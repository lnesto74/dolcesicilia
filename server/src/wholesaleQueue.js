import {
  getWholesaleLeadById,
  hasPendingWholesaleMessage,
  listWholesaleQueue,
  queueWholesaleOutreachRows,
} from './db.js';
import { leadAlreadyReceivedMessage, duplicateSkipReason } from './wholesaleDedup.js';

export function queueWholesaleMessages({ items, minDaysBetween = 14, replacePending = false } = {}) {
  if (!items?.length) throw new Error('items required');

  const queued = [];
  const skipped = [];
  const toInsert = [];

  for (const row of items) {
    const leadId = row.leadId;
    const body = row.body?.trim();
    if (!leadId || !body) {
      skipped.push({ leadId, reason: 'invalid_item' });
      continue;
    }
    const lead = getWholesaleLeadById(leadId);
    if (!lead) {
      skipped.push({ leadId, reason: 'not_found' });
      continue;
    }

    const dup = leadAlreadyReceivedMessage(leadId, { body, minDays: minDaysBetween });
    if (dup.duplicate) {
      skipped.push({
        leadId,
        leadName: lead.name,
        reason: dup.reason === 'messaged_within_window' ? 'recent_message' : 'duplicate_message',
        detail: duplicateSkipReason(dup),
        sentAt: dup.sentAt,
      });
      continue;
    }

    if (hasPendingWholesaleMessage(leadId) && !replacePending) {
      skipped.push({
        leadId,
        leadName: lead.name,
        reason: 'pending_in_queue',
        detail: 'Pending message kept until sent',
      });
      continue;
    }

    toInsert.push({ leadId, body });
  }

  if (toInsert.length) {
    queued.push(...queueWholesaleOutreachRows(toInsert, replacePending));
  }

  return { queued, skipped };
}

export function checkWholesaleSend(leadId, body, minDaysBetween = 14) {
  const lead = getWholesaleLeadById(leadId);
  if (!lead) return { allowed: false, error: 'Lead not found' };
  const dup = leadAlreadyReceivedMessage(leadId, { body, minDays: minDaysBetween });
  return {
    leadId,
    leadName: lead.name,
    allowed: !dup.duplicate,
    duplicate: dup.duplicate,
    reason: dup.duplicate ? dup.reason : null,
    detail: dup.duplicate ? duplicateSkipReason(dup) : null,
    sentAt: dup.sentAt || null,
  };
}

export { listWholesaleQueue };
