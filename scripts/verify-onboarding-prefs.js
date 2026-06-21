#!/usr/bin/env node
/**
 * Verify preference poll option → message_pref + end_of_day_optin mappings.
 * Run: node scripts/verify-onboarding-prefs.js
 */
import { parsePreferenceReply } from '../shared/messagePreferences.js';

const cases = [
  { n: 1, messagePref: 'every_launch', endOfDayOptin: true },
  { n: 2, messagePref: 'every_launch', endOfDayOptin: false },
  { n: 3, messagePref: 'launches_off', endOfDayOptin: true },
  { n: 4, messagePref: 'monthly', endOfDayOptin: false },
  { n: 5, messagePref: 'opt_out', endOfDayOptin: false },
];

let failed = 0;
for (const c of cases) {
  const parsed = parsePreferenceReply(String(c.n));
  const ok =
    parsed &&
    parsed.messagePref === c.messagePref &&
    parsed.endOfDayOptin === c.endOfDayOptin;
  if (!ok) {
    failed += 1;
    console.error('FAIL option', c.n, 'expected', c, 'got', parsed);
  } else {
    console.log('OK option', c.n, '→', parsed.messagePref, 'eod=', parsed.endOfDayOptin);
  }
}

import { onboardingDeliverAfterIso } from '../shared/onboardingFlow.js';
const orderedAt = '2026-06-11T14:00:00.000Z';
const deliver = onboardingDeliverAfterIso(orderedAt);
const diffH = (new Date(deliver).getTime() - new Date(orderedAt).getTime()) / 3600000;
if (Math.abs(diffH - 2) > 0.01) {
  failed += 1;
  console.error('FAIL onboarding delay hours', diffH);
} else {
  console.log('OK onboarding delay ~2h after', orderedAt, '→', deliver);
}

process.exit(failed > 0 ? 1 : 0);
