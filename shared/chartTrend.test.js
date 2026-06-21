import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bestWeekday,
  computeTrailingAverage,
  enrichDayChartTrends,
  weekOverWeekDelta,
} from './chartTrend.js';

describe('computeTrailingAverage', () => {
  it('handles all-zero launch days with min 1-day window', () => {
    const values = [0, 0, 0, 0, 0, 1, 2, 3];
    const ma = computeTrailingAverage(values, 7);
    assert.equal(ma[0], 0);
    assert.equal(ma[4], 0);
    assert.equal(ma[5], 0.17);
    assert.equal(ma[7], 0.86);
  });
});

describe('weekOverWeekDelta', () => {
  it('returns null pct when prior mean is below 1', () => {
    const values = [...Array(7).fill(0.2), ...Array(7).fill(0.5)];
    const wow = weekOverWeekDelta(values, 7);
    assert.ok(wow.hasPrior);
    assert.ok(Math.abs(wow.priorMean - 0.2) < 0.001);
    assert.equal(wow.deltaPct, null);
  });
});

describe('bestWeekday', () => {
  it('picks Saturday when weekend spikes dominate', () => {
    const rows = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.UTC(2026, 5, 1 + i, 12));
      const wd = d.getUTCDay();
      const count = wd === 6 ? 8 : wd === 0 ? 6 : 1;
      rows.push({ date: d.toISOString().slice(0, 10), count });
    }
    const best = bestWeekday(rows, 'count');
    assert.equal(best?.weekday, 'Saturday');
    assert.ok(best && best.avg > 2);
  });
});

describe('enrichDayChartTrends', () => {
  it('includes zero-order gap days in the moving average window', () => {
    const rows = [
      { date: '2026-06-01', count: 4, revenue: 40 },
      { date: '2026-06-02', count: 0, revenue: 0 },
      { date: '2026-06-03', count: 6, revenue: 60 },
      { date: '2026-06-04', count: 2, revenue: 20 },
      { date: '2026-06-05', count: 3, revenue: 30 },
      { date: '2026-06-06', count: 5, revenue: 50 },
      { date: '2026-06-07', count: 1, revenue: 10 },
    ];
    const { rows: enriched } = enrichDayChartTrends(rows, 'count', 'count');
    assert.equal(enriched[2].ma7, 3.33);
    assert.ok(enriched[2].ma7Upper >= enriched[2].ma7);
    assert.ok(enriched[2].ma7Lower <= enriched[2].ma7);
  });
});
