import { PREFERENCE_POLL_TEMPLATE_ID } from './messagePreferences.js';

export const FIRST_VISIT_CAMPAIGN_ID = 'first-visit-feedback';
export const ONBOARDING_TEMPLATE_ID = PREFERENCE_POLL_TEMPLATE_ID;
export const ONBOARDING_DELAY_MS = 2 * 60 * 60 * 1000;

export const ONBOARDING_INTRO_BODY = `Ciao {{firstName}} 🌿

I'm Luca — the chef behind Dolce Sicilia, your little corner of Sicily here in Singapore.

We're a small kitchen, not a big company. Everything is made by hand, in small batches, the way it's done back home. And every so often something new is born here — a new tiramisù, a cannolo, a torta carrying a bit of Palermo or Ortigia.

I'd love to send you a quiet little note when that happens — the way a neighbour knocks when something fresh comes out of the oven. No noise, no selling. Only when there's something truly worth tasting.

But you should decide — would you like that, and how often? Just tap below 👇

Con affetto,
Chef Luca
Dolce Sicilia`;

export function onboardingDeliverAfterIso(orderedAt: string) {
  const base = new Date(orderedAt || Date.now());
  if (Number.isNaN(base.getTime())) return new Date(Date.now() + ONBOARDING_DELAY_MS).toISOString();
  return new Date(base.getTime() + ONBOARDING_DELAY_MS).toISOString();
}
