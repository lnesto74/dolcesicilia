# WhatsApp Orders

Turn inbound WhatsApp messages (Meta ad “Order Now” → +65 9132 9303) into a guided ordering flow with dashboard management.

## Stack (existing repo)

- **DB:** SQLite via `better-sqlite3` in `server/src/db.js` (no ORM)
- **Bot:** State machine in `server/src/waOrderBot.js`, triggered by OpenWA **`message.received` webhook** (same persistent API process as the rest of the app — no separate worker binary)
- **Admin UI:** `/customers/whatsapp-orders`

## Env vars (`server/.env`)

```bash
# Bot
WA_ORDER_BOT_ENABLED=true

# Payment — hitpay (default) or paynow fallback
WA_ORDER_PAYMENT_PROVIDER=hitpay
HITPAY_API_KEY=
HITPAY_WEBHOOK_SALT=
HITPAY_SANDBOX=true
PAYNOW_PHONE=+6591329303
PAYNOW_UEN=

# Owner alerts (WhatsApp to this number when order starts / paid)
OWNER_NOTIFY_PHONE=+65XXXXXXXX

# Delivery zone — 65 Chestnut Avenue, Singapore
BAKERY_LAT=1.3691
BAKERY_LNG=103.7764
GRAB_ZONE_RADIUS_KM=3
DELIVERY_FEE_IN_ZONE=3
DELIVERY_FEE_OUT_ZONE=12
GRAB_STORE_LINK=https://r.grab.com/o/FjYFNJru
WA_CATALOG_LINK=https://wa.me/c/6591329303

# OneMap geocoding (postal → lat/lng)
ONEMAP_TOKEN=
# or ONEMAP_EMAIL + ONEMAP_PASSWORD for token fetch

# Public URL for HitPay redirect + webhook (Tailscale or production host)
PUBLIC_BASE_URL=https://100.x.x.x:5173
```

## Run

1. `./scripts/restart.sh` — rebuilds UI, starts API `:3001` + web `:5173`
2. Enable OpenWA in **Messages → Settings** and ensure webhook is registered:
   - `POST /api/whatsapp/setup-webhook`
3. Open dashboard: **WA Orders** tab or `/customers/whatsapp-orders`

## HitPay webhook URL

Register in HitPay dashboard:

```
{PUBLIC_BASE_URL}/api/wa-orders/hitpay-webhook
```

For local/Tailscale testing, `PUBLIC_BASE_URL` must be reachable from HitPay (use Tailscale funnel or ngrok).

## Meta ad trigger link

Button (pre-filled message — **required** for bot to start):

```
https://wa.me/6591329303?text=Hi%20Chef%20Luca!%20I'd%20like%20to%20order%20tiramis%C3%B9%20%F0%9F%8D%B0
```

Catalog browse only (does **not** start bot):

```
https://wa.me/c/6591329303
```

## Bot flow (reply-only, numbered menu)

1. Greeting + menu (`awaiting_item`)
2. Pick item → quantity (`awaiting_qty`) → ADD / DONE
3. Timing NOW or date (`awaiting_timing`)
4. Address + postal (`awaiting_address`) → OneMap zone check
5. Quote + payment link (`awaiting_payment`)
6. HitPay webhook or owner “Mark paid” → confirmation + owner notify

**CANCEL** any time.

State is stored in `wa_conversations` + `wa_orders` — survives API restart.

## Products (`wa_products`)

Seeded on first boot to mirror catalog:

| SKU | Name | Price |
|-----|------|-------|
| classic | Classic Tiramisù | S$15 |
| pistachio | Pistachio Tiramisù | S$16 |
| orange | Orange Liqueur Tiramisù | S$16 |
| tray | Sharing Tray | from S$50 |
| birthday | Birthday Set | from S$80 |

Update prices in DB or re-seed via SQL if catalog changes.

## End-to-end test

```bash
# 1. Simulate inbound trigger (API must be running, OpenWA enabled for real sends)
curl -s -X POST http://127.0.0.1:3001/api/whatsapp/webhook \
  -H 'Content-Type: application/json' \
  -d '{"event":"message.received","data":{"from":"6591234567@c.us","body":"Hi Chef Luca! I'\''d like to order tiramisù 🍰","type":"chat"}}'

# 2. Continue conversation (replace phone with test number)
for msg in "1" "2" "DONE" "NOW" "65 Chestnut Avenue 679513"; do
  curl -s -X POST http://127.0.0.1:3001/api/whatsapp/webhook \
    -H 'Content-Type: application/json' \
    -d "{\"event\":\"message.received\",\"data\":{\"from\":\"6591234567@c.us\",\"body\":\"$msg\",\"type\":\"chat\"}}"
  echo
done

# 3. List orders
curl -s http://127.0.0.1:3001/api/wa-orders | jq '.orders[0]'

# 4. Mark paid (PayNow fallback path)
ORDER_ID=$(curl -s http://127.0.0.1:3001/api/wa-orders | jq -r '.orders[0].id')
curl -s -X POST "http://127.0.0.1:3001/api/wa-orders/$ORDER_ID/mark-paid"
```

Or run `./scripts/test-wa-order-flow.sh`.

## Future upgrade path

Native WhatsApp buttons / WhatsApp Flows require **Meta Cloud API** (official). OpenWA remains reply-only for v1 to reduce ban risk.

## Out of scope (v1)

- Automated Lalamove/Pickupp booking — owner books manually; hook: `advanceWaOrderStatus(id, 'out_for_delivery')`
