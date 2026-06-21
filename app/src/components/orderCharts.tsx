import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OrderDayRow, OrderHeatmap, RepeatTimeline } from '@shared/orderAnalytics';
import type { GrowthDelta, OrderGrowthKpis, WeekdayOccurrence } from '@shared/orderGrowthKpis';
import { formatSgd } from '@shared/parseOrderValue';
import {
  enrichDayChartTrends,
  type DayChartTrendSummary,
} from '@shared/chartTrend';
import { Switch } from './ui/switch';
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from './ui/chart';

export const WEEKEND_FILL = '#e8dcc8';
export const CHART_GRID = '#e8e0d4';

const timelineChartConfig = {
  first: { label: 'First order', color: '#2d6a4f' },
  repeat: { label: 'Repeat order', color: '#40916c' },
} satisfies ChartConfig;

function parseOrderMs(iso: string): number {
  return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
}

function formatAxisDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
  });
}

function formatFullTimestamp(iso: string): string {
  return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function formatGapDays(days: number): string {
  if (days === 0) return 'same day';
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days === 1) return '1 day';
  return `${days} days`;
}

function freqLabel(avg: number | null): string {
  if (avg == null) return '—';
  if (avg === 0) return 'same day';
  if (avg < 1) return `~${Math.round(avg * 24)}h`;
  return `every ${avg}d`;
}

function addDayKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

function msToDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function weekendAreas(globalStart: number, globalEnd: number) {
  const areas: { x1: number; x2: number }[] = [];
  for (let cur = msToDateKey(globalStart); cur <= msToDateKey(globalEnd); cur = addDayKey(cur, 1)) {
    const d = new Date(`${cur}T12:00:00Z`);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) continue;
    const ms = d.getTime();
    areas.push({
      x1: ms - 43_200_000,
      x2: ms + 43_200_000,
    });
  }
  return areas;
}

interface PointPayload {
  x: number;
  xReal: number;
  y: number;
  customerName: string;
  label: string;
  timestamp: string;
  orderType: string;
  orderIndex: number;
  fill: string;
  avgFreq: string;
  gapAfter: string | null;
}

function TimelineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: PointPayload }[];
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-beige-600 bg-white px-3 py-2.5 text-xs shadow-xl min-w-[10rem]">
      <p className="font-semibold text-ink-900">{p.customerName}</p>
      <p className="text-ink-700 mt-1 font-medium">{p.timestamp}</p>
      <p className="text-mediterranean-800 mt-1">
        {p.orderType} · #{p.orderIndex}
      </p>
      <p className="text-ink-500 mt-0.5">Avg reorder: {p.avgFreq}</p>
      {p.gapAfter && (
        <p className="text-amber-800 mt-1 font-medium">Gap to next: {p.gapAfter}</p>
      )}
    </div>
  );
}

/** Minimum visual gap between dots on the same row (fraction of chart range). */
function spreadOrderXs(
  orders: { orderedAt: string }[],
  globalStart: number,
  globalEnd: number,
): number[] {
  const range = Math.max(globalEnd - globalStart, 86_400_000);
  const minGap = range * 0.025;
  const xs: number[] = [];
  for (let i = 0; i < orders.length; i++) {
    const ms = parseOrderMs(orders[i].orderedAt);
    if (i === 0) {
      xs.push(ms);
      continue;
    }
    xs.push(Math.max(ms, xs[i - 1] + minGap));
  }
  return xs;
}

function OrderDot(props: { cx?: number; cy?: number; payload?: PointPayload }) {
  const { cx = 0, cy = 0, payload } = props;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={7}
      fill={payload?.fill || '#40916c'}
      stroke="#fff"
      strokeWidth={2}
      style={{ cursor: 'pointer' }}
    />
  );
}

