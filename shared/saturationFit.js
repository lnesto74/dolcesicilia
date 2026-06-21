import { round2 } from './orderKpiUtils.js';

function logistic(t, L, k, t0) {
  return L / (1 + Math.exp(-k * (t - t0)));
}

function boundedExp(t, L, k) {
  return L * (1 - Math.exp(-k * t));
}

function rSquared(actual, predicted) {
  const n = actual.length;
  if (n < 2) return 0;
  const meanY = actual.reduce((s, y) => s + y, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (actual[i] - meanY) ** 2;
    ssRes += (actual[i] - predicted[i]) ** 2;
  }
  if (ssTot === 0) return predicted.every((p, i) => p === actual[i]) ? 1 : 0;
  return round2(Math.max(0, 1 - ssRes / ssTot));
}

function nelderMead(fn, start, maxIter = 80) {
  const n = start.length;
  let simplex = [start];
  const step = 0.15;
  for (let i = 0; i < n; i++) {
    const p = [...start];
    p[i] += Math.max(Math.abs(start[i]) * step, 0.1);
    simplex.push(p);
  }

  const score = (p) => fn(p);
  let values = simplex.map(score);
  const alpha = 1;
  const gamma = 2;
  const rho = 0.5;
  const sigma = 0.5;

  for (let iter = 0; iter < maxIter; iter++) {
    const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);

    const worst = n;
    const centroid = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i][j];
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    const reflected = centroid.map((c, j) => c + alpha * (c - simplex[worst][j]));
    const rVal = score(reflected);
    if (rVal < values[0]) {
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      const eVal = score(expanded);
      if (eVal < rVal) {
        simplex[worst] = expanded;
        values[worst] = eVal;
      } else {
        simplex[worst] = reflected;
        values[worst] = rVal;
      }
    } else if (rVal < values[n - 1]) {
      simplex[worst] = reflected;
      values[worst] = rVal;
    } else {
      const contracted = centroid.map((c, j) => c + rho * (simplex[worst][j] - c));
      const cVal = score(contracted);
      if (cVal < values[worst]) {
        simplex[worst] = contracted;
        values[worst] = cVal;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[0].map((v, j) => simplex[0][j] + sigma * (simplex[i][j] - simplex[0][j]));
          values[i] = score(simplex[i]);
        }
      }
    }
  }

  const best = values.indexOf(Math.min(...values));
  return { params: simplex[best], error: values[best] };
}

function fitLogistic(points) {
  if (points.length < 3) return null;
  const actual = points.map((p) => p.y);
  const maxY = Math.max(...actual);
  const n = points.length;

  let best = { error: Infinity, L: maxY, k: 0.5, t0: n / 2, r2: 0 };

  const lSteps = [maxY * 1.05, maxY * 1.2, maxY * 1.5, maxY * 2, maxY * 3];
  for (const L of lSteps) {
    for (let ki = 1; ki <= 20; ki++) {
      const k = ki * 0.1;
      for (let t0i = 0; t0i <= n; t0i++) {
        const t0 = t0i;
        const predicted = points.map((p) => logistic(p.t, L, k, t0));
        let err = 0;
        for (let i = 0; i < n; i++) err += (actual[i] - predicted[i]) ** 2;
        if (err < best.error) best = { error: err, L, k, t0, r2: rSquared(actual, predicted) };
      }
    }
  }

  const refined = nelderMead(
    ([L, k, t0]) => {
      const predicted = points.map((p) => logistic(p.t, L, k, t0));
      let err = 0;
      for (let i = 0; i < n; i++) err += (actual[i] - predicted[i]) ** 2;
      return err;
    },
    [best.L, best.k, best.t0],
  );

  const [L, k, t0] = refined.params;
  const predicted = points.map((p) => logistic(p.t, L, k, t0));
  return {
    model: 'logistic',
    L: round2(Math.max(L, maxY)),
    k: round2(k),
    t0: round2(t0),
    r2: rSquared(actual, predicted),
    points: points.map((p, i) => ({ t: p.t, fitted: round2(predicted[i]) })),
  };
}

