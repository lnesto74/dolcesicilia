#!/usr/bin/env bash
# Start OpenWA API (Docker) + dashboard (local) for Dolce Sicilia.
set -euo pipefail

OPENWA_DIR="${OPENWA_DIR:-$HOME/OpenWA}"
NODE22="$HOME/.nvm/versions/node/v22.14.0/bin"
export PATH="$NODE22:/Applications/Docker.app/Contents/Resources/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$OPENWA_DIR" ]; then
  echo "OpenWA not found. Run: ./scripts/setup-openwa.sh"
  exit 1
fi

echo "Starting OpenWA API (Docker)..."
cd "$OPENWA_DIR"
docker compose -f docker-compose.dev.yml up -d openwa

echo "Waiting for API..."
for i in $(seq 1 30); do
  curl -sf http://localhost:2785/api/health >/dev/null 2>&1 && break
  sleep 1
done

if lsof -ti:2886 >/dev/null 2>&1; then
  echo "Dashboard already running on :2886"
else
  "$ROOT/scripts/ensure-openwa-dashboard.sh" || true
fi

echo ""
echo "  Dashboard: http://localhost:2886"
echo "  API:       http://localhost:2785/api"
echo "  API key:   dev-admin-key  (check: docker logs openwa-api | grep API Key)"
echo ""
echo "  Logs: tail -f /tmp/openwa-dashboard.log"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -x "$ROOT/scripts/ensure-openwa-session.sh" ]; then
  echo ""
  echo "Ensuring WhatsApp session…"
  CLEAR_LOCKS=1 "$ROOT/scripts/ensure-openwa-session.sh" || true
fi
