import { isEligibleForLaunchCampaign } from './messagePrefFilter.js';
import { getMessageLogs, getWhatsAppInteractions, getContactSentLogSummary } from './db.js';
import { MESSAGE_PREF_LABELS } from '../../shared/messagePreferences.js';
import { contactAlreadyReceivedMessage } from './messageDedup.js';

const MIN_DAYS_BETWEEN = 7;

function daysSince(iso) {
  if (!iso) return null;
  const ms = new Date(String(iso).replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor((Date.now() - ms) / 86400000);
}

function mergeRecentOutbound(contactId) {
  const logs = getMessageLogs(contactId).map((l) => ({
    source: 'message_log',
    templateId: l.template_id,
    templateName: l.template_name,
    bodyPreview: String(l.message_body || '').slice(0, 120),
    sentAt: l.sent_at,
  }));

  const interactions = getWhatsAppInteractions(contactId)
    .filter((i) => i.direction === 'out')
    .map((i) => ({
      source: 'whatsapp',
      templateId: i.message_type,
      templateName: i.message_type,
      bodyPreview: String(i.body || '').slice(0, 120),
      sentAt: i.created_at,
    }));

  return [...logs, ...interactions]
    .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)))
    .slice(0, 15);
}

export function buildContactMessagingProfile(contact) {
  const pref = contact.message_pref || 'unset';
  const recentOutbound = mergeRecentOutbound(contact.id);
  const lastMessageSentAt = recentOutbound[0]?.sentAt || null;
  const sentLogSummary = getContactSentLogSummary(contact.id, 30);

  return {
    contactId: contact.id,
    name: contact.name,
    phone: contact.phone?.startsWith('pending-') ? null : contact.phone,
    messagePref: pref,
    messagePrefLabel: MESSAGE_PREF_LABELS[pref] || MESSAGE_PREF_LABELS.unset,
    endOfDayOptin: !!contact.end_of_day_optin,
    messagePrefUpdatedAt: contact.message_pref_updated_at || null,
    lastLaunchSentAt: contact.last_launch_sent_at || null,
    lastMessageSentAt,
    daysSinceLastMessage: daysSince(lastMessageSentAt),
    daysSincePrefSet: daysSince(contact.message_pref_updated_at),
    daysSinceLastLaunch: daysSince(contact.last_launch_sent_at),
    eligibleForLaunchCampaign: isEligibleForLaunchCampaign(contact, MIN_DAYS_BETWEEN),
    eligibleForEndOfDayNotify:
      !!contact.end_of_day_optin &&
      pref !== 'opt_out' &&
      (daysSince(lastMessageSentAt) == null || daysSince(lastMessageSentAt) >= MIN_DAYS_BETWEEN),
    recentlyMessaged: daysSince(lastMessageSentAt) != null && daysSince(lastMessageSentAt) < MIN_DAYS_BETWEEN,
    sentTemplateIds: [...new Set(sentLogSummary.map((l) => l.template_id).filter(Boolean))],
    recentOutbound,
  };
}

/** Check if a specific message can be sent without duplicating prior sends. */
export function canSendMessageToContact(contactId, { body, templateId }) {
  const dup = contactAlreadyReceivedMessage(contactId, { body, templateId });
  return { allowed: !dup.duplicate, duplicate: dup.duplicate ? dup : null };
}

export function buildMessagingContext(contacts) {
  const profiles = contacts.map(buildContactMessagingProfile);
  const byPref = { every_launch: 0, weekly: 0, monthly: 0, launches_off: 0, opt_out: 0, unset: 0 };
  let endOfDayOptIn = 0;
  for (const p of profiles) {
    const key = byPref[p.messagePref] != null ? p.messagePref : 'unset';
    byPref[key] = (byPref[key] || 0) + 1;
    if (p.endOfDayOptin) endOfDayOptIn += 1;
  }

  return {
    rules: {
      minDaysBetweenAnyMessage: MIN_DAYS_BETWEEN,
      neverDuplicateMessage:
        'Never send the same template ID or identical message body to the same contact twice. Check sentTemplateIds and use canSendMessageToContact before queueing.',
      launchCampaign: {
        every_launch: 'Include in every launch (still respect 7-day guardrail)',
        weekly: 'At most one launch message per 7 days (uses lastLaunchSentAt)',
        monthly: 'At most one launch message per 30 days (just now and then)',
        launches_off: 'No launch notes — end-of-day only if endOfDayOptin',
        opt_out: 'Never include in launch broadcasts',
        unset: 'Never include until preference poll completed',
      },
      endOfDay: {
        field: 'endOfDayOptin',
        rule: 'Only message contacts with endOfDayOptin=true for leftover tray alerts; respect 7-day dedup',
      },
    },
    summary: {
      totalContacts: profiles.length,
      byPreference: byPref,
      endOfDayOptIn,
      eligibleForLaunchNow: profiles.filter((p) => p.eligibleForLaunchCampaign).length,
      eligibleForEndOfDayNow: profiles.filter((p) => p.eligibleForEndOfDayNotify).length,
      optedOut: byPref.opt_out,
      noPreferenceYet: byPref.unset,
    },
    contacts: profiles,
  };
}
