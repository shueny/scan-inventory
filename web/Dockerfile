# The web app for local full mode (PRD 6): built in api mode, served by nginx, which also
# passes /api to the API container and serves the Potree tiles with Range support.
FROM node:22.17.0-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html tsconfig.json vite.config.ts vitest.contract.config.ts playwright.config.ts ./
COPY src ./src
COPY e2e ./e2e
ENV VITE_DATA_MODE=api VITE_API_BASE_URL=/api VITE_TILES_BASE_URL=/potree/nora
RUN pnpm build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
