#!/usr/bin/env bash
# Deploy Banyan on a single server (docs/LAUNCH_SETUP.md, step 3).
#
#   scripts/deploy.sh            deploy what is checked out
#   scripts/deploy.sh --pull     git pull --ff-only first
#
# Builds the image, applies migrations (the migrate service runs before web and worker), starts the stack,
# then checks https://$APP_DOMAIN/api/health. If the health check fails, the previous image is restored and
# started again. Migrations are not reversed: they are additive by convention, and the previous image runs
# against the newer schema.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "No .env here. Copy .env.example to .env and fill it in (docs/LAUNCH_SETUP.md)." >&2; exit 1; }
set -a; . ./.env; set +a
: "${APP_DOMAIN:?set APP_DOMAIN in .env}"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile socialflow)

if [ "${1:-}" = "--pull" ]; then git pull --ff-only; fi
echo "Deploying $(git rev-parse --short HEAD) to https://$APP_DOMAIN"

# Keep the running image so a failed deploy can go back to it.
if docker image inspect banyan-app:local >/dev/null 2>&1; then
  docker image tag banyan-app:local banyan-app:previous
  had_previous=1
else
  had_previous=0
fi

"${COMPOSE[@]}" build
"${COMPOSE[@]}" up -d --remove-orphans

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "https://$APP_DOMAIN/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 5
  done
  return 1
}

if healthy; then
  echo "Healthy: https://$APP_DOMAIN/api/health"
  exit 0
fi

echo "Health check failed after the deploy." >&2
"${COMPOSE[@]}" ps >&2 || true
"${COMPOSE[@]}" logs --tail 60 web >&2 || true
if [ "$had_previous" = 1 ]; then
  echo "Rolling back to the previous image." >&2
  docker image tag banyan-app:previous banyan-app:local
  "${COMPOSE[@]}" up -d --no-build web worker
  if healthy; then echo "Rolled back; the previous version is serving." >&2; else echo "Rollback is not healthy either: check the logs above." >&2; fi
fi
exit 1
