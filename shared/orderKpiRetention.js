import {
  parseOrderDate,
  dateKeySg,
  weekStartFromDateKey,
  weekLabelSg,
  round2,
  median,
  mean,
  buildContactOrderMap,
  repeatRateHealth,
  reorderHealth,
  todayKeySg,
} from './orderKpiUtils.js';

export function buildRetentionKpisExtended(orders) {
  const byContact = buildContactOrderMap(orders);
  const today = todayKeySg();
  const todayMs = parseOrderDate(`${today}T12:00:00Z`).getTime();

  const byWeek = new Map();
  for (const o of orders) {
    const ws = weekStartFromDateKey(dateKeySg(o.ordered_at));
    if (!byWeek.has(ws)) {
      byWeek.set(ws, {
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

  const weeklyRepeatCustomers = [];
  const secondOrderByWeek = new Map();
  for (const rows of byContact.values()) {
    if (rows.length < 2) continue;
    const second = rows[1];
    const ws = weekStartFromDateKey(dateKeySg(second.ordered_at));
    secondOrderByWeek.set(ws, (secondOrderByWeek.get(ws) || 0) + 1);
  }
  for (const ws of [...secondOrderByWeek.keys()].sort()) {
    weeklyRepeatCustomers.push({
      weekStart: ws,
      weekLabel: `w/c ${weekLabelSg(ws)}`,
      count: secondOrderByWeek.get(ws),
      basis: 'customers reaching 2nd order this week (by 2nd-order date)',
    });
  }

  const repeatRateTrend = weekKeys.map((ws) => {
    const w = byWeek.get(ws);
    const rate = w.totalOrders ? round2((w.repeatOrders / w.totalOrders) * 100) : 0;
    return {
      weekStart: ws,
      weekLabel: `w/c ${weekLabelSg(ws)}`,
      repeatRate: rate,
      repeatOrders: w.repeatOrders,
      totalOrders: w.totalOrders,
      health: repeatRateHealth(rate),
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
      basis: 'repeat revenue ÷ total revenue (orders after first)',
    };
  });

  const reorderProbability = {
    days14: computeCensoredReorder(byContact, 14, todayMs),
    days30: computeCensoredReorder(byContact, 30, todayMs),
    days60: computeCensoredReorder(byContact, 60, todayMs),
  };

  const gaps = [];
  for (const rows of byContact.values()) {
    for (let i = 1; i < rows.length; i++) {
      const days =
        (parseOrderDate(rows[i].ordered_at).getTime() - parseOrderDate(rows[i - 1].ordered_at).getTime()) /
        86_400_000;
      gaps.push(days);
    }
  }

  const ipi = {
    medianDays: median(gaps),
    meanDays: mean(gaps),
    sampleSize: gaps.length,
    basis: 'median/mean days between consecutive orders (all customers)',
  };

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
    reorderProbability,
    ipi,
    avgOrdersPerCustomerTrend,
  };
}

export function computeCensoredReorder(byContact, tDays, todayMs) {
  let numerator = 0;
  let denominator = 0;
  for (const rows of byContact.values()) {
    const firstMs = parseOrderDate(rows[0].ordered_at).getTime();
    const ageDays = (todayMs - firstMs) / 86_400_000;
    if (ageDays < tDays) continue;
    denominator++;
    const reordered = rows.slice(1).some((o) => {
      const days = (parseOrderDate(o.ordered_at).getTime() - firstMs) / 86_400_000;
      return days <= tDays;
    });
    if (reordered) numerator++;
  }
  const rate = denominator ? round2((numerator / denominator) * 100) : 0;
  return {
    rate,
    numerator,
    denominator,
    health: reorderHealth(rate),
    basis: `${numerator} of ${denominator} customers whose first order was ≥${tDays}d ago reordered within ${tDays}d`,
  };
}
