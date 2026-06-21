export type Objective = 'sales' | 'loyalty' | 'base';

export type DailyBriefSegment =
  | 'win-back'
  | 'tray-upsell'
  | 'vip'
  | 'high-value-first'
  | 'top-spender';

export type DailyBriefKeyword = 'ORANGE' | 'TRAY' | 'TREAT' | 'VIP' | 'YES';

export interface DailyBriefCTA {
  id: string;
  label: string;
  objective: Objective;
  segment: DailyBriefSegment;
  keyword: DailyBriefKeyword;
  contactIds: string[];
  contactNames: string[];
  messageBody: string;
  status: 'staged' | 'sent';
}

export interface DailyBrief {
  type: 'daily_brief';
  version: number;
  date: string;
  coversDate: string;
  generatedAt: string;
  headline: string;
  metrics: {
    orders: number;
    revenue: number;
    aov: number;
    newCustomers: number;
    returningCustomers: number;
    vs7dAvgOrders: number;
    trendDirection: 'up' | 'flat' | 'down';
  };
  whatChanged: { severity: 'high' | 'med' | 'low'; text: string }[];
  topMove: { title: string; objective: Objective; rationale: string; ctaId: string };
  supportingMoves: { title: string; objective: Objective; ctaId: string }[];
  watchouts: string[];
  experiment: { hypothesis: string; metric: string };
  ctas: DailyBriefCTA[];
}
