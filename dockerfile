# *************************************
FROM rust:1.79.0 as log-server

WORKDIR /app

VOLUME "/usr/local/cache"

COPY ./packages/logs/Cargo.lock ./packages/logs/Cargo.toml ./

RUN cargo fetch --target x86_64-unknown-linux-gnu

COPY ./packages/logs/src ./src

RUN cargo build --release

EXPOSE "8870"


FROM debian:stable-slim as log-deploy

WORKDIR /app

RUN apt-get update && apt-get install -y curl

COPY --from=log-server /app/target/release/bury-report-logs ./

CMD ["/app/bury-report-logs"]

# *************************************
FROM node:20.9.0 as server

WORKDIR /app

COPY ./.npmrc ./pnpm-* ./package.json ./
COPY ./packages/server/package.json ./packages/server/package.json

RUN npm i -g pnpm && pnpm i

COPY ./packages/server ./packages/server

WORKDIR /app/packages/server

EXPOSE 8878

CMD ["node", "./src/main.js"]

FROM node:20.9.0 as build

WORKDIR /app

COPY ./packages/web/lib ./packages/web/lib
COPY ./.npmrc ./pnpm-* ./package.json ./
COPY ./packages/web/package.json ./packages/web/package.json

RUN npm i -g pnpm && pnpm i

COPY ./packages/web/.env.production\
     ./packages/web/index.html\
     ./packages/web/*.json\
     ./packages/web/vite.config.ts\
     ./packages/web/
COPY ./packages/web/src ./packages/web/src
COPY ./packages/web/public ./packages/web/public

WORKDIR /app/packages/web
RUN pnpm build

FROM nginx as nginx

COPY --from=build app/packages/web/dist /var/www/dist
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
