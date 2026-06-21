#!/usr/bin/env bash
# Run once in Terminal — keeps Mac app alive. Phone only uploads via Tailscale URL.
exec "$(cd "$(dirname "$0")" && pwd)/scripts/run-servers.sh"
