import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, LineChart as LineChartIcon, Loader2 } from 'lucide-react';
import type { OrderKpisResponse } from '@shared/orderKpis';
import {
  KpiConfidenceChip,
  KpiHealthBadge,
  PartialWeekBanner,
  formatDeltaPct,
  formatSgd,
} from './KpiPrimitives';
import { MomentumBlock, CustomersBlock, RetentionBlock, FrequencyBlock } from './KpiBlocks';
import { SaturationForecastBlock } from './SaturationForecastBlock';

const API_URL = import.meta.env.VITE_API_URL || '';
const TAB_KEY = 'dolce_kpi_tab';

type KpiTab = 'momentum' | 'customers' | 'retention' | 'frequency' | 'forecast';

const TABS: { id: KpiTab; label: string }[] = [
  { id: 'momentum', label: 'Momentum' },
  { id: 'customers', label: 'Customers' },
  { id: 'retention', label: 'Repeat' },
  { id: 'frequency', label: 'Frequency' },
  { id: 'forecast', label: 'Forecast' },
];

export function OrderKpisPanel() {
  const [kpis, setKpis] = useState<OrderKpisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<KpiTab>(() => {
    const saved = localStorage.getItem(TAB_KEY) as KpiTab | null;
    return saved && TABS.some((t) => t.id === saved) ? saved : 'momentum';
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/orders/kpis`);
      if (res.ok) setKpis(await res.json());
    } catch {
      // offline
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  if (loading && !kpis) {
    return (
      <section className="bg-white rounded-xl border border-beige-600 p-8 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-mediterranean-700" />
      </section>
    );
  }

  if (!kpis) return null;

  const hero = kpis.hero;

  return (
    <section className="bg-white rounded-xl border border-beige-600 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-cream-400/40 transition-colors"
      >
        <div>
          <h2 className="font-display text-base text-ink-900 flex items-center gap-2">
            <LineChartIcon className="w-5 h-5 text-mediterranean-700 shrink-0" />
            Analytics &amp; Forecast
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">Weekday-honest growth, retention, frequency model &amp; saturation</p>
        </div>
        <span className="shrink-0 text-mediterranean-700">
          {open ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-beige-400 p-4 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <div className="rounded-lg border border-beige-600 bg-white p-3" title={hero.rolling7dRevenue.basis}>
              <p className="text-[10px] text-ink-500 uppercase">7d revenue</p>
              <p className="text-lg font-display">{formatSgd(hero.rolling7dRevenue.current)}</p>
              <p className="text-xs text-green-700">{formatDeltaPct(hero.rolling7dRevenue.deltaPct)}</p>
            </div>
            <div className="rounded-lg border border-beige-600 bg-white p-3">
              <p className="text-[10px] text-ink-500 uppercase">Repeat rate</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-lg font-display">{hero.repeatRateLatestFullWeek.value}%</p>
                <KpiHealthBadge health={hero.repeatRateLatestFullWeek.health} label="" />
              </div>
              <p className="text-[10px] text-ink-400">{hero.repeatRateLatestFullWeek.weekLabel}</p>
            </div>
            <div className="rounded-lg border border-beige-600 bg-white p-3" title={hero.reorderP30.basis}>
              <p className="text-[10px] text-ink-500 uppercase">p₃₀ reorder</p>
              <p className="text-lg font-display">{hero.reorderP30.rate}%</p>
              <KpiHealthBadge health={hero.reorderP30.health} label={hero.reorderP30.health} />
            </div>
            <div className="rounded-lg border border-beige-600 bg-white p-3">
              <p className="text-[10px] text-ink-500 uppercase">Active N₃₀</p>
              <p className="text-lg font-display">{hero.activeN30}</p>
              <p className="text-[10px] text-ink-400">N₆₀: {hero.activeN60}</p>
            </div>
            <div className="rounded-lg border border-beige-600 bg-mediterranean-50 p-3">
              <p className="text-[10px] text-ink-500 uppercase">Ceiling</p>
              <KpiConfidenceChip confidence={hero.ceiling.confidence} />
              <p className="text-xs text-ink-600 mt-1 leading-snug">
                {hero.ceiling.L != null ? `L ≈ ${hero.ceiling.L}` : hero.ceiling.message}
              </p>
            </div>
          </div>

          {kpis.meta.partialWeek && <PartialWeekBanner weekLabel={kpis.meta.partialWeek.weekLabel} />}

          <div className="flex flex-wrap gap-1.5 border-b border-beige-400 pb-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t.id
                    ? 'bg-mediterranean-700 text-white'
                    : 'bg-cream-400 text-ink-600 hover:bg-beige-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'momentum' && <MomentumBlock kpis={kpis} />}
          {tab === 'customers' && <CustomersBlock kpis={kpis} />}
          {tab === 'retention' && <RetentionBlock kpis={kpis} />}
          {tab === 'frequency' && <FrequencyBlock kpis={kpis} />}
          {tab === 'forecast' && <SaturationForecastBlock kpis={kpis} />}
        </div>
      )}
    </section>
  );
}
