#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_DST="$HOME/Library/LaunchAgents/com.dolcesicilia.customer-app.plist"

sed "s|__PROJECT_ROOT__|$ROOT|g; s|__HOME__|$HOME|g" \
  "$ROOT/scripts/com.dolcesicilia.customer-app.plist.template" > "$PLIST_DST"

chmod +x "$ROOT/scripts/run-servers.sh"

plutil -lint "$PLIST_DST" >/dev/null || { echo "Invalid plist"; exit 1; }

launchctl bootout "gui/$(id -u)/com.dolcesicilia.customer-app" 2>/dev/null || \
  launchctl unload "$PLIST_DST" 2>/dev/null || true

sleep 1
if ! launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>&1; then
  echo "bootstrap failed — trying legacy load..."
  launchctl load "$PLIST_DST" 2>&1 || true
fi

launchctl kickstart -k "gui/$(id -u)/com.dolcesicilia.customer-app" 2>/dev/null || true

sleep 5
"$ROOT/scripts/status.sh"

TS_IP=$(tailscale ip -4 2>/dev/null || echo "100.110.178.91")
echo ""
echo "=========================================="
echo "  MAC runs the app. Phone = upload only."
echo ""
echo "  Phone URL (Tailscale ON):"
echo "  http://${TS_IP}:5173/customers"
echo "=========================================="
echo ""
echo "  Status:  tail -f /tmp/dolcesicilia-app.log"
echo "  Restart: $ROOT/scripts/install-autostart.sh"
echo "  Stop:    launchctl bootout gui/$(id -u)/com.dolcesicilia.customer-app"
