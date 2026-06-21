import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OrderProjectionResponse } from '@shared/orderProjectionTypes';
import {
  SCENARIO_DEFAULTS,
  buildChartSeries,
  buildProjectionSummary,
  runAllScenarios,
} from '@shared/orderProjection.js';
import { CHART_GRID } from '../orderCharts';
import { ChartBasisNote, formatSgd } from './KpiPrimitives';

const API_URL = import.meta.env.VITE_API_URL || '';

type Horizon = 13 | 26;

interface ScenarioParams {
  gNew: number;
  rWeeklyMultiplier: number;
  rGrow: number;
  aovMultiplier: number;
}

interface Assumptions {
  new0: number;
  foAOV: number;
  repAOV: number;
  rWeekly: number;
  cum0: number;
  activeBase0: number;
  low: ScenarioParams;
  base: ScenarioParams;
  high: ScenarioParams;
}

function assumptionsFromApi(data: OrderProjectionResponse): Assumptions {
  return {
    new0: data.defaults.new0,
    foAOV: data.defaults.foAOV,
    repAOV: data.defaults.repAOV,
    rWeekly: data.defaults.rWeekly,
    cum0: data.defaults.cum0,
    activeBase0: data.defaults.activeBase0,
    low: { ...SCENARIO_DEFAULTS.low },
    base: { ...SCENARIO_DEFAULTS.base },
    high: { ...SCENARIO_DEFAULTS.high },
  };
}

function formatUpdatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-SG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function RangeSummary({
  label,
  base,
  low,
  high,
  format,
}: {
  label: string;
  base: number;
  low: number;
  high: number;
  format: (n: number) => string;
}) {
  return (
    <div className="rounded-xl border border-beige-600 bg-white p-4">
      <p className="text-xs text-ink-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-display text-mediterranean-800 mt-1">{format(base)}</p>
      <p className="text-xs text-ink-400 mt-1">
        {format(low)} – {format(high)}
      </p>
    </div>
  );
}

