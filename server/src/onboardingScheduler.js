import {
  listDueOnboarding,
  markOnboardingSent,
  markOnboardingFailed,
  isOnboardingEnabled,
  logMessageSent,
} from './db.js';
import { sendPreferencePoll } from './messagePreferences.js';
import { openwaConfig } from './openwa.js';
import { PREFERENCE_POLL_TEMPLATE_ID } from '../../shared/messagePreferences.js';

const ONBOARDING_SEND_DELAY_MS = 4500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendOnboardingToContact(contactId) {
  const result = await sendPreferencePoll(contactId);
  if (result.ok) {
    markOnboardingSent(contactId);
    logMessageSent({
      contactId,
      templateId: PREFERENCE_POLL_TEMPLATE_ID,
      templateName: 'Neighbourhood Welcome — opt-in',
      messageBody: 'Intro + preference poll (Choose 👇)',
    });
  } else if (!result.duplicate) {
    markOnboardingFailed(contactId);
  } else {
    markOnboardingSent(contactId);
  }
  return result;
}

export async function processDueOnboarding({ manual = false } = {}) {
  if (!manual) {
    return { ok: true, processed: 0, reason: 'auto_send_disabled_manual_only' };
  }
  if (!isOnboardingEnabled()) {
    return { ok: true, processed: 0, reason: 'onboarding_disabled' };
  }

  const cfg = openwaConfig();
  if (!cfg.enabled && !manual) {
    return { ok: true, processed: 0, reason: 'openwa_off' };
  }

  const due = listDueOnboarding();
  const results = [];

  for (let i = 0; i < due.length; i++) {
    if (i > 0) await sleep(ONBOARDING_SEND_DELAY_MS);
    try {
      const result = await sendOnboardingToContact(due[i].id);
      results.push({ contactId: due[i].id, name: due[i].name, ...result });
    } catch (err) {
      markOnboardingFailed(due[i].id);
      results.push({ contactId: due[i].id, name: due[i].name, ok: false, error: err.message });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  return { ok: sent === due.length, processed: due.length, sent, failed: due.length - sent, results };
}

let schedulerTimer = null;

/** Scheduler disabled — onboarding sends only via explicit API/UI (manual: true). */
export function startOnboardingScheduler(_intervalMs = 60_000) {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
