import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OrderKpisResponse } from '@shared/orderKpis';
import { CHART_GRID } from '../orderCharts';
import { ProjectionPanel } from './ProjectionPanel';
import {
  ChartBasisNote,
  KpiConfidenceChip,
  ScenarioConfidenceChip,
  formatSgd,
} from './KpiPrimitives';

const LS_PREFIX = 'dolce_kpi_';

function computeExpansionLocal({
  households2km,
  households12km,
  penetrationPct,
  reachFee,
  marginPct,
  consensusL,
  fWeekly,
  aov,
}: {
  households2km: number;
  households12km: number;
  penetrationPct: number;
  reachFee: number;
  marginPct: number;
  consensusL: number | null;
  fWeekly: number;
  aov: number;
}) {
  const pen = penetrationPct / 100;
  const margin = marginPct / 100;
  const n2 = households2km * pen;
  const n12 = households12km * pen;
  const nStar2 = consensusL != null ? Math.min(n2, consensusL) : n2;
  const nStar12 = consensusL != null ? Math.min(n12, consensusL) : n12;
  const rev2Monthly = Math.round(nStar2 * fWeekly * 4.33 * aov * 100) / 100;
  const rev12Monthly = Math.round(nStar12 * fWeekly * 4.33 * aov * 100) / 100;
  const incrementalContribution = Math.round((rev12Monthly - rev2Monthly) * margin * 100) / 100;
  const paybackMonths =
    incrementalContribution > 0 ? Math.round((reachFee / incrementalContribution) * 100) / 100 : null;
  const breakEvenF =
    nStar12 > nStar2 && aov > 0 && margin > 0
      ? Math.round((reachFee / ((nStar12 - nStar2) * aov * margin * 4.33)) * 100) / 100
      : null;
  const shouldExpand = incrementalContribution > reachFee;
  return {
    n2km: Math.round(nStar2 * 100) / 100,
    n12km: Math.round(nStar12 * 100) / 100,
    rev2kmMonthly: rev2Monthly,
    rev12kmMonthly: rev12Monthly,
    incrementalContribution,
    paybackMonths,
    breakEvenFWeekly: breakEvenF != null ? Math.round((breakEvenF / 4.33) * 100) / 100 : null,
    decision: shouldExpand ? ('expand' as const) : ('wait' as const),
    decisionBasis: shouldExpand
      ? `(N₁₂ₖₘ − N₂ₖₘ) × f × AOV × margin > S$${reachFee}`
      : `incremental contribution S$${incrementalContribution} ≤ reach fee S$${reachFee}`,
  };
}

function useLocalStorageNumber(key: string, defaultVal: number) {
  const [val, setVal] = useState(() => {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw != null ? Number(raw) : defaultVal;
  });
  useEffect(() => {
    localStorage.setItem(LS_PREFIX + key, String(val));
  }, [key, val]);
  return [val, setVal] as const;
}

