import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fitSaturationCurve, assessSaturationConfidence } from './saturationFit.js';
import { computeCensoredReorder } from './orderKpiRetention.js';
import { assessSteadyStateF } from './orderKpiSteadyState.js';
import { parseOrderDate } from './orderKpiUtils.js';

describe('saturationFit', () => {
  it('recovers logistic ceiling within tolerance on synthetic S-curve', () => {
    const trueL = 100;
    const k = 0.8;
    const t0 = 4;
    const points = [];
    for (let t = 0; t < 12; t++) {
      const y = trueL / (1 + Math.exp(-k * (t - t0)));
      points.push({ weekStart: `w${t}`, weekLabel: `w${t}`, adds: 0, cumulative: Math.round(y) });
    }
    const fit = fitSaturationCurve(points);
    assert.ok(fit.logistic);
    assert.ok(fit.logistic.L >= 85 && fit.logistic.L <= 120, `L=${fit.logistic.L}`);
    assert.ok(fit.logistic.r2 > 0.9, `r2=${fit.logistic.r2}`);
  });

  it('flags pre-inflection with few weeks', () => {
    const conf = assessSaturationConfidence({
      completedWeekCount: 3,
      consecutiveDecliningWeeks: 0,
      logisticL: 80,
      expL: 100,
    });
    assert.equal(conf.confidence, 'pre-inflection');
    assert.ok(conf.weeksNeededForReliable >= 3);
  });
});

describe('computeCensoredReorder', () => {
  it('excludes recent buyers from p30 denominator', () => {
    const todayMs = parseOrderDate('2026-06-19T12:00:00Z').getTime();
    const byContact = new Map();

    byContact.set('old-reorder', [
      { ordered_at: '2026-01-01T10:00:00Z' },
      { ordered_at: '2026-01-10T10:00:00Z' },
    ]);
    byContact.set('old-no-reorder', [{ ordered_at: '2026-01-01T10:00:00Z' }]);
    byContact.set('recent-only', [{ ordered_at: '2026-06-10T10:00:00Z' }]);

    const result = computeCensoredReorder(byContact, 30, todayMs);
    assert.equal(result.denominator, 2, 'recent buyer must be censored');
    assert.equal(result.numerator, 1);
    assert.equal(result.rate, 50);
  });
});

describe('assessSteadyStateF', () => {
  it('returns unavailable when no customer has ≥4 weeks tenure', () => {
    const todayMs = parseOrderDate('2026-06-19T12:00:00Z').getTime();
    const byContact = new Map();
    byContact.set('a', [{ ordered_at: '2026-06-01T10:00:00Z' }]);
    byContact.set('b', [{ ordered_at: '2026-06-10T10:00:00Z' }]);

    const result = assessSteadyStateF(byContact, todayMs);
    assert.equal(result.available, false);
    assert.equal(result.value, null);
    assert.ok(result.weeksUntilMeasurable >= 1);
    assert.match(result.message, /not measurable yet/);
  });
});
