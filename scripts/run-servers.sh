#!/usr/bin/env bash
# Mac runs this 24/7. Phone only opens the Tailscale URL to upload screenshots.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="/tmp/dolcesicilia-app.log"
LOCKDIR="/tmp/dolcesicilia-run-servers.lockdir"
export DOLCE_DB_PATH="$ROOT/server/data/contacts.db"
NODE="$HOME/.nvm/versions/node/v18.20.5/bin/node"
[ -x "$NODE" ] || NODE="/opt/homebrew/bin/node"
[ -x "$NODE" ] || NODE="/usr/local/bin/node"
[ -x "$NODE" ] || NODE="$(command -v node)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

# Only one supervisor — duplicate starts kill each other's ports
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  if [ -f "$LOCKDIR/pid" ] && kill -0 "$(cat "$LOCKDIR/pid")" 2>/dev/null; then
    log "Supervisor already running (pid $(cat "$LOCKDIR/pid")) — exiting"
    exit 0
  fi
  rm -rf "$LOCKDIR"
  mkdir "$LOCKDIR" || { log "Cannot acquire lock"; exit 1; }
fi
echo $$ > "$LOCKDIR/pid"

cleanup() {
  log "Supervisor stopping"
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
  rm -rf "$LOCKDIR"
}
trap cleanup INT TERM
trap '' HUP

kill_port() {
  local port=$1
  local i pids
  for i in 1 2 3; do
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    [ -z "$pids" ] && return 0
    log "Killing stale process on port $port (attempt $i)"
    kill -9 $pids 2>/dev/null || true
    sleep 1
  done
}

start_api() {
  cd "$ROOT/server"
  nohup "$NODE" src/index.js >>"$LOG" 2>&1 &
  API_PID=$!
}

start_web() {
  cd "$ROOT/server"
  nohup "$NODE" static-web.js >>"$LOG" 2>&1 &
  WEB_PID=$!
}

wait_for() {
  local url=$1 name=$2
  local i
  for i in $(seq 1 30); do
    curl -sf "$url" >/dev/null 2>&1 && { log "$name ready"; return 0; }
    sleep 1
  done
  log "$name failed to start"
  return 1
}

log "=== Dolce Sicilia starting (node: $($NODE -v), pid $$) ==="
kill_port 3001
kill_port 5173

cd "$ROOT/app"
if [ -f dist/index.html ]; then
  log "Rebuilding web app (source may have changed)..."
  npm run build >>"$LOG" 2>&1 || log "Build failed — using last dist if any"
else
  log "Building web app..."
  npm run build >>"$LOG" 2>&1 || log "Build failed — starting with last dist if any"
fi

log "Starting API on :3001"
start_api
wait_for "http://127.0.0.1:3001/api/health" "API" || true

if [ -x "$ROOT/scripts/ensure-openwa-session.sh" ]; then
  log "Ensuring WhatsApp session (startup)…"
  if [ -x "$ROOT/scripts/ensure-openwa-dashboard.sh" ]; then
    "$ROOT/scripts/ensure-openwa-dashboard.sh" >>"$LOG" 2>&1 || log "OpenWA dashboard not up — see /tmp/openwa-dashboard.log"
  fi
  CLEAR_LOCKS=1 "$ROOT/scripts/ensure-openwa-session.sh" >>"$LOG" 2>&1 \
    && log "WhatsApp session ready" \
    || log "WhatsApp session not ready yet — API watchdog will retry"
fi

log "Starting web on :5173"
start_web
wait_for "http://127.0.0.1:5173/api/health" "Web" || true

TS_IP=$(tailscale ip -4 2>/dev/null || echo "unknown")
log "READY → http://${TS_IP}:5173/customers"

OPENWA_TICK=0
while true; do
  if ! kill -0 "$API_PID" 2>/dev/null || ! curl -sf http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    log "API unhealthy — restarting"
    kill "$API_PID" 2>/dev/null || true
    sleep 1
    start_api
    wait_for "http://127.0.0.1:3001/api/health" "API" || true
  fi
  if ! kill -0 "$WEB_PID" 2>/dev/null || ! curl -sf http://127.0.0.1:5173/api/health >/dev/null 2>&1; then
    log "Web unhealthy — restarting"
    kill "$WEB_PID" 2>/dev/null || true
    sleep 1
    start_web
    wait_for "http://127.0.0.1:5173/api/health" "Web" || true
  fi

  if ! curl -sf --max-time 2 http://127.0.0.1:2886/ >/dev/null 2>&1; then
    if [ -x "$ROOT/scripts/ensure-openwa-dashboard.sh" ]; then
      log "OpenWA dashboard down — restarting"
      "$ROOT/scripts/ensure-openwa-dashboard.sh" >>"$LOG" 2>&1 || true
    fi
  fi

  OPENWA_TICK=$((OPENWA_TICK + 1))
  if [ "$OPENWA_TICK" -ge 6 ]; then
    OPENWA_TICK=0
    if [ -x "$ROOT/scripts/ensure-openwa-session.sh" ]; then
      "$ROOT/scripts/ensure-openwa-session.sh" >>"$LOG" 2>&1 || true
    fi
  fi

  sleep 10
done
