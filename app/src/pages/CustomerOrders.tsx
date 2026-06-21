import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Lightbulb,
  Loader2,
  RefreshCw,
  Repeat,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CustomerAdminNav } from '../components/CustomerAdminNav';
import { DailyIntelligencePanel } from '../components/DailyIntelligencePanel';
import { MessagePrefChip } from '../components/MessagePrefChip';
import { OrderKpisPanel } from '../components/orderKpis/OrderKpisPanel';
import {
  OrderHeatmapChart,
  RepeatComparisonChart,
  WeekendBarBands,
  WeekendLegend,
  ChartTrendToggle,
  ChartTrendSummary,
  TREND_COLOR,
  STEADY_TREND_COLOR,
  prepareOrdersByDayChart,
  prepareRevenueByDayChart,
  steadyTrendLabel,
} from '../components/orderCharts';
import { type OrderAnalytics, type OrderInsight } from '@shared/orderAnalytics';
import { formatSgd } from '@shared/parseOrderValue';

const API_URL = import.meta.env.VITE_API_URL || '';

interface EngagementStrategy {
  growthSummary?: string;
  growthRate?: { ordersPerWeekEstimate?: number; revenuePerWeekEstimate?: number; confidence?: string };
  keyPatterns?: string[];
  upsellOpportunities?: {
    segment: string;
    who: string;
    offer: string;
    messageAngle: string;
    priority: string;
  }[];
  crossSellOpportunities?: {
    from: string;
    to: string;
    who: string;
    messageAngle: string;
    priority: string;
  }[];
  priorityActions?: { action: string; why: string; timing: string }[];
  risks?: string[];
  recommendedCampaigns?: string[];
  rawAnalysis?: string;
  parseError?: boolean;
}

interface AiStrategyResponse {
  model?: string;
  generatedAt?: string;
  strategy?: EngagementStrategy;
  parseWarning?: string | null;
}

const CHART_COLORS = ['#2d6a4f', '#52b788', '#95d5b2', '#40916c', '#f4a261'];
const WEEKDAY_BAR = { weekday: '#2d6a4f', weekend: '#40916c' };

