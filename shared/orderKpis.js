import { computeOrderGrowthKpis } from './orderGrowthKpis.js';
import { buildRepeatWeeklyCumulative } from './orderKpiCustomers.js';
import { buildRetentionKpisExtended } from './orderKpiRetention.js';
import { buildFrequencyKpis } from './orderKpiFrequency.js';
import { buildForecastKpis } from './orderKpiForecast.js';
import { fitSaturationCurve, assessSaturationConfidence } from './saturationFit.js';
import {
  todayKeySg,
  buildContactOrderMap,
  isWeekCompleted,
  weekStartFromDateKey,
} from './orderKpiUtils.js';

export function computeOrderKpis(orders) {
  const growth = computeOrderGrowthKpis(orders);
  const byContact = buildContactOrderMap(orders);
  const today = todayKeySg();
  const customers = buildCustomersBlock(growth, today);
  const retention = buildRetentionKpisExtended(orders);
  const frequency = buildFrequencyKpis(orders);

  const repeatWeeklyCumulative = buildRepeatWeeklyCumulative(orders, byContact);
  const customerFit = fitSaturationCurve(customers.weeklyCumulativeForFit);
  const repeatFit = fitSaturationCurve(repeatWeeklyCumulative);

  const satConfidence = assessSaturationConfidence({
    completedWeekCount: customers.completedWeekCount,
    consecutiveDecliningWeeks: customers.deceleration.consecutiveDecliningWeeks,
    logisticL: customerFit.logistic?.L ?? null,
    expL: customerFit.boundedExp?.L ?? null,
  });

  const saturation = {
    confidence: satConfidence.confidence,
    confidenceReasons: satConfidence.confidenceReasons,
    weeksNeededForReliable: satConfidence.weeksNeededForReliable,
    modelAgreementPct: satConfidence.modelAgreementPct,
    customers: customerFit,
    repeatCustomers: repeatFit,
  };

  const forecast = buildForecastKpis({
    saturation,
    frequency,
    customers,
    confidence: satConfidence.confidence,
    weeksNeeded: satConfidence.weeksNeededForReliable,
  });

  const partialWeek = customers.partialWeek;
  const latestFullWeekRepeat = [...retention.repeatRateTrend]
    .reverse()
    .find((w) => !partialWeek || w.weekStart !== partialWeek.weekStart);

  const hero = {
    rolling7dRevenue: growth.momentum.rolling7d.revenue,
    repeatRateLatestFullWeek: latestFullWeekRepeat
      ? {
          value: latestFullWeekRepeat.repeatRate,
          health: latestFullWeekRepeat.health,
          weekLabel: latestFullWeekRepeat.weekLabel,
        }
      : { value: 0, health: 'red', weekLabel: '—' },
    reorderP30: retention.reorderProbability.days30,
    activeN30: frequency.activeN.days30,
    activeN60: frequency.activeN.days60,
    ceiling: {
      confidence: satConfidence.confidence,
      L:
        satConfidence.confidence !== 'pre-inflection' ? forecast.consensusCeiling?.L ?? null : null,
      message:
        satConfidence.confidence === 'pre-inflection'
          ? `Not yet reliable — needs ${satConfidence.weeksNeededForReliable ?? 4} more full week(s)`
          : forecast.consensusCeiling
            ? `Consensus ceiling ≈ ${forecast.consensusCeiling.L} customers`
            : 'Insufficient data for ceiling',
      weeksNeeded: satConfidence.weeksNeededForReliable,
    },
  };

  return {
    generatedAt: new Date().toISOString(),
    meta: {
      today,
      timezone: 'Asia/Singapore',
      completedWeekCount: customers.completedWeekCount,
      partialWeek,
      medianTenureWeeks: frequency.medianTenureWeeks,
    },
    hero,
    momentum: {
      rolling7d: growth.momentum.rolling7d,
      todayWeekday: growth.momentum.todayWeekday,
      weekdaySeries: growth.weekdaySeries,
      weekdayTrendChart: growth.weekdayTrendChart,
    },
    customers: {
      newCustomersByDay: customers.newCustomersByDay,
      newCustomersByWeek: customers.newCustomersByWeek,
      cumulativeCustomers: customers.cumulativeCustomers,
      weeklyAcquisition: customers.weeklyAcquisition,
      deceleration: customers.deceleration,
      weeklyNewVsReturning: customers.weeklyNewVsReturning,
    },
    retention,
    frequency,
    saturation,
    forecast,
  };
}

function buildCustomersBlock(growth, today) {
  const partialWeekStart = weekStartFromDateKey(today);
  const partialWeek = isWeekCompleted(partialWeekStart, today)
    ? null
    : {
        weekStart: partialWeekStart,
        weekLabel:
          growth.customers.newCustomersByWeek.find((w) => w.weekStart === partialWeekStart)
            ?.weekLabel ?? 'partial week',
      };

  const newCustomersByWeek = growth.customers.newCustomersByWeek.map((w) => ({
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
      ratio: prior > 0 ? Math.round((cur / prior) * 100) / 100 : cur > 0 ? 999 : 0,
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

  let cumulative = 0;
  const weeklyCumulativeForFit = completedWeeks.map((w) => {
    cumulative += w.count;
    return { weekStart: w.weekStart, weekLabel: w.weekLabel, adds: w.count, cumulative };
  });

  return {
    newCustomersByDay: growth.customers.newCustomersByDay,
    newCustomersByWeek,
    cumulativeCustomers: growth.customers.cumulativeCustomers,
    weeklyAcquisition,
    deceleration: {
      status,
      ratioLatestFullWeek: latestRatio?.ratio ?? null,
      consecutiveDecliningWeeks,
      basis: latestRatio
        ? `${latestRatio.weekLabel}: ${latestRatio.current} ÷ ${latestRatio.prior} = ${latestRatio.ratio}× (completed weeks only)`
        : 'need at least 2 completed weeks',
      weeklyRatios: ratios,
    },
    weeklyNewVsReturning: growth.customers.weeklyNewVsReturning.map((w) => ({
      ...w,
      isPartial: w.weekStart === partialWeekStart && !isWeekCompleted(w.weekStart, today),
    })),
    partialWeek,
    completedWeekCount: completedWeeks.length,
    weeklyCumulativeForFit,
  };
}
