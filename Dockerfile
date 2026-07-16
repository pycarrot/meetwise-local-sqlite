FROM node:24.4.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.4.1-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY migrations ./migrations
COPY scripts/docker-entrypoint.mjs ./scripts/docker-entrypoint.mjs
COPY scripts/sqlite-backup.mjs scripts/sqlite-restore.mjs ./scripts/
COPY LICENSE.md NOTICE.md ./
RUN mkdir -p /app/data
RUN chown -R node:node /app
USER node
EXPOSE 4317
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4317/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "scripts/docker-entrypoint.mjs"]
CMD ["node", "dist-server/server/index.js"]
