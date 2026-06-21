import {
  getWholesaleLeadById,
  markWholesaleOutreachSent,
  clearWholesaleQueue,
} from './db.js';
import { openwaConfig, sendTextMessage, ensureWhatsAppReady } from './openwa.js';
import { leadAlreadyReceivedMessage, duplicateSkipReason } from './wholesaleDedup.js';
import { getPhoneValidationWarning } from '../../shared/phoneValidation.js';

const BATCH_DELAY_MS = 4500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fillWholesaleTemplate(body, lead) {
  return String(body || '')
    .replace(/\{\{name\}\}/gi, lead.name)
    .replace(/\{\{businessName\}\}/gi, lead.name)
    .replace(/\{\{cafe\}\}/gi, lead.name)
    .replace(/\{\{Café\}\}/gi, lead.name)
    .trim();
}

export async function sendWholesaleMessage({ leadId, messageBody, outreachId }) {
  const lead = getWholesaleLeadById(leadId);
  if (!lead) return { ok: false, error: 'Lead not found' };

  const text = fillWholesaleTemplate(messageBody, lead);
  if (!text) return { ok: false, error: 'Message body required' };

  if (!lead.phone) {
    return { ok: false, error: `${lead.name} has no phone — use Instagram or email`, code: 'no_phone' };
  }

  const phoneWarning = getPhoneValidationWarning(lead.phone);
  if (phoneWarning) {
    return { ok: false, error: phoneWarning, phone: lead.phone, code: 'invalid_phone' };
  }

  const dup = leadAlreadyReceivedMessage(leadId, { body: text, ignorePendingQueue: true });
  if (dup.duplicate) {
    return {
      ok: false,
      error: `Blocked for ${lead.name}: ${duplicateSkipReason(dup)}`,
      duplicate: dup,
    };
  }

  const cfg = openwaConfig();
  if (!cfg.enabled) {
    return { ok: false, error: 'OpenWA must be enabled to send wholesale messages' };
  }

  const ready = await ensureWhatsAppReady();
  if (!ready.ok) return { ok: false, error: ready.error };

  try {
    await sendTextMessage(lead.phone, text);
  } catch (err) {
    return {
      ok: false,
      error: `WhatsApp could not send to ${lead.name} (${lead.phone}): ${err.message}`,
      phone: lead.phone,
      code: 'whatsapp_send_failed',
    };
  }

  markWholesaleOutreachSent({ leadId, body: text, outreachId });
  try {
    clearWholesaleQueue([leadId]);
  } catch {
    /* pending row may already be updated */
  }

  return {
    ok: true,
    leadId,
    name: lead.name,
    messageBody: text,
    sentViaOpenwa: true,
  };
}

export async function sendWholesaleBatch(items, delayMs = BATCH_DELAY_MS) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    if (i > 0) await sleep(delayMs);
    const result = await sendWholesaleMessage(items[i]);
    results.push(result);
    if (!result.ok) break;
  }
  return {
    ok: results.every((r) => r.ok),
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export { fillWholesaleTemplate };
