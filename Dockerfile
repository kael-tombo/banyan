# Banyan — single-node production image (PostgreSQL).
# Build:  docker build -t banyan .
# Run:    docker run -p 3000:3000 --env-file .env banyan
#         (.env must contain DATABASE_URL pointing at a reachable Postgres —
#          e.g. hosted Prisma Postgres — plus APP_SECRET and WORKER_SECRET)
# Worker: docker run --env-file .env banyan npm run worker
# Migrations run automatically on container start (prisma migrate deploy;
# the prisma CLI ships in dependencies so it is available after pruning).

FROM node:20-alpine AS base
# Prisma engines on musl need openssl; sharp-style native bits need libc compat.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM deps AS build
COPY . .
# Build-time placeholders: the build machine is not the runtime host.
# env.ts exempts the WORKER_SECRET runtime guard during next build;
# scripts/migrate-if-configured.ts skips migrate deploy for file: URLs.
ENV DATABASE_URL=file:./build-placeholder.db \
    APP_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
    NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/worker ./worker
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
