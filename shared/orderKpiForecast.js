import { round2 } from './orderKpiUtils.js';
import { deriveSteadyScenarioConfidence } from './orderKpiSteadyState.js';

function buildSteadyScenario({ nStar, label, frequency, aov, saturationConfidence }) {
  const steady = frequency.fSteadyState;
  if (!steady.available || steady.value == null) {
    return {
      nStar,
      label,
      f: null,
      revMonthly: null,
      available: false,
      message: steady.message,
      weeksUntilMeasurable: steady.weeksUntilMeasurable,
      confidence: 'unavailable',
    };
  }
  const confidence = deriveSteadyScenarioConfidence(steady, saturationConfidence, false);
  return {
    nStar,
    label,
    f: steady.value,
    revMonthly: round2(nStar * steady.value * aov),
    available: true,
    confidence,
  };
}

function buildProvisionalScenario({ nStar, label, frequency, aov }) {
  return {
    nStar,
    label,
    f: frequency.fBlended.value,
    revMonthly: round2(nStar * frequency.fBlended.value * aov),
    available: true,
    confidence: 'provisional',
    message: 'provisional — based on early/blended frequency, not steady state',
  };
}

export function buildForecastKpis({
  saturation,
  frequency,
  customers,
  confidence,
  weeksNeeded,
}) {
  const aov = frequency.identity.aov;
  const steady = frequency.fSteadyState;
  const fMaxWeekly = frequency.fMax.weekly;

  const logisticL = saturation.customers.logistic?.L ?? null;
  const expL = saturation.customers.boundedExp?.L ?? null;
  const consensusL =
    confidence === 'reliable' || confidence === 'low'
      ? logisticL != null && expL != null
        ? round2((logisticL + expL) / 2)
        : logisticL ?? expL
      : null;

  const scenarios = [];

  if (consensusL != null) {
    scenarios.push(
      buildSteadyScenario({
        nStar: consensusL,
        label: 'Fit ceiling × steady f',
        frequency,
        aov,
        saturationConfidence: confidence,
      }),
    );
    scenarios.push({
      nStar: consensusL,
      f: fMaxWeekly,
      label: 'Fit ceiling × f_max',
      revMonthly: round2(consensusL * frequency.fMax.value * aov),
      available: true,
      confidence: confidence === 'pre-inflection' ? 'provisional' : confidence === 'reliable' ? 'reliable' : 'provisional',
    });
  }

  scenarios.push(
    buildSteadyScenario({
      nStar: frequency.activeN.days30,
      label: 'Current N₃₀ × steady f',
      frequency,
      aov,
      saturationConfidence: confidence,
    }),
  );

  if (!steady.available) {
    scenarios.push(
      buildProvisionalScenario({
        nStar: frequency.activeN.days30,
        label: 'Current N₃₀ × blended f',
        frequency,
        aov,
      }),
    );
  }

  const projectedWeeklyRevenue =
    confidence === 'pre-inflection'
      ? []
      : buildProjectedPath(customers.weeklyCumulativeForFit, frequency, aov, consensusL);

  return {
    scenarios,
    projectedWeeklyRevenue,
    expansionDefaults: {
      reachFee: 500,
      defaultMarginPct: 40,
      basis: 'client-side calculator uses N* × f × AOV × margin',
    },
    consensusCeiling: consensusL != null ? { L: consensusL, confidence, weeksNeeded } : null,
  };
}

function buildProjectedPath(weeklyCumulative, frequency, aov, consensusL) {
  if (!weeklyCumulative.length) return [];
  const fWeekly = frequency.fSteadyState.available
    ? frequency.fSteadyState.weekly
    : frequency.fBlended.weekly;
  const nActive = frequency.activeN.days30;
  const out = [];
  const last = weeklyCumulative.at(-1);
  let cumulative = last.cumulative;

  for (let i = 1; i <= 8; i++) {
    const projectedAdds =
      consensusL != null && weeklyCumulative.length >= 2
        ? Math.max(
            0,
            round2(
              (weeklyCumulative.at(-1).cumulative +
                (weeklyCumulative.at(-1).cumulative - weeklyCumulative.at(-2).cumulative) * i) /
                i -
                cumulative,
            ),
          )
        : last.adds;
    cumulative += projectedAdds;
    const newCustOrders = projectedAdds;
    const repeatOrders = round2(nActive * fWeekly);
    const revenue = round2((newCustOrders + repeatOrders) * aov);
    out.push({
      weekOffset: i,
      weekLabel: `+${i} wk`,
      revenue,
      newCustomerOrders: newCustOrders,
      repeatOrders,
      basis: 'projected new-customer adds + active base × weekly f, × AOV',
    });
  }
  return out;
}

export function computeExpansion({
  households2km,
  households12km,
  penetrationPct,
  reachFee,
  marginPct,
  consensusL,
  fWeekly,
  aov,
}) {
  const pen = penetrationPct / 100;
  const margin = marginPct / 100;
  const n2 = households2km * pen;
  const n12 = households12km * pen;
  const nStar2 = consensusL != null ? Math.min(n2, consensusL) : n2;
  const nStar12 = consensusL != null ? Math.min(n12, consensusL) : n12;
  const rev2Monthly = round2(nStar2 * fWeekly * 4.33 * aov);
  const rev12Monthly = round2(nStar12 * fWeekly * 4.33 * aov);
  const incrementalContribution = round2((rev12Monthly - rev2Monthly) * margin);
  const paybackMonths = incrementalContribution > 0 ? round2(reachFee / incrementalContribution) : null;
  const breakEvenF =
    nStar12 > nStar2 && aov > 0 && margin > 0
      ? round2(reachFee / ((nStar12 - nStar2) * aov * margin * 4.33))
      : null;
  const shouldExpand = incrementalContribution > reachFee;

  return {
    n2km: round2(nStar2),
    n12km: round2(nStar12),
    rev2kmMonthly: rev2Monthly,
    rev12kmMonthly: rev12Monthly,
    incrementalContribution,
    paybackMonths,
    breakEvenFWeekly: breakEvenF != null ? round2(breakEvenF / 4.33) : null,
    decision: shouldExpand ? 'expand' : 'wait',
    decisionBasis: shouldExpand
      ? `(N₁₂ₖₘ − N₂ₖₘ) × f × AOV × margin > S$${reachFee}`
      : `incremental contribution S$${incrementalContribution} ≤ reach fee S$${reachFee}`,
  };
}