function ProjectionChart({
  data,
  horizon,
  actualKey,
  baseKey,
  lowKey,
  highKey,
  title,
  formatValue,
}: {
  data: Record<string, unknown>[];
  horizon: Horizon;
  actualKey: string;
  baseKey: string;
  lowKey: string;
  highKey: string;
  title: string;
  formatValue: (n: number) => string;
}) {
  const slice = data
    .filter((d) => {
      const wi = d.weekIndex as number;
      return wi <= 0 || wi <= horizon;
    })
    .map((d) => {
      const low = d[lowKey] as number | undefined;
      const high = d[highKey] as number | undefined;
      return {
        ...d,
        bandBase: low ?? null,
        bandSpan: low != null && high != null ? high - low : null,
      };
    });

  const todayLabel = (slice.find((d) => (d as { weekIndex?: number }).weekIndex === 0) as { weekLabel?: string } | undefined)?.weekLabel;

  return (
    <div>
      <h4 className="text-sm font-semibold text-ink-800 mb-2">{title}</h4>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={slice} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="weekLabel" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={(v) => formatValue(v).replace('S$', '$')} />
          <Tooltip
            formatter={(v: number, name: string) => [formatValue(v), name]}
            labelFormatter={(l) => String(l)}
          />
          {todayLabel ? (
            <ReferenceLine x={todayLabel} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'today', fontSize: 10 }} />
          ) : null}
          <Area type="monotone" dataKey="bandBase" stackId="band" stroke="none" fill="transparent" legendType="none" />
          <Area
            type="monotone"
            dataKey="bandSpan"
            stackId="band"
            stroke="none"
            fill="#95d5b2"
            fillOpacity={0.35}
            name="Low–high range"
          />
          <Line type="monotone" dataKey={actualKey} stroke="#2d6a4f" strokeWidth={2} dot={{ r: 2 }} name="Actual" connectNulls />
          <Line type="monotone" dataKey={baseKey} stroke="#40916c" strokeWidth={2} strokeDasharray="4 2" dot={false} name="Base forecast" connectNulls />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectionPanel() {
  const [apiData, setApiData] = useState<OrderProjectionResponse | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(13);
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [manualOverrides, setManualOverrides] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/orders/projection`);
      if (!res.ok) return;
      const data: OrderProjectionResponse = await res.json();
      setApiData(data);
      if (!manualOverrides) {
        setAssumptions(assumptionsFromApi(data));
      } else {
        setAssumptions((prev) =>
          prev
            ? {
                ...assumptionsFromApi(data),
                low: prev.low,
                base: prev.base,
                high: prev.high,
              }
            : assumptionsFromApi(data),
        );
      }
    } catch {
      // offline
    }
  }, [manualOverrides]);

  useEffect(() => {
    localStorage.removeItem('dolce_projection_assumptions');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const computed = useMemo(() => {
    if (!apiData || !assumptions) return null;
    if (!manualOverrides) {
      return {
        scenarios: apiData.scenarios,
        summary: apiData.summary,
        chartSeries: apiData.chartSeries,
      };
    }
    const baselines = {
      new0: assumptions.new0,
      foAOV: assumptions.foAOV,
      repAOV: assumptions.repAOV,
      rWeekly: assumptions.rWeekly,
      cum0: assumptions.cum0,
      activeBase0: assumptions.activeBase0,
      history: apiData.defaults.history,
    };
    const scenarios = runAllScenarios(baselines, {
      low: assumptions.low,
      base: assumptions.base,
      high: assumptions.high,
    });
    return {
      scenarios,
      summary: buildProjectionSummary(scenarios),
      chartSeries: buildChartSeries(apiData.defaults.history, scenarios),
    };
  }, [apiData, assumptions, manualOverrides]);

  if (!apiData || !assumptions || !computed) return null;

  const period = horizon === 13 ? computed.summary.threeMonths : computed.summary.sixMonths;

  return (
    <section className="rounded-xl border border-mediterranean-200 bg-gradient-to-br from-cream-400 to-white p-5 space-y-5">
      <div>
        <h3 className="font-display text-base text-ink-900">Next 3 &amp; 6 months — projection</h3>
        <p className="text-xs text-ink-500 mt-1">{apiData.note}</p>
        <p className="text-[11px] text-ink-400 mt-1">
          Inputs refresh from latest orders · updated {formatUpdatedAt(apiData.generatedAt)}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setHorizon(13)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${horizon === 13 ? 'bg-mediterranean-700 text-white' : 'bg-white border border-beige-600 text-ink-600'}`}
        >
          3 months
        </button>
        <button
          type="button"
          onClick={() => setHorizon(26)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${horizon === 26 ? 'bg-mediterranean-700 text-white' : 'bg-white border border-beige-600 text-ink-600'}`}
        >
          6 months
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <RangeSummary label={`Revenue next ${horizon === 13 ? '3M' : '6M'}`} {...period.revenue} format={formatSgd} />
        <RangeSummary label="New customers" {...period.newCustomers} format={(n) => String(Math.round(n))} />
        <RangeSummary
          label={`Exit run-rate (wk ${horizon})`}
          {...period.exitRunRate}
          format={(n) => `${formatSgd(n)}/wk`}
        />
      </div>

      <ProjectionChart
        data={computed.chartSeries as Record<string, unknown>[]}
        horizon={horizon}
        actualKey="revenueActual"
        baseKey="revenueBase"
        lowKey="revenueLow"
        highKey="revenueHigh"
        title="Revenue per week"
        formatValue={formatSgd}
      />
      <ProjectionChart
        data={computed.chartSeries as Record<string, unknown>[]}
        horizon={horizon}
        actualKey="newCustomersActual"
        baseKey="newCustomersBase"
        lowKey="newCustomersLow"
        highKey="newCustomersHigh"
        title="New customers per week"
        formatValue={(n) => String(Math.round(n))}
      />
      <ProjectionChart
        data={computed.chartSeries as Record<string, unknown>[]}
        horizon={horizon}
        actualKey="cumulativeActual"
        baseKey="cumulativeBase"
        lowKey="cumulativeLow"
        highKey="cumulativeHigh"
        title="Cumulative customers"
        formatValue={(n) => String(Math.round(n))}
      />

      <details className="rounded-xl border border-beige-600 bg-white p-4">
        <summary className="text-sm font-semibold text-ink-900 cursor-pointer">
          Assumptions
          <span className="ml-2 text-xs font-normal text-ink-500">(auto from orders)</span>
        </summary>
        <div className="mt-4 grid sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
          {(['new0', 'foAOV', 'repAOV', 'rWeekly', 'cum0', 'activeBase0'] as const).map((key) => (
            <div key={key} className="block">
              <span className="text-xs text-ink-500">{key}</span>
              <p className="mt-1 w-full border border-beige-400 bg-cream-400/50 rounded-lg px-2 py-1.5 text-sm text-ink-800">
                {assumptions[key]}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid lg:grid-cols-3 gap-4 text-sm">
          {(['low', 'base', 'high'] as const).map((sc) => (
            <div key={sc} className="space-y-2">
              <p className="text-xs font-semibold uppercase text-ink-600">{sc}</p>
              {(['gNew', 'rWeeklyMultiplier', 'rGrow', 'aovMultiplier'] as const).map((field) => (
                <label key={field} className="block">
                  <span className="text-[10px] text-ink-500">{field}</span>
                  <input
                    type="number"
                    step="0.01"
                    className="mt-0.5 w-full border border-beige-600 rounded-lg px-2 py-1 text-sm"
                    value={assumptions[sc][field]}
                    onChange={(e) => {
                      setManualOverrides(true);
                      setAssumptions({
                        ...assumptions,
                        [sc]: { ...assumptions[sc], [field]: Number(e.target.value) },
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
        {manualOverrides ? (
          <button
            type="button"
            className="mt-3 text-xs text-mediterranean-700 underline"
            onClick={() => {
              setManualOverrides(false);
              if (apiData) setAssumptions(assumptionsFromApi(apiData));
            }}
          >
            Reset scenario tweaks to defaults
          </button>
        ) : null}
        <ChartBasisNote basis="Baselines recomputed from last 4 completed weeks on each visit · independent of saturation ceiling" />
      </details>
    </section>
  );
}