function formatOrderTime(iso: string) {
  return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatHour(h: number) {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

type SectionKey =
  | 'insights'
  | 'ai'
  | 'charts'
  | 'heatmap'
  | 'repeatCompare'
  | 'topSpend'
  | 'topRepeat'
  | 'recent';

const DEFAULT_OPEN_SECTIONS: Record<SectionKey, boolean> = {
  insights: true,
  ai: true,
  charts: true,
  heatmap: true,
  repeatCompare: true,
  topSpend: true,
  topRepeat: true,
  recent: true,
};

function CollapsibleSection({
  open,
  onToggle,
  title,
  subtitle,
  icon,
  children,
  scrollable = false,
  className = '',
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  scrollable?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`bg-white rounded-xl border border-beige-600 shadow-sm overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-cream-400/40 transition-colors"
      >
        <div className="min-w-0">
          <h2 className="font-display text-base text-ink-900 flex items-center gap-2">
            {icon}
            {title}
          </h2>
          {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
        </div>
        <span className="shrink-0 text-mediterranean-700">
          {open ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </span>
      </button>
      {open && (
        <div
          className={
            scrollable
              ? 'border-t border-beige-400 max-h-[min(24rem,55vh)] overflow-y-auto overscroll-contain'
              : 'border-t border-beige-400'
          }
        >
          {children}
        </div>
      )}
    </section>
  );
}

function InsightCard({ insight }: { insight: OrderInsight }) {
  const styles = {
    success: 'border-green-200 bg-green-50 text-green-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    action: 'border-mediterranean-200 bg-mediterranean-50 text-mediterranean-900',
  };
  const icons = { success: Sparkles, warning: AlertTriangle, action: Lightbulb };
  const Icon = icons[insight.type];
  return (
    <div className={`rounded-xl border p-4 ${styles[insight.type]}`}>
      <p className="font-semibold text-sm flex items-center gap-2">
        <Icon className="w-4 h-4 shrink-0" />
        {insight.title}
      </p>
      <p className="text-sm mt-1.5 opacity-90 leading-relaxed">{insight.detail}</p>
    </div>
  );
}

export function CustomerOrders() {
  const [analytics, setAnalytics] = useState<OrderAnalytics | null>(null);
  const [messagePrefById, setMessagePrefById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [openSections, setOpenSections] = useState(DEFAULT_OPEN_SECTIONS);
  const [showOrdersTrend, setShowOrdersTrend] = useState(true);
  const [showRevenueTrend, setShowRevenueTrend] = useState(true);
  const [aiStrategy, setAiStrategy] = useState<AiStrategyResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsRes, contactsRes] = await Promise.all([
        fetch(`${API_URL}/api/orders/analytics`),
        fetch(`${API_URL}/api/contacts?withMessages=1`),
      ]);
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (contactsRes.ok) {
        const data = await contactsRes.json();
        const prefs: Record<string, string> = {};
        for (const c of data.contacts || []) {
          if (c.message_pref && c.message_pref !== 'unset') prefs[c.id] = c.message_pref;
        }
        setMessagePrefById(prefs);
      }
    } catch {
      // offline
    }
    setLoading(false);
  }, []);

  const loadLatestStrategy = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/ai/engagement-strategy/latest`);
      if (res.ok) {
        const data = await res.json();
        if (data.strategy) setAiStrategy(data);
      }
    } catch {
      // offline
    }
  }, []);

  const runAiStrategy = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch(`${API_URL}/api/ai/engagement-strategy`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setAiStrategy(data);
      } else {
        setAiError(data.error || 'Analysis failed');
      }
    } catch {
      setAiError('Cannot reach Mac server for AI analysis.');
    }
    setAiLoading(false);
  };

  useEffect(() => {
    load();
    loadLatestStrategy();
  }, [load, loadLatestStrategy]);

  const mixData = analytics
    ? [
        { name: 'First order', value: analytics.firstTimeOrders, fill: CHART_COLORS[0] },
        { name: 'Repeat', value: analytics.repeatOrders, fill: CHART_COLORS[2] },
      ].filter((d) => d.value > 0)
    : [];

  const hourData =
    analytics?.byHour.map((h) => ({
      hour: formatHour(h.hour),
      count: h.count,
    })) || [];

  const ordersChart = analytics ? prepareOrdersByDayChart(analytics.ordersByDay) : null;
  const dayChartData = ordersChart?.rows ?? [];
  const ordersChartSummary = ordersChart?.summary ?? null;

  const revenueChart = analytics ? prepareRevenueByDayChart(analytics.ordersByDay) : null;
  const revenueChartData = revenueChart?.rows ?? [];
  const revenueChartSummary = revenueChart?.summary ?? null;
  const ordersSteadyLabel = steadyTrendLabel(ordersChartSummary?.steadyTrendFromDate ?? null);
  const revenueSteadyLabel = steadyTrendLabel(revenueChartSummary?.steadyTrendFromDate ?? null);

  return (
    <div className="min-h-screen bg-cream-500">
      <header className="bg-mediterranean-800 text-white px-4 py-6 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-mediterranean-200 text-sm uppercase tracking-widest mb-1">Admin</p>
          <h1 className="font-display text-3xl sm:text-4xl">Order Intelligence</h1>
          <p className="text-mediterranean-100 mt-2 text-sm sm:text-base">
            Every Grab screenshot = one order. Order time comes from iPhone photo metadata (Original date in Photos).
          </p>
          <CustomerAdminNav />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:px-8 space-y-6">
        <DailyIntelligencePanel />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 text-sm text-mediterranean-700 font-medium"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-mediterranean-700" />
          </div>
        ) : !analytics || analytics.totalOrders === 0 ? (
          <section className="bg-white rounded-xl border border-beige-600 p-8 text-center">
            <ShoppingBag className="w-10 h-10 text-ink-300 mx-auto mb-3" />
            <p className="text-ink-600">No orders logged yet.</p>
            <p className="text-sm text-ink-400 mt-2">
              <Link to="/customers" className="text-mediterranean-700 underline">
                Upload Grab screenshots
              </Link>{' '}
              — each image timestamp becomes the order time.
            </p>
          </section>
        ) : (
          <>
            {analytics.ordersWithValue < analytics.totalOrders && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
                {analytics.totalOrders - analytics.ordersWithValue} order(s) have no value yet.{' '}
                <Link to="/customers" className="font-medium underline">
                  Import → One-time backfill
                </Link>
                : add screenshots to archive, then Reconcile (won&apos;t touch contacts or order counts).
              </div>
            )}

            <section className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="rounded-xl border border-beige-600 bg-white p-4">
                <p className="text-xs text-ink-500 uppercase tracking-wide flex items-center gap-1">
                  <ShoppingBag className="w-3.5 h-3.5" /> Total orders
                </p>
                <p className="text-3xl font-display text-mediterranean-800 mt-1">{analytics.totalOrders}</p>
              </div>
              <div className="rounded-xl border border-beige-600 bg-white p-4">
                <p className="text-xs text-ink-500 uppercase tracking-wide">Tracked revenue</p>
                <p className="text-3xl font-display text-mediterranean-800 mt-1">
                  {formatSgd(analytics.totalRevenue)}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {analytics.ordersWithValue} order{analytics.ordersWithValue !== 1 ? 's' : ''} with value
                </p>
              </div>
              <div className="rounded-xl border border-beige-600 bg-white p-4">
                <p className="text-xs text-ink-500 uppercase tracking-wide">Avg order value</p>
                <p className="text-3xl font-display text-mediterranean-800 mt-1">
                  {formatSgd(analytics.avgOrderValue)}
                </p>
              </div>
              <div className="rounded-xl border border-beige-600 bg-white p-4">
                <p className="text-xs text-ink-500 uppercase tracking-wide">This week</p>
                <p className="text-3xl font-display text-mediterranean-800 mt-1">{analytics.ordersThisWeek}</p>
              </div>
              <div className="rounded-xl border border-beige-600 bg-white p-4">
                <p className="text-xs text-ink-500 uppercase tracking-wide flex items-center gap-1">
                  <UserPlus className="w-3.5 h-3.5" /> First orders
                </p>
                <p className="text-3xl font-display text-green-700 mt-1">{analytics.firstTimeOrders}</p>
              </div>
              <div className="rounded-xl border border-beige-600 bg-mediterranean-50 p-4">
                <p className="text-xs text-ink-500 uppercase tracking-wide flex items-center gap-1">
                  <Repeat className="w-3.5 h-3.5" /> Repeat
                </p>
                <p className="text-3xl font-display text-mediterranean-800 mt-1">{analytics.repeatOrders}</p>
                <p className="text-xs text-ink-500 mt-0.5">{analytics.repeatRate}%</p>
              </div>
            </section>

            <OrderKpisPanel />

            {analytics.insights.length > 0 && (
              <CollapsibleSection
                open={openSections.insights}
                onToggle={() => toggleSection('insights')}
                title="Insights"
                subtitle="Quick takeaways from your order data"
                icon={<TrendingUp className="w-5 h-5 text-mediterranean-700 shrink-0" />}
              >
                <div className="p-4 grid sm:grid-cols-2 gap-3">
                  {analytics.insights.map((insight, i) => (
                    <InsightCard key={i} insight={insight} />
                  ))}
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection
              open={openSections.ai}
              onToggle={() => toggleSection('ai')}
              title="AI Growth Strategist"
              subtitle="Claude — upsell & cross-sell recommendations"
              icon={<Sparkles className="w-5 h-5 text-mediterranean-700 shrink-0" />}
              className="border-mediterranean-200 bg-gradient-to-br from-mediterranean-50 to-cream-400"
            >
              <div className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-end gap-3 -mt-1">
                <button
                  type="button"
                  onClick={runAiStrategy}
                  disabled={aiLoading}
                  className="inline-flex items-center justify-center gap-2 shrink-0 text-sm font-medium bg-mediterranean-700 text-white px-4 py-2.5 rounded-lg hover:bg-mediterranean-800 disabled:opacity-50"
                >
                  {aiLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {aiLoading ? 'Analyzing…' : 'Run analysis'}
                </button>
              </div>

              {aiError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                  {aiError}
                  {aiError.includes('ANTHROPIC_API_KEY') && (
                    <p className="mt-1 text-xs opacity-90">
                      On your Mac: set <code className="bg-red-100 px-1 rounded">ANTHROPIC_API_KEY</code> in the
                      server environment, then restart.
                    </p>
                  )}
                </div>
              )}

              {aiStrategy?.parseWarning && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
                  {aiStrategy.parseWarning}
                </div>
              )}

              {aiStrategy?.strategy && !aiStrategy.strategy.parseError && (
                <div className="space-y-4 text-sm">
                  {aiStrategy.generatedAt && (
                    <p className="text-xs text-ink-400">
                      Last run:{' '}
                      {new Date(aiStrategy.generatedAt).toLocaleString('en-SG', {
                        timeZone: 'Asia/Singapore',
                      })}
                      {aiStrategy.model ? ` · ${aiStrategy.model}` : ''}
                    </p>
                  )}

                  {aiStrategy.strategy.growthSummary && (
                    <div className="bg-white rounded-lg border border-beige-600 p-4">
                      <p className="font-semibold text-ink-900 mb-1">Growth summary</p>
                      <p className="text-ink-600 leading-relaxed">{aiStrategy.strategy.growthSummary}</p>
                      {aiStrategy.strategy.growthRate && (
                        <p className="text-xs text-ink-500 mt-2">
                          Est. ~{aiStrategy.strategy.growthRate.ordersPerWeekEstimate ?? '—'} orders/week, ~
                          {aiStrategy.strategy.growthRate.revenuePerWeekEstimate != null
                            ? formatSgd(aiStrategy.strategy.growthRate.revenuePerWeekEstimate)
                            : '—'}
                          /week ({aiStrategy.strategy.growthRate.confidence} confidence)
                        </p>
                      )}
                    </div>
                  )}

                  {aiStrategy.strategy.keyPatterns && aiStrategy.strategy.keyPatterns.length > 0 && (
                    <div className="bg-white rounded-lg border border-beige-600 p-4">
                      <p className="font-semibold text-ink-900 mb-2">Patterns found</p>
                      <ul className="list-disc pl-5 space-y-1 text-ink-600">
                        {aiStrategy.strategy.keyPatterns.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4">
                    {aiStrategy.strategy.upsellOpportunities &&
                      aiStrategy.strategy.upsellOpportunities.length > 0 && (
                        <div className="bg-white rounded-lg border border-beige-600 p-4">
                          <p className="font-semibold text-ink-900 mb-2">Upsell opportunities</p>
                          <ul className="space-y-3">
                            {aiStrategy.strategy.upsellOpportunities.map((u, i) => (
                              <li key={i} className="text-ink-600 border-l-2 border-mediterranean-400 pl-3">
                                <p className="font-medium text-ink-800">
                                  {u.segment}{' '}
                                  <span className="text-xs uppercase text-ink-400">({u.priority})</span>
                                </p>
                                <p className="text-xs mt-0.5">{u.who}</p>
                                <p className="mt-1">{u.offer}</p>
                                <p className="text-xs text-mediterranean-800 mt-1 italic">{u.messageAngle}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {aiStrategy.strategy.crossSellOpportunities &&
                      aiStrategy.strategy.crossSellOpportunities.length > 0 && (
                        <div className="bg-white rounded-lg border border-beige-600 p-4">
                          <p className="font-semibold text-ink-900 mb-2">Cross-sell opportunities</p>
                          <ul className="space-y-3">
                            {aiStrategy.strategy.crossSellOpportunities.map((c, i) => (
                              <li key={i} className="text-ink-600 border-l-2 border-amber-400 pl-3">
                                <p className="font-medium text-ink-800">
                                  {c.from} → {c.to}{' '}
                                  <span className="text-xs uppercase text-ink-400">({c.priority})</span>
                                </p>
                                <p className="text-xs mt-0.5">{c.who}</p>
                                <p className="text-xs text-mediterranean-800 mt-1 italic">{c.messageAngle}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>

                  {aiStrategy.strategy.priorityActions &&
                    aiStrategy.strategy.priorityActions.length > 0 && (
                      <div className="bg-white rounded-lg border border-beige-600 p-4">
                        <p className="font-semibold text-ink-900 mb-2">Priority actions</p>
                        <ol className="space-y-2">
                          {aiStrategy.strategy.priorityActions.map((a, i) => (
                            <li key={i} className="flex gap-2 text-ink-600">
                              <span className="font-bold text-mediterranean-700 shrink-0">{i + 1}.</span>
                              <span>
                                <strong className="text-ink-800">{a.action}</strong> — {a.why}
                                <span className="text-xs text-ink-400 block">{a.timing}</span>
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                  {aiStrategy.strategy.recommendedCampaigns &&
                    aiStrategy.strategy.recommendedCampaigns.length > 0 && (
                      <p className="text-xs text-ink-500">
                        Suggested campaigns (in order):{' '}
                        <span className="font-medium text-mediterranean-800">
                          {aiStrategy.strategy.recommendedCampaigns.join(' → ')}
                        </span>
                        .{' '}
                        <Link to="/customers/segments" className="underline">
                          Open Segments
                        </Link>
                      </p>
                    )}
                </div>
              )}

              {aiStrategy?.strategy?.parseError && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
                  <p className="font-medium">Analysis didn&apos;t finish cleanly</p>
                  <p className="text-xs mt-1">
                    The last run returned invalid JSON (usually cut off mid-response). Tap{' '}
                    <strong>Run analysis</strong> again — output limits are fixed.
                  </p>
                </div>
              )}

              {!aiStrategy?.strategy && !aiLoading && !aiError && (
                <p className="text-sm text-ink-400">
                  Tap &quot;Run analysis&quot; to get upsell / cross-sell recommendations powered by Claude.
                </p>
              )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              open={openSections.charts}
              onToggle={() => toggleSection('charts')}
              title="Charts & trends"
              subtitle="Orders and revenue by day, weekday, hour"
            >
            <section className="grid lg:grid-cols-2 gap-6 p-4">
              <div className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                  <h3 className="font-display text-base text-ink-900">Orders by day</h3>
                  <ChartTrendToggle enabled={showOrdersTrend} onChange={setShowOrdersTrend} />
                </div>
                <p className="text-xs text-ink-500 mb-2">Full date range with weekend shading</p>
                <ChartTrendSummary
                  summary={ordersChartSummary}
                  formatValue={(n) => n.toFixed(1)}
                  unitSuffix="orders"
                />
                <WeekendLegend />
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={dayChartData}>
                    <WeekendBarBands data={dayChartData} />
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d4" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9 }}
                      interval="preserveStartEnd"
                      tickFormatter={(d) =>
                        new Date(`${String(d)}T12:00:00Z`).toLocaleDateString('en-SG', {
                          timeZone: 'Asia/Singapore',
                          day: 'numeric',
                          month: 'short',
                        })
                      }
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(d) =>
                        new Date(`${String(d)}T12:00:00Z`).toLocaleDateString('en-SG', {
                          timeZone: 'Asia/Singapore',
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })
                      }
                      formatter={(value: number, name: string) => {
                        if (name === '7-day average') return [value.toFixed(2), name];
                        if (name.startsWith('Trend (since')) return [formatSgd(value), name];
                        return [value, 'Orders'];
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {dayChartData.map((entry) => (
                        <Cell key={entry.date} fill={entry.fill} />
                      ))}
                    </Bar>
                    <Area
                      type="monotone"
                      dataKey="ma7Band"
                      hide={!showOrdersTrend}
                      stroke="none"
                      fill={TREND_COLOR}
                      fillOpacity={0.12}
                      legendType="none"
                      tooltipType="none"
                      activeDot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="ma7"
                      name="7-day average"
                      hide={!showOrdersTrend}
                      stroke={TREND_COLOR}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    {ordersChartSummary?.showSteadyTrend && (
                      <Line
                        type="monotone"
                        dataKey="steadyTrend"
                        name={ordersSteadyLabel ?? 'Trend'}
                        hide={!showOrdersTrend}
                        stroke={STEADY_TREND_COLOR}
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="6 4"
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    )}
                    {showOrdersTrend && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {revenueChartData.length > 0 && (
                <div className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                    <h3 className="font-display text-base text-ink-900">Revenue by day</h3>
                    <ChartTrendToggle enabled={showRevenueTrend} onChange={setShowRevenueTrend} />
                  </div>
                  <p className="text-xs text-ink-500 mb-2">Total order value (SGD) from Grab screenshots</p>
                  <ChartTrendSummary
                    summary={revenueChartSummary}
                    formatValue={formatSgd}
                    unitSuffix=""
                  />
                  <WeekendLegend />
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={revenueChartData}>
                      <WeekendBarBands data={revenueChartData} />
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d4" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9 }}
                        interval="preserveStartEnd"
                        tickFormatter={(d) =>
                          new Date(`${String(d)}T12:00:00Z`).toLocaleDateString('en-SG', {
                            timeZone: 'Asia/Singapore',
                            day: 'numeric',
                            month: 'short',
                          })
                        }
                      />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S$${v}`} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === '7-day average') return [formatSgd(value), name];
                          if (name.startsWith('Trend (since')) return [formatSgd(value), name];
                          return [formatSgd(value), 'Revenue'];
                        }}
                        labelFormatter={(d) =>
                          new Date(`${String(d)}T12:00:00Z`).toLocaleDateString('en-SG', {
                            timeZone: 'Asia/Singapore',
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })
                        }
                      />
                      <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                        {revenueChartData.map((entry) => (
                          <Cell
                            key={entry.date}
                            fill={typeof entry.fill === 'string' ? entry.fill : '#2d6a4f'}
                          />
                        ))}
                      </Bar>
                      <Area
                        type="monotone"
                        dataKey="ma7Band"
                        hide={!showRevenueTrend}
                        stroke="none"
                        fill={TREND_COLOR}
                        fillOpacity={0.12}
                        legendType="none"
                        tooltipType="none"
                        activeDot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="ma7"
                        name="7-day average"
                        hide={!showRevenueTrend}
                        stroke={TREND_COLOR}
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                      {revenueChartSummary?.showSteadyTrend && (
                        <Line
                          type="monotone"
                          dataKey="steadyTrend"
                          name={revenueSteadyLabel ?? 'Trend'}
                          hide={!showRevenueTrend}
                          stroke={STEADY_TREND_COLOR}
                          strokeWidth={2}
                          dot={false}
                          strokeDasharray="6 4"
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      )}
                      {showRevenueTrend && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm">
                <h3 className="font-display text-base text-ink-900 mb-1">Orders by weekday</h3>
                <p className="text-xs text-ink-500 mb-2">Sat &amp; Sun highlighted</p>
                <WeekendLegend />
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={analytics.ordersByWeekday}>
                    <WeekendBarBands data={analytics.ordersByWeekday} />
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d4" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {analytics.ordersByWeekday.map((entry) => (
                        <Cell
                          key={entry.day}
                          fill={entry.isWeekend ? WEEKDAY_BAR.weekend : WEEKDAY_BAR.weekday}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm">
                <h3 className="font-display text-base text-ink-900 mb-1">First-time vs repeat</h3>
                <p className="text-xs text-ink-500 mb-4">Based on screenshot upload history</p>
                {mixData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={mixData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {mixData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-ink-400 py-8 text-center">No data</p>
                )}
              </div>

              {hourData.length > 0 && (
                <div className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm">
                  <h3 className="font-display text-base text-ink-900 mb-1">Orders by hour</h3>
                  <p className="text-xs text-ink-500 mb-4">When customers place Grab orders (Singapore time)</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={hourData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d4" />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
            </CollapsibleSection>

            <CollapsibleSection
              open={openSections.heatmap}
              onToggle={() => toggleSection('heatmap')}
              title="Order heatmap"
              subtitle="Day of week vs time of day (Singapore time)"
            >
              <div className="p-5">
              <OrderHeatmapChart
                heatmapAll={analytics.heatmapAll}
                heatmapRepeat={analytics.heatmapRepeat}
              />
              </div>
            </CollapsibleSection>

            {analytics.repeatTimelines.length > 0 && (
              <CollapsibleSection
                open={openSections.repeatCompare}
                onToggle={() => toggleSection('repeatCompare')}
                title="Compare repeat customers"
                subtitle={`${analytics.repeatTimelines.length} customer(s) — shared timeline, sorted by reorder speed`}
                icon={<GitBranch className="w-5 h-5 text-mediterranean-700 shrink-0" />}
              >
                <div className="p-4 bg-white">
                  <RepeatComparisonChart timelines={analytics.repeatTimelines} />
                </div>
              </CollapsibleSection>
            )}

            {analytics.topCustomersBySpend.length > 0 && (
              <CollapsibleSection
                open={openSections.topSpend}
                onToggle={() => toggleSection('topSpend')}
                title="Customers by order value"
                subtitle={`${analytics.topCustomersBySpend.length} customers — scroll for full list`}
                scrollable
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-500 border-b border-beige-500 bg-cream-400">
                        <th className="p-3">Customer</th>
                        <th className="p-3">Orders</th>
                        <th className="p-3">Total spend</th>
                        <th className="p-3">Avg order</th>
                        <th className="p-3">Last order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.topCustomersBySpend.map((c) => (
                        <tr key={c.contactId} className="border-b border-beige-400 last:border-0">
                          <td className="p-3">
                            <p className="font-medium text-ink-800 flex items-center gap-1.5 flex-wrap">
                              {c.name}
                              <MessagePrefChip pref={messagePrefById[c.contactId]} />
                            </p>
                            <p className="font-mono text-xs text-ink-500">
                              {c.phone?.startsWith('pending-') ? 'No phone yet' : c.phone}
                            </p>
                          </td>
                          <td className="p-3 text-ink-600">{c.orderCount}</td>
                          <td className="p-3 font-semibold text-mediterranean-800">{formatSgd(c.totalSpend)}</td>
                          <td className="p-3 text-ink-600">{formatSgd(c.avgOrderValue)}</td>
                          <td className="p-3 text-ink-600">{formatOrderTime(c.lastOrder)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            )}

            {analytics.topRepeat.length > 0 && (
              <CollapsibleSection
                open={openSections.topRepeat}
                onToggle={() => toggleSection('topRepeat')}
                title="Top repeat customers"
                subtitle="Customers with more than one logged order"
                scrollable
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-500 border-b border-beige-500 bg-cream-400">
                        <th className="p-3">Customer</th>
                        <th className="p-3">Orders</th>
                        <th className="p-3">Avg days between</th>
                        <th className="p-3">Last order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.topRepeat.map((c) => {
                        const tl = analytics.repeatTimelines.find((t) => t.contactId === c.contactId);
                        return (
                          <tr key={c.contactId} className="border-b border-beige-400 last:border-0">
                            <td className="p-3">
                              <p className="font-medium text-ink-800 flex items-center gap-1.5 flex-wrap">
                                {c.name}
                                <MessagePrefChip pref={messagePrefById[c.contactId]} />
                              </p>
                              <p className="font-mono text-xs text-ink-500">
                              {c.phone?.startsWith('pending-') ? 'No phone yet' : c.phone}
                            </p>
                            </td>
                            <td className="p-3 font-semibold text-mediterranean-800">{c.count}</td>
                            <td className="p-3 text-ink-600">
                              {tl?.avgDaysBetween != null
                                ? tl.avgDaysBetween === 0
                                  ? 'same day'
                                  : `${tl.avgDaysBetween} days`
                                : '—'}
                            </td>
                            <td className="p-3 text-ink-600">{formatOrderTime(c.lastOrder)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection
              open={openSections.recent}
              onToggle={() => toggleSection('recent')}
              title="Recent orders"
              subtitle={`${analytics.recentOrders.length} orders — scroll for full list`}
              scrollable
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-ink-500 border-b border-beige-500 bg-cream-400">
                      <th className="p-3">Customer</th>
                      <th className="p-3">Order time</th>
                      <th className="p-3">Value</th>
                      <th className="p-3">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.recentOrders.map((o) => (
                      <tr key={o.id} className="border-b border-beige-400 last:border-0">
                        <td className="p-3">
                          <p className="font-medium text-ink-800 flex items-center gap-1.5 flex-wrap">
                            {o.name}
                            <MessagePrefChip pref={messagePrefById[o.contact_id]} />
                          </p>
                          <p className="font-mono text-xs text-ink-500">
                            {o.phone?.startsWith('pending-') ? 'No phone yet' : o.phone}
                          </p>
                        </td>
                        <td className="p-3 text-ink-600">{formatOrderTime(o.ordered_at)}</td>
                        <td className="p-3 font-medium text-mediterranean-800">
                          {o.order_value != null && o.order_value > 0 ? formatSgd(o.order_value) : '—'}
                        </td>
                        <td className="p-3">
                          {o.is_first_order ? (
                            <span className="text-xs font-medium text-green-800 bg-green-100 px-2 py-0.5 rounded-full">
                              First order
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                              Returning
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          </>
        )}
      </main>
    </div>
  );
}
