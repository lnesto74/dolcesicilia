/** Driver dispatch — ETA, pickup, and delivery poll helpers. */

export const WA_DRIVER_ETA_OPTIONS = [
  { minutes: 15, label: 'Under 15 min' },
  { minutes: 30, label: 'Under 30 min' },
  { minutes: 40, label: 'Under 40 min' },
  { minutes: 50, label: 'Under 50 min' },
  { minutes: 60, label: 'Under 60 min' },
];

/** Short id for drivers (legacy fallback), e.g. 1782015578738-2mqunmg → 2mqunmg */
export function shortOrderId(orderId) {
  const id = String(orderId || '');
  const dash = id.lastIndexOf('-');
  return dash >= 0 ? id.slice(dash + 1) : id.slice(-8);
}

/** Bag label number — zero-padded to 3 digits: 1 → 001, 778 → 778 */
export function formatOrderNumber(orderNumber) {
  if (orderNumber == null || orderNumber === '') return null;
  const n = Number(orderNumber);
  if (!Number.isFinite(n) || n < 1) return null;
  return String(Math.floor(n)).padStart(3, '0');
}

/** Display tag for drivers, bags, and polls — prefer numeric order_number. */
export function formatOrderTag(orderOrId) {
  if (orderOrId && typeof orderOrId === 'object') {
    const num = formatOrderNumber(orderOrId.order_number);
    if (num) return `#${num}`;
    if (orderOrId.id) return `#${shortOrderId(orderOrId.id)}`;
    return '#???';
  }
  const s = String(orderOrId || '');
  if (/^\d+$/.test(s)) {
    const num = formatOrderNumber(parseInt(s, 10));
    if (num) return `#${num}`;
  }
  return `#${shortOrderId(s)}`;
}

export function parseOrderTag(text) {
  const raw = String(text || '');
  const numHash = raw.match(/#(\d{1,4})\b/);
  if (numHash) return numHash[1];
  const hash = raw.match(/#([a-z0-9]+)/i);
  if (hash) return hash[1].toLowerCase();
  const dot = raw.match(/^[a-z0-9]+\s*·\s*/i);
  if (dot) {
    const prefix = raw.split('·')[0].trim().replace(/^#/, '');
    if (prefix) return prefix.toLowerCase();
  }
  return null;
}

function parseEtaMinutesFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  for (const opt of WA_DRIVER_ETA_OPTIONS) {
    if (lower.includes(opt.label.toLowerCase())) return opt.minutes;
  }

  const numMatch = lower.match(/under\s*(\d+)/) || lower.match(/(\d+)\s*min/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    const hit = WA_DRIVER_ETA_OPTIONS.find((o) => o.minutes === n);
    if (hit) return hit.minutes;
  }

  if (/^1$/.test(lower)) return 15;
  if (/^2$/.test(lower)) return 30;
  if (/^3$/.test(lower)) return 40;
  if (/^4$/.test(lower)) return 50;
  if (/^5$/.test(lower)) return 60;

  return null;
}

export function waDriverEtaPollOptions(order) {
  const tag = formatOrderTag(order);
  return WA_DRIVER_ETA_OPTIONS.map((o) => `${tag} · ${o.label}`);
}

export function parseDriverEtaReply(text) {
  const minutes = parseEtaMinutesFromText(text);
  if (!minutes) return null;
  return { minutes, orderTag: parseOrderTag(text) };
}

export function driverPickupPollOptions(order) {
  const tag = formatOrderTag(order);
  return [`${tag} · ✅ Picked up`, `${tag} · Not yet`];
}

export function driverDeliveredPollOptions(order) {
  const tag = formatOrderTag(order);
  return [`${tag} · ✅ Delivered`, `${tag} · Not yet`];
}

export function parseDriverPickupReply(text) {
  const orderTag = parseOrderTag(text);
  const lower = String(text || '').toLowerCase();
  if (!orderTag) return null;
  if (lower.includes('not yet')) return null;
  if (lower.includes('picked up') || (lower.includes('✅') && lower.includes('picked'))) {
    return { orderTag };
  }
  return null;
}

export function parseDriverDeliveredReply(text) {
  const orderTag = parseOrderTag(text);
  const lower = String(text || '').toLowerCase();
  if (!orderTag) return null;
  if (lower.includes('not yet')) return null;
  if (lower.includes('delivered') || (lower.includes('✅') && lower.includes('deliver'))) {
    return { orderTag };
  }
  return null;
}

export function customerDriverFoundMessage(etaMinutes) {
  const opt = WA_DRIVER_ETA_OPTIONS.find((o) => o.minutes === etaMinutes);
  const etaLabel = opt?.label?.toLowerCase() || `about ${etaMinutes} minutes`;
  return (
    `Great news 🛵 We found a driver for your tiramisù!\n\n` +
    `Estimated arrival: ${etaLabel}.\n\n` +
    `Sit tight — fresh dolci is on the way. — Chef Luca`
  );
}

export function customerOutForDeliveryMessage(etaMinutes) {
  const opt = WA_DRIVER_ETA_OPTIONS.find((o) => o.minutes === etaMinutes);
  const etaLabel = opt?.label?.toLowerCase() || `about ${etaMinutes} minutes`;
  return (
    `Buone notizie 🛵 Your tiramisù just left the kitchen and is on its way to you.\n\n` +
    `Estimated arrival: ${etaLabel}.\n\n` +
    `See you shortly! — Chef Luca`
  );
}

export function customerTrackingLinkIntroMessage() {
  return '📍 Tap the link below to track your delivery live 👇';
}

export function buildDriverDispatchPollQuestion(order, orderSummary) {
  return `${formatOrderTag(order)} — New delivery. Tap your ETA if you can take it 👇\n\n${orderSummary}`;
}

export function buildDriverAssignmentMessage(order, etaMinutes, pickupAddress) {
  const tag = formatOrderTag(order);
  const dest = order.address_text || '—';
  const postal = order.postal_code ? ` (${order.postal_code})` : '';
  const opt = WA_DRIVER_ETA_OPTIONS.find((o) => o.minutes === etaMinutes);
  const etaLabel = opt?.label?.toLowerCase() || `under ${etaMinutes} min`;
  const pickup = pickupAddress || '65 Chestnut Avenue, Eco Sanctuary, Singapore 679524';

  return [
    "You're assigned ✅",
    '',
    `Order: ${tag}`,
    `Pickup: ${pickup}`,
    `Drop-off: ${dest}${postal}`,
    `Order total: S$${Number(order.total || 0).toFixed(2)}`,
    '',
    `Customer: ${order.customer_name || 'Guest'}`,
    `Phone: ${order.customer_phone}`,
    `Your ETA: ${etaLabel}`,
    '',
    '→ Tap below when you have picked up from the kitchen.',
  ].join('\n');
}

export function buildDriverPickupPollQuestion(order) {
  return `${formatOrderTag(order)} — Confirm pickup from the kitchen 👇`;
}

export function buildDriverDeliveredPollQuestion(order) {
  return `${formatOrderTag(order)} — Confirm delivered to the customer 👇`;
}

/** @deprecated use parseDriverEtaReply */
export function waDriverPollOptions(orderId) {
  return waDriverEtaPollOptions(orderId);
}
