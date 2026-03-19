# *************************************
FROM rust:1.90.0 AS log-server

RUN apt-get update && \
    apt-get install -y \
      cmake \
      pkg-config \
      libssl-dev \
      && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

VOLUME "/usr/local/cache"

COPY ./packages/logs/Cargo.lock ./packages/logs/Cargo.toml ./

RUN cargo fetch --target x86_64-unknown-linux-gnu

COPY ./packages/logs/src ./src

RUN cargo build --release

EXPOSE "8870"


FROM debian:stable-slim AS log-deploy

WORKDIR /app

RUN apt-get update && apt-get install -y curl

COPY --from=log-server /app/target/release/bury-report-logs ./

CMD ["/app/bury-report-logs"]

# *************************************
FROM denoland/deno:2.5.6 AS server

WORKDIR /app

COPY ./.npmrc ./pnpm-* ./package.json ./
COPY ./packages/server/package.json ./packages/server/deno.* ./packages/server/

COPY ./packages/server ./packages/server

WORKDIR /app/packages/server

RUN deno install --frozen=false --node-modules-dir=true && deno cache --node-modules-dir ./src/main.ts 

# 2. 安装 Playwright 的 Chromium 浏览器
# 使用 --with-deps 补全缺少的系统库
RUN deno run -A npm:playwright install --with-deps chromium

FROM debian:bookworm-slim AS server-runner

RUN apt-get update && apt-get install -y \
    ffmpeg \
    libnss3 \
    libatk1.0-0 \
    libasound2 \
    libx11-6 \
    libpangocairo-1.0-0 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. 从官方镜像拷贝 Deno 二进制文件 (不使用整个 Deno 镜像作为基础)
COPY --from=server /usr/bin/deno /usr/local/bin/deno

# 3. 拷贝浏览器二进制文件 (仅 Chromium)
COPY --from=server /root/.cache/ms-playwright /root/.cache/ms-playwright

COPY --from=server /root/.cache/deno /root/.cache/deno

# 4. 拷贝你的应用代码和依赖缓存
COPY --from=server /app /app

WORKDIR /app/packages/server

# 5. 关键环境变量
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

EXPOSE 8878

# 3. 环境变量设置
# 告诉 Playwright 在容器内不要尝试寻找 X11 服务
ENV DISPLAY=:99

CMD ["deno", "task", "start"]

FROM node:20.9.0 AS build

WORKDIR /app

COPY ./packages/web/lib ./packages/web/lib
COPY ./.npmrc ./pnpm-* ./package.json ./
COPY ./packages/web/package.json ./packages/web/package.json

RUN npm i -g pnpm && pnpm i

COPY ./packages/web/.env.production\
     ./packages/web/index.html\
     ./packages/web/*.json\
     ./packages/web/rsbuild.config.ts\
     ./packages/web/
COPY ./packages/web/src ./packages/web/src
COPY ./packages/web/public ./packages/web/public

WORKDIR /app/packages/web
RUN pnpm build

FROM nginx AS nginx

COPY --from=build app/packages/web/dist /var/www/dist
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# *************************************
FROM rust:1.90.0 AS worker-server

RUN apt-get update && \
    apt-get install -y \
      cmake \
      pkg-config \
      libssl-dev \
      && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

VOLUME "/usr/local/cache"

COPY ./packages/worker/Cargo.lock ./packages/worker/Cargo.toml ./

RUN cargo fetch --target x86_64-unknown-linux-gnu

COPY ./packages/worker/src ./src

RUN cargo build --release


FROM debian:stable-slim AS worker-deploy

WORKDIR /app

# RUN apt-get update && apt-get install -y curl

COPY --from=worker-server /app/target/release/bury-report-worker ./

CMD ["/app/bury-report-worker"]

# *************************************
FROM rust:1.90.0 AS proxy-build

WORKDIR /app

VOLUME "/usr/local/cache"

COPY ./packages/proxy/Cargo.lock ./packages/proxy/Cargo.toml ./

RUN cargo fetch --target x86_64-unknown-linux-gnu

COPY ./packages/proxy/src ./src

RUN cargo build --release


FROM debian:stable-slim AS proxy-deploy

WORKDIR /app

# RUN apt-get update && apt-get install -y curl

COPY --from=proxy-build /app/target/release/bury-report-proxy ./

CMD ["/app/bury-report-proxy"]

FROM node:20.17-alpine AS mcp-deploy

WORKDIR /app

COPY ./.npmrc ./pnpm-* ./package.json ./
COPY ./packages/mcp-server/package*.json  ./packages/mcp-server/

COPY ./packages/mcp-server ./packages/mcp-server

WORKDIR /app/packages/mcp-server

RUN npm i -g pnpm && pnpm i
EXPOSE 3000
CMD ["npx", "tsx", "src/main.ts"]
