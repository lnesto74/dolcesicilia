import { firstNameFromFullName } from './messageTemplates.js';
import { HIGH_VALUE_THRESHOLD_SGD } from './parseOrderValue.js';

export const TOP_SPENDER_MIN_SGD = 70;

export interface PromoCampaign {
  id: string;
  segmentId: string;
  name: string;
  promo: string;
  keyword: string;
  description: string;
  body: string;
}

export const PROMO_CAMPAIGNS: PromoCampaign[] = [
  {
    id: 'win-back',
    segmentId: 'win-back',
    name: 'Win-back',
    promo: 'Win-back offer',
    keyword: 'ORANGE',
    description: 'First-timers who haven\'t reordered in 14+ days',
    body: `Hey {{firstName}}! 👋 We miss you at Dolce Sicilia. We just dropped our new Orange Liquor Tiramisù — and we'd love for you to try it. Reply "ORANGE" and we'll save you one this week. 🍊🇮🇹`,
  },
  {
    id: 'tray-upsell',
    segmentId: 'tray-upsell',
    name: 'Tray upsell',
    promo: 'Birthday tray',
    keyword: 'TRAY',
    description: 'Recent single-portion orders (last 7 days)',
    body: `Ciao {{firstName}}! 🎂 Planning anything this weekend? Our Birthday Tray serves 9–12 people and comes in Classic, Pistachio or Orange Liquor. Order by Thursday for Friday delivery. Interested? Just reply! 👇`,
  },
  {
    id: 'vip-early-access',
    segmentId: 'vip',
    name: 'VIP early access',
    promo: 'VIP early access',
    keyword: 'YES',
    description: 'Loyal fans with 2+ orders',
    body: `{{firstName}}, you're one of our best customers — so you hear it first. 🤫 We're testing a new flavour next week and we want your honest opinion. Want in? Reply "YES" and we'll set one aside for you.`,
  },
  {
    id: 'high-value-first',
    segmentId: 'high-value-first',
    name: 'High-value thank-you',
    promo: 'VIP reward — big first order',
    keyword: 'TREAT',
    description: `First order ≥ S$${HIGH_VALUE_THRESHOLD_SGD} — reward your best new customers`,
    body: `{{firstName}}, wow — thank you for such a generous first order at Dolce Sicilia! 🤍 As a thank-you we'd love to offer you a complimentary pistachio topping on your next order. Just reply "TREAT" and we'll note it for you. Grazie! 🇮🇹`,
  },
  {
    id: 'top-spender',
    segmentId: 'top-spender',
    name: 'Top spender reward',
    promo: 'Most valuable customers',
    keyword: 'VIP',
    description: 'Highest lifetime spend — your power buyers',
    body: `{{firstName}}, you're one of our most valued customers at Dolce Sicilia — thank you for your incredible support! 🙏 We'd like to offer you early access to our next limited batch. Reply "VIP" and Luca will personally reach out.`,
  },
];

export type PrimarySegmentId =
  | 'win-back'
  | 'high-value-first'
  | 'vip'
  | 'tray-upsell'
  | 'new-nurture';

export type SegmentTagId = 'top-spender' | 'promoter' | 'at-risk';

export const WIN_BACK_MIN_DAYS = 14;
export const WIN_BACK_MAX_DAYS = 60;
export const HIGH_VALUE_MAX_DAYS = 14;
export const TRAY_UPSELL_MAX_DAYS = 7;

export interface SegmentContact {
  id: string;
  name: string;
  phone: string;
  customer_type: string;
  order_count: number;
  lastOrderAt: string | null;
  daysSinceOrder: number | null;
  totalSpend: number;
  firstOrderValue: number | null;
  maxOrderValue: number | null;
  message_pref?: string | null;
  primarySegment?: PrimarySegmentId | null;
  tags?: SegmentTagId[];
}

export interface CustomerSegment {
  id: string;
  name: string;
  who: string;
  promo: string;
  campaign: PromoCampaign;
  count: number;
  contacts: SegmentContact[];
}

function parseOrderMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(ms) ? null : ms;
}

function daysSince(iso: string | null, now = Date.now()): number | null {
  const ms = parseOrderMs(iso);
  if (ms == null) return null;
  return Math.floor((now - ms) / 86_400_000);
}

export function getPrimarySegment(contact: SegmentContact): PrimarySegmentId | null {
  if (contact.order_count <= 0 || contact.daysSinceOrder == null) return null;
  const d = contact.daysSinceOrder;
  const fv = contact.firstOrderValue;

  if (contact.order_count === 1 && d >= WIN_BACK_MIN_DAYS && d <= WIN_BACK_MAX_DAYS) {
    return 'win-back';
  }
  if (
    contact.order_count === 1 &&
    fv != null &&
    fv >= HIGH_VALUE_THRESHOLD_SGD &&
    d <= HIGH_VALUE_MAX_DAYS
  ) {
    return 'high-value-first';
  }
  if (contact.order_count >= 2) return 'vip';
  if (
    contact.order_count === 1 &&
    d <= TRAY_UPSELL_MAX_DAYS &&
    (fv == null || fv < HIGH_VALUE_THRESHOLD_SGD)
  ) {
    return 'tray-upsell';
  }
  if (contact.order_count >= 1) return 'new-nurture';
  return null;
}

