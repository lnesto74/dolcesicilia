#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building host landing page (Next.js static export)..."
cd "$ROOT/host"
npm ci
npm run build

echo "==> Building marketing app (Vite)..."
cd "$ROOT/app"
npm ci
npm run build

echo "==> Merging host page into app/dist/host/..."
mkdir -p "$ROOT/app/dist/host"
cp -R "$ROOT/host/out/." "$ROOT/app/dist/host/"

echo "==> Site build complete."
