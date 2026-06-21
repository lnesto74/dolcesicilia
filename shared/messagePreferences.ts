import { firstNameFromFullName } from './messageTemplates.js';

export type MessagePref =
  | 'every_launch'
  | 'weekly'
  | 'monthly'
  | 'launches_off'
  | 'opt_out'
  | 'unset';

export const PREFERENCE_POLL_TEMPLATE_ID = 'neighbourhood-welcome-opt-in-gj63kd';

export const PREFERENCE_POLL_OPTIONS = [
  {
    rowId: 'pref_everything',
    number: 1,
    messagePref: 'every_launch' as const,
    endOfDayOptin: true,
    title: 'Everything — new dolci + evening trays 🌿',
    pollLabel: 'Everything — new dolci + evening trays 🌿',
    confirmation:
      "Perfetto — new dolci when they're born, and a quiet note when there's leftover fresh tray at close 🌿\n\nChef Luca\nDolce Sicilia",
  },
  {
    rowId: 'pref_every_launch',
    number: 2,
    messagePref: 'every_launch' as const,
    endOfDayOptin: false,
    title: 'When something new is born 🍋',
    pollLabel: 'When something new is born 🍋',
    confirmation:
      "Perfetto — I'll knock whenever something fresh comes out of the oven 🍋\n\nChef Luca\nDolce Sicilia",
  },
  {
    rowId: 'pref_end_of_day',
    number: 3,
    messagePref: 'launches_off' as const,
    endOfDayOptin: true,
    title: 'End-of-day fresh trays, at a kinder price 🌙',
    pollLabel: 'End-of-day fresh trays, at a kinder price 🌙',
    confirmation:
      "Got it — only when there's leftover fresh tray at close, at a kinder price 🌙\n\nChef Luca\nDolce Sicilia",
  },
  {
    rowId: 'pref_monthly',
    number: 4,
    messagePref: 'monthly' as const,
    endOfDayOptin: false,
    title: 'Just now and then 📅',
    pollLabel: 'Just now and then 📅',
    confirmation:
      "Lovely — just now and then, a little taste of what's new 📅\n\nChef Luca\nDolce Sicilia",
  },
  {
    rowId: 'pref_opt_out',
    number: 5,
    messagePref: 'opt_out' as const,
    endOfDayOptin: false,
    title: 'No grazie ☕',
    description: "I'll come find you",
    pollLabel: 'No grazie ☕',
    confirmation:
      "Of course — no notes from me. The door's always open whenever you fancy a little Sicily ☕\n\nChef Luca\nDolce Sicilia",
  },
] as const;

export const PREFERENCE_CONFIRMATIONS = Object.fromEntries(
  PREFERENCE_POLL_OPTIONS.map((o) => [o.rowId, o.confirmation]),
) as Record<string, string>;

export const MESSAGE_PREF_LABELS: Record<MessagePref, string> = {
  every_launch: 'Every launch',
  weekly: 'Weekly',
  monthly: 'Just now and then',
  launches_off: 'End-of-day only',
  opt_out: 'Opted out',
  unset: 'No preference',
};

export const MESSAGE_PREF_CHIP_CLASS: Record<MessagePref, string> = {
  every_launch: 'bg-mediterranean-800 text-white border-mediterranean-900',
  weekly: 'bg-cream-400 text-ink-800 border-beige-600',
  monthly: 'bg-amber-100 text-amber-950 border-amber-400',
  launches_off: 'bg-slate-200 text-slate-800 border-slate-400',
  opt_out: 'bg-ink-200 text-ink-600 border-ink-300',
  unset: 'bg-ink-100 text-ink-500 border-ink-200',
};

export function normalizeMessagePref(value: unknown): MessagePref {
  if (
    value === 'every_launch' ||
    value === 'weekly' ||
    value === 'monthly' ||
    value === 'launches_off' ||
    value === 'opt_out'
  ) {
    return value;
  }
  return 'unset';
}

