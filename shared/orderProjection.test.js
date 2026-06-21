import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runScenarioWalk,
  weekOneRevenue,
  SCENARIO_DEFAULTS,
  buildProjectionSummary,
  runAllScenarios,
} from './orderProjection.js';

describe('orderProjection weekly walk', () => {
  const baselines = {
    new0: 10,
    foAOV: 25,
    repAOV: 30,
    rWeekly: 0.2,
    cum0: 50,
    activeBase0: 40,
    history: [],
  };

  it('week-1 revenue equals new0×foAOV + activeBase0×rWeekly×repAOV (base)', () => {
    const expected = 10 * 25 + 40 * 0.2 * 30;
    const actual = weekOneRevenue(baselines, SCENARIO_DEFAULTS.base);
    assert.equal(actual, expected);
  });

  it('new customers taper with negative gNew', () => {
    const pts = runScenarioWalk(baselines, SCENARIO_DEFAULTS.base, 4);
    assert.ok(pts[0].newCustomers >= pts[1].newCustomers);
    assert.ok(pts[1].newCustomers >= pts[2].newCustomers);
  });

  it('summary low ≤ base ≤ high for 3-month revenue', () => {
    const scenarios = runAllScenarios(baselines);
    const summary = buildProjectionSummary(scenarios);
    assert.ok(summary.threeMonths.revenue.low <= summary.threeMonths.revenue.base);
    assert.ok(summary.threeMonths.revenue.base <= summary.threeMonths.revenue.high);
  });
});
