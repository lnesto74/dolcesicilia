import {
  checkMessageDuplicate,
  checkMessageFrequencyCap,
  frequencySkipReason,
  isMessageDedupExemptPhone,
} from '../../shared/messageDedup.js';
import {
  getContactById,
  getMessageLogs,
  getWhatsAppInteractions,
  getPendingQueueBody,
} from './db.js';

export function contactAlreadyReceivedMessage(contactId, { body, templateId }) {
  const contact = getContactById(contactId);
  if (contact && isMessageDedupExemptPhone(contact.phone)) {
    return { duplicate: false, exempt: true };
  }

  const exempt = false;
  const sentLogs = getMessageLogs(contactId);
  const outboundInteractions = getWhatsAppInteractions(contactId);

  const dup = checkMessageDuplicate({
    sentLogs,
    outboundInteractions,
    pendingBody: getPendingQueueBody(contactId),
    templateId,
    body,
    exemptFromDedup: exempt,
  });
  if (dup.duplicate) return dup;

  const freq = checkMessageFrequencyCap({
    sentLogs,
    outboundInteractions,
    exemptFromDedup: exempt,
  });
  if (freq.blocked) {
    return {
      duplicate: true,
      reason: freq.reason,
      sentAt: freq.sentAt,
      via: 'frequency_cap',
      daysSince: freq.daysSince,
      minDays: freq.minDays,
    };
  }

  return { duplicate: false };
}

export {
  checkMessageDuplicate,
  checkMessageFrequencyCap,
  frequencySkipReason,
  normalizeMessageBody,
  duplicateSkipReason,
  isMessageDedupExemptPhone,
  MESSAGE_DEDUP_EXEMPT_PHONES,
  MESSAGE_FREQUENCY_MIN_DAYS,
} from '../../shared/messageDedup.js';
