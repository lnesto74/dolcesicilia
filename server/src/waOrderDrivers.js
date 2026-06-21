import {
  waDriverEtaPollOptions,
  parseDriverEtaReply,
  parseDriverPickupReply,
  parseDriverDeliveredReply,
  customerOutForDeliveryMessage,
  customerTrackingLinkIntroMessage,
  buildDriverDispatchPollQuestion,
  buildDriverAssignmentMessage,
  buildDriverPickupPollQuestion,
  buildDriverDeliveredPollQuestion,
  driverPickupPollOptions,
  driverDeliveredPollOptions,
  formatOrderTag,
  shortOrderId,
} from '../../shared/waOrderDrivers.js';
import { notifyWaOrderChange } from './waOrderBus.js';
import { waOrderConfig } from '../../shared/waOrderConfig.js';
import {
  isWaTrackingEnabled,
  startDeliveryTracking,
  buildCustomerTrackUrl,
  buildDriverTrackUrl,
  endDeliveryTracking,
} from './waOrderTracking.js';
import {
  getWaOrder,
  listWaDrivers,
  createWaDriverDispatch,
  getOpenWaDriverDispatch,
  getLatestWaDriverDispatch,
  getAnyOpenWaDriverDispatch,
  findWaDriverDispatchByOrderTag,
  tryAssignWaDriverDispatch,
  markWaDriverDispatchPickedUp,
  markWaDriverDispatchDelivered,
  getWaDriverByPhone,
  findContactByPhone,
  logWhatsAppInteraction,
  logWaOrderEvent,
  transitionWaOrder,
} from './db.js';
import {
  sendPollMessage,
  sendTextMessage,
  ensureWhatsAppReady,
  openwaConfig,
  phoneFromWhatsAppFrom,
} from './openwa.js';

async function driverReply(phone, text, contactId) {
  logWhatsAppInteraction({
    contactId: contactId || null,
    phone,
    direction: 'out',
    messageType: 'text',
    body: text.slice(0, 500),
  });
  const cfg = openwaConfig();
  if (!cfg.enabled) return { ok: false, error: 'OpenWA disabled' };
  const ready = await ensureWhatsAppReady();
  if (!ready.ok) return ready;
  await sendTextMessage(phone, text);
  return { ok: true };
}

async function driverPoll(phone, question, options) {
  logWhatsAppInteraction({
    contactId: null,
    phone,
    direction: 'out',
    messageType: 'poll',
    body: question,
  });
  const cfg = openwaConfig();
  if (!cfg.enabled) return { ok: false, error: 'OpenWA disabled' };
  const ready = await ensureWhatsAppReady();
  if (!ready.ok) return ready;
  await sendPollMessage(phone, question, options);
  return { ok: true };
}

function buildDispatchSummary(order) {
  const cfg = waOrderConfig();
  const tag = formatOrderTag(order);
  const pickup = cfg.bakeryAddress;
  const dest = order.address_text || '—';
  const postal = order.postal_code ? ` (${order.postal_code})` : '';
  return [
    `Order: ${tag}`,
    `Pickup: ${pickup}`,
    `Drop-off: ${dest}${postal}`,
    `Order total: S$${Number(order.total || 0).toFixed(2)}`,
  ].join('\n');
}

function customerCompletedMessage() {
  return 'Grazie di cuore 🤍 Enjoy every bite — you\'re always welcome at our table. — Chef Luca';
}

