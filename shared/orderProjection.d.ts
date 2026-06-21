export const SCENARIO_DEFAULTS: Record<
  string,
  { gNew: number; rWeeklyMultiplier: number; rGrow: number; aovMultiplier: number; label: string }
>;

export function runScenarioWalk(
  baselines: Record<string, unknown>,
  scenarioParams: Record<string, unknown>,
  weeks?: number,
): {
  weekIndex: number;
  weekLabel: string;
  newCustomers: number;
  cumulativeCustomers: number;
  repeatOrders: number;
  orders: number;
  revenue: number;
}[];

export function runAllScenarios(
  baselines: Record<string, unknown>,
  overrides?: Record<string, unknown>,
  weeks?: number,
): Record<string, ReturnType<typeof runScenarioWalk>>;

export function buildProjectionSummary(scenarios: Record<string, ReturnType<typeof runScenarioWalk>>): {
  threeMonths: {
    weeks: number;
    revenue: { base: number; low: number; high: number };
    newCustomers: { base: number; low: number; high: number };
    exitRunRate: { base: number; low: number; high: number };
  };
  sixMonths: {
    weeks: number;
    revenue: { base: number; low: number; high: number };
    newCustomers: { base: number; low: number; high: number };
    exitRunRate: { base: number; low: number; high: number };
  };
};

export function buildChartSeries(
  history: Record<string, unknown>[],
  scenarios: Record<string, ReturnType<typeof runScenarioWalk>>,
  horizon?: number,
): Record<string, unknown>[];

export function computeOrderProjection(orders: Record<string, unknown>[]): Record<string, unknown>;

export function weekOneRevenue(
  baselines: Record<string, unknown>,
  scenarioParams?: Record<string, unknown>,
): number;
