/** WhatsApp Orders — env-backed config (server-side). */

const DEFAULT_BAKERY = { lat: 1.3691, lng: 103.7764 }; // 65 Chestnut Avenue (OneMap approx)

export function waOrderConfig() {
  const provider = (process.env.WA_ORDER_PAYMENT_PROVIDER || 'hitpay').toLowerCase();
  return {
    enabled: process.env.WA_ORDER_BOT_ENABLED !== 'false',
    paymentProvider: provider,
    hitpayApiKey: process.env.HITPAY_API_KEY || '',
    hitpayWebhookSalt: process.env.HITPAY_WEBHOOK_SALT || '',
    hitpaySandbox: process.env.HITPAY_SANDBOX === 'true',
    paynowPhone: process.env.PAYNOW_PHONE || '+6591329303',
    paynowUen: process.env.PAYNOW_UEN || '',
    ownerNotifyPhone: process.env.OWNER_NOTIFY_PHONE || '',
    bakeryLat: Number(process.env.BAKERY_LAT) || DEFAULT_BAKERY.lat,
    bakeryLng: Number(process.env.BAKERY_LNG) || DEFAULT_BAKERY.lng,
    bakeryAddress:
      process.env.BAKERY_ADDRESS ||
      '65 Chestnut Avenue, Eco Sanctuary, Singapore 679524',
    grabZoneRadiusKm: Number(process.env.GRAB_ZONE_RADIUS_KM) || 3,
    deliveryFeeInZone: Number(process.env.DELIVERY_FEE_IN_ZONE) || 3,
    deliveryFeeOutZone: Number(process.env.DELIVERY_FEE_OUT_ZONE) || 12,
    grabStoreLink: process.env.GRAB_STORE_LINK || 'https://r.grab.com/o/FjYFNJru',
    catalogLink: process.env.WA_CATALOG_LINK || 'https://wa.me/c/6591329303',
    onemapToken: process.env.ONEMAP_TOKEN || '',
    onemapEmail: process.env.ONEMAP_EMAIL || '',
    onemapPassword: process.env.ONEMAP_PASSWORD || '',
    idleTimeoutHours: Number(process.env.WA_ORDER_IDLE_HOURS) || 24,
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  };
}

export function hitpayBaseUrl(sandbox) {
  return sandbox ? 'https://api.sandbox.hit-pay.com' : 'https://api.hit-pay.com';
}
