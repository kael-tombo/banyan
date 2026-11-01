# Banyan — production image (US-002).
#
# One image, three roles (see docker-compose.yml):
#   web     next start                       (UI + API)
#   worker  node dist/worker.js              (BullMQ consumer + maintenance sweep)
#   migrate npx prisma migrate deploy        (one-shot, before web and worker)
#
# Standalone use: docker build -t banyan . && docker run --env-file .env -p 3000:3000 banyan

FROM node:22-alpine AS base
# Prisma engines on musl need openssl; libc6-compat for native modules.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: full install for the build ----
FROM base AS deps
COPY package.json package-lock.json ./
# legacy-peer-deps is pinned off so the result never depends on the builder's npm config.
RUN npm ci --legacy-peer-deps=false

# ---- build: Next.js app + bundled worker ----
FROM deps AS build
COPY . .
# Build-time placeholders only. env.ts exempts runtime-only secrets during
# `next build`; migrate-if-configured skips migrations for file: URLs.
ENV DATABASE_URL=file:./build-placeholder.db \
    APP_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
RUN npx prisma generate \
 && npm run build \
 && npm run build:worker \
 && npm prune --omit=dev --legacy-peer-deps=false

# ---- runtime: non-root, production dependencies only ----
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1
# Run next directly (no npm/npx wrapper) so SIGTERM reaches Node for a graceful shutdown.
CMD ["node_modules/.bin/next", "start"]