export function SaturationForecastBlock({ kpis }: { kpis: OrderKpisResponse }) {
  const { saturation, forecast, frequency } = kpis;
  const conf = saturation.confidence;

  const [households2, setHouseholds2] = useLocalStorageNumber('households2km', 5000);
  const [households12, setHouseholds12] = useLocalStorageNumber('households12km', 40000);
  const [penetration, setPenetration] = useLocalStorageNumber('penetration', 2);
  const [margin, setMargin] = useLocalStorageNumber('margin', forecast.expansionDefaults.defaultMarginPct);
  const reachFee = forecast.expansionDefaults.reachFee;

  const consensusL = forecast.consensusCeiling?.L ?? null;
  const expansion = computeExpansionLocal({
    households2km: households2,
    households12km: households12,
    penetrationPct: penetration,
    reachFee,
    marginPct: margin,
    consensusL,
    fWeekly: frequency.fSteadyState.weekly || frequency.fBlended.weekly,
    aov: frequency.identity.aov,
  });

  const customerActual = saturation.customers.actual.map((p) => ({
    ...p,
    label: p.weekLabel ?? `w${p.t}`,
  }));

  return (
    <div className="space-y-8">
      <ProjectionPanel />

      <div className="space-y-6">
      <div className="rounded-xl border border-beige-600 bg-white p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-900">Saturation confidence</span>
          <KpiConfidenceChip confidence={conf} />
        </div>
        {conf === 'pre-inflection' ? (
          <p className="text-sm text-ink-600">{kpis.hero.ceiling.message}</p>
        ) : (
          <p className="text-sm text-ink-600">
            Consensus ceiling L ≈ <strong>{consensusL ?? '—'}</strong> customers
            {saturation.modelAgreementPct != null && ` · model agreement ${saturation.modelAgreementPct}%`}
          </p>
        )}
        {saturation.confidenceReasons.length > 0 && (
          <ul className="text-xs text-ink-500 list-disc pl-4 space-y-0.5">
            {saturation.confidenceReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      {customerActual.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ink-800 mb-2">Cumulative customers + fits</h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={customerActual} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis width={36} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="cumulative" stroke="#2d6a4f" strokeWidth={2} name="Actual" dot />
            </LineChart>
          </ResponsiveContainer>
          <div className="grid sm:grid-cols-2 gap-2 mt-2 text-xs text-ink-500">
            {saturation.customers.logistic && (
              <p>
                Logistic: L={saturation.customers.logistic.L}, k={saturation.customers.logistic.k}, R²=
                {saturation.customers.logistic.r2}
              </p>
            )}
            {saturation.customers.boundedExp && (
              <p>
                Bounded exp: L={saturation.customers.boundedExp.L}, k={saturation.customers.boundedExp.k}, R²=
                {saturation.customers.boundedExp.r2}
              </p>
            )}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-ink-800 mb-2">Steady-state revenue scenarios</h4>
        <div className="grid sm:grid-cols-3 gap-3">
          {forecast.scenarios.map((s, i) => (
            <div key={i} className="rounded-xl border border-beige-600 bg-white p-4" title={s.label}>
              <p className="text-xs text-ink-500">{s.label}</p>
              {s.available && s.revMonthly != null ? (
                <p className="text-lg font-display text-mediterranean-800 mt-1">{formatSgd(s.revMonthly)}/mo</p>
              ) : (
                <p className="text-sm text-ink-500 mt-2 leading-snug">{s.message}</p>
              )}
              {s.available && s.f != null && (
                <p className="text-[10px] text-ink-400">
                  N*={Math.round(s.nStar)} × f={s.f}
                </p>
              )}
              {s.message && s.available && (
                <p className="text-[10px] text-amber-700 mt-1">{s.message}</p>
              )}
              <div className="mt-2">
                <ScenarioConfidenceChip confidence={s.confidence} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {forecast.projectedWeeklyRevenue.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ink-800 mb-2">Projected weekly revenue path</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={forecast.projectedWeeklyRevenue} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `S$${v}`} width={48} tick={{ fontSize: 10 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload as { revenue: number; basis: string };
                  return (
                    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-xl">
                      <p>{formatSgd(d.revenue)}</p>
                      <p className="text-ink-500 italic">{d.basis}</p>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#40916c" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <details className="rounded-xl border border-beige-600 bg-cream-400/30 p-4">
        <summary className="text-sm font-semibold text-ink-900 cursor-pointer">Reach expansion calculator</summary>
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <label className="block">
            <span className="text-xs text-ink-500">Households 2 km</span>
            <input
              type="number"
              className="mt-1 w-full border border-beige-600 rounded-lg px-3 py-2"
              value={households2}
              onChange={(e) => setHouseholds2(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-500">Households 12 km</span>
            <input
              type="number"
              className="mt-1 w-full border border-beige-600 rounded-lg px-3 py-2"
              value={households12}
              onChange={(e) => setHouseholds12(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-500">Penetration %</span>
            <input
              type="number"
              step="0.1"
              className="mt-1 w-full border border-beige-600 rounded-lg px-3 py-2"
              value={penetration}
              onChange={(e) => setPenetration(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-500">Margin %</span>
            <input
              type="number"
              className="mt-1 w-full border border-beige-600 rounded-lg px-3 py-2"
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
          <p>
            Rev* 2 km: <strong>{formatSgd(expansion.rev2kmMonthly)}/mo</strong> (N≈{expansion.n2km})
          </p>
          <p>
            Rev* 12 km: <strong>{formatSgd(expansion.rev12kmMonthly)}/mo</strong> (N≈{expansion.n12km})
          </p>
          <p>
            Incremental contribution: <strong>{formatSgd(expansion.incrementalContribution)}/mo</strong>
          </p>
          <p>
            Payback on S${reachFee}:{' '}
            <strong>{expansion.paybackMonths != null ? `${expansion.paybackMonths} mo` : '—'}</strong>
          </p>
        </div>
        <p className="mt-3 text-sm">
          Decision:{' '}
          <span
            className={`font-semibold ${expansion.decision === 'expand' ? 'text-green-700' : 'text-amber-700'}`}
          >
            {expansion.decision === 'expand' ? 'EXPAND' : 'WAIT'}
          </span>
          {' — '}
          {expansion.decisionBasis}
        </p>
        <ChartBasisNote basis="Inputs saved in localStorage · uses steady-state f and AOV from API" />
      </details>
      </div>
    </div>
  );
}
