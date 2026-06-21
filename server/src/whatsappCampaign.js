import {
  fillCampaignMessage,
  getMessageForStep,
  getPollOptionsForWaiting,
  parseCampaignReply,
} from '../../shared/firstVisitCampaign.js';
import { isAutoSendEnabled } from './autoSend.js';
import {
  findContactByPhone,
  getEnrollment,
  getSetting,
  advanceCampaignSend,
  recordCampaignReply,
  listCampaignQueue,
  listWaitingEnrollments,
  logWhatsAppInteraction,
} from './db.js';
import {
  chatIdToPhone,
  openwaConfig,
  sendTextMessage,
  sendPollMessage,
  ensureWhatsAppReady,
  phoneFromWhatsAppFrom,
} from './openwa.js';

async function deliverMessage(phone, msg, senderName, customerName, contactId, step) {
  const text = fillCampaignMessage(msg.body, customerName, senderName);
  if (msg.poll) {
    await sendPollMessage(phone, msg.poll.question, msg.poll.options);
    logWhatsAppInteraction({
      contactId,
      phone,
      direction: 'out',
      messageType: 'poll',
      body: msg.poll.question,
      campaignStep: step,
    });
    return text;
  }
  await sendTextMessage(phone, text);
  logWhatsAppInteraction({
    contactId,
    phone,
    direction: 'out',
    messageType: 'text',
    body: text,
    campaignStep: step,
  });
  return text;
}

export async function sendCampaignStep(contactId, senderName) {
  const enrollment = getEnrollment(contactId);
  if (!enrollment || enrollment.completed_at) {
    return { ok: false, error: 'No active campaign enrollment' };
  }

  const msg = getMessageForStep(enrollment.current_step);
  if (!msg) return { ok: false, error: 'No message for current step' };

  const cfg = openwaConfig();
  const sentStep = enrollment.current_step;

  if (cfg.enabled) {
    const ready = await ensureWhatsAppReady();
    if (!ready.ok) return { ok: false, error: ready.error };
    const messageBody = await deliverMessage(
      enrollment.phone,
      msg,
      senderName,
      enrollment.name,
      contactId,
      sentStep,
    );
    const updated = advanceCampaignSend(contactId, sentStep, messageBody);

    // After welcome, immediately send first poll
    if (sentStep === 'ready_msg1') {
      const chained = await sendCampaignStep(contactId, senderName);
      return { ok: true, enrollment: chained.enrollment || updated, messageBody, sentViaOpenwa: true, chained: true };
    }

    return { ok: true, enrollment: updated, messageBody, sentViaOpenwa: true };
  }

  const text = fillCampaignMessage(msg.body, enrollment.name, senderName);
  const updated = advanceCampaignSend(contactId, sentStep, text);
  return { ok: true, enrollment: updated, messageBody: text, sentViaOpenwa: false };
}

const BULK_SEND_DELAY_MS = 4500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendCampaignBatch(contactIds, senderName, delayMs = BULK_SEND_DELAY_MS) {
  const results = [];
  for (let i = 0; i < contactIds.length; i++) {
    if (i > 0) await sleep(delayMs);
    const contactId = contactIds[i];
    const enrollment = getEnrollment(contactId);
    const name = enrollment?.name || contactId;

    if (!enrollment || enrollment.waiting_for) {
      results.push({ contactId, name, ok: false, error: 'Not ready to send (waiting for reply)' });
      continue;
    }

    try {
      const result = await sendCampaignStep(contactId, senderName);
      results.push({ contactId, name, ...result });
      if (!result.ok) break;
    } catch (err) {
      results.push({ contactId, name, ok: false, error: err.message });
      break;
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  return {
    ok: failed === 0,
    sent,
    failed,
    results,
    queue: listCampaignQueue(),
  };
}

export async function handleIncomingMessage(from, body, messageType = 'chat') {
  const phone = await phoneFromWhatsAppFrom(from);
  let contact = phone ? findContactByPhone(phone) : null;

  if (!contact && /@lid$/i.test(from)) {
    console.log('Webhook: LID resolve failed', from);
  }

  if (!contact) {
    const waiting = listWaitingEnrollments();
    if (waiting.length === 1) {
      contact = waiting[0];
      console.log('Webhook: matched single waiting enrollment', contact.name);
    }
  }

  if (!contact) {
    logWhatsAppInteraction({
      phone: phone || from,
      direction: 'in',
      messageType,
      body: String(body || ''),
    });
    console.log('Webhook: unknown contact', phone, from, body);
    return { ok: false, reason: 'unknown_contact' };
  }

  const enrollment = getEnrollment(contact.id);
  logWhatsAppInteraction({
    contactId: contact.id,
    phone: contact.phone,
    direction: 'in',
    messageType,
    body: String(body || ''),
    campaignStep: enrollment?.current_step || null,
    replyKey: enrollment?.waiting_for || null,
  });

  if (!enrollment || !enrollment.waiting_for) {
    console.log('Webhook: not waiting', contact.name, body);
    return { ok: false, reason: 'not_waiting' };
  }

  const pollOptions = getPollOptionsForWaiting(enrollment.waiting_for);
  const parsed = parseCampaignReply(body, enrollment.waiting_for, pollOptions);
  if (!parsed) {
    console.log('Webhook: unrecognized reply', contact.name, body, messageType);
    return { ok: false, reason: 'unrecognized_reply', hint: 'Reply with a number (1–4) or tap an option' };
  }

  const replyKey = enrollment.waiting_for;
  const replyValue = parsed.value;

  recordCampaignReply(contact.id, replyKey, replyValue, {
    label: parsed.label,
    raw: String(body || ''),
  });
  console.log('Webhook: recorded', contact.name, replyKey, parsed.label);

  const senderName = getSetting('sender_name', 'Luca');
  const cfg = openwaConfig();
  let autoSent = null;

  if (cfg.enabled) {
    const refreshed = getEnrollment(contact.id);
    if (refreshed && !refreshed.waiting_for && refreshed.current_step !== 'completed') {
      try {
        autoSent = await sendCampaignStep(contact.id, senderName);
        console.log('Webhook: auto-sent next', contact.name, refreshed.current_step);
      } catch (err) {
        console.error('Auto-send after reply failed:', err.message);
      }
    }
  }

  return {
    ok: true,
    contactId: contact.id,
    replyKey,
    replyValue,
    autoSent,
    queue: listCampaignQueue(),
  };
}