export function getSegmentTags(
  contact: SegmentContact,
  campaignAnswers?: Record<string, unknown> | null,
): SegmentTagId[] {
  const tags: SegmentTagId[] = [];
  if (
    contact.totalSpend >= TOP_SPENDER_MIN_SGD ||
    (contact.maxOrderValue != null && contact.maxOrderValue >= 50)
  ) {
    tags.push('top-spender');
  }
  if (campaignAnswers) {
    const q3 = String(campaignAnswers.q3 ?? '');
    if (/100%|definitely/i.test(q3)) tags.push('promoter');
    const negative =
      /not quite|issue|probably not/i.test(
        `${campaignAnswers.q1 ?? ''} ${campaignAnswers.q2 ?? ''} ${q3}`,
      ) && !/loved|perfect|100%/i.test(q3);
    if (negative) tags.push('at-risk');
  }
  return tags;
}

function enrichContact(
  c: {
    id: string;
    name: string;
    phone: string;
    customer_type?: string;
    order_count?: number;
    orderStats?: {
      lastOrderAt?: string;
      count?: number;
      totalValue?: number;
      firstOrderValue?: number | null;
      maxOrderValue?: number | null;
    } | null;
    last_seen_at?: string;
    message_pref?: string | null;
    campaignAnswers?: Record<string, unknown> | null;
  },
  now: number,
): SegmentContact | null {
  const lastOrderAt = c.orderStats?.lastOrderAt || c.last_seen_at || null;
  const orderCount = c.orderStats?.count ?? c.order_count ?? 0;
  if (orderCount <= 0 || !lastOrderAt) return null;

  const base: SegmentContact = {
    id: c.id,
    name: c.name,
    phone: c.phone,
    customer_type: c.customer_type || 'first_time',
    order_count: orderCount,
    lastOrderAt,
    daysSinceOrder: daysSince(lastOrderAt, now),
    totalSpend: c.orderStats?.totalValue ?? 0,
    firstOrderValue: c.orderStats?.firstOrderValue ?? null,
    maxOrderValue: c.orderStats?.maxOrderValue ?? null,
    message_pref: c.message_pref || 'unset',
  };
  const primarySegment = getPrimarySegment(base);
  const tags = getSegmentTags(base, c.campaignAnswers);
  return { ...base, primarySegment, tags };
}

const PRIMARY_SEGMENT_META: Record<
  PrimarySegmentId,
  { name: string; who: string; promo: string; campaignKey: string }
> = {
  'win-back': {
    name: 'Win-back',
    who: `Ordered once, ${WIN_BACK_MIN_DAYS}–${WIN_BACK_MAX_DAYS} days ago`,
    promo: 'Win-back offer',
    campaignKey: 'win-back',
  },
  'high-value-first': {
    name: 'High-value first order',
    who: `First order ≥ S$${HIGH_VALUE_THRESHOLD_SGD}, within ${HIGH_VALUE_MAX_DAYS} days`,
    promo: 'VIP thank-you reward',
    campaignKey: 'high-value-first',
  },
  vip: {
    name: 'VIP — loyal fans',
    who: '2+ orders (returning)',
    promo: 'VIP early access',
    campaignKey: 'vip',
  },
  'tray-upsell': {
    name: 'Recent — tray upsell',
    who: `Single order < S$${HIGH_VALUE_THRESHOLD_SGD}, last ${TRAY_UPSELL_MAX_DAYS} days`,
    promo: 'Upsell to tray',
    campaignKey: 'tray-upsell',
  },
  'new-nurture': {
    name: 'New / nurture',
    who: 'First-time or early customers outside other segments',
    promo: 'Gentle nurture',
    campaignKey: 'high-value-first',
  },
};

export function computeCustomerSegments(
  contacts: {
    id: string;
    name: string;
    phone: string;
    customer_type?: string;
    order_count?: number;
    orderStats?: {
      lastOrderAt?: string;
      count?: number;
      totalValue?: number;
      firstOrderValue?: number | null;
      maxOrderValue?: number | null;
    } | null;
    last_seen_at?: string;
    message_pref?: string | null;
  }[],
  now = Date.now(),
): CustomerSegment[] {
  const enriched = contacts
    .map((c) => enrichContact(c, now))
    .filter((c): c is SegmentContact => c != null);

  const campaignById = Object.fromEntries(PROMO_CAMPAIGNS.map((p) => [p.segmentId, p]));
  const topSpenders = enriched.filter((c) => c.tags?.includes('top-spender'));

  const primaryOrder: PrimarySegmentId[] = [
    'win-back',
    'high-value-first',
    'vip',
    'tray-upsell',
    'new-nurture',
  ];

  const primarySegments = primaryOrder.map((id) => {
    const meta = PRIMARY_SEGMENT_META[id];
    const members = enriched.filter((c) => c.primarySegment === id);
    const campaign =
      campaignById[meta.campaignKey] ??
      campaignById['high-value-first'];
    return {
      id,
      name: meta.name,
      who: meta.who,
      promo: meta.promo,
      campaign,
      count: members.length,
      contacts: members,
    };
  });

  return [
    ...primarySegments,
    {
      id: 'top-spender',
      name: 'Top spenders (tag)',
      who: `Lifetime spend ≥ S$${TOP_SPENDER_MIN_SGD} or single order ≥ S$50`,
      promo: 'Most valuable customers',
      campaign: campaignById['top-spender'],
      count: topSpenders.length,
      contacts: topSpenders.sort((a, b) => b.totalSpend - a.totalSpend),
    },
  ];
}

export function fillPromoMessage(body: string, name: string): string {
  const firstName = firstNameFromFullName(name);
  return body.replace(/\{\{firstName\}\}/g, firstName).replace(/\{\{name\}\}/g, name);
}
