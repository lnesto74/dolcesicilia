#!/usr/bin/env bash
# Simulate WhatsApp order bot flow via webhook (no real WhatsApp required for DB/state test)
set -euo pipefail

API="${API_URL:-http://127.0.0.1:3001}"
PHONE="${TEST_WA_PHONE:-6591234567}"
FROM="${PHONE}@c.us"

post_msg() {
  local body="$1"
  echo "→ Customer: $body"
  curl -sf -X POST "$API/api/whatsapp/webhook" \
    -H 'Content-Type: application/json' \
    -d "{\"event\":\"message.received\",\"data\":{\"from\":\"$FROM\",\"body\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$body"),\"type\":\"chat\"}}" \
    | python3 -m json.tool 2>/dev/null || true
  echo
}

echo "=== WA Order flow test → $API ==="
post_msg "Hi Chef Luca! I'd like to order tiramisù 🍰"
post_msg "1"
post_msg "2"
post_msg "DONE"
post_msg "NOW"
post_msg "65 Chestnut Avenue Singapore 679513"

ORDER_ID=$(curl -sf "$API/api/wa-orders" | python3 -c "import sys,json; o=json.load(sys.stdin).get('orders',[]); print(o[0]['id'] if o else '')")
if [ -z "$ORDER_ID" ]; then
  echo "No order created — check WA_ORDER_BOT_ENABLED and API logs"
  exit 1
fi
echo "Order: $ORDER_ID"
curl -sf -X POST "$API/api/wa-orders/$ORDER_ID/mark-paid" | python3 -m json.tool
echo "Done — open /customers/whatsapp-orders"
