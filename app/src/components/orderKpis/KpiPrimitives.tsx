import type { GrowthDelta } from '@shared/orderGrowthKpis';
import type { ConfidenceFlag, HealthFlag, ScenarioConfidenceFlag } from '@shared/orderKpis';
import { formatSgd } from '@shared/parseOrderValue';

export function formatDeltaPct(pct: number | null | undefined): string {
  if (pct == null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

export function deltaColor(delta: number | null | undefined): string {
  if (delta == null || delta === 0) return 'text-ink-600';
  return delta > 0 ? 'text-green-700' : 'text-red-700';
}

const CONFIDENCE_STYLES: Record<ConfidenceFlag, string> = {
  reliable: 'bg-green-100 text-green-800 border-green-200',
  low: 'bg-amber-100 text-amber-900 border-amber-200',
  'pre-inflection': 'bg-ink-100 text-ink-600 border-ink-200',
};

const HEALTH_STYLES: Record<HealthFlag, string> = {
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-800',
};

export function ScenarioConfidenceChip({ confidence }: { confidence: ScenarioConfidenceFlag }) {
  const styles: Record<ScenarioConfidenceFlag, string> = {
    reliable: 'bg-green-100 text-green-800 border-green-200',
    provisional: 'bg-amber-100 text-amber-900 border-amber-200',
    unavailable: 'bg-ink-100 text-ink-500 border-ink-200',
  };
  const labels: Record<ScenarioConfidenceFlag, string> = {
    reliable: 'reliable',
    provisional: 'provisional',
    unavailable: 'unavailable',
  };
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${styles[confidence]}`}
    >
      {labels[confidence]}
    </span>
  );
}

export function KpiConfidenceChip({ confidence }: { confidence: ConfidenceFlag }) {
  const label =
    confidence === 'pre-inflection' ? 'pre-inflection' : confidence === 'low' ? 'low confidence' : 'reliable';
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLES[confidence]}`}>
      {label}
    </span>
  );
}

export function KpiHealthBadge({ health, label }: { health: HealthFlag; label?: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${HEALTH_STYLES[health]}`}>
      {label || health}
    </span>
  );
}

export function KpiDeltaCard({
  label,
  delta,
  formatValue,
}: {
  label: string;
  delta: GrowthDelta;
  formatValue: (n: number) => string;
}) {
  return (
    <div className="rounded-xl border border-beige-600 bg-white p-4" title={delta.basis}>
      <p className="text-xs text-ink-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-display text-mediterranean-800 mt-1">{formatValue(delta.current)}</p>
      <p className={`text-sm font-medium mt-1 ${deltaColor(delta.delta)}`}>
        {delta.delta >= 0 ? '+' : ''}
        {formatValue(delta.delta)} ({formatDeltaPct(delta.deltaPct)})
      </p>
      <p className="text-[10px] text-ink-400 mt-1.5 leading-snug">{delta.basis}</p>
    </div>
  );
}

export function PartialWeekBanner({ weekLabel }: { weekLabel: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <span className="font-medium">{weekLabel}</span> is partial — excluded from deceleration test and saturation
      fit.
    </div>
  );
}

export function ChartBasisNote({ basis }: { basis?: string }) {
  if (!basis) return null;
  return <p className="text-[10px] text-ink-400 mt-1 italic">{basis}</p>;
}

export function KpiTooltipContent({
  label,
  value,
  basis,
}: {
  label: string;
  value: string;
  basis?: string;
}) {
  return (
    <div className="rounded-lg border border-beige-600 bg-white px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-ink-900">{label}</p>
      <p className="text-ink-700 mt-1">{value}</p>
      {basis && <p className="text-ink-500 mt-1 italic">{basis}</p>}
    </div>
  );
}

export { formatSgd };
