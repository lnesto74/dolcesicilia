import {
  buildWaOrderMenuText,
  waProductByMenuNumber,
  waProductBySku,
  computeWaCartSubtotal,
  formatWaOrderItems,
  isWaOrderTrigger,
} from '../../shared/waOrderProducts.js';
import {
  parseWhatsAppCatalogOrder,
  isWhatsAppCatalogOrderMessage,
} from '../../shared/waOrderCatalog.js';
import { waOrderConfig } from '../../shared/waOrderConfig.js';
import {
  getWaConversation,
  upsertWaConversation,
  clearWaConversation,
  createWaOrder,
  getWaOrder,
  getActiveWaOrderForPhone,
  transitionWaOrder,
  updateWaOrder,
  logWaOrderEvent,
  findContactByPhone,
  logWhatsAppInteraction,
  getLastDeliveryAddressForPhone,
} from './db.js';
import { geocodeSingaporeAddress } from './waOrderZone.js';
import { createWaOrderPaymentLink, markWaOrderPaidManual } from './waOrderPayment.js';
import { notifyOwnerWaOrderStarted } from './waOrderNotify.js';
import { sendTextMessage, ensureWhatsAppReady, openwaConfig, phoneFromWhatsAppFrom, fetchOpenWaOrder, fetchOpenWaOrderFromMessage } from './openwa.js';

const CANCEL_WORDS = new Set(['cancel', 'stop', 'quit']);

async function reply(phone, text, contactId) {
  const cfg = openwaConfig();
  logWhatsAppInteraction({
    contactId: contactId || null,
    phone,
    direction: 'out',
    messageType: 'text',
    body: text.slice(0, 500),
  });
  if (!cfg.enabled) return { ok: false, error: 'OpenWA disabled' };
  const ready = await ensureWhatsAppReady();
  if (!ready.ok) return ready;
  await sendTextMessage(phone, text);
  return { ok: true };
}

function normalizeInput(body) {
  return String(body || '').trim();
}

