FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache postgresql-client
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/server ./server
COPY --chown=node:node --from=build /app/tsconfig.server.json ./
RUN mkdir -p /backups && chown node:node /backups
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "server/index.ts"]
