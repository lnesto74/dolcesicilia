#!/usr/bin/env bash
# Fix OpenWA "QR failed" / "no session" after Docker restart (Chromium profile lock).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION_ID="${1:-6c6a18fc-a4b2-4499-9005-7c663e3385b1}"

echo "=== Fixing OpenWA session ==="

docker restart openwa-api
sleep 6

export OPENWA_SESSION_ID="$SESSION_ID"
export CLEAR_LOCKS=1
export MAX_WAIT=60
exec "$ROOT/scripts/ensure-openwa-session.sh"
