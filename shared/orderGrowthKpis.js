const SG_TZ = 'Asia/Singapore';
const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function parseOrderDate(iso) {
  return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
}

function dateKeySg(iso) {
  return parseOrderDate(iso).toLocaleDateString('en-CA', { timeZone: SG_TZ });
}

function weekdaySgFromKey(dateKey) {
  const wd = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-SG', {
    timeZone: SG_TZ,
    weekday: 'short',
  });
  return WEEKDAY_ORDER.includes(wd) ? wd : null;
}

function dayLabelSg(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-SG', {
    timeZone: SG_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function weekLabelSg(weekStart) {
  return new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('en-SG', {
    timeZone: SG_TZ,
    day: 'numeric',
    month: 'short',
  });
}

function addDayKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

function todayKeySg() {
  return new Date().toLocaleDateString('en-CA', { timeZone: SG_TZ });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pctDelta(current, prior) {
  if (prior === 0) return current > 0 ? 100 : current === 0 ? 0 : null;
  return round2(((current - prior) / prior) * 100);
}

function makeDelta(current, prior, basis) {
  return {
    current: round2(current),
    prior: round2(prior),
    delta: round2(current - prior),
    deltaPct: pctDelta(current, prior),
    basis,
  };
}

function aov(revenue, orders) {
  if (!orders || revenue <= 0) return null;
  return round2(revenue / orders);
}

function weekStartFromDateKey(dateKey) {
  const wd = weekdaySgFromKey(dateKey);
  if (!wd) return dateKey;
  const idx = WEEKDAY_ORDER.indexOf(wd);
  return addDayKey(dateKey, -idx);
}

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : round2((sorted[mid - 1] + sorted[mid]) / 2);
}

function buildDailyRows(orders) {
  const byDay = new Map();
  const firstOrderDate = new Map();

  const sorted = [...orders].sort((a, b) => a.ordered_at.localeCompare(b.ordered_at));
  for (const o of sorted) {
    if (!firstOrderDate.has(o.contact_id)) {
      firstOrderDate.set(o.contact_id, dateKeySg(o.ordered_at));
    }
  }

  for (const o of orders) {
    const key = dateKeySg(o.ordered_at);
    if (!byDay.has(key)) {
      byDay.set(key, { date: key, orders: 0, revenue: 0, newCustomers: 0, repeatOrders: 0 });
    }
    const row = byDay.get(key);
    row.orders += 1;
    if (o.order_value != null && o.order_value > 0) row.revenue += o.order_value;
    if (firstOrderDate.get(o.contact_id) === key) row.newCustomers += 1;
    else row.repeatOrders += 1;
  }

  if (byDay.size === 0) return [];

  const keys = [...byDay.keys()].sort();
  const rows = [];
  for (let cur = keys[0]; cur <= keys[keys.length - 1]; cur = addDayKey(cur, 1)) {
    const r = byDay.get(cur) || { orders: 0, revenue: 0, newCustomers: 0, repeatOrders: 0 };
    const wd = weekdaySgFromKey(cur);
    rows.push({
      date: cur,
      weekday: wd || '—',
      dayLabel: dayLabelSg(cur),
      orders: r.orders,
      revenue: round2(r.revenue),
      aov: aov(r.revenue, r.orders),
      newCustomers: r.newCustomers,
      repeatOrders: r.repeatOrders,
      isWeekend: wd === 'Sat' || wd === 'Sun',
    });
  }
  return rows;
}

function buildWeekdaySeries(dailyRows) {
  const byWd = new Map(WEEKDAY_ORDER.map((d) => [d, []]));
  for (const row of dailyRows) {
    if (!row.weekday || row.weekday === '—') continue;
    byWd.get(row.weekday).push(row);
  }

  return WEEKDAY_ORDER.map((weekday) => {
    const raw = byWd.get(weekday) || [];
    const occurrences = raw.map((row, i) => {
      const prior = i > 0 ? raw[i - 1] : null;
      const prev4 = raw.slice(Math.max(0, i - 4), i);
      const avg4Orders =
        prev4.length > 0 ? round2(prev4.reduce((s, r) => s + r.orders, 0) / prev4.length) : null;
      const avg4Revenue =
        prev4.length > 0 ? round2(prev4.reduce((s, r) => s + r.revenue, 0) / prev4.length) : null;

      const priorLabel = prior ? dayLabelSg(prior.date) : null;
      return {
        date: row.date,
        weekday,
        dayLabel: row.dayLabel,
        orders: row.orders,
        revenue: row.revenue,
        aov: row.aov,
        newCustomers: row.newCustomers,
        wowOrders: prior
          ? makeDelta(
              row.orders,
              prior.orders,
              `vs ${priorLabel} (previous ${weekday})`,
            )
          : null,
        wowRevenue: prior
          ? makeDelta(
              row.revenue,
              prior.revenue,
              `vs ${priorLabel} (previous ${weekday})`,
            )
          : null,
        vs4WeekAvgOrders: avg4Orders,
        vs4WeekAvgRevenue: avg4Revenue,
        vs4WeekAvgOrdersDeltaPct:
          avg4Orders != null ? pctDelta(row.orders, avg4Orders) : null,
        vs4WeekAvgRevenueDeltaPct:
          avg4Revenue != null ? pctDelta(row.revenue, avg4Revenue) : null,
      };
    });
    return { weekday, occurrences };
  });
}

function sumWindow(rows, startIdx, len) {
  const slice = rows.slice(startIdx, startIdx + len);
  const orders = slice.reduce((s, r) => s + r.orders, 0);
  const revenue = round2(slice.reduce((s, r) => s + r.revenue, 0));
  const newCustomers = slice.reduce((s, r) => s + r.newCustomers, 0);
  return { orders, revenue, newCustomers, aov: aov(revenue, orders) };
}

function buildMomentum(dailyRows) {
  const emptyDelta = (basis) => makeDelta(0, 0, basis);
  if (dailyRows.length === 0) {
    const today = todayKeySg();
    const wd = weekdaySgFromKey(today) || 'Mon';
    return {
      rolling7d: {
        windowEnd: today,
        windowStart: today,
        priorWindowEnd: today,
        priorWindowStart: today,
        orders: emptyDelta('rolling 7d vs prior 7d'),
        revenue: emptyDelta('rolling 7d vs prior 7d'),
        aov: emptyDelta('rolling 7d vs prior 7d'),
        newCustomers: emptyDelta('rolling 7d vs prior 7d'),
      },
      todayWeekday: {
        weekday: wd,
        date: today,
        orders: emptyDelta(`vs last ${wd}`),
        revenue: emptyDelta(`vs last ${wd}`),
        aov: null,
        newCustomers: emptyDelta(`vs last ${wd}`),
        vs4WeekAvg: {
          orders: { value: 0, avg: 0, deltaPct: null, basis: `${wd} 4-week avg` },
          revenue: { value: 0, avg: 0, deltaPct: null, basis: `${wd} 4-week avg` },
        },
      },
    };
  }

  const endIdx = dailyRows.length;
  const cur = sumWindow(dailyRows, Math.max(0, endIdx - 7), 7);
  const prior = sumWindow(dailyRows, Math.max(0, endIdx - 14), 7);
  const windowEnd = dailyRows[dailyRows.length - 1].date;
  const windowStart = dailyRows[Math.max(0, dailyRows.length - 7)].date;
  const priorWindowEnd = addDayKey(windowStart, -1);
  const priorWindowStart = dailyRows[Math.max(0, dailyRows.length - 14)].date;

  const today = todayKeySg();
  const todayWd = weekdaySgFromKey(today) || 'Mon';
  const todayRow = dailyRows.find((r) => r.date === today) || {
    date: today,
    orders: 0,
    revenue: 0,
    newCustomers: 0,
    aov: null,
  };
  const lastWeekDate = addDayKey(today, -7);
  const lastWeekRow = dailyRows.find((r) => r.date === lastWeekDate) || {
    orders: 0,
    revenue: 0,
    newCustomers: 0,
    aov: null,
  };
  const lastWeekLabel = dayLabelSg(lastWeekDate);

  const wdSeries = buildWeekdaySeries(dailyRows).find((s) => s.weekday === todayWd);
  const wdOcc = wdSeries?.occurrences || [];
  const prev4SameWd = wdOcc.filter((o) => o.date < today).slice(-4);
  const avg4Orders =
    prev4SameWd.length > 0
      ? round2(prev4SameWd.reduce((s, o) => s + o.orders, 0) / prev4SameWd.length)
      : null;
  const avg4Revenue =
    prev4SameWd.length > 0
      ? round2(prev4SameWd.reduce((s, o) => s + o.revenue, 0) / prev4SameWd.length)
      : null;

  return {
    rolling7d: {
      windowEnd,
      windowStart,
      priorWindowEnd,
      priorWindowStart,
      orders: makeDelta(cur.orders, prior.orders, 'rolling 7d vs prior 7d'),
      revenue: makeDelta(cur.revenue, prior.revenue, 'rolling 7d vs prior 7d'),
      aov: makeDelta(cur.aov ?? 0, prior.aov ?? 0, 'rolling 7d AOV vs prior 7d'),
      newCustomers: makeDelta(
        cur.newCustomers,
        prior.newCustomers,
        'rolling 7d new customers vs prior 7d',
      ),
    },
    todayWeekday: {
      weekday: todayWd,
      date: today,
      orders: makeDelta(todayRow.orders, lastWeekRow.orders, `vs ${lastWeekLabel} (last ${todayWd})`),
      revenue: makeDelta(
        todayRow.revenue,
        lastWeekRow.revenue,
        `vs ${lastWeekLabel} (last ${todayWd})`,
      ),
      aov:
        todayRow.orders > 0 || lastWeekRow.orders > 0
          ? makeDelta(
              todayRow.aov ?? 0,
              lastWeekRow.aov ?? 0,
              `AOV vs ${lastWeekLabel} (last ${todayWd})`,
            )
          : null,
      newCustomers: makeDelta(
        todayRow.newCustomers,
        lastWeekRow.newCustomers,
        `vs ${lastWeekLabel} (last ${todayWd})`,
      ),
      vs4WeekAvg: {
        orders: {
          value: todayRow.orders,
          avg: avg4Orders ?? 0,
          deltaPct: avg4Orders != null ? pctDelta(todayRow.orders, avg4Orders) : null,
          basis: `this ${todayWd} vs trailing 4-${todayWd} average`,
        },
        revenue: {
          value: todayRow.revenue,
          avg: avg4Revenue ?? 0,
          deltaPct: avg4Revenue != null ? pctDelta(todayRow.revenue, avg4Revenue) : null,
          basis: `this ${todayWd} vs trailing 4-${todayWd} average`,
        },
      },
    },
  };
}

function buildCustomerKpis(dailyRows) {
  const newCustomersByDay = dailyRows
    .filter((r) => r.newCustomers > 0)
    .map((r) => ({ date: r.date, dayLabel: r.dayLabel, count: r.newCustomers }));

  const byWeek = new Map();
  for (const row of dailyRows) {
    const ws = weekStartFromDateKey(row.date);
    if (!byWeek.has(ws)) {
      byWeek.set(ws, { weekStart: ws, newCustomers: 0, newOrders: 0, repeatOrders: 0 });
    }
    const w = byWeek.get(ws);
    w.newCustomers += row.newCustomers;
    w.newOrders += row.newCustomers;
    w.repeatOrders += row.repeatOrders;
  }

  const weekKeys = [...byWeek.keys()].sort();
  const newCustomersByWeek = weekKeys.map((ws) => ({
    weekStart: ws,
    weekLabel: `w/c ${weekLabelSg(ws)}`,
    count: byWeek.get(ws).newCustomers,
  }));

  let cumulative = 0;
  const cumulativeCustomers = dailyRows.map((r) => {
    cumulative += r.newCustomers;
    return { date: r.date, total: cumulative };
  });

  const weeklyNewVsReturning = weekKeys.map((ws) => {
    const w = byWeek.get(ws);
    const total = w.newOrders + w.repeatOrders;
    return {
      weekStart: ws,
      weekLabel: `w/c ${weekLabelSg(ws)}`,
      newOrders: w.newOrders,
      repeatOrders: w.repeatOrders,
      newPct: total ? round2((w.newOrders / total) * 100) : 0,
    };
  });

  return {
    newCustomersByDay,
    newCustomersByWeek,
    cumulativeCustomers,
    weeklyAcquisitionRate: newCustomersByWeek,
    weeklyNewVsReturning,
  };
}

function buildRetentionKpis(orders, dailyRows) {
  const byContact = new Map();
  for (const o of orders) {
    if (!byContact.has(o.contact_id)) byContact.set(o.contact_id, []);
    byContact.get(o.contact_id).push(o);
  }
  for (const rows of byContact.values()) {
    rows.sort((a, b) => a.ordered_at.localeCompare(b.ordered_at));
  }

  const byWeek = new Map();
  for (const row of dailyRows) {
    const ws = weekStartFromDateKey(row.date);
    if (!byWeek.has(ws)) {
      byWeek.set(ws, {
        orders: [],
        repeatOrders: 0,
        totalOrders: 0,
        repeatRevenue: 0,
        totalRevenue: 0,
        repeatContactIds: new Set(),
      });
    }
  }

  for (const o of orders) {
    const ws = weekStartFromDateKey(dateKeySg(o.ordered_at));
    if (!byWeek.has(ws)) continue;
    const w = byWeek.get(ws);
    w.totalOrders += 1;
    if (o.order_value != null && o.order_value > 0) w.totalRevenue += o.order_value;
    if (!o.is_first_order) {
      w.repeatOrders += 1;
      w.repeatContactIds.add(o.contact_id);
      if (o.order_value != null && o.order_value > 0) w.repeatRevenue += o.order_value;
    }
  }

  const weekKeys = [...byWeek.keys()].sort();

  const weeklyRepeatCustomers = weekKeys.map((ws) => ({
    weekStart: ws,
    weekLabel: `w/c ${weekLabelSg(ws)}`,
    count: byWeek.get(ws).repeatContactIds.size,
  }));

  const repeatRateTrend = weekKeys.map((ws) => {
    const w = byWeek.get(ws);
    return {
      weekStart: ws,
      weekLabel: `w/c ${weekLabelSg(ws)}`,
      repeatRate: w.totalOrders ? round2((w.repeatOrders / w.totalOrders) * 100) : 0,
      repeatOrders: w.repeatOrders,
      totalOrders: w.totalOrders,
    };
  });

  const repeatRevenueShareTrend = weekKeys.map((ws) => {
    const w = byWeek.get(ws);
    const totalRev = round2(w.totalRevenue);
    const repRev = round2(w.repeatRevenue);
    return {
      weekStart: ws,
      weekLabel: `w/c ${weekLabelSg(ws)}`,
      repeatRevenue: repRev,
      totalRevenue: totalRev,
      sharePct: totalRev ? round2((repRev / totalRev) * 100) : 0,
    };
  });

  const cohortByWeek = new Map();
  for (const [contactId, rows] of byContact) {
    const first = rows[0];
    const ws = weekStartFromDateKey(dateKeySg(first.ordered_at));
    if (!cohortByWeek.has(ws)) cohortByWeek.set(ws, []);
    cohortByWeek.get(ws).push({ contactId, firstAt: first.ordered_at, rows });
  }

  const cohortReorder = [...cohortByWeek.keys()].sort().map((ws) => {
    const cohort = cohortByWeek.get(ws);
    let r14 = 0;
    let r30 = 0;
    for (const c of cohort) {
      const firstMs = parseOrderDate(c.firstAt).getTime();
      const reorder = c.rows.slice(1).some((o) => {
        const days = (parseOrderDate(o.ordered_at).getTime() - firstMs) / 86_400_000;
        return days <= 30;
      });
      const reorder14 = c.rows.slice(1).some((o) => {
        const days = (parseOrderDate(o.ordered_at).getTime() - firstMs) / 86_400_000;
        return days <= 14;
      });
      if (reorder14) r14 += 1;
      if (reorder) r30 += 1;
    }
    const size = cohort.length;
    return {
      weekStart: ws,
      weekLabel: `w/c ${weekLabelSg(ws)}`,
      cohortSize: size,
      reorder14dPct: size ? round2((r14 / size) * 100) : 0,
      reorder30dPct: size ? round2((r30 / size) * 100) : 0,
    };
  });

  const secondOrderGapsByWeek = new Map();
  for (const rows of byContact.values()) {
    if (rows.length < 2) continue;
    const second = rows[1];
    const ws = weekStartFromDateKey(dateKeySg(second.ordered_at));
    const gap =
      (parseOrderDate(second.ordered_at).getTime() - parseOrderDate(rows[0].ordered_at).getTime()) /
      86_400_000;
    if (!secondOrderGapsByWeek.has(ws)) secondOrderGapsByWeek.set(ws, []);
    secondOrderGapsByWeek.get(ws).push(gap);
  }

  const medianDaysToSecondOrderTrend = weekKeys
    .filter((ws) => secondOrderGapsByWeek.has(ws))
    .map((ws) => ({
      weekStart: ws,
      weekLabel: `w/c ${weekLabelSg(ws)}`,
      medianDays: median(secondOrderGapsByWeek.get(ws)),
      sampleSize: secondOrderGapsByWeek.get(ws).length,
    }));

  const customersActiveByWeek = new Map();
  for (const o of orders) {
    const ws = weekStartFromDateKey(dateKeySg(o.ordered_at));
    if (!customersActiveByWeek.has(ws)) customersActiveByWeek.set(ws, new Set());
    customersActiveByWeek.get(ws).add(o.contact_id);
  }

  const avgOrdersPerCustomerTrend = weekKeys.map((ws) => {
    const w = byWeek.get(ws);
    const customers = customersActiveByWeek.get(ws)?.size || 0;
    return {
      weekStart: ws,
      weekLabel: `w/c ${weekLabelSg(ws)}`,
      avg: customers ? round2(w.totalOrders / customers) : 0,
      customers,
    };
  });

  return {
    weeklyRepeatCustomers,
    repeatRateTrend,
    repeatRevenueShareTrend,
    cohortReorder,
    medianDaysToSecondOrderTrend,
    avgOrdersPerCustomerTrend,
  };
}

function buildEconomicsKpis(orders) {
  const byWd = new Map(WEEKDAY_ORDER.map((d) => [d, { orders: 0, revenue: 0 }]));
  let weekendOrders = 0;
  let weekendRevenue = 0;
  let weekdayOrders = 0;
  let weekdayRevenue = 0;

  for (const o of orders) {
    const wd = weekdaySgFromKey(dateKeySg(o.ordered_at));
    if (!wd) continue;
    const val = o.order_value != null && o.order_value > 0 ? o.order_value : 0;
    const bucket = byWd.get(wd);
    bucket.orders += 1;
    bucket.revenue += val;
    if (wd === 'Sat' || wd === 'Sun') {
      weekendOrders += 1;
      weekendRevenue += val;
    } else {
      weekdayOrders += 1;
      weekdayRevenue += val;
    }
  }

  const totalOrders = orders.length;
  const totalRevenue = round2(weekendRevenue + weekdayRevenue);

  return {
    aovByWeekday: WEEKDAY_ORDER.map((weekday) => {
      const b = byWd.get(weekday);
      const rev = round2(b.revenue);
      return {
        weekday,
        aov: aov(rev, b.orders),
        orders: b.orders,
        revenue: rev,
        isWeekend: weekday === 'Sat' || weekday === 'Sun',
      };
    }),
    weekendVsWeekday: {
      weekend: {
        orders: weekendOrders,
        revenue: round2(weekendRevenue),
        orderSharePct: totalOrders ? round2((weekendOrders / totalOrders) * 100) : 0,
        revenueSharePct: totalRevenue ? round2((weekendRevenue / totalRevenue) * 100) : 0,
      },
      weekday: {
        orders: weekdayOrders,
        revenue: round2(weekdayRevenue),
        orderSharePct: totalOrders ? round2((weekdayOrders / totalOrders) * 100) : 0,
        revenueSharePct: totalRevenue ? round2((weekdayRevenue / totalRevenue) * 100) : 0,
      },
    },
  };
}

export function computeOrderGrowthKpis(orders) {
  const dailyRows = buildDailyRows(orders);
  const weekdaySeries = buildWeekdaySeries(dailyRows);

  return {
    momentum: buildMomentum(dailyRows),
    weekdaySeries,
    weekdayTrendChart: {
      series: weekdaySeries.map((s) => ({
        weekday: s.weekday,
        points: s.occurrences.map((o) => ({
          date: o.date,
          weekLabel: o.dayLabel,
          orders: o.orders,
          revenue: o.revenue,
        })),
      })),
    },
    customers: buildCustomerKpis(dailyRows),
    retention: buildRetentionKpis(orders, dailyRows),
    economics: buildEconomicsKpis(orders),
  };
}
