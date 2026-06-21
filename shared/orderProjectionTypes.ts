export interface ProjectionBaselines {
  new0: number;
  foAOV: number;
  repAOV: number;
  rWeekly: number;
  cum0: number;
  activeBase0: number;
  history: {
    weekIndex: number;
    weekLabel: string;
    newCustomers: number;
    cumulativeCustomers: number;
    revenue: number;
  }[];
  scenarios: Record<string, { gNew: number; rWeeklyMultiplier: number; rGrow: number; aovMultiplier: number; label: string }>;
}

export interface OrderProjectionResponse {
  generatedAt: string;
  note: string;
  defaults: ProjectionBaselines & { basis?: Record<string, string> };
  scenarios: Record<string, { weekIndex: number; revenue: number; newCustomers: number; cumulativeCustomers: number }[]>;
  summary: {
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
  chartSeries: Record<string, unknown>[];
}
