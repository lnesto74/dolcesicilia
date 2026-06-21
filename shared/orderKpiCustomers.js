import {
  todayKeySg,
  weekStartFromDateKey,
  weekLabelSg,
  isWeekCompleted,
  round2,
  dateKeySg,
} from './orderKpiUtils.js';

export function buildCustomerKpisExtended(dailyRows, growthCustomers) {
  const today = todayKeySg();
  const partialWeekStart = weekStartFromDateKey(today);
  const partialWeek = isWeekCompleted(partialWeekStart, today)
    ? null
    : { weekStart: partialWeekStart, weekLabel: `w/c ${weekLabelSg(partialWeekStart)}` };

  const newCustomersByWeek = growthCustomers.newCustomersByWeek.map((w) => ({
    ...w,
    isPartial: w.weekStart === partialWeekStart && !isWeekCompleted(w.weekStart, today),
  }));

  const weeklyAcquisition = newCustomersByWeek.map((w) => ({
    weekStart: w.weekStart,
    weekLabel: w.weekLabel,
    count: w.count,
    isPartial: w.isPartial,
  }));

  const completedWeeks = newCustomersByWeek.filter((w) => !w.isPartial);
  const ratios = [];
  for (let i = 1; i < completedWeeks.length; i++) {
    const cur = completedWeeks[i].count;
    const prior = completedWeeks[i - 1].count;
    ratios.push({
      weekStart: completedWeeks[i].weekStart,
      weekLabel: completedWeeks[i].weekLabel,
      ratio: prior > 0 ? round2(cur / prior) : cur > 0 ? 999 : 0,
      current: cur,
      prior,
    });
  }

  let consecutiveDecliningWeeks = 0;
  for (let i = ratios.length - 1; i >= 0; i--) {
    if (ratios[i].ratio < 1.0) consecutiveDecliningWeeks++;
    else break;
  }

  const latestRatio = ratios.at(-1) ?? null;
  let status = 'insufficient_data';
  if (completedWeeks.length >= 2) {
    if (consecutiveDecliningWeeks >= 3) status = 'decelerating';
    else if (latestRatio && latestRatio.ratio > 1.05) status = 'accelerating';
    else status = 'stable';
  }

  const deceleration = {
    status,
    ratioLatestFullWeek: latestRatio?.ratio ?? null,
    consecutiveDecliningWeeks,
    basis: latestRatio
      ? `${latestRatio.weekLabel}: ${latestRatio.current} ÷ ${latestRatio.prior} = ${latestRatio.ratio}× (completed weeks only)`
      : 'need at least 2 completed weeks',
    weeklyRatios: ratios,
  };

  return {
    newCustomersByDay: growthCustomers.newCustomersByDay,
    newCustomersByWeek,
    cumulativeCustomers: growthCustomers.cumulativeCustomers,
    weeklyAcquisition,
    deceleration,
    weeklyNewVsReturning: growthCustomers.weeklyNewVsReturning.map((w) => ({
      ...w,
      isPartial: w.weekStart === partialWeekStart && !isWeekCompleted(w.weekStart, today),
    })),
    partialWeek,
    completedWeekCount: completedWeeks.length,
    weeklyCumulativeForFit: buildWeeklyCumulative(completedWeeks),
  };
}

function buildWeeklyCumulative(completedWeeks) {
  let cumulative = 0;
  return completedWeeks.map((w) => {
    cumulative += w.count;
    return {
      weekStart: w.weekStart,
      weekLabel: w.weekLabel,
      adds: w.count,
      cumulative,
    };
  });
}

export function buildRepeatWeeklyCumulative(orders, byContact) {
  const repeatByWeek = new Map();
  for (const rows of byContact.values()) {
    if (rows.length < 2) continue;
    const second = rows[1];
    const ws = weekStartFromDateKey(dateKeySg(second.ordered_at));
    repeatByWeek.set(ws, (repeatByWeek.get(ws) || 0) + 1);
  }
  const keys = [...repeatByWeek.keys()].sort();
  let cumulative = 0;
  return keys.map((ws) => {
    cumulative += repeatByWeek.get(ws);
    return {
      weekStart: ws,
      weekLabel: `w/c ${weekLabelSg(ws)}`,
      adds: repeatByWeek.get(ws),
      cumulative,
    };
  });
}