function fitBoundedExp(points) {
  if (points.length < 3) return null;
  const actual = points.map((p) => p.y);
  const maxY = Math.max(...actual);
  const n = points.length;

  let best = { error: Infinity, L: maxY, k: 0.5, r2: 0 };

  const lSteps = [maxY * 1.05, maxY * 1.2, maxY * 1.5, maxY * 2, maxY * 3];
  for (const L of lSteps) {
    for (let ki = 1; ki <= 30; ki++) {
      const k = ki * 0.08;
      const predicted = points.map((p) => boundedExp(p.t, L, k));
      let err = 0;
      for (let i = 0; i < n; i++) err += (actual[i] - predicted[i]) ** 2;
      if (err < best.error) best = { error: err, L, k, r2: rSquared(actual, predicted) };
    }
  }

  const refined = nelderMead(
    ([L, k]) => {
      const predicted = points.map((p) => boundedExp(p.t, L, k));
      let err = 0;
      for (let i = 0; i < n; i++) err += (actual[i] - predicted[i]) ** 2;
      return err;
    },
    [best.L, best.k],
  );

  const [L, k] = refined.params;
  const predicted = points.map((p) => boundedExp(p.t, L, k));
  return {
    model: 'boundedExponential',
    L: round2(Math.max(L, maxY)),
    k: round2(k),
    r2: rSquared(actual, predicted),
    points: points.map((p, i) => ({ t: p.t, fitted: round2(predicted[i]) })),
  };
}

function smoothSecondDerivative(values) {
  if (values.length < 3) return values.map((_, i) => ({ t: i, value: 0 }));
  const out = [];
  for (let i = 1; i < values.length - 1; i++) {
    const d2 = values[i + 1] - 2 * values[i] + values[i - 1];
    out.push({ t: i, value: round2(d2) });
  }
  return out;
}

export function assessSaturationConfidence({
  completedWeekCount,
  consecutiveDecliningWeeks,
  logisticL,
  expL,
}) {
  const reasons = [];
  let confidence = 'reliable';

  const modelSpread =
    logisticL != null && expL != null && logisticL > 0 && expL > 0
      ? Math.abs(logisticL - expL) / ((logisticL + expL) / 2)
      : null;

  if (completedWeekCount < 6) {
    confidence = 'pre-inflection';
    reasons.push(`only ${completedWeekCount} completed weeks (need ≥6)`);
  }
  if (consecutiveDecliningWeeks < 3) {
    if (confidence !== 'pre-inflection') confidence = 'pre-inflection';
    reasons.push('weekly adds ratio has not been <1.0 for 3 consecutive completed weeks');
  }
  if (modelSpread != null && modelSpread > 0.25) {
    confidence = 'pre-inflection';
    reasons.push(`model ceilings differ by ${round2(modelSpread * 100)}% (>25%)`);
  }
  if (confidence === 'reliable' && completedWeekCount < 10) {
    confidence = 'low';
    reasons.push(`${completedWeekCount} completed weeks (10+ for reliable)`);
  }

  const weeksNeeded = confidence === 'pre-inflection' ? Math.max(0, 6 - completedWeekCount) : null;

  return {
    confidence,
    confidenceReasons: reasons,
    weeksNeededForReliable: weeksNeeded,
    modelAgreementPct: modelSpread != null ? round2((1 - modelSpread) * 100) : null,
  };
}

export function fitSaturationCurve(weeklyCumulative) {
  const points = weeklyCumulative.map((w, i) => ({ t: i, y: w.cumulative, weekLabel: w.weekLabel }));
  const actual = points.map((p) => ({ t: p.t, cumulative: p.y, weekLabel: p.weekLabel }));

  if (points.length < 3) {
    return {
      logistic: null,
      boundedExp: null,
      actual,
      inflectionSignal: [],
    };
  }

  const logisticFit = fitLogistic(points);
  const expFit = fitBoundedExp(points);
  const ySmooth = points.map((p) => p.y);
  const inflectionSignal = smoothSecondDerivative(ySmooth);

  return {
    logistic: logisticFit,
    boundedExp: expFit,
    actual,
    inflectionSignal,
  };
}
