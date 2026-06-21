/** Parse WhatsApp Business catalog cart (OpenWA message type: order). */

function parseMoney(raw) {
  if (raw == null || raw === '') return 0;
  const s = String(raw).replace(/[^\d.]/g, '');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return n;
}

/**
 * WhatsApp Business catalog stores SGD as integer ×1000 (35000 → S$35).
 * Some payloads use cents (3500 → S$35). Pick the scale that yields realistic prices.
 */
export function pickCatalogPriceScale(rawValues) {
  const values = rawValues.filter((v) => v > 0);
  if (!values.length) return 1;

  let best = { scale: 1, score: Infinity };
  for (const scale of [1000, 100, 1]) {
    const norm = values.map((v) => v / scale);
    const max = Math.max(...norm);
    const min = Math.min(...norm);
    if (min < 0.5 || max > 500) continue;
    const score = max;
    if (score < best.score) best = { scale, score };
  }
  return best.scale;
}

function normalizeUnitPrice(raw, scale) {
  const n = typeof raw === 'number' ? raw : parseMoney(raw);
  if (!n) return 0;
  return Math.round((n / scale) * 100) / 100;
}

/** Fix orders saved before catalog price-scale detection (×1000 inflation). */
export function deflateInflatedWaOrderPrices(order) {
  if (!order?.items?.length) return order;
  const maxUnit = Math.max(...order.items.map((i) => i.unit_price || 0), order.subtotal || 0);
  if (maxUnit < 500) return order;

  const scale = pickCatalogPriceScale([
    ...order.items.map((i) => i.unit_price),
    order.subtotal,
  ]);
  if (scale === 1) return order;

  const items = order.items.map((i) => ({
    ...i,
    unit_price: Math.round((i.unit_price / scale) * 100) / 100,
  }));
  const subtotal = Math.round((order.subtotal / scale) * 100) / 100;
  const total = Math.round((subtotal + (order.delivery_fee || 0)) * 100) / 100;
  return { ...order, items, subtotal, total };
}

export function parseWhatsAppCatalogOrder(webhookData = {}) {
  const order =
    webhookData.order ||
    webhookData.metadata?.order ||
    webhookData.raw?.order ||
    webhookData.message?.order ||
    webhookData._data?.order ||
    (webhookData.products ? webhookData : null);
  if (!order) return null;

  const rawProducts =
    order.products ||
    order.productItems ||
    order.items ||
    webhookData.products ||
    [];

  if (!Array.isArray(rawProducts) || rawProducts.length === 0) return null;

  const rawPrices = rawProducts.map(
    (p) => p.price ?? p.itemPrice ?? p.amount ?? p.priceAmount ?? p.retailPrice ?? 0,
  );
  const subtotalRaw = parseMoney(order.subtotal ?? order.total ?? order.estimatedTotal);
  const scale = pickCatalogPriceScale([...rawPrices, subtotalRaw].filter((v) => v > 0));

  const items = rawProducts.map((p, idx) => {
    const qty = Number(p.qty ?? p.quantity ?? p.count ?? 1) || 1;
    const name = p.name || p.title || p.productName || `Item ${idx + 1}`;
    const unitPrice = normalizeUnitPrice(
      p.price ?? p.itemPrice ?? p.amount ?? p.priceAmount ?? p.retailPrice,
      scale,
    );
    return {
      sku: String(p.id || p.retailerId || p.productId || `catalog-${idx}`),
      name,
      qty,
      unit_price: unitPrice,
    };
  });

  let subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const subtotalNorm = subtotalRaw > 0 ? normalizeUnitPrice(subtotalRaw, scale) : 0;

  if (subtotalNorm > 0 && subtotal < 0.01) {
    const totalQty = items.reduce((s, i) => s + i.qty, 0) || 1;
    const perUnit = subtotalNorm / totalQty;
    for (const i of items) i.unit_price = Math.round(perUnit * 100) / 100;
    subtotal = subtotalNorm;
  } else if (subtotalNorm > 0) {
    subtotal = subtotalNorm;
  }

  return {
    items,
    subtotal: Math.round(subtotal * 100) / 100,
    currency: order.currency || 'SGD',
    orderId: order.id || null,
  };
}

export function isWhatsAppCatalogOrderMessage(messageType, webhookData) {
  if (messageType === 'order') return true;
  return !!parseWhatsAppCatalogOrder(webhookData);
}
