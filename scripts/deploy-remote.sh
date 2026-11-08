#!/usr/bin/env bash
# Prepare and deploy Ma'at to an already-authorized Vultr VM.
# This script does not run from the build environment without MAAT_HOST and explicit authorization.
# Review it before use. It never copies .env.local or the local data directory.
set -euo pipefail

: "${MAAT_HOST:?Set MAAT_HOST to the authorized SSH target, e.g. maat@203.0.113.10}"
REMOTE_DIR="${REMOTE_DIR:-/opt/maat}"
SERVICE_WEB="${SERVICE_WEB:-maat-web}"
SERVICE_WORKER="${SERVICE_WORKER:-maat-worker}"

echo "==> Copying application to ${MAAT_HOST}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude data \
  --exclude .env.local \
  --exclude .env \
  --exclude .git \
  --exclude test-results \
  --exclude playwright-report \
  ./ "${MAAT_HOST}:${REMOTE_DIR}/"

echo "==> Installing, building, migrating"
ssh "${MAAT_HOST}" "sudo -u maat bash -lc '
  set -euo pipefail
  cd ${REMOTE_DIR}
  corepack pnpm install --frozen-lockfile
  set -a; . /etc/maat/maat.env; set +a
  corepack pnpm exec next build
  corepack pnpm exec tsx scripts/migrate.ts
'"

echo "==> Restarting services"
ssh "${MAAT_HOST}" "sudo systemctl restart ${SERVICE_WEB} ${SERVICE_WORKER} && sleep 2 && sudo systemctl --no-pager --lines=20 status ${SERVICE_WEB} ${SERVICE_WORKER}"

echo "==> Health check (requires APP_URL in /etc/maat/maat.env)"
ssh "${MAAT_HOST}" "set -a; . /etc/maat/maat.env; set +a; curl -fsS \"\${APP_URL}/api/health\""

echo "Deployment commands completed. Verify the public workflow manually before marking it complete."

