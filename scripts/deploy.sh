#!/usr/bin/env bash
#
# Dirory — deploy the web app on the VPS (brief §111).
#
# Pulls the latest code, rebuilds the image and restarts the stack with as little
# downtime as possible. Safe to run repeatedly.
#
#   ./scripts/deploy.sh            # deploy current branch
#   ./scripts/deploy.sh --no-pull  # skip git pull (already up to date)
#
# Requirements on the server: git, docker, docker compose (V2), .env present.

set -euo pipefail

# Always run from the repo root, wherever this is invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!! %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# --- preflight --------------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "docker is not installed (see docs/DEPLOY.md step 4)."
docker compose version >/dev/null 2>&1 || die "docker compose (V2) is not available."

[ -f .env ] || die ".env is missing. Copy .env.example and fill it in (docs/DEPLOY.md step 6)."

# Refuse to run with the example placeholders still in place.
if grep -qE '^NEXT_PUBLIC_SUPABASE_URL=$|^SUPABASE_SERVICE_ROLE_KEY=$|^NEXT_PUBLIC_SUPABASE_ANON_KEY=$' .env; then
  die ".env still has empty required values. Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY."
fi
if ! grep -q '^DOMAIN=' .env; then
  die "DOMAIN is not set in .env."
fi

DOMAIN="$(grep -E '^DOMAIN=' .env | head -1 | cut -d= -f2- | tr -d '\r')"

# --- fetch ------------------------------------------------------------------
if [ "${1:-}" != "--no-pull" ]; then
  if [ -d .git ]; then
    log "Pulling latest code"
    git pull --ff-only
  else
    warn "Not a git checkout; skipping pull."
  fi
fi

# --- build ------------------------------------------------------------------
log "Building the image (this compiles the app; NEXT_PUBLIC_* come from .env)"
docker compose build web

# --- start / update ---------------------------------------------------------
# `up -d` recreates only the containers whose image or config changed, so a
# deploy that touched nothing keeps the current containers running.
log "Starting the stack"
docker compose up -d --remove-orphans

log "Waiting for the app to become healthy"
for i in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q web)" 2>/dev/null || echo unknown)"
  if [ "$status" = "healthy" ]; then
    log "App is healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    warn "App did not report healthy in time. Recent logs:"
    docker compose logs --tail 40 web || true
    die "Deploy aborted: app unhealthy."
  fi
  sleep 3
done

# --- verify -----------------------------------------------------------------
# Test the app ON THIS SERVER (via Caddy, resolving the domain locally) rather
# than the public domain. Testing the public domain would silently test whatever
# DNS currently points at — e.g. the old Netlify site — and report a false pass.
log "Checking the app on this server"

if curl -fsS -o /dev/null --max-time 15 --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/health" 2>/dev/null; then
  curl -fsS --max-time 15 --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/health" || true
  printf '\n'
  log "HTTPS is live on this server for ${DOMAIN}"
else
  warn "No HTTPS response from Caddy yet. Usually this means Caddy has not been"
  warn "able to obtain a certificate, which it cannot do until DNS is correct."
  RESOLVED="$(getent hosts "${DOMAIN}" 2>/dev/null | awk '{print $1}' | head -1)"
  if [ -n "${RESOLVED}" ]; then
    warn "  ${DOMAIN} currently resolves to: ${RESOLVED}"
    warn "  If that is not this server, update the A record and Caddy will retry"
    warn "  automatically (it retries for up to 30 days)."
  fi
  warn "Caddy log tail:"
  docker compose logs --tail 15 caddy || true
  warn "The app itself is running; only the certificate is pending."
fi

log "Container status"
docker compose ps
