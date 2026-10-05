# Dirory web app — production image (M5, brief §105).
#
# Three stages:
#   1. deps    — install the monorepo workspace dependencies (cached)
#   2. builder — `next build` with the public Supabase values baked in
#   3. runner  — a tiny non-root image that runs only the standalone server
#
# The service-role key is deliberately NOT a build argument. NEXT_PUBLIC_* values
# are compiled into the client bundle, so they must exist at build time; the
# service-role key is read at runtime from the environment and must never be
# baked into an image layer (it would be readable by anyone with the image).

# ---------------------------------------------------------------------------
# 1. deps
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# The monorepo root files plus the web workspace manifest.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
# npm ci needs the workspace manifests it references.
RUN npm ci --include=dev --workspace apps/web --include-workspace-root

# ---------------------------------------------------------------------------
# 2. builder
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Public values only. Set these via build args in docker-compose.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL=https://dirory.com
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web

RUN npm run build --workspace apps/web

# ---------------------------------------------------------------------------
# 3. runner
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as a non-root user (brief §106).
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# `output: "standalone"` gives a server plus the minimal node_modules it traced.
# The monorepo tracing root means the bundle sits under apps/web/.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# The gated RBZ is read at runtime by /api/download/rbz. It is traced into the
# standalone bundle, but copy it explicitly so the path is always present.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/private ./apps/web/private

USER nextjs
EXPOSE 3000

# Healthcheck hits the app's own endpoint (used by docker-compose and Caddy).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
