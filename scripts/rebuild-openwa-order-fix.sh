#!/usr/bin/env bash
# Rebuild OpenWA Docker after catalog order webhook patch (getOrder in adapter).
set -euo pipefail
OPENWA_DIR="${OPENWA_DIR:-$HOME/OpenWA}"
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

if [ ! -d "$OPENWA_DIR" ]; then
  echo "OpenWA not found at $OPENWA_DIR"
  exit 1
fi

echo "Rebuilding OpenWA API (catalog order fix)…"
cd "$OPENWA_DIR"
docker compose -f docker-compose.dev.yml build openwa
docker compose -f docker-compose.dev.yml up -d openwa

for i in $(seq 1 45); do
  curl -sf http://127.0.0.1:2785/api/health >/dev/null 2>&1 && break
  sleep 2
done
echo "OpenWA ready — restart dolcesicilia API: ./scripts/restart.sh"
