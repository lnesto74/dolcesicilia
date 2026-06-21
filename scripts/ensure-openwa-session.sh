#!/usr/bin/env bash
# Ensure OpenWA Docker API is up and the WhatsApp session is connected.
# Safe to run repeatedly (startup, watchdog, manual).
set -uo pipefail

OPENWA_DIR="${OPENWA_DIR:-$HOME/OpenWA}"
SESSION_ID="${OPENWA_SESSION_ID:-6c6a18fc-a4b2-4499-9005-7c663e3385b1}"
API_KEY="${OPENWA_API_KEY:-dev-admin-key}"
API="http://127.0.0.1:2785/api"
CLEAR_LOCKS="${CLEAR_LOCKS:-0}"
MAX_WAIT="${MAX_WAIT:-90}"

log() { echo "[$(date '+%H:%M:%S')] [openwa] $*"; }

session_status() {
  curl -sf -H "X-API-Key: $API_KEY" "$API/sessions/$SESSION_ID" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status') or d.get('data',{}).get('status',''))" 2>/dev/null \
    || echo "unknown"
}

clear_chromium_locks() {
  [ -d "$OPENWA_DIR/data/sessions" ] || return 0
  find "$OPENWA_DIR/data/sessions" \
    \( -name SingletonLock -o -name SingletonCookie -o -name SingletonSocket -o -name LOCK \) \
    -delete 2>/dev/null || true
}

wait_for_api() {
  local i
  for i in $(seq 1 30); do
    curl -sf "$API/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# 1. Ensure Docker API container is running
if command -v docker >/dev/null 2>&1 && [ -d "$OPENWA_DIR" ]; then
  docker compose -f "$OPENWA_DIR/docker-compose.dev.yml" up -d openwa >/dev/null 2>&1 || true
fi

if ! wait_for_api; then
  log "API not reachable at $API — skipping"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -x "$ROOT/scripts/ensure-openwa-dashboard.sh" ]; then
  "$ROOT/scripts/ensure-openwa-dashboard.sh" || log "Dashboard not up — see /tmp/openwa-dashboard.log"
fi

STATUS="$(session_status)"
if [ "$STATUS" = "ready" ]; then
  log "Session ready"
  exit 0
fi

log "Session status: ${STATUS:-unknown}"

if [ "$CLEAR_LOCKS" = "1" ] || [ "$STATUS" = "disconnected" ]; then
  clear_chromium_locks
fi

if [ "$STATUS" = "disconnected" ] || [ "$STATUS" = "unknown" ] || [ -z "$STATUS" ]; then
  log "Starting session $SESSION_ID …"
  curl -sf -X POST -H "X-API-Key: $API_KEY" "$API/sessions/$SESSION_ID/start" >/dev/null 2>&1 || true
  sleep 2
fi

for i in $(seq 1 "$MAX_WAIT"); do
  STATUS="$(session_status)"
  if [ "$STATUS" = "ready" ]; then
    log "Session connected"
    exit 0
  fi
  if [ "$STATUS" = "qr_ready" ]; then
    log "QR scan required — open http://localhost:2886"
    exit 2
  fi
  sleep 1
done

log "Timed out waiting for ready (last status: $STATUS)"
exit 1
