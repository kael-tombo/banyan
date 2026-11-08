#!/usr/bin/env bash
# Live SocialFlow smoke test on the production server (docs/LAUNCH_SETUP.md, step 5).
#
#   scripts/smoke-prod.sh <socialflow-api-key>             check the connection and the connected accounts
#   scripts/smoke-prod.sh <socialflow-api-key> --publish   ALSO publish one LinkedIn post and one 2-post X thread
#
# Runs scripts/smoke-socialflow.ts in a one-off container (the Dockerfile's tools stage) on the stack's private
# network, so it reaches SocialFlow Lite at http://socialflow:8080 exactly as Banyan does. Nothing is installed on
# the server and nothing stays running.
set -euo pipefail
cd "$(dirname "$0")/.."
key="${1:?usage: scripts/smoke-prod.sh <socialflow-api-key> [--publish]}"; shift
set -a; . ./.env; set +a

docker build --quiet --target tools -t banyan-tools . >/dev/null
docker run --rm --network banyan_default \
  -e SOCIALFLOW_API_URL=http://socialflow:8080 \
  -e SOCIALFLOW_ALLOW_PRIVATE_NETWORK=true \
  -e SOCIALFLOW_TRANSPORT="${SOCIALFLOW_TRANSPORT:-mcp}" \
  -e SOCIALFLOW_API_KEY="$key" \
  -e APP_SECRET="$APP_SECRET" \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-banyan}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-banyan}" \
  banyan-tools npx tsx scripts/smoke-socialflow.ts "$@"