export async function dispatchWaOrderToDrivers(orderId) {
  const order = getWaOrder(orderId);
  if (!order) throw new Error('Order not found');
  if (!order.address_text) throw new Error('Order has no delivery address');
  if (order.payment_status !== 'paid') throw new Error('Order must be paid before finding a driver');

  const existing = getOpenWaDriverDispatch(orderId);
  if (existing) throw new Error('Driver search already in progress for this order');

  const orderTag = order.order_number != null ? String(order.order_number) : shortOrderId(orderId);
  const active = findWaDriverDispatchByOrderTag(orderTag, {
    status: 'assigned',
  }) || findWaDriverDispatchByOrderTag(orderTag, { status: 'picked_up' });
  if (active) throw new Error('This order already has a driver assigned');

  const drivers = listWaDrivers({ activeOnly: true });
  if (!drivers.length) throw new Error('No active drivers — add drivers in the Drivers tab');

  const dispatch = createWaDriverDispatch(orderId);
  const summary = buildDispatchSummary(order);
  const question = buildDriverDispatchPollQuestion(order, summary);
  const options = waDriverEtaPollOptions(order);

  const cfg = openwaConfig();
  if (!cfg.enabled) throw new Error('OpenWA disabled');
  const ready = await ensureWhatsAppReady();
  if (!ready.ok) throw new Error(ready.error || 'WhatsApp not ready');

  const sent = [];
  const failed = [];
  for (const driver of drivers) {
    try {
      await sendPollMessage(driver.phone, question, options);
      logWhatsAppInteraction({
        contactId: null,
        phone: driver.phone,
        direction: 'out',
        messageType: 'poll',
        body: question,
      });
      sent.push(driver.phone);
    } catch (err) {
      failed.push({ phone: driver.phone, error: err.message });
    }
  }

  if (!sent.length) throw new Error('Could not reach any drivers on WhatsApp');

  logWaOrderEvent({
    orderId,
    phone: order.customer_phone,
    fromState: order.status,
    toState: order.status,
    event: 'driver_dispatch_started',
    detail: `dispatch:${dispatch.id}; drivers:${sent.length}`,
  });

  notifyWaOrderChange(orderId, 'driver_dispatch');
  return { dispatch, sent, failed, driversNotified: sent.length };
}

async function handleDriverEtaAccept(driver, phone, parsed, messageType, body) {
  const openDispatch = getAnyOpenWaDriverDispatch(parsed.orderTag);
  if (!openDispatch) {
    await driverReply(
      phone,
      'No open deliveries right now — we\'ll ping you when the next one comes in. 🛵',
      null,
    );
    return { handled: true, noOpenDispatch: true };
  }

  const assigned = tryAssignWaDriverDispatch({
    dispatchId: openDispatch.id,
    driverPhone: phone,
    etaMinutes: parsed.minutes,
  });

  if (!assigned) {
    await driverReply(
      phone,
      'Sorry — another driver just took this delivery. We\'ll send the next one your way. 🙏',
      null,
    );
    return { handled: true, tooLate: true };
  }

  const order = getWaOrder(assigned.order_id);
  if (!order) return { handled: true };

  logWhatsAppInteraction({
    contactId: null,
    phone,
    direction: 'in',
    messageType,
    body: String(body || '').slice(0, 500),
  });

  const assignmentMsg = buildDriverAssignmentMessage(
    order,
    parsed.minutes,
    waOrderConfig().bakeryAddress,
  );
  await driverReply(phone, assignmentMsg, null);

  const pickupQuestion = buildDriverPickupPollQuestion(order);
  await driverPoll(phone, pickupQuestion, driverPickupPollOptions(order));

  logWaOrderEvent({
    orderId: order.id,
    phone: order.customer_phone,
    fromState: order.status,
    toState: order.status,
    event: 'driver_assigned',
    detail: `${driver.name}|${parsed.minutes}min|awaiting_pickup`,
  });

  const others = listWaDrivers({ activeOnly: true }).filter(
    (d) => d.phone.replace(/\D/g, '') !== phone.replace(/\D/g, ''),
  );
  for (const other of others) {
    await driverReply(
      other.phone,
      `Order ${formatOrderTag(order)} was just taken by another driver — standby for the next one. 🛵`,
      null,
    );
  }

  notifyWaOrderChange(order.id, 'driver_assigned');
  return { handled: true, assigned: true, orderId: order.id, etaMinutes: parsed.minutes };
}

