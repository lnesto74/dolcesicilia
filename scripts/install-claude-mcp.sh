#!/usr/bin/env bash
# Merge Dolce Sicilia MCP server into Claude Desktop config (macOS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
NODE="${DOLCE_NODE:-$HOME/.nvm/versions/node/v18.20.5/bin/node}"
MCP_ENTRY="$ROOT/server/mcp/index.js"
MCP_BUILD="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%dT%H%M%SZ)"
DB_PATH="$ROOT/server/data/contacts.db"

if [ ! -x "$NODE" ]; then
  NODE="$(command -v node)"
fi

if [ ! -x "$NODE" ]; then
  echo "Node not found. Set DOLCE_NODE to your node binary."
  exit 1
fi

mkdir -p "$(dirname "$CONFIG")"

if [ ! -f "$CONFIG" ]; then
  echo '{"mcpServers":{}}' > "$CONFIG"
fi

export ROOT NODE MCP_ENTRY CONFIG MCP_BUILD DB_PATH
python3 <<'PY'
import json, os

config_path = os.environ["CONFIG"]
root = os.environ["ROOT"]
node = os.environ["NODE"]
mcp_entry = os.environ["MCP_ENTRY"]
db_path = os.environ["DB_PATH"]
mcp_build = os.environ["MCP_BUILD"]

with open(config_path) as f:
    data = json.load(f)

data.setdefault("mcpServers", {})
data["mcpServers"]["dolcesicilia"] = {
    "command": node,
    "args": [mcp_entry],
    "env": {
        "DOLCE_DB_PATH": db_path,
        "DOLCE_MCP_BUILD": mcp_build,
    },
}

with open(config_path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print("Updated:", config_path)
print("  dolcesicilia →", mcp_entry)
print("  node →", node)
print("  DOLCE_DB_PATH →", db_path)
print("  DOLCE_MCP_BUILD →", mcp_build)
PY

echo ""
echo "Next steps:"
echo "  1. Quit Claude Desktop completely (Cmd+Q)"
echo "  2. Reopen Claude Desktop"
echo "  3. Open your Dolce Sicilia project"
echo "  4. Check Settings → Developer → MCP — dolcesicilia should be connected"
echo ""
echo "Try asking: \"Use get_full_snapshot and suggest who to message for tray upsell this week\""
