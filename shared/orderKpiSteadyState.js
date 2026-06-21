import { parseOrderDate, round2 } from './orderKpiUtils.js';

const MS_PER_DAY = 86_400_000;
const MIN_STEADY_TENURE_DAYS = 28;
const MIN_STEADY_COHORT_SIZE = 5;

/** Assess whether tenure-restricted steady-state f is measurable. */
export function assessSteadyStateF(byContact, todayMs) {
  let steadyOrders = 0;
  let steadyTenureMonths = 0;
  let steadyCustomerCount = 0;
  let oldestFirstMs = todayMs;

  for (const rows of byContact.values()) {
    const firstMs = parseOrderDate(rows[0].ordered_at).getTime();
    if (firstMs < oldestFirstMs) oldestFirstMs = firstMs;
    const tenureDays = (todayMs - firstMs) / MS_PER_DAY;
    if (tenureDays >= MIN_STEADY_TENURE_DAYS) {
      steadyCustomerCount += 1;
      const tenureMonths = Math.max(tenureDays / 30, 1 / 30);
      steadyOrders += rows.length;
      steadyTenureMonths += tenureMonths;
    }
  }

  const oldestTenureDays = (todayMs - oldestFirstMs) / MS_PER_DAY;
  const daysUntilCohort = Math.max(0, MIN_STEADY_TENURE_DAYS - oldestTenureDays);
  const weeksUntilMeasurable = Math.ceil(daysUntilCohort / 7);

  const cohortLargeEnough = steadyCustomerCount >= MIN_STEADY_COHORT_SIZE;
  const available = cohortLargeEnough && steadyTenureMonths > 0;
  const value = available ? round2(steadyOrders / steadyTenureMonths) : null;

  let message = null;
  if (!available) {
    if (steadyCustomerCount === 0) {
      message = `Steady-state f not measurable yet — needs ~4-week-old cohort (${weeksUntilMeasurable} more week${weeksUntilMeasurable !== 1 ? 's' : ''}).`;
    } else {
      message = `Steady-state f not measurable yet — only ${steadyCustomerCount} customer${steadyCustomerCount !== 1 ? 's' : ''} with ≥4-week tenure (need ${MIN_STEADY_COHORT_SIZE}).`;
    }
  }

  return {
    available,
    value,
    weekly: value != null ? round2(value / 4.33) : null,
    sampleSize: steadyCustomerCount,
    weeksUntilMeasurable,
    message,
    basis: 'orders ÷ Σ tenure months (customers with ≥4 weeks tenure, n≥5)',
  };
}

/**
 * Weakest-input confidence for a steady-state revenue scenario.
 * @param {'reliable'|'low'|'pre-inflection'} saturationConfidence
 */
export function deriveSteadyScenarioConfidence(steadyState, saturationConfidence, usesBlendedF = false) {
  if (!steadyState.available || usesBlendedF) {
    return usesBlendedF ? 'provisional' : 'unavailable';
  }
  if (saturationConfidence === 'pre-inflection' || saturationConfidence === 'low') {
    return 'provisional';
  }
  return 'reliable';
}
