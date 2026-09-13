# Development-foundation container image. Production deployment topology
# (Cloudflare, reverse proxy, orchestration, TLS) is a separate concern —
# see docs/architecture/blueprint.md §18 and the Infrastructure phase in §19.
# This Dockerfile proves the app containerizes cleanly; it is not yet the
# production image.

FROM node:24-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- Run ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000

# Phase 12 — hits the real readiness check (GET /api/v1/health), not just
# "is the process alive": that route returns 503 when Postgres is
# unreachable (its own comment), so an orchestrator relying on this
# HEALTHCHECK correctly stops routing traffic to this container during a
# database outage instead of treating a listening socket as "healthy."
# Plain Node http, not curl/wget — node:24-alpine ships neither by default
# and this avoids adding either just for a health probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
