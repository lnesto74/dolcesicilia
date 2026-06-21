import type { GrowthDelta } from '@shared/orderGrowthKpis';

export type ConfidenceFlag = 'reliable' | 'low' | 'pre-inflection';
export type ScenarioConfidenceFlag = 'reliable' | 'provisional' | 'unavailable';
export type HealthFlag = 'green' | 'amber' | 'red';

export interface OrderKpisResponse {
  generatedAt: string;
  meta: {
    today: string;
    timezone: string;
    completedWeekCount: number;
    partialWeek: { weekStart: string; weekLabel: string } | null;
    medianTenureWeeks: number;
  };
  hero: {
    rolling7dRevenue: GrowthDelta;
    repeatRateLatestFullWeek: { value: number; health: HealthFlag; weekLabel: string };
    reorderP30: { rate: number; numerator: number; denominator: number; health: HealthFlag; basis: string };
    activeN30: number;
    activeN60: number;
    ceiling: {
      confidence: ConfidenceFlag;
      L: number | null;
      message: string;
      weeksNeeded: number | null;
    };
  };
  momentum: import('@shared/orderGrowthKpis').OrderGrowthKpis['momentum'] & {
    weekdaySeries: import('@shared/orderGrowthKpis').OrderGrowthKpis['weekdaySeries'];
    weekdayTrendChart: import('@shared/orderGrowthKpis').OrderGrowthKpis['weekdayTrendChart'];
  };
  customers: {
    newCustomersByDay: { date: string; dayLabel: string; count: number }[];
    newCustomersByWeek: { weekStart: string; weekLabel: string; count: number; isPartial: boolean }[];
    cumulativeCustomers: { date: string; total: number }[];
    weeklyAcquisition: { weekStart: string; weekLabel: string; count: number; isPartial: boolean }[];
    deceleration: {
      status: string;
      ratioLatestFullWeek: number | null;
      consecutiveDecliningWeeks: number;
      basis: string;
    };
    weeklyNewVsReturning: {
      weekStart: string;
      weekLabel: string;
      newOrders: number;
      repeatOrders: number;
      newPct: number;
      isPartial?: boolean;
    }[];
  };
  retention: {
    weeklyRepeatCustomers: { weekStart: string; weekLabel: string; count: number; basis?: string }[];
    repeatRateTrend: { weekStart: string; weekLabel: string; repeatRate: number; health: HealthFlag }[];
    repeatRevenueShareTrend: { weekStart: string; weekLabel: string; sharePct: number; basis?: string }[];
    reorderProbability: {
      days14: { rate: number; numerator: number; denominator: number; health: HealthFlag; basis: string };
      days30: { rate: number; numerator: number; denominator: number; health: HealthFlag; basis: string };
      days60: { rate: number; numerator: number; denominator: number; health: HealthFlag; basis: string };
    };
    ipi: { medianDays: number | null; meanDays: number | null; sampleSize: number; basis: string };
    avgOrdersPerCustomerTrend: { weekLabel: string; avg: number }[];
  };
  frequency: {
    activeN: { days30: number; days60: number };
    fBlended: { value: number; weekly: number; inflatedWarning: boolean; basis: string };
    fSteadyState: {
      value: number;
      weekly: number;
      available: boolean;
      sampleSize: number;
      weeksUntilMeasurable: number;
      message: string | null;
      basis: string;
    };
    fMax: { value: number; weekly: number; basis: string };
    fByWeekday: { weekday: string; ordersPerActiveCustomer: number; isWeekend: boolean }[];
    revenueDecompositionMonthly: { monthLabel: string; firstOrder: number; repeat: number }[];
    crossoverMonth: string | null;
    aovWeeklyTrend: { weekLabel: string; aov: number | null }[];
    identity: { N: number; f: number; aov: number; revenuePerWeek: number; basis: string };
    medianTenureWeeks: number;
  };
  saturation: {
    confidence: ConfidenceFlag;
    confidenceReasons: string[];
    weeksNeededForReliable: number | null;
    modelAgreementPct: number | null;
    customers: {
      logistic: { L: number; k: number; r2: number } | null;
      boundedExp: { L: number; k: number; r2: number } | null;
      actual: { t: number; cumulative: number; weekLabel?: string }[];
      inflectionSignal: { t: number; value: number }[];
    };
    repeatCustomers: {
      logistic: { L: number; k: number; r2: number } | null;
      boundedExp: { L: number; k: number; r2: number } | null;
      actual: { t: number; cumulative: number; weekLabel?: string }[];
    };
  };
  forecast: {
    scenarios: {
      nStar: number;
      f: number | null;
      label: string;
      revMonthly: number | null;
      available: boolean;
      confidence: ScenarioConfidenceFlag;
      message?: string;
      weeksUntilMeasurable?: number;
    }[];
    projectedWeeklyRevenue: { weekLabel: string; revenue: number; basis: string }[];
    expansionDefaults: { reachFee: number; defaultMarginPct: number };
    consensusCeiling: { L: number; confidence: ConfidenceFlag; weeksNeeded: number | null } | null;
  };
}
