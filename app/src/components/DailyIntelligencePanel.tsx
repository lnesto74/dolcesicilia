import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Send,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';
import type { DailyBrief, DailyBriefCTA, Objective } from '@shared/dailyBrief';
import { firstNameFromFullName } from '@shared/messageTemplates';
import { formatSgd } from '@shared/parseOrderValue';

const API_URL = import.meta.env.VITE_API_URL || '';
const COLLAPSED_KEY = 'di_panel_collapsed';

const OBJECTIVE_STYLES: Record<Objective, string> = {
  sales: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  loyalty: 'bg-violet-100 text-violet-800 border-violet-200',
  base: 'bg-amber-100 text-amber-800 border-amber-200',
};

const SEVERITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  med: 'bg-amber-500',
  low: 'bg-ink-300',
};

function relativeTime(iso?: string) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TrendIcon({ direction }: { direction?: string }) {
  if (direction === 'up') return <TrendingUp className="w-3.5 h-3.5 text-green-600" />;
  if (direction === 'down') return <TrendingDown className="w-3.5 h-3.5 text-red-600" />;
  return <Minus className="w-3.5 h-3.5 text-ink-400" />;
}

function ObjectiveChip({ objective }: { objective?: Objective }) {
  if (!objective) return null;
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${OBJECTIVE_STYLES[objective] ?? OBJECTIVE_STYLES.base}`}
    >
      {objective}
    </span>
  );
}

function CtaButton({ cta }: { cta: DailyBriefCTA }) {
  const previewNames = (cta.contactNames ?? [])
    .map((n) => firstNameFromFullName(n))
    .join(', ');
  const tooltip = [previewNames || '—', `keyword ${cta.keyword ?? '—'}`, cta.segment ?? '—']
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      to={`/customers/messages?cta=${encodeURIComponent(cta.id)}`}
      title={tooltip}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mediterranean-700 text-white text-sm font-medium hover:bg-mediterranean-800 shrink-0"
    >
      <Send className="w-3.5 h-3.5" />
      {cta.label}
      {cta.status === 'staged' && (
        <span className="text-[10px] font-bold uppercase bg-white/20 px-1.5 py-0.5 rounded">
          staged
        </span>
      )}
    </Link>
  );
}

function resolveCta(brief: DailyBrief, ctaId?: string): DailyBriefCTA | undefined {
  if (!ctaId) return undefined;
  return brief.ctas?.find((c) => c.id === ctaId);
}

export function DailyIntelligencePanel() {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
  const [showMore, setShowMore] = useState(false);

  const fetchBrief = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/daily-brief/latest`);
      if (res.ok) {
        const data = await res.json();
        setBrief(data.brief ?? null);
      }
    } catch {
      setBrief(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBrief();
    const onFocus = () => fetchBrief();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchBrief]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  const topCta = brief ? resolveCta(brief, brief.topMove?.ctaId) : undefined;

  return (
    <section className="bg-white rounded-xl border border-beige-600 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-beige-400">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-2 text-left min-w-0 flex-1"
        >
          <span className="text-lg shrink-0">🧠</span>
          <div className="min-w-0">
            <h2 className="font-display text-base text-ink-900">Daily Intelligence</h2>
            {brief && (
              <p className="text-xs text-ink-500 truncate">
                {brief.coversDate ?? brief.date}
                {brief.generatedAt && ` · updated ${relativeTime(brief.generatedAt)}`}
              </p>
            )}
          </div>
          <span className="text-mediterranean-700 shrink-0 ml-1">
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </span>
        </button>
        <button
          type="button"
          onClick={fetchBrief}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-mediterranean-700 font-medium px-2 py-1 rounded hover:bg-cream-400"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {loading && !brief ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-mediterranean-700" />
            </div>
          ) : !brief ? (
            <p className="text-sm text-ink-500 py-4 text-center">
              No brief yet — the daily run posts here each morning.
            </p>
          ) : (
            <>
              {brief.metrics && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    ['Orders', brief.metrics.orders],
                    ['Revenue', formatSgd(brief.metrics.revenue ?? 0)],
                    ['AOV', formatSgd(brief.metrics.aov ?? 0)],
                    ['New', brief.metrics.newCustomers],
                    ['Returning', brief.metrics.returningCustomers],
                  ].map(([label, val]) => (
                    <span
                      key={String(label)}
                      className="px-2.5 py-1 rounded-full bg-cream-400 border border-beige-500 text-ink-700"
                    >
                      <span className="text-ink-500">{label}</span> {val}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cream-400 border border-beige-500">
                    <TrendIcon direction={brief.metrics.trendDirection} />
                    <span className="text-ink-600">
                      {brief.metrics.vs7dAvgOrders != null
                        ? `${brief.metrics.vs7dAvgOrders > 0 ? '+' : ''}${brief.metrics.vs7dAvgOrders}% vs 7d`
                        : 'trend'}
                    </span>
                  </span>
                </div>
              )}

              {brief.headline && (
                <p className="font-semibold text-ink-900 leading-snug">{brief.headline}</p>
              )}

              {brief.topMove && (
                <div className="rounded-xl border-2 border-mediterranean-300 bg-mediterranean-50 p-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-mediterranean-800">
                    Today&apos;s #1 move
                  </p>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink-900">{brief.topMove.title}</p>
                      {brief.topMove.rationale && (
                        <p className="text-sm text-ink-600 mt-1">{brief.topMove.rationale}</p>
                      )}
                      <div className="mt-2">
                        <ObjectiveChip objective={brief.topMove.objective} />
                      </div>
                    </div>
                    {topCta && <CtaButton cta={topCta} />}
                  </div>
                </div>
              )}

              {brief.supportingMoves?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
                    Supporting moves
                  </p>
                  {brief.supportingMoves.map((move, i) => {
                    const cta = resolveCta(brief, move.ctaId);
                    return (
                      <div
                        key={move.ctaId ?? i}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-beige-500 bg-cream-400/50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-800">{move.title}</p>
                          <ObjectiveChip objective={move.objective} />
                        </div>
                        {cta && <CtaButton cta={cta} />}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="text-xs text-mediterranean-700 font-medium"
              >
                {showMore ? '▲ Less' : '▼ More (changes, watchouts, experiment)'}
              </button>

              {showMore && (
                <div className="space-y-3 text-sm">
                  {brief.whatChanged?.length > 0 && (
                    <ul className="space-y-1.5">
                      {brief.whatChanged.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-ink-700">
                          <span
                            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[item.severity] ?? SEVERITY_DOT.low}`}
                          />
                          {item.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {brief.watchouts?.length > 0 && (
                    <ul className="space-y-1 text-ink-500 list-disc list-inside">
                      {brief.watchouts.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                  {brief.experiment && (
                    <p className="text-ink-600 italic">
                      Experiment: {brief.experiment.hypothesis} → measure {brief.experiment.metric}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
