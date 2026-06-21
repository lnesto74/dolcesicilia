import {
  parseOrderDate,
  dateKeySg,
  weekStartFromDateKey,
  weekLabelSg,
  isWeekCompleted,
  todayKeySg,
  round2,
  buildContactOrderMap,
} from './orderKpiUtils.js';

const MS_PER_DAY = 86_400_000;
const HISTORY_WEEKS = 12;

export const SCENARIO_DEFAULTS = {
  low: { gNew: -0.08, rWeeklyMultiplier: 0.8, rGrow: 1.0, aovMultiplier: 1.0, label: 'Low' },
  base: { gNew: -0.03, rWeeklyMultiplier: 1.0, rGrow: 1.0, aovMultiplier: 1.0, label: 'Base' },
  high: { gNew: 0.0, rWeeklyMultiplier: 1.2, rGrow: 1.01, aovMultiplier: 1.05, label: 'High' },
};

function firstOrderDateByContact(orders) {
  const map = new Map();
  for (const o of orders) {
    if (!map.has(o.contact_id)) map.set(o.contact_id, dateKeySg(o.ordered_at));
  }
  return map;
}

function buildWeeklyBuckets(orders) {
  const firstDates = firstOrderDateByContact(orders);
  const byWeek = new Map();

  for (const o of orders) {
    const ws = weekStartFromDateKey(dateKeySg(o.ordered_at));
    if (!byWeek.has(ws)) {
      byWeek.set(ws, {
        weekStart: ws,
        weekLabel: `w/c ${weekLabelSg(ws)}`,
        newCustomers: 0,
        repeatOrders: 0,
        firstOrderRevenue: 0,
        firstOrderCount: 0,
        repeatRevenue: 0,
        repeatCount: 0,
        activeContacts: new Set(),
        revenue: 0,
        orders: 0,
      });
    }
    const w = byWeek.get(ws);
    w.orders += 1;
    w.activeContacts.add(o.contact_id);
    const val = o.order_value != null && o.order_value > 0 ? o.order_value : 0;
    w.revenue += val;

    const isNew = firstDates.get(o.contact_id) === dateKeySg(o.ordered_at);
    if (isNew) {
      w.newCustomers += 1;
      if (val > 0) {
        w.firstOrderRevenue += val;
        w.firstOrderCount += 1;
      }
    } else {
      w.repeatOrders += 1;
      if (val > 0) {
        w.repeatRevenue += val;
        w.repeatCount += 1;
      }
    }
  }

  return [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function computeProjectionBaselines(orders) {
  const today = todayKeySg();
  const todayMs = parseOrderDate(`${today}T12:00:00Z`).getTime();
  const partialWeekStart = weekStartFromDateKey(today);
  const weeks = buildWeeklyBuckets(orders);
  const completed = weeks.filter((w) => isWeekCompleted(w.weekStart, today));
  const last4 = completed.slice(-4);

  const new0 =
    last4.length > 0 ? round2(last4.reduce((s, w) => s + w.newCustomers, 0) / last4.length) : 0;

  let foSum = 0;
  let foCount = 0;
  let repSum = 0;
  let repCount = 0;
  let repeatOrders4w = 0;
  let activeSum = 0;

  const firstDates = firstOrderDateByContact(orders);
  for (const w of last4) {
    repeatOrders4w += w.repeatOrders;
    activeSum += w.activeContacts.size;
    for (const o of orders) {
      if (weekStartFromDateKey(dateKeySg(o.ordered_at)) !== w.weekStart) continue;
      const val = o.order_value != null && o.order_value > 0 ? o.order_value : 0;
      if (val <= 0) continue;
      const isNew = firstDates.get(o.contact_id) === dateKeySg(o.ordered_at);
      if (isNew) {
        foSum += val;
        foCount += 1;
      } else {
        repSum += val;
        repCount += 1;
      }
    }
  }

  const foAOV = foCount ? round2(foSum / foCount) : 0;
  const repAOV = repCount ? round2(repSum / repCount) : foAOV;
  const avgActive = last4.length ? activeSum / last4.length : 0;
  const rWeekly = avgActive > 0 ? round2(repeatOrders4w / last4.length / avgActive) : 0;

  const byContact = buildContactOrderMap(orders);
  const cum0 = byContact.size;
  const cutoff30 = todayMs - 30 * MS_PER_DAY;
  const active30 = new Set();
  for (const o of orders) {
    if (parseOrderDate(o.ordered_at).getTime() >= cutoff30) active30.add(o.contact_id);
  }
  const activeBase0 = active30.size;

  const histSlice = weeks.slice(-HISTORY_WEEKS);
  let runCum =
    cum0 - histSlice.reduce((s, w) => s + w.newCustomers, 0);
  const history = histSlice.map((w, i) => {
    runCum += w.newCustomers;
    return {
      weekIndex: i - histSlice.length + 1,
      weekStart: w.weekStart,
      weekLabel: w.weekLabel,
      isActual: true,
      newCustomers: w.newCustomers,
      cumulativeCustomers: runCum,
      revenue: round2(w.revenue),
      orders: w.orders,
      repeatOrders: w.repeatOrders,
    };
  });
  if (history.length) history[history.length - 1].weekIndex = 0;

  return {
    new0,
    foAOV,
    repAOV,
    rWeekly,
    cum0,
    activeBase0,
    basis: {
      new0: `avg new customers/week, last ${last4.length} completed weeks (excl. partial)`,
      foAOV: 'avg first-order value, last 4 completed weeks',
      repAOV: 'avg repeat-order value, last 4 completed weeks',
      rWeekly: 'repeat orders per active customer per week, last 4 completed weeks',
    },
    history,
    partialWeekExcluded: partialWeekStart,
    completedWeeksUsed: last4.length,
  };
}

/**
 * Weekly walk for one scenario. Week 1 revenue = new0×foAOV + activeBase0×rWeekly×repAOV.
 */
export function runScenarioWalk(baselines, scenarioParams, weeks = 26) {
  const {
    gNew = 0,
    rWeeklyMultiplier = 1,
    rGrow = 1,
    aovMultiplier = 1,
    new0: new0Override,
    foAOV: foOverride,
    repAOV: repOverride,
    rWeekly: rWeeklyOverride,
    cum0: cum0Override,
    activeBase0: activeBaseOverride,
  } = scenarioParams;

  const new0 = new0Override ?? baselines.new0;
  const foAOV = (foOverride ?? baselines.foAOV) * aovMultiplier;
  const repAOV = (repOverride ?? baselines.repAOV) * aovMultiplier;
  const rWeekly = (rWeeklyOverride ?? baselines.rWeekly) * rWeeklyMultiplier;
  const cum0 = cum0Override ?? baselines.cum0;
  const activeBase0 = activeBaseOverride ?? baselines.activeBase0;

  let cumCust = cum0;
  let activeBase = activeBase0;
  const points = [];

  for (let t = 1; t <= weeks; t++) {
    const newCust = Math.max(0, round2(new0 * (1 + gNew) ** (t - 1)));
    const repeatOrders = round2(activeBase * rWeekly * rGrow ** (t - 1));
    const revenue = round2(newCust * foAOV + repeatOrders * repAOV);
    cumCust = round2(cumCust + newCust);
    activeBase = cumCust;
    points.push({
      weekIndex: t,
      weekLabel: `+${t}w`,
      newCustomers: newCust,
      cumulativeCustomers: cumCust,
      repeatOrders,
      orders: round2(newCust + repeatOrders),
      revenue,
    });
  }
  return points;
}

export function runAllScenarios(baselines, overrides = {}, weeks = 26) {
  const scenarios = {};
  for (const [key, defaults] of Object.entries(SCENARIO_DEFAULTS)) {
    scenarios[key] = runScenarioWalk(
      baselines,
      { ...defaults, ...overrides.common, ...overrides[key] },
      weeks,
    );
  }
  return scenarios;
}

function sumRange(points, start, end, field) {
  return round2(points.slice(start - 1, end).reduce((s, p) => s + p[field], 0));
}

export function buildProjectionSummary(scenarios) {
  return {
    threeMonths: {
      weeks: 13,
      revenue: {
        base: sumRange(scenarios.base, 1, 13, 'revenue'),
        low: sumRange(scenarios.low, 1, 13, 'revenue'),
        high: sumRange(scenarios.high, 1, 13, 'revenue'),
      },
      newCustomers: {
        base: sumRange(scenarios.base, 1, 13, 'newCustomers'),
        low: sumRange(scenarios.low, 1, 13, 'newCustomers'),
        high: sumRange(scenarios.high, 1, 13, 'newCustomers'),
      },
      exitRunRate: {
        base: scenarios.base[12]?.revenue ?? 0,
        low: scenarios.low[12]?.revenue ?? 0,
        high: scenarios.high[12]?.revenue ?? 0,
      },
    },
    sixMonths: {
      weeks: 26,
      revenue: {
        base: sumRange(scenarios.base, 1, 26, 'revenue'),
        low: sumRange(scenarios.low, 1, 26, 'revenue'),
        high: sumRange(scenarios.high, 1, 26, 'revenue'),
      },
      newCustomers: {
        base: sumRange(scenarios.base, 1, 26, 'newCustomers'),
        low: sumRange(scenarios.low, 1, 26, 'newCustomers'),
        high: sumRange(scenarios.high, 1, 26, 'newCustomers'),
      },
      exitRunRate: {
        base: scenarios.base[25]?.revenue ?? 0,
        low: scenarios.low[25]?.revenue ?? 0,
        high: scenarios.high[25]?.revenue ?? 0,
      },
    },
  };
}

export function buildChartSeries(history, scenarios, horizon = 26) {
  const hist = history.map((h) => ({
    weekIndex: h.weekIndex,
    weekLabel: h.weekLabel,
    isForecast: false,
    revenueActual: h.revenue,
    newCustomersActual: h.newCustomers,
    cumulativeActual: h.cumulativeCustomers,
  }));

  const forecast = [];
  for (let t = 1; t <= horizon; t++) {
    forecast.push({
      weekIndex: t,
      weekLabel: `+${t}w`,
      isForecast: true,
      revenueBase: scenarios.base[t - 1]?.revenue,
      revenueLow: scenarios.low[t - 1]?.revenue,
      revenueHigh: scenarios.high[t - 1]?.revenue,
      newCustomersBase: scenarios.base[t - 1]?.newCustomers,
      newCustomersLow: scenarios.low[t - 1]?.newCustomers,
      newCustomersHigh: scenarios.high[t - 1]?.newCustomers,
      cumulativeBase: scenarios.base[t - 1]?.cumulativeCustomers,
      cumulativeLow: scenarios.low[t - 1]?.cumulativeCustomers,
      cumulativeHigh: scenarios.high[t - 1]?.cumulativeCustomers,
    });
  }

  return [...hist, ...forecast];
}

export function computeOrderProjection(orders) {
  const baselines = computeProjectionBaselines(orders);
  const scenarios = runAllScenarios(baselines);
  const summary = buildProjectionSummary(scenarios);
  const chartSeries = buildChartSeries(baselines.history, scenarios);

  return {
    generatedAt: new Date().toISOString(),
    note: 'Short-range projection from current growth, AOV and repeat mix. Independent of the (not-yet-measurable) long-run ceiling.',
    defaults: {
      ...baselines,
      scenarios: SCENARIO_DEFAULTS,
    },
    scenarios,
    summary,
    chartSeries,
  };
}

// Week-1 closed form for tests
export function weekOneRevenue(baselines, scenarioParams = SCENARIO_DEFAULTS.base) {
  const pts = runScenarioWalk(baselines, scenarioParams, 1);
  return pts[0]?.revenue ?? 0;
}
