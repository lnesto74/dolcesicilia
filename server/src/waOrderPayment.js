import crypto from 'crypto';
import { waOrderConfig, hitpayBaseUrl } from '../../shared/waOrderConfig.js';
import { updateWaOrder, transitionWaOrder, getWaOrder } from './db.js';
import { notifyOwnerWaOrderPaid } from './waOrderNotify.js';
import { sendTextMessage, ensureWhatsAppReady, openwaConfig } from './openwa.js';

function buildConfirmationMessage(order) {
  const when =
    order.delivery_type === 'now'
      ? 'as soon as it is ready'
      : order.scheduled_for
        ? `for ${new Date(order.scheduled_for).toLocaleString('en-SG', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}`
        : 'soon';
  return [
    'Grazie di cuore 🤍 Your order is confirmed.',
    `Chef Luca is preparing it fresh and will arrange delivery ${when}.`,
    "You're always welcome at our table.",
  ].join('\n');
}

async function sendCustomerText(phone, text) {
  const cfg = openwaConfig();
  if (!cfg.enabled) return { ok: false };
  const ready = await ensureWhatsAppReady();
  if (!ready.ok) return ready;
  await sendTextMessage(phone, text);
  return { ok: true };
}

export async function sendWaOrderConfirmation(order) {
  return sendCustomerText(order.customer_phone, buildConfirmationMessage(order));
}

export async function createWaOrderPaymentLink(order) {
  const cfg = waOrderConfig();
  if (cfg.paymentProvider === 'paynow') {
    return buildPayNowInstructions(order, cfg);
  }
  if (!cfg.hitpayApiKey) {
    return buildPayNowInstructions(order, cfg);
  }

  const base = hitpayBaseUrl(cfg.hitpaySandbox);
  const payload = {
    amount: Number(order.total).toFixed(2),
    currency: 'SGD',
    purpose: `Dolce Sicilia order ${order.id.slice(-8)}`,
    reference_number: order.id,
    redirect_url: cfg.publicBaseUrl
      ? `${cfg.publicBaseUrl}/customers/whatsapp-orders?paid=${order.id}`
      : undefined,
    webhook: cfg.publicBaseUrl
      ? `${cfg.publicBaseUrl}/api/wa-orders/hitpay-webhook`
      : undefined,
  };

  const res = await fetch(`${base}/v1/payment-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-BUSINESS-API-KEY': cfg.hitpayApiKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('HitPay error:', data);
    return buildPayNowInstructions(order, cfg);
  }

  updateWaOrder(order.id, {
    payment_provider: 'hitpay',
    payment_ref: data.id || data.payment_request_id,
    payment_link: data.url,
    payment_status: 'pending',
  });

  return {
    ok: true,
    provider: 'hitpay',
    paymentLink: data.url,
    paymentRef: data.id,
    message: [
      "Here's your order:",
      '',
      `Total: S$${Number(order.total).toFixed(2)}`,
      '',
      `To confirm, pay here: ${data.url}`,
      '(PayNow & cards accepted.)',
    ].join('\n'),
  };
}

function buildPayNowInstructions(order, cfg) {
  const lines = [
    "Here's your order:",
    '',
    `Total: S$${Number(order.total).toFixed(2)}`,
    '',
    `Pay via PayNow to ${cfg.paynowPhone}${cfg.paynowUen ? ` (UEN ${cfg.paynowUen})` : ''}.`,
    'After paying, reply PAID and send your payment screenshot here.',
    'Chef Luca will confirm shortly. 🤍',
  ];
  updateWaOrder(order.id, {
    payment_provider: 'paynow',
    payment_status: 'pending',
  });
  return {
    ok: true,
    provider: 'paynow',
    message: lines.join('\n'),
  };
}

export function verifyHitPayWebhookSignature(rawBody, signatureHeader) {
  const cfg = waOrderConfig();
  if (!cfg.hitpayWebhookSalt || !signatureHeader) return false;
  const computed = crypto
    .createHmac('sha256', cfg.hitpayWebhookSalt)
    .update(rawBody)
    .digest('hex');
  return computed === signatureHeader;
}

export async function handleHitPayWebhook(body) {
  const status = body.status || body.payment_status;
  const ref = body.reference_number || body.payment_request_id;
  if (!ref) return { ok: false, error: 'missing reference' };

  const order = getWaOrder(ref);
  if (!order) return { ok: false, error: 'order not found' };

  if (status !== 'completed' && status !== 'paid') {
    return { ok: true, skipped: true, status };
  }

  if (order.payment_status === 'paid') {
    return { ok: true, duplicate: true };
  }

  transitionWaOrder(order.id, {
    fromState: order.status,
    toState: 'paid',
    patch: {
      payment_status: 'paid',
      payment_ref: body.payment_id || body.id || order.payment_ref,
    },
    event: 'payment_received',
    detail: 'hitpay',
  });

  const updated = getWaOrder(order.id);
  await sendWaOrderConfirmation(updated);
  await notifyOwnerWaOrderPaid(updated);
  return { ok: true, orderId: order.id };
}

export async function markWaOrderPaidManual(orderId) {
  const order = getWaOrder(orderId);
  if (!order) throw new Error('Order not found');
  if (order.payment_status === 'paid') return order;
  if (order.status !== 'awaiting_payment' && order.status !== 'awaiting_address') {
    throw new Error(`Cannot mark paid from status: ${order.status}`);
  }

  transitionWaOrder(order.id, {
    fromState: order.status,
    toState: 'paid',
    patch: { payment_status: 'paid', payment_provider: order.payment_provider || 'manual' },
    event: 'payment_marked_manual',
  });
  const updated = getWaOrder(orderId);
  await sendWaOrderConfirmation(updated);
  await notifyOwnerWaOrderPaid(updated);
  return updated;
}