function parseQty(text) {
  const n = parseInt(text.replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 && n <= 99 ? n : null;
}

function parseTiming(text) {
  const t = text.toUpperCase().trim();
  if (t === 'NOW' || t === 'TODAY') {
    return { deliveryType: 'now', scheduledFor: null };
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed) && parsed > Date.now()) {
    return { deliveryType: 'scheduled', scheduledFor: new Date(parsed).toISOString() };
  }
  const rel = text.match(/(\d{1,2})\s*(am|pm)/i);
  if (rel) {
    const d = new Date();
    let hour = parseInt(rel[1], 10);
    if (/pm/i.test(rel[2]) && hour < 12) hour += 12;
    if (/am/i.test(rel[2]) && hour === 12) hour = 0;
    d.setHours(hour, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return { deliveryType: 'scheduled', scheduledFor: d.toISOString() };
  }
  return null;
}

async function startOrderFlow(phone, name) {
  const cfg = waOrderConfig();
  const order = createWaOrder({ phone, name, status: 'awaiting_item' });
  upsertWaConversation({
    phone,
    orderId: order.id,
    state: 'awaiting_item',
    context: { cart: [] },
  });
  await notifyOwnerWaOrderStarted(order);
  const menu = buildWaOrderMenuText(cfg.catalogLink);
  await reply(phone, menu);
  return { handled: true, started: true, orderId: order.id };
}

async function handleAwaitingItem(order, conv, text, phone, contactId) {
  const upper = text.toUpperCase();
  const ctx = conv.context || { cart: [] };

  if (upper === 'DONE') {
    if (!ctx.cart?.length) {
      await reply(phone, 'Your cart is empty — reply with a number from the menu first.', contactId);
      return { handled: true };
    }
    transitionWaOrder(order.id, {
      fromState: 'awaiting_item',
      toState: 'awaiting_timing',
    });
    upsertWaConversation({ phone, orderId: order.id, state: 'awaiting_timing', context: ctx });
    await reply(
      phone,
      'When would you like it? Reply NOW for today, or a date & time (e.g. "Sat 3pm") to reserve it fresh for the day. 🎂',
      contactId,
    );
    return { handled: true };
  }

  if (upper === 'ADD') {
    const cfg = waOrderConfig();
    await reply(phone, buildWaOrderMenuText(cfg.catalogLink), contactId);
    return { handled: true };
  }

  const menuNum = parseInt(text, 10);
  const product = waProductByMenuNumber(menuNum);
  if (!product || product.price == null) {
    await reply(phone, 'Reply with a number from the menu (1–5), ADD, or DONE.', contactId);
    return { handled: true };
  }

  ctx.pendingSku = product.sku;
  ctx.pendingName = product.name;
  ctx.pendingUnitPrice = product.price;
  upsertWaConversation({ phone, orderId: order.id, state: 'awaiting_qty', context: ctx });
  transitionWaOrder(order.id, { fromState: 'awaiting_item', toState: 'awaiting_qty' });
  await reply(
    phone,
    `Lovely choice — ${product.name}. How many? (reply a number)\nOr reply ADD to add another item, or DONE to continue.`,
    contactId,
  );
  return { handled: true };
}

async function handleAwaitingQty(order, conv, text, phone, contactId) {
  const upper = text.toUpperCase();
  const ctx = conv.context || { cart: [] };

  if (upper === 'ADD') {
    upsertWaConversation({ phone, orderId: order.id, state: 'awaiting_item', context: ctx });
    transitionWaOrder(order.id, { fromState: 'awaiting_qty', toState: 'awaiting_item' });
    const cfg = waOrderConfig();
    await reply(phone, buildWaOrderMenuText(cfg.catalogLink), contactId);
    return { handled: true };
  }

  if (upper === 'DONE') {
    if (!ctx.cart?.length) {
      await reply(phone, 'Tell me how many first (reply a number), or pick another item with ADD.', contactId);
      return { handled: true };
    }
    upsertWaConversation({ phone, orderId: order.id, state: 'awaiting_timing', context: ctx });
    transitionWaOrder(order.id, { fromState: 'awaiting_qty', toState: 'awaiting_timing' });
    await reply(
      phone,
      'When would you like it? Reply NOW for today, or a date & time (e.g. "Sat 3pm") to reserve it fresh for the day. 🎂',
      contactId,
    );
    return { handled: true };
  }

  const qty = parseQty(text);
  if (!qty || !ctx.pendingSku) {
    await reply(phone, 'Reply with a number (how many), ADD, or DONE.', contactId);
    return { handled: true };
  }

  const product = waProductBySku(ctx.pendingSku);
  ctx.cart = ctx.cart || [];
  ctx.cart.push({
    sku: ctx.pendingSku,
    name: ctx.pendingName || product?.name || ctx.pendingSku,
    qty,
    unit_price: ctx.pendingUnitPrice || product?.price || 0,
  });
  delete ctx.pendingSku;
  delete ctx.pendingName;
  delete ctx.pendingUnitPrice;

  const subtotal = computeWaCartSubtotal(ctx.cart);
  updateWaOrder(order.id, { items: ctx.cart, subtotal });
  upsertWaConversation({ phone, orderId: order.id, state: 'awaiting_item', context: ctx });
  transitionWaOrder(order.id, { fromState: 'awaiting_qty', toState: 'awaiting_item' });

  await reply(
    phone,
    `Added ${qty}× ${ctx.cart[ctx.cart.length - 1].name}.\n\nCart:\n${formatWaOrderItems(ctx.cart)}\n\nReply ADD for another item, or DONE to continue.`,
    contactId,
  );
  return { handled: true };
}

async function applyAddressAndQuote(order, conv, geo, phone, contactId, addressText) {
  if (!geo.inGrabZone) {
    await reply(
      phone,
      "You're a little outside our quick-delivery ring, so I'll arrange a private courier to bring it to you, fresh. ❤️",
      contactId,
    );
  }

  const cartItems = (order.items?.length ? order.items : conv.context?.cart) || [];
  const subtotal = computeWaCartSubtotal(cartItems);
  const total = subtotal + geo.deliveryFee;
  updateWaOrder(order.id, {
    address_text: geo.formatted || addressText,
    postal_code: geo.postalCode,
    lat: geo.lat,
    lng: geo.lng,
    in_grab_zone: geo.inGrabZone,
    delivery_fee: geo.deliveryFee,
    items: cartItems,
    subtotal,
    total,
  });

  transitionWaOrder(order.id, { fromState: order.status, toState: 'awaiting_payment' });
  upsertWaConversation({
    phone,
    orderId: order.id,
    state: 'awaiting_payment',
    context: { ...conv.context, cart: cartItems },
  });

  const refreshed = getWaOrder(order.id);
  const pay = await createWaOrderPaymentLink(refreshed);
  let payBody = pay.message.replace(/^Here's your order:\s*\n+/i, '').trim();
  payBody = payBody.replace(/^Total:\s*S\$[\d.]+\s*\n+/i, '').trim();
  const quote = [
    "Here's your order:",
    formatWaOrderItems(refreshed.items),
    '',
    `Delivery: S$${geo.deliveryFee.toFixed(2)}`,
    `Total: S$${total.toFixed(2)}`,
    '',
    payBody,
  ].join('\n');
  await reply(phone, quote, contactId);
}

const ADDRESS_CONFIRM_YES = new Set(['yes', 'y', '1', 'ok', 'correct', 'si', 'sì', 'yeah', 'confirm']);
const ADDRESS_CONFIRM_NO = new Set(['no', 'n', '2', 'new', 'change', 'different']);

async function proceedToAddressStep(order, conv, phone, contactId) {
  const saved = getLastDeliveryAddressForPhone(phone, { excludeOrderId: order.id });
  if (saved?.address_text) {
    transitionWaOrder(order.id, {
      fromState: order.status,
      toState: 'awaiting_address_confirm',
    });
    upsertWaConversation({
      phone,
      orderId: order.id,
      state: 'awaiting_address_confirm',
      context: { ...(conv.context || {}), savedAddress: saved },
    });
    await reply(
      phone,
      [
        'Welcome back 🤍',
        '',
        'Is this still your delivery address?',
        '',
        saved.address_text + (saved.postal_code ? ` · ${saved.postal_code}` : ''),
        '',
        'Reply YES to confirm, or NO to send a new address.',
      ].join('\n'),
      contactId,
    );
    return;
  }

  transitionWaOrder(order.id, { fromState: order.status, toState: 'awaiting_address' });
  upsertWaConversation({ phone, orderId: order.id, state: 'awaiting_address', context: conv.context });
  await reply(
    phone,
    'Please share your delivery address and postal code so I can arrange everything.',
    contactId,
  );
}

async function handleAwaitingAddressConfirm(order, conv, text, phone, contactId) {
  const lower = text.toLowerCase().trim();
  const saved = conv.context?.savedAddress;

  if (ADDRESS_CONFIRM_NO.has(lower)) {
    transitionWaOrder(order.id, {
      fromState: 'awaiting_address_confirm',
      toState: 'awaiting_address',
    });
    upsertWaConversation({
      phone,
      orderId: order.id,
      state: 'awaiting_address',
      context: conv.context,
    });
    await reply(
      phone,
      'No problem — please send your full delivery address with 6-digit postal code.',
      contactId,
    );
    return { handled: true };
  }

  if (!ADDRESS_CONFIRM_YES.has(lower)) {
    await reply(phone, 'Reply YES to keep this address, or NO to send a new one.', contactId);
    return { handled: true };
  }

  if (!saved?.address_text) {
    transitionWaOrder(order.id, {
      fromState: 'awaiting_address_confirm',
      toState: 'awaiting_address',
    });
    upsertWaConversation({ phone, orderId: order.id, state: 'awaiting_address', context: conv.context });
    await reply(phone, 'Please share your delivery address and postal code.', contactId);
    return { handled: true };
  }

  const geo = saved.lat && saved.lng
    ? {
        ok: true,
        formatted: saved.address_text,
        postalCode: saved.postal_code,
        lat: saved.lat,
        lng: saved.lng,
        inGrabZone: saved.in_grab_zone,
        deliveryFee: saved.delivery_fee ?? (saved.in_grab_zone ? waOrderConfig().deliveryFeeInZone : waOrderConfig().deliveryFeeOutZone),
      }
    : await geocodeSingaporeAddress(saved.address_text);

  if (!geo.ok) {
    transitionWaOrder(order.id, {
      fromState: 'awaiting_address_confirm',
      toState: 'awaiting_address',
    });
    upsertWaConversation({ phone, orderId: order.id, state: 'awaiting_address', context: conv.context });
    await reply(phone, 'I couldn\'t verify that address — please send your full address + postal code.', contactId);
    return { handled: true };
  }

  await applyAddressAndQuote(order, conv, geo, phone, contactId, saved.address_text);
  return { handled: true };
}

async function handleAwaitingTiming(order, conv, text, phone, contactId) {
  const timing = parseTiming(text);
  if (!timing) {
    await reply(phone, 'Reply NOW for today, or a date & time like "Sat 3pm".', contactId);
    return { handled: true };
  }
  updateWaOrder(order.id, {
    delivery_type: timing.deliveryType,
    scheduled_for: timing.scheduledFor,
  });
  await proceedToAddressStep(order, conv, phone, contactId);
  return { handled: true };
}

async function handleAwaitingAddress(order, conv, text, phone, contactId) {
  const geo = await geocodeSingaporeAddress(text);
  if (!geo.ok) {
    await reply(phone, `${geo.error}\n\nPlease send full address + 6-digit postal code.`, contactId);
    return { handled: true };
  }

  await applyAddressAndQuote(order, conv, geo, phone, contactId, text);
  return { handled: true };
}

async function handleAwaitingPayment(order, conv, text, phone, contactId) {
  const upper = text.toUpperCase();
  if (upper === 'PAID' || upper.startsWith('PAID ')) {
    await markWaOrderPaidManual(order.id);
    clearWaConversation(phone);
    return { handled: true, paid: true };
  }
  await reply(
    phone,
    'Once payment is complete, you\'re all set 🤍\nIf you paid via PayNow, reply PAID with your screenshot.',
    contactId,
  );
  return { handled: true };
}

async function handleCancel(order, phone, contactId) {
  transitionWaOrder(order.id, {
    fromState: order.status,
    toState: 'cancelled',
    event: 'cancelled_by_customer',
  });
  clearWaConversation(phone);
  await reply(phone, 'No problem — order cancelled. Message anytime to order again. 🌿', contactId);
  return { handled: true, cancelled: true };
}

async function resolveCatalogPayload(webhookData) {
  let parsed = parseWhatsAppCatalogOrder(webhookData);
  if (parsed?.items?.length) return parsed;

  if (webhookData?.order) {
    parsed = parseWhatsAppCatalogOrder({ order: webhookData.order, ...webhookData });
    if (parsed?.items?.length) return parsed;
  }

  const fetchedOrder = await fetchOpenWaOrderFromMessage(webhookData);
  if (fetchedOrder) {
    parsed = parseWhatsAppCatalogOrder({ order: fetchedOrder, ...webhookData });
    if (parsed?.items?.length) return parsed;
  }

  const orderId =
    webhookData.orderId ||
    webhookData.order?.id ||
    webhookData.metadata?.orderId ||
    webhookData.metadata?.order?.id;
  if (orderId) {
    const fetched = await fetchOpenWaOrder(orderId);
    parsed = parseWhatsAppCatalogOrder({ order: fetched, ...webhookData });
    if (parsed?.items?.length) return parsed;
  }
  return null;
}

function advanceExistingOrderToTiming(existing, parsed, phone, contact) {
  const items = parsed?.items?.length ? parsed.items : existing.items || [];
  const subtotal =
    parsed?.subtotal > 0 ? parsed.subtotal : computeWaCartSubtotal(items);
  transitionWaOrder(existing.id, {
    fromState: existing.status,
    toState: 'awaiting_timing',
    patch: {
      items,
      subtotal,
      notes: parsed?.unparsed ? 'catalog_cart_unparsed' : 'catalog_cart',
    },
    event: 'catalog_cart_received',
    detail: parsed?.unparsed ? 'no_line_items_in_webhook' : undefined,
  });
  upsertWaConversation({
    phone,
    orderId: existing.id,
    state: 'awaiting_timing',
    context: { cart: items, source: 'catalog' },
  });
  return getWaOrder(existing.id);
}

async function handleCatalogOrder(phone, webhookData, contact, contactId) {
  let parsed = await resolveCatalogPayload(webhookData);
  const unparsed = !parsed?.items?.length;
  if (unparsed) {
    console.warn(
      '[wa-order] catalog cart — could not read line items',
      JSON.stringify(webhookData).slice(0, 300),
    );
    await reply(
      phone,
      'Perfetto — I received your cart 🤍\n\nI couldn\'t read the item list this time. Please open the menu and send your cart again (tap Send on the cart). — Chef Luca',
      contactId,
    );
    return { handled: true, catalogOrder: true, unparsed: true, retry: true };
  }

  const existing = getActiveWaOrderForPhone(phone);

  // Each catalog cart = new bag number (don't merge into an open trigger-only order).
  if (existing) {
    transitionWaOrder(existing.id, {
      fromState: existing.status,
      toState: 'cancelled',
      event: 'replaced_by_catalog',
    });
    clearWaConversation(phone);
  }

  const order = createWaOrder({ phone, name: contact?.name, status: 'awaiting_timing' });
  updateWaOrder(order.id, {
    items: parsed.items,
    subtotal: parsed.subtotal,
    notes: unparsed ? 'catalog_cart_unparsed' : parsed.orderId ? `catalog_order:${parsed.orderId}` : 'catalog_cart',
  });
  upsertWaConversation({
    phone,
    orderId: order.id,
    state: 'awaiting_timing',
    context: { cart: parsed.items, source: 'catalog' },
  });
  const freshOrder = getWaOrder(order.id);

  const summary = unparsed || !parsed.items.length
    ? [
        'Perfetto — I received your cart from the menu 🤍',
        '',
        'When would you like it? Reply NOW for today, or a date & time (e.g. "Sat 3pm") to reserve it fresh for the day. 🎂',
      ].join('\n')
    : [
        'Perfetto — I received your cart from the menu 🤍',
        '',
        formatWaOrderItems(parsed.items),
        `Subtotal: S$${parsed.subtotal.toFixed(2)} (estimated)`,
        '',
        'When would you like it? Reply NOW for today, or a date & time (e.g. "Sat 3pm") to reserve it fresh for the day. 🎂',
      ].join('\n');

  await reply(phone, summary, contactId);

  try {
    await notifyOwnerWaOrderStarted(freshOrder);
  } catch (err) {
    console.warn('[wa-order] owner notify failed (customer already replied):', err.message);
  }

  return { handled: true, catalogOrder: true, orderId: order.id, unparsed };
}

export async function handleWaOrderInbound(from, body, messageType = 'chat', webhookData = {}) {
  const cfg = waOrderConfig();
  if (!cfg.enabled) return { handled: false, reason: 'bot_disabled' };

  const phone = await phoneFromWhatsAppFrom(from);
  if (!phone) return { handled: false, reason: 'no_phone' };

  const contact = findContactByPhone(phone);
  const contactId = contact?.id;
  const isCatalogOrder = isWhatsAppCatalogOrderMessage(messageType, webhookData);

  const text = normalizeInput(body);
  const logBody = isCatalogOrder
    ? `[catalog cart ${parseWhatsAppCatalogOrder(webhookData)?.items?.length || 0} items]`
    : text.slice(0, 500);

  logWhatsAppInteraction({
    contactId,
    phone,
    direction: 'in',
    messageType: isCatalogOrder ? 'order' : messageType,
    body: logBody,
  });

  if (isCatalogOrder) {
    return handleCatalogOrder(phone, webhookData, contact, contactId);
  }

  if (!text) return { handled: false, reason: 'empty' };

  let conv = getWaConversation(phone);
  let order = conv?.order_id ? getWaOrder(conv.order_id) : getActiveWaOrderForPhone(phone);

  if (CANCEL_WORDS.has(text.toLowerCase()) && order && !['completed', 'cancelled', 'paid'].includes(order.status)) {
    return handleCancel(order, phone, contactId);
  }

  const activeStates = [
    'awaiting_item', 'awaiting_qty', 'awaiting_timing',
    'awaiting_address_confirm', 'awaiting_address', 'awaiting_payment',
  ];

  if (!conv && !order && isWaOrderTrigger(text)) {
    return startOrderFlow(phone, contact?.name);
  }

  if (!conv && order && activeStates.includes(order.status)) {
    conv = upsertWaConversation({
      phone,
      orderId: order.id,
      state: order.status,
      context: { cart: order.items || [] },
    });
  }

  if (!conv || conv.current_state === 'idle') {
    if (isWaOrderTrigger(text)) {
      return startOrderFlow(phone, contact?.name);
    }
    return { handled: false };
  }

  order = getWaOrder(conv.order_id);
  if (!order || ['completed', 'cancelled'].includes(order.status)) {
    clearWaConversation(phone);
    if (isWaOrderTrigger(text)) return startOrderFlow(phone, contact?.name);
    return { handled: false };
  }

  upsertWaConversation({
    phone,
    orderId: order.id,
    state: conv.current_state,
    context: conv.context,
  });

  const state = conv.current_state;
  if (state === 'awaiting_item') return handleAwaitingItem(order, conv, text, phone, contactId);
  if (state === 'awaiting_qty') return handleAwaitingQty(order, conv, text, phone, contactId);
  if (state === 'awaiting_timing') return handleAwaitingTiming(order, conv, text, phone, contactId);
  if (state === 'awaiting_address_confirm') {
    return handleAwaitingAddressConfirm(order, conv, text, phone, contactId);
  }
  if (state === 'awaiting_address') return handleAwaitingAddress(order, conv, text, phone, contactId);
  if (state === 'awaiting_payment') return handleAwaitingPayment(order, conv, text, phone, contactId);

  return { handled: false };
}

export async function sendWaOrderReply(orderId, messageBody) {
  const order = getWaOrder(orderId);
  if (!order) throw new Error('Order not found');
  const text = String(messageBody || '').trim();
  if (!text) throw new Error('message required');
  return reply(order.customer_phone, text);
}

function customerStatusMessage(order, status) {
  if (status === 'scheduled') {
    const when =
      order.delivery_type === 'now' || !order.scheduled_for
        ? 'for today'
        : `for ${new Date(order.scheduled_for).toLocaleString('en-SG', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}`;
    return `Chef Luca is preparing your tiramisù fresh ${when}. I'll message you when it's on the way. 🤍`;
  }
  if (status === 'out_for_delivery') {
    return 'Buone notizie 🛵 Your tiramisù just left the kitchen and is on its way to you. See you shortly! — Chef Luca';
  }
  if (status === 'completed') {
    return 'Grazie di cuore 🤍 Enjoy every bite — you\'re always welcome at our table. — Chef Luca';
  }
  if (status === 'cancelled') {
    return 'Your order has been cancelled. Message anytime if you\'d like to order again. 🌿';
  }
  return null;
}

export async function advanceWaOrderStatus(orderId, status) {
  const order = getWaOrder(orderId);
  if (!order) throw new Error('Order not found');
  const allowed = ['scheduled', 'out_for_delivery', 'completed', 'cancelled'];
  if (!allowed.includes(status)) throw new Error('Invalid status');

  const updated = transitionWaOrder(orderId, {
    fromState: order.status,
    toState: status,
    event: 'admin_status',
    detail: status,
  });

  const text = customerStatusMessage(updated, status);
  if (!text) return { order: updated, whatsapp: { sent: false, skipped: true } };

  const contact = findContactByPhone(updated.customer_phone);
  const result = await reply(updated.customer_phone, text, contact?.id);
  if (!result.ok) {
    console.warn('[wa-order] status WhatsApp failed:', status, updated.customer_phone, result.error);
    return { order: updated, whatsapp: { sent: false, error: result.error || 'Send failed' } };
  }
  return { order: updated, whatsapp: { sent: true } };
}
