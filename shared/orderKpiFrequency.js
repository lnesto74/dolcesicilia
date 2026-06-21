import {
  parseOrderDate,
  dateKeySg,
  weekStartFromDateKey,
  weekLabelSg,
  weekdaySgFromKey,
  WEEKDAY_ORDER,
  todayKeySg,
  round2,
  aov,
  buildContactOrderMap,
} from './orderKpiUtils.js';
import { assessSteadyStateF } from './orderKpiSteadyState.js';

const MS_PER_DAY = 86_400_000;

export function buildFrequencyKpis(orders) {
  const today = todayKeySg();
  const todayMs = parseOrderDate(`${today}T12:00:00Z`).getTime();
  const byContact = buildContactOrderMap(orders);

  const active30 = new Set();
  const active60 = new Set();
  const cutoff30 = todayMs - 30 * MS_PER_DAY;
  const cutoff60 = todayMs - 60 * MS_PER_DAY;

  for (const o of orders) {
    const ms = parseOrderDate(o.ordered_at).getTime();
    if (ms >= cutoff30) active30.add(o.contact_id);
    if (ms >= cutoff60) active60.add(o.contact_id);
  }

  let totalOrders = 0;
  let totalTenureMonths = 0;
  const perCustomerFreq = [];
  const tenuresWeeks = [];

  for (const [, rows] of byContact) {
    const firstMs = parseOrderDate(rows[0].ordered_at).getTime();
    const tenureDays = (todayMs - firstMs) / MS_PER_DAY;
    const tenureMonths = Math.max(tenureDays / 30, 1 / 30);
    const tenureWeeks = tenureDays / 7;
    tenuresWeeks.push(tenureWeeks);
    totalOrders += rows.length;
    totalTenureMonths += tenureMonths;
    const freq = rows.length / tenureMonths;
    perCustomerFreq.push({ contactId: rows[0].contact_id, freq, orders: rows.length, tenureWeeks });
  }

  const steadyState = assessSteadyStateF(byContact, todayMs);
  const fBlended = totalTenureMonths > 0 ? round2(totalOrders / totalTenureMonths) : 0;
  const fSteady = steadyState.value ?? 0;
  const medianTenureWeeks = medianArr(tenuresWeeks);

  const sortedFreq = [...perCustomerFreq].sort((a, b) => b.freq - a.freq);
  const decileSize = Math.max(1, Math.ceil(sortedFreq.length * 0.1));
  const topDecile = sortedFreq.slice(0, decileSize);
  let topOrders = 0;
  let topTenure = 0;
  for (const c of topDecile) {
    topOrders += c.orders;
    topTenure += Math.max(c.tenureWeeks / 4.33, 1 / 30);
  }
  const fMax = topTenure > 0 ? round2(topOrders / topTenure) : 0;

  const n30 = active30.size;
  const totalRevenue = round2(
    orders.reduce((s, o) => s + (o.order_value != null && o.order_value > 0 ? o.order_value : 0), 0),
  );
  const valuedOrders = orders.filter((o) => o.order_value != null && o.order_value > 0).length;
  const overallAov = aov(totalRevenue, valuedOrders) ?? 0;

  const fWeekly = round2(fBlended / 4.33);
  const identity = {
    N: n30,
    f: fWeekly,
    fMonthly: fBlended,
    aov: overallAov,
    revenuePerWeek: round2(n30 * fWeekly * overallAov),
    basis: 'Rev/week = N₃₀ × f_weekly × AOV',
  };

  const ordersByWd = new Map(WEEKDAY_ORDER.map((d) => [d, 0]));
  for (const o of orders) {
    if (!active30.has(o.contact_id)) continue;
    const wd = weekdaySgFromKey(dateKeySg(o.ordered_at));
    if (wd) ordersByWd.set(wd, (ordersByWd.get(wd) || 0) + 1);
  }
  const fByWeekday = WEEKDAY_ORDER.map((weekday) => ({
    weekday,
    ordersPerActiveCustomer: n30 ? round2((ordersByWd.get(weekday) || 0) / n30) : 0,
    orders: ordersByWd.get(weekday) || 0,
    isWeekend: weekday === 'Sat' || weekday === 'Sun',
  }));

  const byMonth = new Map();
  for (const o of orders) {
    const dk = dateKeySg(o.ordered_at);
    const month = dk.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, { firstOrder: 0, repeat: 0 });
    const val = o.order_value != null && o.order_value > 0 ? o.order_value : 0;
    const bucket = byMonth.get(month);
    if (o.is_first_order) bucket.firstOrder += val;
    else bucket.repeat += val;
  }
  const months = [...byMonth.keys()].sort();
  let crossoverMonth = null;
  const revenueDecompositionMonthly = months.map((month) => {
    const b = byMonth.get(month);
    const firstOrder = round2(b.firstOrder);
    const repeat = round2(b.repeat);
    if (!crossoverMonth && repeat > firstOrder && repeat > 0) crossoverMonth = month;
    return { month, monthLabel: formatMonth(month), firstOrder, repeat, total: round2(firstOrder + repeat) };
  });

  const byWeek = new Map();
  for (const o of orders) {
    const ws = weekStartFromDateKey(dateKeySg(o.ordered_at));
    if (!byWeek.has(ws)) byWeek.set(ws, { revenue: 0, orders: 0 });
    const w = byWeek.get(ws);
    w.orders += 1;
    if (o.order_value != null && o.order_value > 0) w.revenue += o.order_value;
  }
  const aovWeeklyTrend = [...byWeek.keys()].sort().map((ws) => {
    const w = byWeek.get(ws);
    return {
      weekStart: ws,
      weekLabel: `w/c ${weekLabelSg(ws)}`,
      aov: aov(w.revenue, w.orders),
      orders: w.orders,
      revenue: round2(w.revenue),
    };
  });

  return {
    activeN: { days30: n30, days60: active60.size },
    fBlended: {
      value: fBlended,
      weekly: fWeekly,
      inflatedWarning: medianTenureWeeks < 4,
      basis: 'total orders ÷ Σ tenure months (all customers)',
    },
    fSteadyState: {
      value: fSteady,
      weekly: steadyState.weekly ?? 0,
      available: steadyState.available,
      sampleSize: steadyState.sampleSize,
      weeksUntilMeasurable: steadyState.weeksUntilMeasurable,
      message: steadyState.message,
      basis: steadyState.basis,
    },
    fMax: {
      value: fMax,
      weekly: round2(fMax / 4.33),
      basis: 'tenure-weighted f of top-decile most-frequent customers',
    },
    fByWeekday,
    revenueDecompositionMonthly,
    crossoverMonth,
    aovWeeklyTrend,
    identity,
    medianTenureWeeks: round2(medianTenureWeeks),
  };
}

function medianArr(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-SG', {
    month: 'short',
    year: 'numeric',
  });
}
