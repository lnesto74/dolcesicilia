export type DuplicateCheckResult =
  | { duplicate: false }
  | {
      duplicate: true;
      reason: 'template_already_sent' | 'same_body_sent' | 'already_queued' | 'messaged_within_window';
      templateId?: string;
      sentAt?: string;
      via?: string;
      daysSince?: number;
      minDays?: number;
    };

const IGNORED_TEMPLATE_IDS = new Set(['custom', 'queued', '']);

/** Test numbers — duplicate protection off (repeat sends allowed). */
export const MESSAGE_DEDUP_EXEMPT_PHONES = ['393343782367'];

export function phoneDigits(phone: unknown): string {
  return String(phone || '').replace(/\D/g, '');
}

export function isMessageDedupExemptPhone(phone: unknown): boolean {
  const d = phoneDigits(phone);
  return MESSAGE_DEDUP_EXEMPT_PHONES.some((ex) => d === ex || d.endsWith(ex));
}

/** Normalize body text for duplicate comparison. */
export function normalizeMessageBody(body: unknown): string {
  return String(body || '')
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ');
}

interface SentLogRow {
  template_id?: string | null;
  message_body?: string | null;
  sent_at?: string | null;
}

interface InteractionRow {
  direction?: string | null;
  body?: string | null;
  created_at?: string | null;
}

export const MESSAGE_FREQUENCY_MIN_DAYS = 7;

function parseSentMs(iso: unknown): number | null {
  if (!iso) return null;
  const ms = new Date(String(iso).replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function latestOutboundSentAt({
  sentLogs = [],
  outboundInteractions = [],
}: {
  sentLogs?: SentLogRow[];
  outboundInteractions?: InteractionRow[];
} = {}): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const log of sentLogs) {
    const ms = parseSentMs(log.sent_at);
    if (ms != null && ms > bestMs) {
      bestMs = ms;
      best = log.sent_at || null;
    }
  }
  for (const ix of outboundInteractions) {
    if (ix.direction !== 'out') continue;
    const ms = parseSentMs(ix.created_at);
    if (ms != null && ms > bestMs) {
      bestMs = ms;
      best = ix.created_at || null;
    }
  }
  return best;
}

export type FrequencyCapResult =
  | { blocked: false }
  | {
      blocked: true;
      reason: 'messaged_within_window';
      sentAt: string;
      daysSince: number;
      minDays: number;
    };

export function checkMessageFrequencyCap({
  sentLogs = [],
  outboundInteractions = [],
  minDays = MESSAGE_FREQUENCY_MIN_DAYS,
  exemptFromDedup = false,
  now = Date.now(),
}: {
  sentLogs?: SentLogRow[];
  outboundInteractions?: InteractionRow[];
  minDays?: number;
  exemptFromDedup?: boolean;
  now?: number;
}): FrequencyCapResult {
  if (exemptFromDedup) return { blocked: false };

  const sentAt = latestOutboundSentAt({ sentLogs, outboundInteractions });
  if (!sentAt) return { blocked: false };

  const sentMs = parseSentMs(sentAt);
  if (sentMs == null) return { blocked: false };

  const daysSince = (now - sentMs) / 86_400_000;
  if (daysSince < minDays) {
    return {
      blocked: true,
      reason: 'messaged_within_window',
      sentAt,
      daysSince: Math.floor(daysSince),
      minDays,
    };
  }
  return { blocked: false };
}

export function frequencySkipReason(result: FrequencyCapResult): string {
  if (!result.blocked) return '';
  const d = result.daysSince ?? 0;
  return `messaged ${d} day${d === 1 ? '' : 's'} ago (min ${result.minDays} days between any message)`;
}

export function checkMessageDuplicate({
  sentLogs = [],
  outboundInteractions = [],
  pendingBody,
  templateId,
  body,
  exemptFromDedup = false,
}: {
  sentLogs?: SentLogRow[];
  outboundInteractions?: InteractionRow[];
  pendingBody?: string | null;
  templateId?: string | null;
  body?: string | null;
  exemptFromDedup?: boolean;
}): DuplicateCheckResult {
  if (exemptFromDedup) return { duplicate: false };

  const normalized = normalizeMessageBody(body);
  if (!normalized) return { duplicate: false };

  const tid = templateId?.trim();
  if (tid && !IGNORED_TEMPLATE_IDS.has(tid)) {
    const byTemplate = sentLogs.find((l) => l.template_id === tid);
    if (byTemplate) {
      return {
        duplicate: true,
        reason: 'template_already_sent',
        templateId: tid,
        sentAt: byTemplate.sent_at || undefined,
        via: 'message_log',
      };
    }
  }

  for (const log of sentLogs) {
    if (normalizeMessageBody(log.message_body) === normalized) {
      return {
        duplicate: true,
        reason: 'same_body_sent',
        sentAt: log.sent_at || undefined,
        via: 'message_log',
      };
    }
  }

  for (const i of outboundInteractions) {
    if (i.direction !== 'out') continue;
    const ib = normalizeMessageBody(i.body);
    if (ib.length < 40) continue;
    if (ib === normalized) {
      return {
        duplicate: true,
        reason: 'same_body_sent',
        sentAt: i.created_at || undefined,
        via: 'whatsapp',
      };
    }
  }

  if (pendingBody && normalizeMessageBody(pendingBody) === normalized) {
    return { duplicate: true, reason: 'already_queued' };
  }

  return { duplicate: false };
}

export function duplicateSkipReason(result: DuplicateCheckResult): string {
  if (!result.duplicate) return '';
  if (result.reason === 'template_already_sent') {
    return `already sent template ${result.templateId || ''}`.trim();
  }
  if (result.reason === 'already_queued') return 'same message already queued';
  if (result.reason === 'messaged_within_window') {
    return frequencySkipReason({
      blocked: true,
      reason: 'messaged_within_window',
      sentAt: result.sentAt || '',
      daysSince: result.daysSince ?? 0,
      minDays: result.minDays ?? MESSAGE_FREQUENCY_MIN_DAYS,
    });
  }
  return 'identical message already sent';
}
