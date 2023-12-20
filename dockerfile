FROM rust:1.74.1 as build-sign

WORKDIR /app

COPY ./packages/sign/* .

RUN cargo install wasm-pack && wasm-pack build --target nodejs

FROM node:16.14.2 as server

WORKDIR /app

COPY ./pnpm-* ./package.json ./
COPY ./packages/server/package.json ./packages/server/package.json
COPY --from=build-sign /app/packages/sign/pkg ./packages/sign/pkg

RUN npm i -g pnpm && pnpm i

COPY ./packages/server ./packages/server

WORKDIR /app/packages/server

EXPOSE 8878

CMD ["pnpm", "dev"]
