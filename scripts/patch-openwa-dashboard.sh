#!/usr/bin/env bash
# Persist OpenWA dashboard API key + default dev-admin-key for local Dolce Sicilia setup.
set -euo pipefail

OPENWA_DIR="${OPENWA_DIR:-$HOME/OpenWA}"
DASH="$OPENWA_DIR/dashboard"
MARKER="$DASH/.dolce-patched-api-key"

[ -d "$DASH/src" ] || exit 0
[ -f "$MARKER" ] && exit 0

echo "[patch-openwa] Patching dashboard for persistent API key…"

cat >"$DASH/.env.local" <<'EOF'
VITE_DEFAULT_API_KEY=dev-admin-key
EOF

# sessionStorage → localStorage (survives tab close; same key on 127.0.0.1 and localhost if user picks one)
for f in "$DASH/src/App.tsx" "$DASH/src/services/api.ts" "$DASH/src/hooks/useWebSocket.ts"; do
  [ -f "$f" ] || continue
  sed -i '' 's/sessionStorage\.getItem('\''openwa_api_key'\'')/localStorage.getItem('\''openwa_api_key'\'')/g' "$f"
  sed -i '' 's/sessionStorage\.setItem('\''openwa_api_key'\''/localStorage.setItem('\''openwa_api_key'\''/g' "$f"
  sed -i '' 's/sessionStorage\.removeItem('\''openwa_api_key'\'')/localStorage.removeItem('\''openwa_api_key'\'')/g' "$f"
done

# Pre-fill login + auto-connect on local dev
python3 - "$DASH/src/pages/Login.tsx" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
if 'VITE_DEFAULT_API_KEY' in text:
    sys.exit(0)
text = text.replace(
    "  const [apiKey, setApiKey] = useState('');",
    """  const defaultKey = import.meta.env.VITE_DEFAULT_API_KEY || 'dev-admin-key';
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('openwa_api_key') || defaultKey,
  );""",
)
if 'useEffect' not in text.split('export function Login')[1][:1200]:
    text = text.replace(
        "import { useState } from 'react';",
        "import { useState, useEffect } from 'react';",
    )
    insert = """
  useEffect(() => {
    const saved = localStorage.getItem('openwa_api_key');
    const key = saved || defaultKey;
    if (!saved && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      void fetch('/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      })
        .then((r) => (r.ok ? onLogin(key) : undefined))
        .catch(() => undefined);
    }
  }, [defaultKey, onLogin]);

"""
    text = text.replace("  const [error, setError] = useState('');\n", "  const [error, setError] = useState('');\n" + insert)
path.write_text(text)
PY

touch "$MARKER"
echo "[patch-openwa] Done — API key: dev-admin-key (saved in browser localStorage)"
