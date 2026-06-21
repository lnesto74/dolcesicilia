import {
  MESSAGE_PREF_LABELS,
  normalizeMessagePref,
  PREFERENCE_POLL_TEMPLATE_ID,
} from './messagePreferences.js';

const WELCOME_CHIP = {
  not_sent: {
    label: 'Welcome not sent',
    shortLabel: 'Not sent',
    className: 'bg-stone-50 text-stone-700 ring-1 ring-inset ring-stone-200',
  },
  queued: {
    label: 'Scheduled — Neighbourhood Welcome not sent yet',
    shortLabel: 'To send',
    className: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200',
  },
  sent_awaiting: {
    label: 'Welcome sent on WhatsApp — waiting for poll reply',
    shortLabel: 'Sent',
    className: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  },
  done: {
    label: 'Welcome sent — customer replied',
    shortLabel: 'Replied',
    className: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  },
};

const PREF_CHIP = {
  every_launch: 'bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200',
  weekly: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  monthly: 'bg-teal-50 text-teal-900 ring-1 ring-inset ring-teal-200',
  launches_off: 'bg-indigo-50 text-indigo-900 ring-1 ring-inset ring-indigo-200',
  opt_out: 'bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-300',
  unset: 'bg-transparent text-ink-400 ring-1 ring-inset ring-stone-200',
};

export function prefDisplayLabel(pref, endOfDayOptin) {
  if (pref === 'unset') return null;
  if (pref === 'every_launch' && endOfDayOptin) return 'Everything + evening trays';
  if (pref === 'launches_off' && endOfDayOptin) return 'End-of-day trays only';
  return MESSAGE_PREF_LABELS[pref];
}

export function prefShortDisplayLabel(pref, endOfDayOptin) {
  if (pref === 'unset') return null;
  if (pref === 'every_launch' && endOfDayOptin) return 'All + EOD';
  if (pref === 'every_launch') return 'New launches';
  if (pref === 'launches_off' && endOfDayOptin) return 'EOD only';
  if (pref === 'monthly') return 'Occasionally';
  if (pref === 'opt_out') return 'Opted out';
  if (pref === 'weekly') return 'Weekly';
  return MESSAGE_PREF_LABELS[pref];
}

export function computeOnboardingOptInView(contact) {
  const pref = normalizeMessagePref(contact.message_pref);
  const endOfDay = !!contact.end_of_day_optin;
  const scheduleStatus = contact.onboardingScheduleStatus;
  const welcomeSent =
    !!contact.welcomeSent ||
    scheduleStatus === 'sent' ||
    hasWelcomeMessageSent(contact.sentMessages);

  let welcomeStatus = 'not_sent';
  if (pref !== 'unset') {
    welcomeStatus = 'done';
  } else if (welcomeSent) {
    welcomeStatus = 'sent_awaiting';
  } else if (scheduleStatus === 'pending' || scheduleStatus === 'failed') {
    welcomeStatus = 'queued';
  }

  const welcomeMeta = WELCOME_CHIP[welcomeStatus];
  const prefLabel = prefDisplayLabel(pref, endOfDay);
  const prefShort = prefShortDisplayLabel(pref, endOfDay);

  let summary;
  if (pref !== 'unset') {
    summary = prefLabel || MESSAGE_PREF_LABELS[pref];
  } else if (welcomeStatus === 'sent_awaiting') {
    summary = 'Tap poll — no preference yet';
  } else if (welcomeStatus === 'queued') {
    summary = 'Neighbourhood Welcome not sent yet';
  } else {
    summary = 'No welcome message yet';
  }

  return {
    welcomeStatus,
    welcomeLabel: welcomeMeta.label,
    welcomeShortLabel: welcomeMeta.shortLabel,
    welcomeChipClass: welcomeMeta.className,
    pref,
    prefLabel,
    prefShortLabel: prefShort,
    prefChipClass: PREF_CHIP[pref],
    summary,
    welcomeSentAt:
      contact.welcomeSentAt ||
      welcomeSentAtFromMessages(contact.sentMessages) ||
      undefined,
    prefUpdatedAt: contact.message_pref_updated_at || undefined,
  };
}

export function hasWelcomeMessageSent(sentMessages) {
  return sentMessages?.some((m) => m.template_id === PREFERENCE_POLL_TEMPLATE_ID) ?? false;
}

export function welcomeSentAtFromMessages(sentMessages) {
  const row = sentMessages?.find((m) => m.template_id === PREFERENCE_POLL_TEMPLATE_ID);
  return row?.sent_at || null;
}
