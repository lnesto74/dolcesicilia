export interface GrowthDelta {
  current: number;
  prior: number;
  delta: number;
  deltaPct: number | null;
  basis: string;
}

export interface WeekdayOccurrence {
  date: string;
  weekday: string;
  dayLabel: string;
  orders: number;
  revenue: number;
  aov: number | null;
  newCustomers: number;
  wowOrders: GrowthDelta | null;
  wowRevenue: GrowthDelta | null;
  vs4WeekAvgOrders: number | null;
  vs4WeekAvgRevenue: number | null;
  vs4WeekAvgOrdersDeltaPct: number | null;
  vs4WeekAvgRevenueDeltaPct: number | null;
}

export interface OrderGrowthKpis {
  momentum: {
    rolling7d: {
      windowEnd: string;
      windowStart: string;
      priorWindowEnd: string;
      priorWindowStart: string;
      orders: GrowthDelta;
      revenue: GrowthDelta;
      aov: GrowthDelta;
      newCustomers: GrowthDelta;
    };
    todayWeekday: {
      weekday: string;
      date: string;
      orders: GrowthDelta;
      revenue: GrowthDelta;
      aov: GrowthDelta | null;
      newCustomers: GrowthDelta;
      vs4WeekAvg: {
        orders: { value: number; avg: number; deltaPct: number | null; basis: string };
        revenue: { value: number; avg: number; deltaPct: number | null; basis: string };
      };
    };
  };
  weekdaySeries: { weekday: string; occurrences: WeekdayOccurrence[] }[];
  weekdayTrendChart: {
    series: {
      weekday: string;
      points: { date: string; weekLabel: string; orders: number; revenue: number }[];
    }[];
  };
  customers: {
    newCustomersByDay: { date: string; dayLabel: string; count: number }[];
    newCustomersByWeek: { weekStart: string; weekLabel: string; count: number }[];
    cumulativeCustomers: { date: string; total: number }[];
    weeklyAcquisitionRate: { weekStart: string; weekLabel: string; count: number }[];
    weeklyNewVsReturning: {
      weekStart: string;
      weekLabel: string;
      newOrders: number;
      repeatOrders: number;
      newPct: number;
    }[];
  };
  retention: {
    weeklyRepeatCustomers: { weekStart: string; weekLabel: string; count: number }[];
    repeatRateTrend: {
      weekStart: string;
      weekLabel: string;
      repeatRate: number;
      repeatOrders: number;
      totalOrders: number;
    }[];
    repeatRevenueShareTrend: {
      weekStart: string;
      weekLabel: string;
      repeatRevenue: number;
      totalRevenue: number;
      sharePct: number;
    }[];
    cohortReorder: {
      weekStart: string;
      weekLabel: string;
      cohortSize: number;
      reorder14dPct: number;
      reorder30dPct: number;
    }[];
    medianDaysToSecondOrderTrend: {
      weekStart: string;
      weekLabel: string;
      medianDays: number | null;
      sampleSize: number;
    }[];
    avgOrdersPerCustomerTrend: {
      weekStart: string;
      weekLabel: string;
      avg: number;
      customers: number;
    }[];
  };
  economics: {
    aovByWeekday: {
      weekday: string;
      aov: number | null;
      orders: number;
      revenue: number;
      isWeekend: boolean;
    }[];
    weekendVsWeekday: {
      weekend: { orders: number; revenue: number; orderSharePct: number; revenueSharePct: number };
      weekday: { orders: number; revenue: number; orderSharePct: number; revenueSharePct: number };
    };
  };
}

interface OrderRow {
  contact_id: string;
  ordered_at: string;
  is_first_order?: number | boolean;
  order_value?: number | null;
}

export declare function computeOrderGrowthKpis(orders: OrderRow[]): OrderGrowthKpis;
