import {
  checkMessageDuplicate,
  duplicateSkipReason,
  isMessageDedupExemptPhone,
  normalizeMessageBody,
} from '../../shared/messageDedup.js';
import {
  getWholesaleLeadById,
  getWholesaleOutreachSent,
  getWholesalePendingBody,
} from './db.js';

export const WHOLESALE_FREQUENCY_MIN_DAYS = 14;

function parseSentMs(iso) {
  if (!iso) return null;
  const ms = new Date(String(iso).replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function isLeadRecentlyContacted(lead, minDays = WHOLESALE_FREQUENCY_MIN_DAYS) {
  if (!lead) return false;
  const candidates = [lead.last_contacted_at, lead.lastSentAt].filter(Boolean);
  let bestMs = -1;
  for (const iso of candidates) {
    const ms = parseSentMs(iso);
    if (ms != null && ms > bestMs) bestMs = ms;
  }
  if (bestMs < 0) return false;
  return (Date.now() - bestMs) / 86_400_000 < minDays;
}

export function leadAlreadyReceivedMessage(
  leadId,
  { body, minDays = WHOLESALE_FREQUENCY_MIN_DAYS, ignorePendingQueue = false } = {},
) {
  const lead = getWholesaleLeadById(leadId);
  if (!lead) return { duplicate: false, error: 'Lead not found' };

  if (lead.phone && isMessageDedupExemptPhone(lead.phone)) {
    return { duplicate: false, exempt: true };
  }

  const sentRows = getWholesaleOutreachSent(leadId);
  const sentLogs = sentRows.map((r) => ({
    message_body: r.body,
    sent_at: r.sent_at,
    template_id: null,
  }));
  const pendingBody = ignorePendingQueue ? null : getWholesalePendingBody(leadId);

  const dup = checkMessageDuplicate({
    sentLogs,
    outboundInteractions: [],
    pendingBody,
    body,
  });
  if (dup.duplicate) return dup;

  if (isLeadRecentlyContacted(lead, minDays)) {
    const sentAt = lead.last_contacted_at || lead.lastSentAt;
    const sentMs = parseSentMs(sentAt);
    const daysSince = sentMs != null ? Math.floor((Date.now() - sentMs) / 86_400_000) : 0;
    return {
      duplicate: true,
      reason: 'messaged_within_window',
      sentAt,
      daysSince,
      minDays,
      via: 'frequency_cap',
    };
  }

  return { duplicate: false };
}

export { duplicateSkipReason, normalizeMessageBody, isMessageDedupExemptPhone };
