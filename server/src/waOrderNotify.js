import { formatOrderTag } from '../../shared/waOrderDrivers.js';
import { waOrderConfig } from '../../shared/waOrderConfig.js';
import { formatWaOrderItems } from '../../shared/waOrderProducts.js';
import { sendTextMessage, ensureWhatsAppReady, openwaConfig } from './openwa.js';

function formatTiming(order) {
  if (order.delivery_type === 'now') return 'as soon as ready today';
  if (order.scheduled_for) {
    return `for ${new Date(order.scheduled_for).toLocaleString('en-SG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }
  return 'soon';
}

function ownerSummary(order, headline) {
  const zone = order.in_grab_zone ? 'In zone (Grab ok)' : 'Concierge delivery';
  return [
    headline,
    '',
    `Customer: ${order.customer_name || 'Guest'} (${order.customer_phone})`,
    formatWaOrderItems(order.items),
    `Timing: ${formatTiming(order)}`,
    `Address: ${order.address_text || '—'}${order.postal_code ? ` ${order.postal_code}` : ''}`,
    `Zone: ${zone}`,
    `Total: S$${Number(order.total).toFixed(2)}`,
    `Order: ${formatOrderTag(order)}`,
  ].join('\n');
}

async function sendOwnerMessage(text) {
  const cfg = waOrderConfig();
  const wa = openwaConfig();
  if (!cfg.ownerNotifyPhone || !wa.enabled) {
    console.log('[wa-order notify]', text.slice(0, 200));
    return { ok: false, reason: 'notify_not_configured' };
  }
  const ready = await ensureWhatsAppReady();
  if (!ready.ok) return { ok: false, error: ready.error };
  await sendTextMessage(cfg.ownerNotifyPhone, text);
  return { ok: true };
}

export async function notifyOwnerWaOrderStarted(order) {
  return sendOwnerMessage(
    ownerSummary(order, '🆕 New WhatsApp order started'),
  );
}

export async function notifyOwnerWaOrderPaid(order) {
  return sendOwnerMessage(
    ownerSummary(order, '✅ WhatsApp order PAID — arrange rider'),
  );
}