/** Shared-axis timeline — one row per repeat customer, each dot = one order. */
export function RepeatComparisonChart({ timelines }: { timelines: RepeatTimeline[] }) {
  if (timelines.length === 0) return null;

  const sorted = [...timelines].sort(
    (a, b) =>
      (a.avgDaysBetween ?? 999) - (b.avgDaysBetween ?? 999) ||
      b.orderCount - a.orderCount,
  );

  const rowIndexByContact = new Map(sorted.map((tl, i) => [tl.contactId, i]));

  const allMs = timelines.flatMap((t) => t.orders.map((o) => parseOrderMs(o.orderedAt)));
  const globalStart = Math.min(...allMs);
  const globalEnd = Math.max(...allMs);
  const pad = Math.max((globalEnd - globalStart) * 0.06, 86_400_000);
  const domainStart = globalStart - pad;
  const domainEnd = globalEnd + pad;
  const weekends = weekendAreas(globalStart, globalEnd);
  const chartHeight = Math.max(220, sorted.length * 56 + 72);

  const allPoints: PointPayload[] = sorted.flatMap((tl) => {
    const row = rowIndexByContact.get(tl.contactId) ?? 0;
    const xs = spreadOrderXs(tl.orders, domainStart, domainEnd);
    return tl.orders.map((o, i) => ({
      x: xs[i],
      xReal: parseOrderMs(o.orderedAt),
      y: row,
      customerName: tl.name || 'Unknown',
      label: o.label,
      timestamp: formatFullTimestamp(o.orderedAt),
      orderType: i === 0 ? 'First order' : 'Repeat order',
      orderIndex: i + 1,
      fill: i === 0 ? '#2d6a4f' : '#40916c',
      avgFreq: freqLabel(tl.avgDaysBetween),
      gapAfter: tl.gaps[i] ? formatGapDays(tl.gaps[i].days) : null,
    }));
  });

  const yTicks = sorted.map((_, i) => i);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
        <span className="inline-block w-8 h-3 rounded-sm border border-beige-500 bg-[#e8dcc8]" />
        <span>Saturday &amp; Sunday</span>
        <span className="text-ink-300">|</span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-[#2d6a4f]" /> First order
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-[#40916c]" /> Repeat order
        </span>
      </div>

      <ChartContainer
        config={timelineChartConfig}
        className="w-full aspect-auto"
        style={{ height: chartHeight }}
      >
        <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical horizontal />
          {weekends.map((w, i) => (
            <ReferenceArea
              key={i}
              x1={w.x1}
              x2={w.x2}
              strokeOpacity={0}
              fill={WEEKEND_FILL}
              fillOpacity={0.55}
              ifOverflow="extendDomain"
            />
          ))}
          <XAxis
            type="number"
            dataKey="x"
            domain={[domainStart, domainEnd]}
            tickFormatter={formatAxisDate}
            tick={{ fontSize: 10, fill: '#6b6560' }}
            axisLine={{ stroke: CHART_GRID }}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[-0.5, sorted.length - 0.5]}
            reversed
            ticks={yTicks}
            tickFormatter={(row) => {
              const tl = sorted[row as number];
              if (!tl) return '';
              const freq = freqLabel(tl.avgDaysBetween);
              return `${tl.name || 'Unknown'} (${freq})`;
            }}
            width={128}
            tick={{ fontSize: 10, fill: '#3d3832' }}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip cursor={{ strokeDasharray: '3 3' }} content={<TimelineTooltip />} />
          <Scatter data={allPoints} shape={OrderDot} />
        </ScatterChart>
      </ChartContainer>

      <p className="text-[11px] text-ink-500 text-center">
        Fastest reorder at top · hover a dot for exact time and gap to next order
      </p>
    </div>
  );
}

export function WeekendBarBands({
  data,
}: {
  data: { date?: string; day?: string; isWeekend?: boolean }[];
}) {
  const keyField = data[0]?.date ? 'date' : 'day';
  return (
    <>
      {data.map((d) =>
        d.isWeekend ? (
          <ReferenceArea
            key={String(d[keyField as keyof typeof d])}
            x1={d[keyField as keyof typeof d] as string}
            x2={d[keyField as keyof typeof d] as string}
            strokeOpacity={0}
            fill={WEEKEND_FILL}
            fillOpacity={0.9}
            ifOverflow="extendDomain"
          />
        ) : null,
      )}
    </>
  );
}

