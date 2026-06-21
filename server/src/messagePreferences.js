import {
  getContactById,
  logWhatsAppInteraction,
  setContactPreferences,
  messagePrefSetRecently,
  getMessageTemplateById,
  findContactByPhone,
  logMessageSent,
  markOnboardingSent,
} from './db.js';
import {
  PREFERENCE_POLL_TEMPLATE_ID,
  PREFERENCE_POLL_OPTIONS,
  parsePreferenceReply,
  fillPreferenceIntro,
  PREFERENCE_POLL_QUEUE_TEMPLATE,
} from '../../shared/messagePreferences.js';
import {
  ensureWhatsAppReady,
  sendTextMessage,
  sendPollMessage,
  phoneFromWhatsAppFrom,
} from './openwa.js';
import { contactAlreadyReceivedMessage, duplicateSkipReason } from './messageDedup.js';
import { isAutoSendEnabled } from './autoSend.js';

export { isEligibleForLaunchCampaign, filterLaunchCampaignContacts } from './messagePrefFilter.js';
export { isEligibleForEndOfDayNotify, filterEndOfDayContacts } from './messagePrefFilter.js';

const prefReplyInFlight = new Map();
const PREF_REPLY_LOCK_MS = 15_000;

export async function sendPreferencePoll(contact) {
  const resolved = typeof contact === 'string' ? getContactById(contact) : contact;
  if (!resolved) return { ok: false, error: 'Contact not found' };

  const ready = await ensureWhatsAppReady();
  if (!ready.ok) return { ok: false, error: ready.error };

  const dup = contactAlreadyReceivedMessage(resolved.id, {
    templateId: PREFERENCE_POLL_TEMPLATE_ID,
    body: 'Intro + preference poll (Choose 👇)',
  });
  if (dup.duplicate) {
    return {
      ok: false,
      error: `Preference poll already sent (${duplicateSkipReason(dup)})`,
      duplicate: dup,
    };
  }

  const template = getMessageTemplateById(PREFERENCE_POLL_TEMPLATE_ID);
  const intro = template?.body
    ? fillPreferenceIntro(template.body, resolved.name)
    : fillPreferenceIntro(
        `Ciao {{firstName}} 🌿\n\nHow often would you like to hear from Dolce Sicilia?`,
        resolved.name,
      );

  await sendTextMessage(resolved.phone, intro);
  logWhatsAppInteraction({
    contactId: resolved.id,
    phone: resolved.phone,
    direction: 'out',
    messageType: 'text',
    body: intro.slice(0, 500),
  });

  await new Promise((r) => setTimeout(r, 1500));

  const pollQuestion = 'Choose 👇';
  const pollOptions = PREFERENCE_POLL_OPTIONS.map((o) => o.pollLabel);

  try {
    await sendPollMessage(resolved.phone, pollQuestion, pollOptions);
    logWhatsAppInteraction({
      contactId: resolved.id,
      phone: resolved.phone,
      direction: 'out',
      messageType: 'poll',
      body: pollQuestion,
    });
  } catch (err) {
    console.warn('Preference poll send failed, falling back to numbered text:', err.message);
    const numbered = PREFERENCE_POLL_OPTIONS.map(
      (o, i) => `${i + 1}. ${o.title}${o.description ? ` — ${o.description}` : ''}`,
    ).join('\n');
    await sendTextMessage(
      resolved.phone,
      `${pollQuestion}\n\n${numbered}\n\nReply with 1, 2, 3, 4, or 5.`,
    );
  }

  return { ok: true, contactId: resolved.id, name: resolved.name };
}

export async function sendPreferencePollBatch(contactIds, delayMs = 4500) {
  const results = [];
  for (let i = 0; i < contactIds.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    const contact = getContactById(contactIds[i]);
    if (!contact) {
      results.push({ contactId: contactIds[i], ok: false, error: 'Contact not found' });
      continue;
    }
    try {
      const result = await sendPreferencePoll(contact);
      if (result.ok) {
        logMessageSent({
          contactId: contact.id,
          templateId: PREFERENCE_POLL_TEMPLATE_ID,
          templateName: 'Neighbourhood Welcome — opt-in',
          messageBody: 'Intro + preference poll (Choose 👇)',
        });
        markOnboardingSent(contact.id);
      }
      results.push({ ...result, contactId: contact.id });
    } catch (err) {
      results.push({ contactId: contact.id, ok: false, error: err.message });
    }
  }
  return {
    ok: results.every((r) => r.ok),
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function handlePreferenceReply(from, body, messageType, data = {}) {
  const phone = await phoneFromWhatsAppFrom(from);
  let contact = phone ? findContactByPhone(phone) : null;
  if (!contact && data.contactId) contact = getContactById(data.contactId);
  if (!contact) return { handled: false, reason: 'unknown_contact' };

  const parsed = parsePreferenceReply(body, {
    rowId: data.selectedRowId || data.listRowId || data.rowId,
    selectedOption: data.selectedOption,
  });

  if (!parsed) return { handled: false, reason: 'not_preference_reply' };

  const lockKey = contact.id;
  const lockedAt = prefReplyInFlight.get(lockKey);
  if (lockedAt != null && Date.now() - lockedAt < PREF_REPLY_LOCK_MS) {
    console.log('Preference reply in-flight deduped', contact.name, parsed.rowId);
    return {
      handled: true,
      ok: true,
      duplicate: true,
      contactId: contact.id,
      messagePref: parsed.messagePref,
      endOfDayOptin: parsed.endOfDayOptin,
      name: contact.name,
    };
  }

  if (messagePrefSetRecently(contact.id, parsed.messagePref, parsed.endOfDayOptin)) {
    console.log('Preference reply deduped', contact.name, parsed.rowId);
    return {
      handled: true,
      ok: true,
      duplicate: true,
      contactId: contact.id,
      messagePref: parsed.messagePref,
      endOfDayOptin: parsed.endOfDayOptin,
      name: contact.name,
    };
  }

  prefReplyInFlight.set(lockKey, Date.now());

  setContactPreferences(contact.id, {
    messagePref: parsed.messagePref,
    endOfDayOptin: parsed.endOfDayOptin,
  });

  const confirmation = parsed.confirmation;
  if (isAutoSendEnabled()) {
    try {
      const ready = await ensureWhatsAppReady();
      if (ready.ok) {
        await sendTextMessage(contact.phone, confirmation);
        logWhatsAppInteraction({
          contactId: contact.id,
          phone: contact.phone,
          direction: 'out',
          messageType: 'text',
          body: confirmation,
        });
      }
    } catch (err) {
      console.warn('Preference confirmation failed:', err.message);
    }
  } else {
    console.log('Preference saved (no auto confirmation — manual-only mode)', contact.name, parsed.rowId);
  }

  logWhatsAppInteraction({
    contactId: contact.id,
    phone: contact.phone,
    direction: 'in',
    messageType: messageType || 'chat',
    body: String(body || data.selectedOption || ''),
  });

  setTimeout(() => prefReplyInFlight.delete(lockKey), PREF_REPLY_LOCK_MS);

  return {
    handled: true,
    ok: true,
    contactId: contact.id,
    messagePref: parsed.messagePref,
    endOfDayOptin: parsed.endOfDayOptin,
    name: contact.name,
  };
}

export function isPreferencePollQueueItem(templateId) {
  return templateId === PREFERENCE_POLL_QUEUE_TEMPLATE;
}
