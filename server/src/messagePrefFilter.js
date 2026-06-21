import { isContactRecentlyMessaged } from './db.js';

export function isEligibleForLaunchCampaign(contact, minDaysRecent = 7) {
  const pref = contact.message_pref || 'unset';
  if (pref === 'opt_out' || pref === 'unset' || pref === 'launches_off') return false;
  if (isContactRecentlyMessaged(contact.id, minDaysRecent)) return false;

  if (pref === 'every_launch') return true;

  if (!contact.last_launch_sent_at) return true;

  const sentMs = new Date(String(contact.last_launch_sent_at).replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(sentMs)) return true;

  const days = (Date.now() - sentMs) / 86400000;
  if (pref === 'weekly') return days >= 7;
  if (pref === 'monthly') return days >= 30;
  return false;
}

export function filterLaunchCampaignContacts(contacts, minDaysRecent = 7) {
  return contacts.filter((c) => isEligibleForLaunchCampaign(c, minDaysRecent));
}

export function isEligibleForEndOfDayNotify(contact, minDaysRecent = 7) {
  if (!contact.end_of_day_optin) return false;
  if (contact.message_pref === 'opt_out') return false;
  if (isContactRecentlyMessaged(contact.id, minDaysRecent)) return false;
  return true;
}

export function filterEndOfDayContacts(contacts, minDaysRecent = 7) {
  return contacts.filter((c) => isEligibleForEndOfDayNotify(c, minDaysRecent));
}
