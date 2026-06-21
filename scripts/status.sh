#!/usr/bin/env bash
set -uo pipefail

echo "=== Dolce Sicilia status ==="
echo ""

check() {
  local name=$1 url=$2
  if curl -sf "$url" >/dev/null 2>&1; then
    echo "✓ $name — UP ($url)"
  else
    echo "✗ $name — DOWN ($url)"
  fi
}

check "API" "http://127.0.0.1:3001/api/health"
check "Web" "http://127.0.0.1:5173/customers"

TS_IP=$(tailscale ip -4 2>/dev/null || echo "100.110.178.91")
check "Tailscale" "http://${TS_IP}:5173/customers"

if curl -sf http://127.0.0.1:2785/api/health >/dev/null 2>&1; then
  if curl -sf http://127.0.0.1:2886/ >/dev/null 2>&1; then
    echo "✓ OpenWA dashboard — UP (http://localhost:2886)"
  else
    echo "✗ OpenWA dashboard — DOWN (run ./scripts/ensure-openwa-dashboard.sh)"
  fi
  WA_STATUS=$(curl -sf http://127.0.0.1:3001/api/whatsapp/status 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?') if d.get('connected') else d.get('status', d.get('message','down')))" 2>/dev/null \
    || echo "unknown")
  if [ "$WA_STATUS" = "ready" ]; then
    echo "✓ WhatsApp — connected"
  else
    echo "✗ WhatsApp — $WA_STATUS (auto-reconnect should run within 60s)"
  fi
else
  echo "✗ OpenWA API — DOWN (http://127.0.0.1:2785)"
fi

if [ -f /tmp/dolcesicilia-run-servers.lockdir/pid ]; then
  SUP_PID=$(cat /tmp/dolcesicilia-run-servers.lockdir/pid)
  if kill -0 "$SUP_PID" 2>/dev/null; then
    echo "✓ Supervisor — running (pid $SUP_PID)"
  else
    echo "✗ Supervisor — stale lock (pid $SUP_PID dead)"
  fi
else
  echo "✗ Supervisor — not running"
fi

if launchctl print "gui/$(id -u)/com.dolcesicilia.customer-app" >/dev/null 2>&1; then
  echo "✓ Autostart — launchd agent loaded"
else
  echo "✗ Autostart — launchd agent NOT loaded (run install-autostart.sh)"
fi

echo ""
echo "Log: tail -f /tmp/dolcesicilia-app.log"
