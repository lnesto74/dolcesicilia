import { getContactById, logMessageSent, logWhatsAppInteraction, recordLaunchSentAt, clearMessageQueue, markOnboardingSent } from './db.js';
import { openwaConfig, sendTextMessage, ensureWhatsAppReady } from './openwa.js';
import { fillTemplate } from '../../shared/messageTemplates.js';
import { PREFERENCE_POLL_TEMPLATE_ID } from '../../shared/messagePreferences.js';
import { sendPreferencePoll } from './messagePreferences.js';
import { contactAlreadyReceivedMessage, duplicateSkipReason } from './messageDedup.js';
import { getPhoneValidationWarning } from '../../shared/phoneValidation.js';

const BATCH_DELAY_MS = 4500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendAdHocMessage({
  contactId,
  messageBody,
  templateId,
  templateName,
  customerName,
  campaignType,
}) {
  const contact = getContactById(contactId);
  if (!contact) return { ok: false, error: 'Contact not found' };

  const cfg = openwaConfig();

  if (templateId === PREFERENCE_POLL_TEMPLATE_ID) {
    if (!cfg.enabled) {
      return { ok: false, error: 'OpenWA must be enabled to send the preference poll' };
    }
    const dup = contactAlreadyReceivedMessage(contactId, {
      templateId: PREFERENCE_POLL_TEMPLATE_ID,
      body: 'Intro + preference poll (Choose 👇)',
    });
    if (dup.duplicate) {
      return {
        ok: false,
        error: `Preference poll already sent to ${contact.name} (${duplicateSkipReason(dup)})`,
        duplicate: dup,
      };
    }
    const result = await sendPreferencePoll(contact);
    if (!result.ok) return result;
    logMessageSent({
      contactId,
      templateId: PREFERENCE_POLL_TEMPLATE_ID,
      templateName: templateName || 'Neighbourhood Welcome — opt-in',
      messageBody: 'Intro + preference poll (Choose 👇)',
    });
    markOnboardingSent(contactId);
    try {
      clearMessageQueue([contactId]);
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      contactId,
      name: contact.name,
      messageBody: 'Intro + preference poll',
      sentViaOpenwa: true,
      preferencePoll: true,
    };
  }

  const text = fillTemplate(messageBody, customerName || contact.name);

  const phoneWarning = getPhoneValidationWarning(contact.phone);
  if (phoneWarning) {
    return { ok: false, error: phoneWarning, phone: contact.phone, code: 'invalid_phone' };
  }

  const dup = contactAlreadyReceivedMessage(contactId, { body: text, templateId });
  if (dup.duplicate) {
    return {
      ok: false,
      error: `Already sent to ${contact.name}: ${duplicateSkipReason(dup)}`,
      duplicate: dup,
    };
  }

  if (cfg.enabled) {
    const ready = await ensureWhatsAppReady();
    if (!ready.ok) return { ok: false, error: ready.error };

    try {
      await sendTextMessage(contact.phone, text);
    } catch (err) {
      return {
        ok: false,
        error: `WhatsApp could not send to ${contact.name} (${contact.phone}): ${err.message}`,
        phone: contact.phone,
        code: 'whatsapp_send_failed',
      };
    }
    logWhatsAppInteraction({
      contactId,
      phone: contact.phone,
      direction: 'out',
      messageType: 'text',
      body: text,
    });
  }

  logMessageSent({
    contactId,
    templateId: templateId || 'custom',
    templateName: templateName || 'Custom',
    messageBody: text,
  });

  try {
    clearMessageQueue([contactId]);
  } catch {
    /* queue row may already be gone */
  }

  if (campaignType === 'launch') {
    recordLaunchSentAt(contactId);
  }

  return { ok: true, contactId, name: contact.name, messageBody: text, sentViaOpenwa: cfg.enabled };
}

export async function sendAdHocBatch(items, delayMs = BATCH_DELAY_MS) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    if (i > 0) await sleep(delayMs);
    const result = await sendAdHocMessage(items[i]);
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