export function WeekendLegend({ compact }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-xs text-ink-500 ${compact ? '' : 'mb-3'}`}>
      <span className="inline-block w-8 h-3 rounded-sm border border-beige-500 bg-[#e8dcc8]" />
      <span>Saturday &amp; Sunday</span>
    </div>
  );
}

export function enrichDayChartData(data: OrderDayRow[]) {
  return data.map((d) => ({
    ...d,
    fill: d.isWeekend ? '#40916c' : '#2d6a4f',
  }));
}

const TREND_COLOR = '#e76f51';
export const STEADY_TREND_COLOR = '#40916c';

export function ChartTrendToggle({
  enabled,
  onChange,
  label = 'Trend line',
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-ink-500 cursor-pointer select-none">
      <Switch checked={enabled} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

export function prepareOrdersByDayChart(data: OrderDayRow[]) {
  const base = enrichDayChartData(data);
  return enrichDayChartTrends(base, 'count', 'count');
}

export function prepareRevenueByDayChart(data: OrderDayRow[]) {
  const base = data.map((d) => ({
    ...d,
    fill: d.isWeekend ? '#40916c' : '#2d6a4f',
  }));
  return enrichDayChartTrends(base, 'revenue', 'count');
}

function formatTrendDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
  });
}

export function ChartTrendSummary({
  summary,
  formatValue,
  unitSuffix,
}: {
  summary: DayChartTrendSummary | null;
  formatValue: (n: number) => string;
  unitSuffix: string;
}) {
  if (!summary) return null;
  const { weekOverWeek: wow, bestWeekday: best } = summary;
  const arrow =
    wow.delta != null && wow.delta > 0
      ? '▲'
      : wow.delta != null && wow.delta < 0
        ? '▼'
        : '→';
  const deltaClass =
    wow.delta != null && wow.delta > 0
      ? 'text-green-700'
      : wow.delta != null && wow.delta < 0
        ? 'text-red-700'
        : 'text-ink-600';

  return (
    <div className="text-xs text-ink-500 mt-1 space-y-0.5">
      <p>
        Last 7 days:{' '}
        <span className="font-medium text-ink-700">
          {formatValue(wow.recentMean)}
          {unitSuffix ? ` ${unitSuffix}` : ''}/day
        </span>
        {wow.hasPrior && wow.priorMean != null && (
          <>
            {' '}
            (<span className={deltaClass}>{arrow}</span> vs{' '}
            {formatValue(wow.priorMean)} prior 7 days
            {wow.deltaPct != null && (
              <span className={deltaClass}>
                , {wow.deltaPct > 0 ? '+' : ''}
                {wow.deltaPct}%
              </span>
            )}
            )
          </>
        )}
      </p>
      {best && (
        <p>
          Best day of week:{' '}
          <span className="font-medium text-ink-700">{best.weekday}</span> (avg{' '}
          {formatValue(best.avg)})
        </p>
      )}
    </div>
  );
}

export function steadyTrendLabel(fromDate: string | null): string | null {
  if (!fromDate) return null;
  return `Trend (since ${formatTrendDate(fromDate)})`;
}

export { TREND_COLOR };

const WEEKDAY_LINE_COLORS: Record<string, string> = {
  Mon: '#2d6a4f',
  Tue: '#40916c',
  Wed: '#52b788',
  Thu: '#95d5b2',
  Fri: '#f4a261',
  Sat: '#e76f51',
  Sun: '#e9c46a',
};

const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type WeekdayName = (typeof WEEKDAY_ORDER)[number];

function weekStartFromDateKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getDefaultCompareWeekday(momentum: OrderGrowthKpis['momentum'], weekdaySeries: OrderGrowthKpis['weekdaySeries']): WeekdayName {
  const todayWd = momentum.todayWeekday.weekday as WeekdayName;
  if (momentum.todayWeekday.orders.current > 0 || momentum.todayWeekday.revenue.current > 0) {
    return todayWd;
  }
  const todayDate = momentum.todayWeekday.date;
  const thisWeekStart = weekStartFromDateKey(todayDate);
  let best: { wd: WeekdayName; date: string } | null = null;
  for (const s of weekdaySeries) {
    const occ = s.occurrences.at(-1);
    if (!occ || occ.date < thisWeekStart || occ.date > todayDate) continue;
    if (occ.orders > 0 || occ.revenue > 0) {
      if (!best || occ.date > best.date) best = { wd: s.weekday as WeekdayName, date: occ.date };
    }
  }
  return best?.wd ?? todayWd;
}

function buildWeekdayComparison(occ: WeekdayOccurrence, prior: WeekdayOccurrence | null, todayDate: string) {
  const priorLabel = prior?.dayLabel ?? `previous ${occ.weekday}`;
  const basisSuffix = `(previous ${occ.weekday})`;

  const orders: GrowthDelta = occ.wowOrders ?? {
    current: occ.orders,
    prior: prior?.orders ?? 0,
    delta: occ.orders - (prior?.orders ?? 0),
    deltaPct:
      prior && prior.orders > 0
        ? Math.round(((occ.orders - prior.orders) / prior.orders) * 10000) / 100
        : occ.orders > 0
          ? 100
          : 0,
    basis: prior ? `vs ${priorLabel} ${basisSuffix}` : `first ${occ.weekday} on record`,
  };

  const revenue: GrowthDelta = occ.wowRevenue ?? {
    current: occ.revenue,
    prior: prior?.revenue ?? 0,
    delta: Math.round((occ.revenue - (prior?.revenue ?? 0)) * 100) / 100,
    deltaPct:
      prior && prior.revenue > 0
        ? Math.round(((occ.revenue - prior.revenue) / prior.revenue) * 10000) / 100
        : occ.revenue > 0
          ? 100
          : 0,
    basis: prior ? `vs ${priorLabel} ${basisSuffix}` : `first ${occ.weekday} on record`,
  };

  const newCustomers: GrowthDelta = {
    current: occ.newCustomers,
    prior: prior?.newCustomers ?? 0,
    delta: occ.newCustomers - (prior?.newCustomers ?? 0),
    deltaPct:
      prior && prior.newCustomers > 0
        ? Math.round(((occ.newCustomers - prior.newCustomers) / prior.newCustomers) * 10000) / 100
        : occ.newCustomers > 0
          ? 100
          : 0,
    basis: prior ? `vs ${priorLabel} ${basisSuffix}` : `first ${occ.weekday} on record`,
  };

  const aov: GrowthDelta | null =
    occ.orders > 0 || (prior?.orders ?? 0) > 0
      ? {
          current: occ.aov ?? 0,
          prior: prior?.aov ?? 0,
          delta: Math.round(((occ.aov ?? 0) - (prior?.aov ?? 0)) * 100) / 100,
          deltaPct:
            prior?.aov && prior.aov > 0
              ? Math.round((((occ.aov ?? 0) - prior.aov) / prior.aov) * 10000) / 100
              : null,
          basis: prior ? `AOV vs ${priorLabel} ${basisSuffix}` : `AOV — first ${occ.weekday}`,
        }
      : null;

  return {
    weekday: occ.weekday,
    date: occ.date,
    dayLabel: occ.dayLabel,
    isToday: occ.date === todayDate,
    orders,
    revenue,
    aov,
    newCustomers,
    vs4WeekAvg: {
      orders: {
        value: occ.orders,
        avg: occ.vs4WeekAvgOrders ?? 0,
        deltaPct: occ.vs4WeekAvgOrdersDeltaPct,
        basis: `this ${occ.weekday} vs trailing 4-${occ.weekday} average`,
      },
      revenue: {
        value: occ.revenue,
        avg: occ.vs4WeekAvgRevenue ?? 0,
        deltaPct: occ.vs4WeekAvgRevenueDeltaPct,
        basis: `this ${occ.weekday} vs trailing 4-${occ.weekday} average`,
      },
    },
  };
}

function formatDeltaPct(pct: number | null | undefined): string {
  if (pct == null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

function deltaColor(delta: number | null | undefined): string {
  if (delta == null || delta === 0) return 'text-ink-600';
  return delta > 0 ? 'text-green-700' : 'text-red-700';
}

function MomentumCard({
  label,
  delta,
  formatValue,
  subLabel,
}: {
  label: string;
  delta: GrowthDelta;
  formatValue: (n: number) => string;
  subLabel?: string;
}) {
  return (
    <div
      className="rounded-xl border border-beige-600 bg-white p-4"
      title={delta.basis}
    >
      <p className="text-xs text-ink-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-display text-mediterranean-800 mt-1">{formatValue(delta.current)}</p>
      <p className={`text-sm font-medium mt-1 ${deltaColor(delta.delta)}`}>
        {delta.delta >= 0 ? '+' : ''}
        {formatValue(delta.delta)} ({formatDeltaPct(delta.deltaPct)})
      </p>
      <p className="text-[10px] text-ink-400 mt-1.5 leading-snug">{delta.basis}</p>
      {subLabel && <p className="text-[10px] text-ink-500 mt-0.5">{subLabel}</p>}
    </div>
  );
}

function getWeekdayOccurrences(
  weekdaySeries: OrderGrowthKpis['weekdaySeries'],
  wd: WeekdayName,
  todayDate: string,
): { latest: WeekdayOccurrence | null; prior: WeekdayOccurrence | null } {
  const series = weekdaySeries.find((s) => s.weekday === wd);
  const occs = series?.occurrences ?? [];
  if (occs.length === 0) return { latest: null, prior: null };

  const thisWeekStart = weekStartFromDateKey(todayDate);
  const inWeek = occs.filter((o) => o.date >= thisWeekStart && o.date <= todayDate);
  const latest = inWeek.at(-1) ?? occs.at(-1)!;
  const idx = occs.findIndex((o) => o.date === latest.date);
  const prior = idx > 0 ? occs[idx - 1] : null;
  return { latest, prior };
}

function WeekdayComparePicker({
  selected,
  onSelect,
  todayWeekday,
  weekdaySeries,
  todayDate,
}: {
  selected: WeekdayName;
  onSelect: (wd: WeekdayName) => void;
  todayWeekday: WeekdayName;
  weekdaySeries: OrderGrowthKpis['weekdaySeries'];
  todayDate: string;
}) {
  const thisWeekStart = weekStartFromDateKey(todayDate);

  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAY_ORDER.map((wd) => {
        const { latest: occ } = getWeekdayOccurrences(weekdaySeries, wd, todayDate);
        const inThisWeek = occ && occ.date >= thisWeekStart && occ.date <= todayDate;
        const isToday = wd === todayWeekday;
        const isSelected = wd === selected;
        const isWeekend = wd === 'Sat' || wd === 'Sun';
        const hasData = occ && (occ.orders > 0 || occ.revenue > 0);

        return (
          <button
            key={wd}
            type="button"
            onClick={() => onSelect(wd)}
            title={
              occ
                ? `${occ.dayLabel}${hasData ? ` · ${occ.orders} orders` : ''}${isToday ? ' · today' : ''}`
                : `No ${wd} data yet`
            }
            className={`inline-flex flex-col items-center min-w-[2.75rem] px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${
              isSelected
                ? 'bg-mediterranean-700 text-white border-mediterranean-700 shadow-sm'
                : isWeekend
                  ? 'bg-mediterranean-50 text-mediterranean-800 border-beige-600 hover:bg-mediterranean-100'
                  : 'bg-white text-ink-700 border-beige-600 hover:bg-cream-400'
            } ${!inThisWeek && !isToday ? 'opacity-45' : ''}`}
          >
            <span>{wd}</span>
            {hasData && inThisWeek && (
              <span className={`text-[10px] font-normal mt-0.5 ${isSelected ? 'text-mediterranean-100' : 'text-ink-400'}`}>
                {occ.orders}
              </span>
            )}
            {isToday && (
              <span
                className={`text-[9px] uppercase tracking-wide mt-0.5 ${
                  isSelected ? 'text-mediterranean-200' : 'text-mediterranean-600'
                }`}
              >
                today
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Vs4WeekAvgCard({
  label,
  value,
  avg,
  deltaPct,
  basis,
  formatValue,
}: {
  label: string;
  value: number;
  avg: number;
  deltaPct: number | null;
  basis: string;
  formatValue: (n: number) => string;
}) {
  return (
    <div className="rounded-xl border border-beige-600 bg-mediterranean-50 p-4" title={basis}>
      <p className="text-xs text-ink-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-display text-mediterranean-800 mt-1">
        {formatValue(value)}
        <span className="text-sm text-ink-500 font-normal ml-2">avg {formatValue(avg)}</span>
      </p>
      <p className={`text-sm font-medium mt-1 ${deltaColor(deltaPct)}`}>{formatDeltaPct(deltaPct)}</p>
      <p className="text-[10px] text-ink-400 mt-1">{basis}</p>
    </div>
  );
}

export function GrowthMomentumCards({
  momentum,
  weekdaySeries,
}: {
  momentum: OrderGrowthKpis['momentum'];
  weekdaySeries: OrderGrowthKpis['weekdaySeries'];
}) {
  const { rolling7d, todayWeekday } = momentum;
  const todayDate = todayWeekday.date;
  const todayWd = todayWeekday.weekday as WeekdayName;

  const [selectedWd, setSelectedWd] = useState<WeekdayName>(() =>
    getDefaultCompareWeekday(momentum, weekdaySeries),
  );

  const { latest: latestOcc, prior: priorOcc } = getWeekdayOccurrences(
    weekdaySeries,
    selectedWd,
    todayDate,
  );

  const compare = latestOcc ? buildWeekdayComparison(latestOcc, priorOcc, todayDate) : null;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Rolling 7 days vs prior 7 days</h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MomentumCard label="Orders" delta={rolling7d.orders} formatValue={(n) => String(n)} />
          <MomentumCard label="Revenue" delta={rolling7d.revenue} formatValue={formatSgd} />
          <MomentumCard label="AOV" delta={rolling7d.aov} formatValue={formatSgd} />
          <MomentumCard
            label="New customers"
            delta={rolling7d.newCustomers}
            formatValue={(n) => String(n)}
          />
        </div>
        <p className="text-[10px] text-ink-400 mt-2">
          {rolling7d.windowStart} → {rolling7d.windowEnd} vs {rolling7d.priorWindowStart} →{' '}
          {rolling7d.priorWindowEnd}
        </p>
      </div>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
          <div>
            <h4 className="text-sm font-semibold text-ink-800">Same weekday comparison</h4>
            <p className="text-xs text-ink-500 mt-0.5">
              Pick any day — always compared to the previous same weekday, never mixed days.
            </p>
          </div>
          <WeekdayComparePicker
            selected={selectedWd}
            onSelect={setSelectedWd}
            todayWeekday={todayWd}
            weekdaySeries={weekdaySeries}
            todayDate={todayDate}
          />
        </div>

        {compare ? (
          <>
            <p className="text-xs text-mediterranean-800 font-medium mb-3">
              {compare.dayLabel}
              {compare.isToday ? ' · today' : ''}
              {compare.orders.basis !== `first ${compare.weekday} on record` && (
                <span className="text-ink-500 font-normal"> — {compare.orders.basis}</span>
              )}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MomentumCard label="Orders" delta={compare.orders} formatValue={(n) => String(n)} />
              <MomentumCard label="Revenue" delta={compare.revenue} formatValue={formatSgd} />
              {compare.aov ? (
                <MomentumCard label="AOV" delta={compare.aov} formatValue={formatSgd} />
              ) : (
                <div className="rounded-xl border border-beige-600 bg-cream-400/50 p-4">
                  <p className="text-xs text-ink-500 uppercase tracking-wide">AOV</p>
                  <p className="text-2xl font-display text-ink-400 mt-1">—</p>
                </div>
              )}
              <MomentumCard
                label="New customers"
                delta={compare.newCustomers}
                formatValue={(n) => String(n)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Vs4WeekAvgCard
                label={`Orders vs 4-week ${compare.weekday} avg`}
                value={compare.vs4WeekAvg.orders.value}
                avg={compare.vs4WeekAvg.orders.avg}
                deltaPct={compare.vs4WeekAvg.orders.deltaPct}
                basis={compare.vs4WeekAvg.orders.basis}
                formatValue={(n) => String(n)}
              />
              <Vs4WeekAvgCard
                label={`Revenue vs 4-week ${compare.weekday} avg`}
                value={compare.vs4WeekAvg.revenue.value}
                avg={compare.vs4WeekAvg.revenue.avg}
                deltaPct={compare.vs4WeekAvg.revenue.deltaPct}
                basis={compare.vs4WeekAvg.revenue.basis}
                formatValue={formatSgd}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-400 py-4">No {selectedWd} data yet.</p>
        )}
      </div>
    </div>
  );
}

export function WeekdayTrendChart({
  weekdayTrendChart,
}: {
  weekdayTrendChart: OrderGrowthKpis['weekdayTrendChart'];
}) {
  const maxLen = Math.max(...weekdayTrendChart.series.map((s) => s.points.length), 0);
  if (maxLen === 0) return <p className="text-sm text-ink-400">Not enough data yet.</p>;

  const chartData = Array.from({ length: maxLen }, (_, i) => {
    const row: Record<string, string | number> = { idx: i + 1 };
    for (const s of weekdayTrendChart.series) {
      const pt = s.points[i];
      if (pt) {
        row[s.weekday] = pt.orders;
        row[`${s.weekday}_label`] = pt.weekLabel;
        row[`${s.weekday}_date`] = pt.date;
      }
    }
    return row;
  });

  const activeWeekdays = weekdayTrendChart.series.filter((s) => s.points.length > 0);

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">
        Each line tracks one weekday across successive weeks — Saturdays only compare to Saturdays.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis
            dataKey="idx"
            tick={{ fontSize: 11 }}
            label={{ value: 'Week #', position: 'insideBottom', offset: -4, fontSize: 11 }}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-beige-600 bg-white px-3 py-2.5 text-xs shadow-xl">
                  <p className="font-semibold text-ink-900">Occurrence #{label}</p>
                  {payload.map((p) => {
                    const wd = String(p.dataKey);
                    const dateLabel = (p.payload as Record<string, string>)[`${wd}_label`];
                    return (
                      <p key={wd} style={{ color: p.color }} className="mt-1">
                        <span className="font-medium">{wd}</span>: {p.value} orders
                        {dateLabel ? <span className="text-ink-500"> · {dateLabel}</span> : null}
                      </p>
                    );
                  })}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {activeWeekdays.map((s) => (
            <Line
              key={s.weekday}
              type="monotone"
              dataKey={s.weekday}
              stroke={WEEKDAY_LINE_COLORS[s.weekday] || '#2d6a4f'}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CustomerGrowthCharts({ customers }: { customers: OrderGrowthKpis['customers'] }) {
  const cumData = customers.cumulativeCustomers.map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">New customers per week</h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={customers.newCustomersByWeek} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#2d6a4f" strokeWidth={2} dot={{ r: 3 }} name="New customers" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Cumulative customer base</h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={cumData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
            <Tooltip />
            <Line type="monotone" dataKey="total" stroke="#40916c" strokeWidth={2} dot={false} name="Total customers" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="lg:col-span-2">
        <h4 className="text-sm font-semibold text-ink-800 mb-2">New vs returning orders per week</h4>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={customers.weeklyNewVsReturning} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="newOrders" stroke="#2d6a4f" strokeWidth={2} name="First orders" />
            <Line type="monotone" dataKey="repeatOrders" stroke="#40916c" strokeWidth={2} name="Repeat orders" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RetentionGrowthCharts({ retention }: { retention: OrderGrowthKpis['retention'] }) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Repeat customers per week (2+ orders)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={retention.weeklyRepeatCustomers} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#40916c" strokeWidth={2} dot={{ r: 3 }} name="Customers" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Repeat order rate (%)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={retention.repeatRateTrend} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} width={36} unit="%" />
            <Tooltip formatter={(v: number) => [`${v}%`, 'Repeat rate']} />
            <Line type="monotone" dataKey="repeatRate" stroke="#2d6a4f" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Repeat revenue share (%)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={retention.repeatRevenueShareTrend} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} width={36} unit="%" />
            <Tooltip formatter={(v: number) => [`${v}%`, 'Share']} />
            <Line type="monotone" dataKey="sharePct" stroke="#e76f51" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Cohort reorder rate (first-order week)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={retention.cohortReorder} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} width={36} unit="%" />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="reorder14dPct" stroke="#52b788" strokeWidth={2} name="Within 14d" />
            <Line type="monotone" dataKey="reorder30dPct" stroke="#2d6a4f" strokeWidth={2} name="Within 30d" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Median days to 2nd order</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={retention.medianDaysToSecondOrderTrend} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} width={32} />
            <Tooltip />
            <Line type="monotone" dataKey="medianDays" stroke="#f4a261" strokeWidth={2} dot={{ r: 3 }} name="Days" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Avg orders per active customer</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={retention.avgOrdersPerCustomerTrend} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} width={28} />
            <Tooltip />
            <Line type="monotone" dataKey="avg" stroke="#40916c" strokeWidth={2} dot={{ r: 3 }} name="Avg orders" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function EconomicsGrowthCharts({ economics }: { economics: OrderGrowthKpis['economics'] }) {
  const aovData = economics.aovByWeekday.map((d) => ({
    ...d,
    aovDisplay: d.aov ?? 0,
  }));

  const { weekend, weekday } = economics.weekendVsWeekday;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">AOV by weekday</h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={aovData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="weekday" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v: number) => [formatSgd(v), 'AOV']} />
            <Line type="monotone" dataKey="aovDisplay" stroke="#2d6a4f" strokeWidth={2} dot={{ r: 4 }} name="AOV" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-beige-600 bg-white p-4">
          <p className="text-xs text-ink-500 uppercase tracking-wide">Weekday (Mon–Fri)</p>
          <p className="text-lg font-display text-mediterranean-800 mt-1">
            {weekday.orders} orders · {formatSgd(weekday.revenue)}
          </p>
          <p className="text-sm text-ink-600 mt-1">
            {weekday.orderSharePct}% of orders · {weekday.revenueSharePct}% of revenue
          </p>
        </div>
        <div className="rounded-xl border border-beige-600 bg-mediterranean-50 p-4">
          <p className="text-xs text-ink-500 uppercase tracking-wide">Weekend (Sat–Sun)</p>
          <p className="text-lg font-display text-mediterranean-800 mt-1">
            {weekend.orders} orders · {formatSgd(weekend.revenue)}
          </p>
          <p className="text-sm text-ink-600 mt-1">
            {weekend.orderSharePct}% of orders · {weekend.revenueSharePct}% of revenue
          </p>
        </div>
      </div>
    </div>
  );
}

const HEATMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const HEATMAP_HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel12(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function heatmapCellColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return '#f5f0e8';
  const t = count / maxCount;
  if (t < 0.25) return '#d8f3dc';
  if (t < 0.5) return '#95d5b2';
  if (t < 0.75) return '#52b788';
  return '#2d6a4f';
}

function heatmapTextColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return 'transparent';
  return count / maxCount >= 0.5 ? '#fff' : '#1b4332';
}

interface HeatmapHover {
  day: string;
  hourLabel: string;
  count: number;
  isWeekend: boolean;
  isPeak: boolean;
  left: number;
  top: number;
}

function HeatmapCellTooltip({
  hover,
  mode,
}: {
  hover: HeatmapHover | null;
  mode: 'repeat' | 'all';
}) {
  if (!hover || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[200] rounded-lg border border-beige-600 bg-white px-3 py-2.5 text-xs shadow-xl min-w-[10rem]"
      style={{
        left: hover.left,
        top: hover.top - 10,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <p className="font-semibold text-ink-900">
        {hover.day} · {hover.hourLabel}
        {hover.isWeekend ? (
          <span className="font-normal text-mediterranean-700"> · weekend</span>
        ) : null}
      </p>
      <p className="text-ink-700 mt-1 font-medium">
        {hover.count === 0
          ? 'No orders'
          : `${hover.count} order${hover.count !== 1 ? 's' : ''}`}
      </p>
      <p className="text-ink-500 mt-0.5">
        {mode === 'repeat' ? 'Returning customers' : 'All customers'} · Singapore time
      </p>
      {hover.isPeak && hover.count > 0 && (
        <p className="text-amber-800 mt-1 font-medium">Peak slot for this view</p>
      )}
    </div>,
    document.body,
  );
}

/** Day-of-week × hour heatmap — when repeat (or all) customers order most. */
export function OrderHeatmapChart({
  heatmapAll,
  heatmapRepeat,
}: {
  heatmapAll: OrderHeatmap;
  heatmapRepeat: OrderHeatmap;
}) {
  const [mode, setMode] = useState<'repeat' | 'all'>('repeat');
  const [hovered, setHovered] = useState<HeatmapHover | null>(null);
  const heatmap = mode === 'repeat' ? heatmapRepeat : heatmapAll;
  const { cells, maxCount, peakSlot } = heatmap;

  const cellMap = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-beige-600 bg-cream-400 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('repeat')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              mode === 'repeat'
                ? 'bg-white text-mediterranean-800 shadow-sm'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            Repeat orders
          </button>
          <button
            type="button"
            onClick={() => setMode('all')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              mode === 'all'
                ? 'bg-white text-mediterranean-800 shadow-sm'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            All orders
          </button>
        </div>
        {peakSlot && peakSlot.count > 0 && (
          <p className="text-xs text-ink-500">
            Peak: <span className="font-medium text-mediterranean-800">{peakSlot.day} {peakSlot.hourLabel}</span>
            {' '}({peakSlot.count} order{peakSlot.count > 1 ? 's' : ''})
          </p>
        )}
      </div>

      <WeekendLegend compact />

      <HeatmapCellTooltip hover={hovered} mode={mode} />

      <div
        className="overflow-x-auto -mx-1 px-1"
        onMouseLeave={() => setHovered(null)}
      >
        <div
          className="min-w-[36rem] grid gap-px"
          style={{
            gridTemplateColumns: '2.75rem repeat(24, minmax(1.25rem, 1fr))',
          }}
        >
          <div />
          {HEATMAP_HOURS.map((h) => (
            <div
              key={h}
              className="text-[9px] text-ink-400 text-center pb-1 leading-none"
              title={cells.find((c) => c.hour === h)?.hourLabel}
            >
              {h % 3 === 0 ? (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`) : ''}
            </div>
          ))}

          {HEATMAP_DAYS.map((day) => {
            const isWeekend = day === 'Sat' || day === 'Sun';
            return (
              <div key={day} className="contents">
                <div
                  className={`text-xs font-medium pr-2 flex items-center justify-end ${
                    isWeekend ? 'text-mediterranean-800' : 'text-ink-600'
                  }`}
                >
                  {day}
                </div>
                {HEATMAP_HOURS.map((hour) => {
                  const cell = cellMap.get(`${day}-${hour}`);
                  const count = cell?.count ?? 0;
                  const bg = heatmapCellColor(count, maxCount);
                  const fg = heatmapTextColor(count, maxCount);
                  const isPeak =
                    peakSlot?.day === day && peakSlot?.hour === hour && count > 0;
                  return (
                    <div
                      key={`${day}-${hour}`}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHovered({
                          day,
                          hourLabel: cell?.hourLabel ?? hourLabel12(hour),
                          count,
                          isWeekend,
                          isPeak: Boolean(isPeak),
                          left: rect.left + rect.width / 2,
                          top: rect.top,
                        });
                      }}
                      className={`aspect-square rounded-sm flex items-center justify-center text-[10px] font-semibold tabular-nums cursor-default transition-transform hover:scale-110 hover:z-10 relative ${
                        isWeekend ? 'ring-1 ring-inset ring-[#e8dcc8]/80' : ''
                      } ${isPeak ? 'ring-2 ring-amber-500 ring-offset-1' : ''} ${
                        hovered?.day === day && hovered?.hourLabel === (cell?.hourLabel ?? hourLabel12(hour))
                          ? 'ring-2 ring-mediterranean-600 ring-offset-1 z-20'
                          : ''
                      }`}
                      style={{ backgroundColor: bg, color: fg }}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-[10px] text-ink-500">
        <span>Low</span>
        <div className="flex h-3 rounded overflow-hidden border border-beige-500">
          {['#f5f0e8', '#d8f3dc', '#95d5b2', '#52b788', '#2d6a4f'].map((c) => (
            <span key={c} className="w-6 h-full" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span>High</span>
      </div>

      <p className="text-[11px] text-ink-500 text-center">
        Singapore time · darker = more orders · hover for details
      </p>
    </div>
  );
}
