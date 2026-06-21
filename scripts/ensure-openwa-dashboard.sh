#!/usr/bin/env bash
# Stable OpenWA QR dashboard on :2886 — production preview, not vite dev.
set -uo pipefail

OPENWA_DIR="${OPENWA_DIR:-$HOME/OpenWA}"
NODE22="$HOME/.nvm/versions/node/v22.14.0/bin"
DASH_DIR="$OPENWA_DIR/dashboard"
PIDFILE="/tmp/openwa-dashboard.pid"
LOG="/tmp/openwa-dashboard.log"
BUILD_STAMP="$DASH_DIR/dist/.dolce-build-stamp"
PORT=2886

log() { echo "[$(date '+%H:%M:%S')] [openwa-dashboard] $*"; }

dashboard_up() {
  curl -sf --max-time 2 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1
}

if [ ! -d "$DASH_DIR" ]; then
  log "Not found: $DASH_DIR — run ./scripts/setup-openwa.sh"
  exit 1
fi

if [ ! -x "$NODE22/node" ]; then
  log "Node 22 not found at $NODE22"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -x "$ROOT/scripts/patch-openwa-dashboard.sh" ]; then
  "$ROOT/scripts/patch-openwa-dashboard.sh" || true
fi

if dashboard_up; then
  exit 0
fi

# Kill stale listeners on 2886
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  log "Clearing stale process on :$PORT"
  lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

needs_build() {
  [ ! -f "$DASH_DIR/dist/index.html" ] && return 0
  [ ! -f "$BUILD_STAMP" ] && return 0
  find "$DASH_DIR/src" "$DASH_DIR/.env.local" -newer "$BUILD_STAMP" 2>/dev/null | grep -q . && return 0
  return 1
}

if needs_build; then
  log "Building dashboard (one-time, ~30s)…"
  cd "$DASH_DIR"
  if PATH="$NODE22:$PATH" "$NODE22/npm" run build >>"$LOG" 2>&1; then
    touch "$BUILD_STAMP"
    log "Build OK"
  else
    log "Build failed — see $LOG"
    exit 1
  fi
fi

log "Starting stable dashboard on http://127.0.0.1:${PORT} …"
cd "$DASH_DIR"
PATH="$NODE22:$PATH" nohup "$NODE22/npx" vite preview --host 127.0.0.1 --port "$PORT" >>"$LOG" 2>&1 &
echo $! >"$PIDFILE"

for i in $(seq 1 30); do
  if dashboard_up; then
    log "Dashboard ready → http://127.0.0.1:${PORT}"
    exit 0
  fi
  sleep 1
done

log "Failed to start — tail -f $LOG"
exit 1
