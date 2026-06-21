import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OrderKpisResponse } from '@shared/orderKpis';
import { GrowthMomentumCards, WeekdayTrendChart, CHART_GRID } from '../orderCharts';
import { ChartBasisNote, formatSgd } from './KpiPrimitives';

export function MomentumBlock({ kpis }: { kpis: OrderKpisResponse }) {
  return (
    <div className="space-y-6">
      <GrowthMomentumCards momentum={kpis.momentum} weekdaySeries={kpis.momentum.weekdaySeries} />
      <div>
        <h3 className="font-display text-base text-ink-900 mb-1">Per-weekday trend</h3>
        <p className="text-xs text-ink-500 mb-3">Each line is one weekday across successive weeks.</p>
        <WeekdayTrendChart weekdayTrendChart={kpis.momentum.weekdayTrendChart} />
      </div>
    </div>
  );
}

export function CustomersBlock({ kpis }: { kpis: OrderKpisResponse }) {
  const { customers } = kpis;
  const decel = customers.deceleration;
  const decelColor =
    decel.status === 'decelerating'
      ? 'text-red-700 bg-red-50 border-red-200'
      : decel.status === 'accelerating'
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-ink-600 bg-cream-400 border-beige-600';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${decelColor}`}>
          {decel.status === 'decelerating'
            ? `Decelerating ${decel.consecutiveDecliningWeeks} wks`
            : decel.status === 'accelerating'
              ? `Accelerating ${decel.ratioLatestFullWeek ?? '—'}×`
              : decel.status === 'stable'
                ? `Stable ${decel.ratioLatestFullWeek ?? '—'}×`
                : 'Insufficient data'}
        </span>
        <span className="text-[10px] text-ink-400">{decel.basis}</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold text-ink-800 mb-2">New customers per day</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={customers.newCustomersByDay.slice(-21)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="dayLabel" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#2d6a4f" name="New customers" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-ink-800 mb-2">New customers per week</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={customers.newCustomersByWeek} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#40916c" name="New customers" />
            </BarChart>
          </ResponsiveContainer>
          <ChartBasisNote basis="hatched = partial week (excluded from deceleration)" />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Cumulative customer base</h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={customers.cumulativeCustomers} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
            <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="total" stroke="#2d6a4f" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">New vs returning orders per week</h4>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={customers.weeklyNewVsReturning} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 9 }} />
            <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="newOrders" stackId="a" fill="#2d6a4f" name="First orders" />
            <Bar dataKey="repeatOrders" stackId="a" fill="#40916c" name="Repeat orders" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RetentionBlock({ kpis }: { kpis: OrderKpisResponse }) {
  const { retention } = kpis;
  const p = retention.reorderProbability;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'p₁₄', data: p.days14 },
          { label: 'p₃₀', data: p.days30 },
          { label: 'p₆₀', data: p.days60 },
        ].map(({ label, data }) => (
          <div key={label} className="rounded-xl border border-beige-600 bg-white p-4" title={data.basis}>
            <p className="text-xs text-ink-500 uppercase">{label} reorder</p>
            <p className="text-2xl font-display text-mediterranean-800 mt-1">{data.rate}%</p>
            <p className="text-[10px] text-ink-400 mt-1">{data.numerator}/{data.denominator} eligible</p>
            <p className="text-[10px] text-ink-400 mt-0.5">{data.basis}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-ink-600">
        IPI: median <strong>{retention.ipi.medianDays ?? '—'}d</strong> · mean{' '}
        <strong>{retention.ipi.meanDays ?? '—'}d</strong> ({retention.ipi.sampleSize} gaps)
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold text-ink-800 mb-2">Repeat rate trend</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={retention.repeatRateTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 9 }} />
              <YAxis unit="%" width={36} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="repeatRate" stroke="#2d6a4f" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-ink-800 mb-2">Repeat revenue share</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={retention.repeatRevenueShareTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 9 }} />
              <YAxis unit="%" width={36} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="sharePct" stroke="#e76f51" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function FrequencyBlock({ kpis }: { kpis: OrderKpisResponse }) {
  const { frequency } = kpis;
  const id = frequency.identity;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-mediterranean-200 bg-mediterranean-50 p-5">
        <p className="text-sm font-semibold text-ink-900">Rev = N × f × AOV</p>
        <p className="text-lg font-display text-mediterranean-800 mt-2">
          {id.N} × {id.f}/wk × {formatSgd(id.aov)} = <strong>{formatSgd(id.revenuePerWeek)}/wk</strong>
        </p>
        <ChartBasisNote basis={id.basis} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-beige-600 bg-white p-4">
          <p className="text-xs text-ink-500 uppercase">N₃₀ / N₆₀</p>
          <p className="text-xl font-display mt-1">
            {frequency.activeN.days30} / {frequency.activeN.days60}
          </p>
        </div>
        <div className="rounded-xl border border-beige-600 bg-white p-4">
          <p className="text-xs text-ink-500 uppercase">f blended (monthly)</p>
          <p className="text-xl font-display mt-1">{frequency.fBlended.value}</p>
          {frequency.fBlended.inflatedWarning && (
            <p className="text-[10px] text-amber-700 mt-1">inflated by short tenure</p>
          )}
        </div>
        <div className="rounded-xl border border-beige-600 bg-white p-4">
          <p className="text-xs text-ink-500 uppercase">f steady (≥4wk)</p>
          {frequency.fSteadyState.available ? (
            <p className="text-xl font-display mt-1">{frequency.fSteadyState.value}</p>
          ) : (
            <p className="text-sm text-ink-500 mt-1 leading-snug">{frequency.fSteadyState.message}</p>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold text-ink-800 mb-2">f by weekday</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={frequency.fByWeekday} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="weekday" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={32} />
              <Tooltip />
              <Bar dataKey="ordersPerActiveCustomer" fill="#2d6a4f" name="Orders/active cust" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-ink-800 mb-2">AOV weekly trend</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={frequency.aovWeeklyTrend.filter((d) => d.aov != null)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 9 }} />
              <YAxis tickFormatter={(v) => `S$${v}`} width={48} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => formatSgd(v)} />
              <Line type="monotone" dataKey="aov" stroke="#40916c" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Revenue decomposition (monthly)</h4>
        {frequency.crossoverMonth && (
          <p className="text-xs text-mediterranean-700 mb-2">
            Repeat revenue crossed first-order revenue in {frequency.crossoverMonth}
          </p>
        )}
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={frequency.revenueDecompositionMonthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 9 }} />
            <YAxis tickFormatter={(v) => `S$${v}`} width={48} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => formatSgd(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="firstOrder" stackId="a" fill="#2d6a4f" name="First-order" />
            <Bar dataKey="repeat" stackId="a" fill="#40916c" name="Repeat" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
