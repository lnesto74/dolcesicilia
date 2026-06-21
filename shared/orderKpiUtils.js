export const SG_TZ = 'Asia/Singapore';
export const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function parseOrderDate(iso) {
  return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
}

export function dateKeySg(iso) {
  return parseOrderDate(iso).toLocaleDateString('en-CA', { timeZone: SG_TZ });
}

export function todayKeySg() {
  return new Date().toLocaleDateString('en-CA', { timeZone: SG_TZ });
}

export function weekdaySgFromKey(dateKey) {
  const wd = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-SG', {
    timeZone: SG_TZ,
    weekday: 'short',
  });
  return WEEKDAY_ORDER.includes(wd) ? wd : null;
}

export function dayLabelSg(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-SG', {
    timeZone: SG_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function weekLabelSg(weekStart) {
  return new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('en-SG', {
    timeZone: SG_TZ,
    day: 'numeric',
    month: 'short',
  });
}

export function addDayKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

export function weekStartFromDateKey(dateKey) {
  const wd = weekdaySgFromKey(dateKey);
  if (!wd) return dateKey;
  const idx = WEEKDAY_ORDER.indexOf(wd);
  return addDayKey(dateKey, -idx);
}

export function isWeekCompleted(weekStart, today) {
  return addDayKey(weekStart, 6) < today;
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function pctDelta(current, prior) {
  if (prior === 0) return current > 0 ? 100 : current === 0 ? 0 : null;
  return round2(((current - prior) / prior) * 100);
}

export function makeDelta(current, prior, basis) {
  return {
    current: round2(current),
    prior: round2(prior),
    delta: round2(current - prior),
    deltaPct: pctDelta(current, prior),
    basis,
  };
}

export function aov(revenue, orders) {
  if (!orders || revenue <= 0) return null;
  return round2(revenue / orders);
}

export function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : round2((sorted[mid - 1] + sorted[mid]) / 2);
}

export function mean(nums) {
  if (!nums.length) return null;
  return round2(nums.reduce((s, n) => s + n, 0) / nums.length);
}

export function buildContactOrderMap(orders) {
  const byContact = new Map();
  for (const o of orders) {
    if (!byContact.has(o.contact_id)) byContact.set(o.contact_id, []);
    byContact.get(o.contact_id).push(o);
  }
  for (const rows of byContact.values()) {
    rows.sort((a, b) => a.ordered_at.localeCompare(b.ordered_at));
  }
  return byContact;
}

export function repeatRateHealth(rate) {
  if (rate >= 25) return 'green';
  if (rate >= 15) return 'amber';
  return 'red';
}

export function reorderHealth(rate) {
  if (rate >= 30) return 'green';
  if (rate >= 15) return 'amber';
  return 'red';
}
