# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24.21.0-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /srv/api
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
FROM build AS test
COPY tests ./tests
COPY migrations ./migrations
COPY assets ./assets
CMD ["node", "--test", "--test-concurrency=1", "tests/integration/*.test.mjs"]
FROM build AS production-deps
RUN npm prune --omit=dev --no-audit --no-fund
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /srv/api
COPY --from=production-deps --chown=node:node /srv/api/package.json ./
COPY --from=production-deps --chown=node:node /srv/api/node_modules ./node_modules
COPY --from=build --chown=node:node /srv/api/dist ./dist
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node assets ./assets
USER node
CMD ["node", "dist/main.js"]
