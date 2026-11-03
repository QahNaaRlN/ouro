FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY packages/protocol ./packages/protocol
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build && node scripts/build-hosted-operations.mjs

FROM build AS qualification
CMD ["npm", "run", "test:external-pg"]

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=build /app/packages/protocol ./packages/protocol
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 OURO_LOCAL_DEMO=0 OURO_DEPLOYMENT_MODE=cloud
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=production-deps --chown=node:node /app/packages/protocol ./packages/protocol
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/.operations ./.operations
COPY --chown=node:node package.json next.config.ts ./
COPY --chown=node:node db ./db
COPY --chown=node:node public ./public
COPY --chown=node:node scripts/hosted-next.mjs ./scripts/hosted-next.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=6 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","scripts/hosted-next.mjs"]
