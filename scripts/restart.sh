#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Ensure OpenWA Docker + QR dashboard + WhatsApp session before app restart
if [ -x "$ROOT/scripts/ensure-openwa-dashboard.sh" ]; then
  echo "Starting OpenWA QR dashboard…"
  "$ROOT/scripts/ensure-openwa-dashboard.sh" || echo "Dashboard not up — see /tmp/openwa-dashboard.log"
fi
if [ -x "$ROOT/scripts/ensure-openwa-session.sh" ]; then
  echo "Ensuring WhatsApp session…"
  CLEAR_LOCKS=1 "$ROOT/scripts/ensure-openwa-session.sh" || echo "OpenWA not ready yet — will retry after API starts"
fi

# Always rebuild web so UI changes show up (serves static dist/, not live Vite)
if [ -f "$ROOT/app/package.json" ]; then
  echo "Building web app..."
  (cd "$ROOT/app" && npm run build) || echo "Web build failed — continuing with existing dist"
fi

# Stop supervisor if running
if [ -f /tmp/dolcesicilia-run-servers.lockdir/pid ]; then
  kill "$(cat /tmp/dolcesicilia-run-servers.lockdir/pid)" 2>/dev/null || true
  sleep 2
fi
rm -rf /tmp/dolcesicilia-run-servers.lockdir

# Prefer launchd if installed
if launchctl print "gui/$(id -u)/com.dolcesicilia.customer-app" >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/com.dolcesicilia.customer-app"
  sleep 4
else
  nohup "$ROOT/scripts/run-servers.sh" >> /tmp/dolcesicilia-app.log 2>&1 &
  sleep 4
fi

"$ROOT/scripts/status.sh"
