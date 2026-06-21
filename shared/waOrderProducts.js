export const WA_CATALOG_LINK = 'https://wa.me/c/6591329303';

export const WA_ORDER_PRODUCTS = [
  {
    sku: 'classic',
    name: 'Classic Tiramisù',
    description: 'Handmade Sicilian classic — fresh the morning of delivery.',
    price: 15,
    priceLabel: 'S$15',
    catalogLink: WA_CATALOG_LINK,
    active: true,
  },
  {
    sku: 'pistachio',
    name: 'Pistachio Tiramisù',
    description: 'Bronte pistachio — rich and fragrant.',
    price: 16,
    priceLabel: 'S$16',
    catalogLink: WA_CATALOG_LINK,
    active: true,
  },
  {
    sku: 'orange',
    name: 'Orange Liqueur Tiramisù',
    description: 'Sicilian orange liqueur — bright and elegant.',
    price: 16,
    priceLabel: 'S$16',
    catalogLink: WA_CATALOG_LINK,
    active: true,
  },
  {
    sku: 'tray',
    name: 'Sharing Tray (4–6 pax)',
    description: 'For gatherings — prepared fresh for your date.',
    price: 50,
    priceLabel: 'from S$50',
    catalogLink: WA_CATALOG_LINK,
    active: true,
    minQty: 1,
  },
  {
    sku: 'birthday',
    name: 'Birthday Set',
    description: 'Tray + candle + personal message — reserve in advance.',
    price: 80,
    priceLabel: 'from S$80',
    catalogLink: WA_CATALOG_LINK,
    active: true,
    minQty: 1,
  },
];

export const WA_ORDER_STATUS_LABELS = {
  new: 'New',
  awaiting_item: 'Choosing items',
  awaiting_qty: 'Quantity',
  awaiting_timing: 'Timing',
  awaiting_address: 'Address',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  scheduled: 'Scheduled',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const WA_ORDER_TIMELINE = [
  { key: 'awaiting_payment', label: 'Awaiting pay' },
  { key: 'paid', label: 'Paid' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'out_for_delivery', label: 'Delivering' },
  { key: 'completed', label: 'Done' },
];

const PRE_PAYMENT_STATUSES = [
  'new',
  'awaiting_item',
  'awaiting_qty',
  'awaiting_timing',
  'awaiting_address',
];

export function resolveWaTimelineStep(status) {
  if (status === 'cancelled') return 'cancelled';
  if (PRE_PAYMENT_STATUSES.includes(status)) return 'awaiting_payment';
  if (WA_ORDER_TIMELINE.some((s) => s.key === status)) return status;
  return 'awaiting_payment';
}

export function waTimelineStepIndex(step) {
  return WA_ORDER_TIMELINE.findIndex((s) => s.key === step);
}

export function formatWaOrderBagTag(orderNumber) {
  if (orderNumber == null) return null;
  const n = Number(orderNumber);
  if (!Number.isFinite(n) || n < 1) return null;
  return `#${String(Math.floor(n)).padStart(3, '0')}`;
}

export function activeWaProducts() {
  return WA_ORDER_PRODUCTS.filter((p) => p.active);
}

export function waProductByMenuNumber(n) {
  const products = activeWaProducts();
  return products[n - 1] || null;
}

export function waProductBySku(sku) {
  return WA_ORDER_PRODUCTS.find((p) => p.sku === sku && p.active) || null;
}

export function buildWaOrderMenuText(catalogLink = WA_CATALOG_LINK) {
  const lines = activeWaProducts().map(
    (p, i) => `${i + 1}️⃣ ${p.name} — ${p.priceLabel}`,
  );
  return [
    'Ciao 👋 Welcome to Dolce Sicilia — Chef Luca here.',
    'Everything is handmade fresh the morning of delivery. 🍃',
    `Tap to see photos: ${catalogLink}`,
    '',
    'What would you like today? Reply with the number:',
    ...lines,
  ].join('\n');
}

export function isWaOrderTrigger(text) {
  const t = String(text || '').toLowerCase();
  return /order|tiramis|tiramisu|tiramisù|chef luca|dolce sicilia|menu|birthday/.test(t);
}

export function computeWaCartSubtotal(items) {
  return (items || []).reduce((sum, i) => sum + i.qty * i.unit_price, 0);
}

export function formatWaOrderItems(items) {
  if (!items?.length) return '(no items)';
  return items
    .map((i) => `• ${i.qty}× ${i.name} — S$${(i.qty * i.unit_price).toFixed(2)}`)
    .join('\n');
}