async function handleDriverPickupConfirm(driver, phone, parsed, messageType, body) {
  let dispatch = findWaDriverDispatchByOrderTag(parsed.orderTag, {
    status: 'assigned',
    driverPhone: phone,
  });

  if (!dispatch) {
    await driverReply(
      phone,
      `No active pickup pending for ${formatOrderTag(parsed.orderTag)} — check the order id on your poll.`,
      null,
    );
    return { handled: true, notFound: true };
  }

  const updated = markWaDriverDispatchPickedUp(dispatch.id);
  if (!updated) {
    await driverReply(phone, 'Pickup already confirmed or order no longer active.', null);
    return { handled: true };
  }

  logWhatsAppInteraction({
    contactId: null,
    phone,
    direction: 'in',
    messageType,
    body: String(body || '').slice(0, 500),
  });

  const order = getWaOrder(updated.order_id);
  if (!order) return { handled: true };

  const contact = findContactByPhone(order.customer_phone);

  let customerTrackUrl = null;
  let driverTrackUrl = null;
  if (isWaTrackingEnabled()) {
    const session = startDeliveryTracking(order.id);
    if (session) {
      customerTrackUrl = buildCustomerTrackUrl(order, session.customerToken);
      driverTrackUrl = buildDriverTrackUrl(session.driverToken);
    }
  }

  await driverReply(
    order.customer_phone,
    customerOutForDeliveryMessage(updated.eta_minutes),
    contact?.id,
  );
  if (customerTrackUrl) {
    await driverReply(order.customer_phone, customerTrackingLinkIntroMessage(), contact?.id);
    await driverReply(order.customer_phone, customerTrackUrl, contact?.id);
  }

  if (order.status !== 'out_for_delivery' && order.status !== 'completed') {
    transitionWaOrder(order.id, {
      fromState: order.status,
      toState: 'out_for_delivery',
      event: 'driver_picked_up',
      detail: `${driver.name}|${updated.eta_minutes}min`,
    });
  }

  if (driverTrackUrl) {
    await driverReply(
      phone,
      `${formatOrderTag(order)} — picked up ✅\nOpen the link below to share your location 👇`,
      null,
    );
    await driverReply(phone, driverTrackUrl, null);
  } else {
    await driverReply(
      phone,
      `${formatOrderTag(order)} — picked up ✅ On your way to the customer.`,
      null,
    );
  }

  const deliveredQuestion = buildDriverDeliveredPollQuestion(order);
  await driverPoll(phone, deliveredQuestion, driverDeliveredPollOptions(order));

  notifyWaOrderChange(order.id, 'driver_picked_up');
  return { handled: true, pickedUp: true, orderId: order.id };
}

async function handleDriverDeliveredConfirm(driver, phone, parsed, messageType, body) {
  let dispatch = findWaDriverDispatchByOrderTag(parsed.orderTag, {
    status: 'picked_up',
    driverPhone: phone,
  });

  if (!dispatch) {
    await driverReply(
      phone,
      `No delivery in progress for ${formatOrderTag(parsed.orderTag)}.`,
      null,
    );
    return { handled: true, notFound: true };
  }

  const updated = markWaDriverDispatchDelivered(dispatch.id);
  if (!updated) {
    await driverReply(phone, 'Delivery already confirmed.', null);
    return { handled: true };
  }

  logWhatsAppInteraction({
    contactId: null,
    phone,
    direction: 'in',
    messageType,
    body: String(body || '').slice(0, 500),
  });

  const order = getWaOrder(updated.order_id);
  if (!order) return { handled: true };

  if (isWaTrackingEnabled()) {
    endDeliveryTracking(order.id);
  }

  const contact = findContactByPhone(order.customer_phone);
  await driverReply(order.customer_phone, customerCompletedMessage(), contact?.id);

  if (order.status !== 'completed') {
    transitionWaOrder(order.id, {
      fromState: order.status,
      toState: 'completed',
      event: 'driver_delivered',
      detail: driver.name,
    });
  }

  await driverReply(
    phone,
    `${formatOrderTag(order)} — delivered ✅ Great job!`,
    null,
  );

  notifyWaOrderChange(order.id, 'driver_delivered');
  return { handled: true, delivered: true, orderId: order.id };
}

export async function handleDriverDispatchInbound(from, body, messageType = 'chat') {
  const phone = await phoneFromWhatsAppFrom(from);
  if (!phone) return { handled: false };

  const driver = getWaDriverByPhone(phone);
  if (!driver) return { handled: false };

  const text = String(body || '').trim();
  if (!text) return { handled: false };

  const delivered = parseDriverDeliveredReply(text);
  if (delivered) {
    return handleDriverDeliveredConfirm(driver, phone, delivered, messageType, text);
  }

  const pickup = parseDriverPickupReply(text);
  if (pickup) {
    return handleDriverPickupConfirm(driver, phone, pickup, messageType, text);
  }

  const eta = parseDriverEtaReply(text);
  if (eta) {
    return handleDriverEtaAccept(driver, phone, eta, messageType, text);
  }

  return { handled: false };
}

export function getWaOrderDriverInfo(orderId) {
  const dispatch = getLatestWaDriverDispatch(orderId);
  if (!dispatch) return null;
  const driver = dispatch.accepted_driver_phone
    ? listWaDrivers().find(
        (d) => d.phone.replace(/\D/g, '') === dispatch.accepted_driver_phone.replace(/\D/g, ''),
      )
    : null;
  return { dispatch, driver };
}