export type PreferenceReplyResult = {
  messagePref: MessagePref;
  endOfDayOptin: boolean;
  confirmation: string;
  rowId: string;
};

export function parsePreferenceReply(
  rawBody: string,
  extra?: { rowId?: string; selectedOption?: string },
): PreferenceReplyResult | null {
  const rowId = extra?.rowId?.trim();
  if (rowId) {
    const byRow = PREFERENCE_POLL_OPTIONS.find((o) => o.rowId === rowId);
    if (byRow) {
      return {
        messagePref: byRow.messagePref,
        endOfDayOptin: byRow.endOfDayOptin,
        confirmation: byRow.confirmation,
        rowId: byRow.rowId,
      };
    }
  }

  const body = String(rawBody || extra?.selectedOption || '').trim();
  if (!body) return null;

  const lower = body.toLowerCase();

  for (const opt of PREFERENCE_POLL_OPTIONS) {
    if (lower === opt.rowId || lower.includes(opt.rowId)) {
      return {
        messagePref: opt.messagePref,
        endOfDayOptin: opt.endOfDayOptin,
        confirmation: opt.confirmation,
        rowId: opt.rowId,
      };
    }
    if (body === opt.title || body === opt.pollLabel) {
      return {
        messagePref: opt.messagePref,
        endOfDayOptin: opt.endOfDayOptin,
        confirmation: opt.confirmation,
        rowId: opt.rowId,
      };
    }
    if (lower.includes(opt.title.toLowerCase().slice(0, 14))) {
      return {
        messagePref: opt.messagePref,
        endOfDayOptin: opt.endOfDayOptin,
        confirmation: opt.confirmation,
        rowId: opt.rowId,
      };
    }
  }

  const num = lower.match(/^([1-5])$/);
  if (num) {
    const opt = PREFERENCE_POLL_OPTIONS.find((o) => o.number === Number(num[1]));
    if (opt) {
      return {
        messagePref: opt.messagePref,
        endOfDayOptin: opt.endOfDayOptin,
        confirmation: opt.confirmation,
        rowId: opt.rowId,
      };
    }
  }

  if (/\b(no grazie|opt.?out|stop|unsubscribe)\b/i.test(body)) {
    const opt = PREFERENCE_POLL_OPTIONS.find((o) => o.rowId === 'pref_opt_out')!;
    return {
      messagePref: opt.messagePref,
      endOfDayOptin: opt.endOfDayOptin,
      confirmation: opt.confirmation,
      rowId: opt.rowId,
    };
  }

  return null;
}

export function fillPreferenceIntro(body: string, name: string) {
  const firstName = firstNameFromFullName(name);
  return body.replace(/\{\{firstName\}\}/g, firstName).replace(/\{\{name\}\}/g, name);
}

export const PREFERENCE_POLL_QUEUE_TEMPLATE = 'preference-poll';

export function isEligibleForLaunchCampaign(
  contact: {
    message_pref?: string | null;
    last_launch_sent_at?: string | null;
    id: string;
    sentMessages?: { sent_at: string }[];
  },
  minDaysRecent = 7,
): boolean {
  const pref = normalizeMessagePref(contact.message_pref);
  if (pref === 'opt_out' || pref === 'unset' || pref === 'launches_off') return false;

  if (contact.sentMessages?.length) {
    const latest = contact.sentMessages.reduce((a, b) => (a.sent_at > b.sent_at ? a : b));
    const ms = new Date(latest.sent_at.replace(' ', 'T') + 'Z').getTime();
    if (!Number.isNaN(ms)) {
      const days = (Date.now() - ms) / 86400000;
      if (days < minDaysRecent) return false;
    }
  }

  if (pref === 'every_launch') return true;

  if (!contact.last_launch_sent_at) return true;

  const sentMs = new Date(String(contact.last_launch_sent_at).replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(sentMs)) return true;

  const days = (Date.now() - sentMs) / 86400000;
  if (pref === 'weekly') return days >= 7;
  if (pref === 'monthly') return days >= 30;
  return false;
}
