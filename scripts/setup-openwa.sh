#!/usr/bin/env bash
# Start OpenWA on Mac for Dolce Sicilia WhatsApp automation.
set -euo pipefail

OPENWA_DIR="${OPENWA_DIR:-$HOME/OpenWA}"

echo "=== Dolce Sicilia + OpenWA setup ==="
echo ""

if [ ! -d "$OPENWA_DIR" ]; then
  echo "Cloning OpenWA to $OPENWA_DIR ..."
  git clone https://github.com/rmyndharis/OpenWA.git "$OPENWA_DIR"
fi

cd "$OPENWA_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install Docker Desktop first."
  exit 1
fi

echo "Installing dashboard dependencies..."
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH"
cd "$OPENWA_DIR/dashboard"
npm install --legacy-peer-deps

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/start-openwa.sh"

echo ""
echo "Next steps:"
echo "  1. Open dashboard → create session → scan QR with your business WhatsApp"
echo "  2. Copy API key + session ID into Follow-up page → OpenWA settings"
echo "  3. Click 'Register reply webhook'"
echo "  4. Select Luca test contact → Send via OpenWA"
