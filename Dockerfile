FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json ./packages/domain/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk upgrade --no-cache \
    && apk add --no-cache postgresql-client
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json ./packages/domain/package.json
RUN npm ci --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --chown=node:node --from=build /app/dist ./dist-seed
COPY --chown=node:node --from=build /app/build ./build
COPY --chown=node:node --from=build /app/packages/domain/dist ./packages/domain/dist
COPY --chown=node:node --from=build /app/server/db/migrations ./server/db/migrations
COPY --chown=node:node scripts/container-entrypoint.sh ./container-entrypoint.sh
RUN mkdir -p /app/dist \
    && chown node:node /app/dist \
    && chmod 755 /app/container-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["/app/container-entrypoint.sh"]
