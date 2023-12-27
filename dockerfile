FROM node:16.14.2 as server

WORKDIR /app

COPY ./.npmrc ./pnpm-* ./package.json ./
COPY ./packages/server/package.json ./packages/server/package.json

RUN npm i -g pnpm && pnpm i

COPY ./packages/server ./packages/server

WORKDIR /app/packages/server

EXPOSE 8878

CMD ["node", "./src/main.js"]

FROM node:16.14.2 as build

WORKDIR /app

COPY ./packages/web/lib ./packages/web/lib
COPY ./.npmrc ./pnpm-* ./package.json ./
COPY ./packages/web/package.json ./packages/web/package.json

RUN npm i -g pnpm && pnpm i

COPY ./packages/web ./packages/web
WORKDIR /app/packages/web
RUN pnpm build

FROM nginx as nginx

COPY --from=build app/packages/web/dist /var/www/dist
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
