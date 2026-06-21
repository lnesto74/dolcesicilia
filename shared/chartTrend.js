/** Trailing moving average (not centered). Uses up to `windowSize` prior points incl. today. */
export function computeTrailingAverage(values, windowSize = 7) {
  if (values.length === 0) return [];

  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
    return Math.round(avg * 100) / 100;
  });
}

/** Rolling standard deviation over the same trailing window as the moving average. */
export function computeTrailingStdDev(values, windowSize = 7) {
  if (values.length === 0) return [];

  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    if (slice.length < 2) return 0;
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
    return Math.round(Math.sqrt(variance) * 100) / 100;
  });
}

/** Mean of the last N days vs mean of the preceding N days. */
export function weekOverWeekDelta(values, windowSize = 7) {
  if (values.length === 0) {
    return { recentMean: 0, priorMean: null, delta: null, deltaPct: null, hasPrior: false };
  }

  const recent = values.slice(-windowSize);
  const recentMean = recent.reduce((s, v) => s + v, 0) / recent.length;

  if (values.length < windowSize * 2) {
    return { recentMean, priorMean: null, delta: null, deltaPct: null, hasPrior: false };
  }

  const prior = values.slice(-windowSize * 2, -windowSize);
  const priorMean = prior.reduce((s, v) => s + v, 0) / prior.length;
  const delta = recentMean - priorMean;
  const deltaPct =
    priorMean >= 1 ? Math.round((delta / priorMean) * 1000) / 10 : null;

  return { recentMean, priorMean, delta, deltaPct, hasPrior: true };
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function weekdayFromDateKey(dateKey) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return WEEKDAY_NAMES[d.getUTCDay()];
}

/** Highest average value by day-of-week (UTC date keys). */
export function bestWeekday(rows, valueKey) {
  if (rows.length === 0) return null;

  const sums = new Map();
  for (const row of rows) {
    const wd = new Date(`${row.date}T12:00:00Z`).getUTCDay();
    const v = Number(row[valueKey]) || 0;
    const prev = sums.get(wd) ?? { sum: 0, count: 0 };
    sums.set(wd, { sum: prev.sum + v, count: prev.count + 1 });
  }

  let best = null;
  for (const [wd, { sum, count }] of sums) {
    const avg = Math.round((sum / count) * 100) / 100;
    if (!best || avg > best.avg) {
      best = { weekday: WEEKDAY_NAMES[wd], avg };
    }
  }
  return best;
}

/** Skip up to 5 launch days at the start where count < threshold. */
export function steadyStateStartIndex(rows, countKey, launchThreshold = 1, maxLaunchDays = 5) {
  let skip = 0;
  while (
    skip < maxLaunchDays &&
    skip < rows.length &&
    (Number(rows[skip][countKey]) || 0) < launchThreshold
  ) {
    skip++;
  }
  return skip;
}

/** Simple least-squares linear regression trend line for chart series. */
export function linearTrendLine(data, valueKey, outputKey = 'trend') {
  if (data.length === 0) return [];

  const points = data.map((d, i) => ({
    x: i,
    y: Number(d[valueKey]) || 0,
  }));

  const n = points.length;
  if (n < 2) {
    return data.map((d) => ({
      ...d,
      [outputKey]: Number(d[valueKey]) || 0,
    }));
  }

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return data.map((d, i) => ({
    ...d,
    [outputKey]: Math.round((slope * i + intercept) * 100) / 100,
  }));
}

export function enrichDayChartTrends(data, valueKey, countKey = valueKey, options = {}) {
  const windowSize = options.windowSize ?? 7;
  const minSteadyDays = options.minSteadyDays ?? 10;

  const values = data.map((d) => Number(d[valueKey]) || 0);
  const ma7 = computeTrailingAverage(values, windowSize);
  const ma7Std = computeTrailingStdDev(values, windowSize);
  const ma7Upper = ma7.map((m, i) => Math.round((m + ma7Std[i]) * 100) / 100);
  const ma7Lower = ma7.map((m, i) =>
    Math.round(Math.max(0, m - ma7Std[i]) * 100) / 100,
  );

  const steadyStart = steadyStateStartIndex(data, countKey);
  const steadySlice = data.slice(steadyStart);
  const showSteadyTrend = steadySlice.length >= minSteadyDays;
  const steadyTrendByDate = new Map();

  if (showSteadyTrend) {
    const fitted = linearTrendLine(steadySlice, valueKey, 'steadyTrend');
    for (const row of fitted) {
      steadyTrendByDate.set(row.date, Number(row.steadyTrend) || 0);
    }
  }

  const rows = data.map((d, i) => ({
    ...d,
    ma7: ma7[i],
    ma7Upper: ma7Upper[i],
    ma7Lower: ma7Lower[i],
    ma7Band: [ma7Lower[i], ma7Upper[i]],
    steadyTrend: steadyTrendByDate.get(d.date) ?? null,
  }));

  return {
    rows,
    summary: {
      weekOverWeek: weekOverWeekDelta(values, windowSize),
      bestWeekday: bestWeekday(data, valueKey),
      steadyTrendFromDate: showSteadyTrend ? (data[steadyStart]?.date ?? null) : null,
      showSteadyTrend,
    },
  };
}
