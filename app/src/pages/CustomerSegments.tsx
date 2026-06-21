import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { CustomerAdminNav } from '../components/CustomerAdminNav';
import { MessagePrefChip } from '../components/MessagePrefChip';
import type { CustomerSegment, SegmentTagId } from '@shared/customerSegments';
import { formatSgd } from '@shared/parseOrderValue';
import { API_URL } from '../lib/api';

const SEGMENT_STYLES: Record<string, string> = {
  'high-value-first': 'border-amber-300 bg-amber-50',
  'top-spender': 'border-yellow-300 bg-yellow-50',
  'win-back': 'border-amber-200 bg-amber-50',
  'tray-upsell': 'border-mediterranean-200 bg-mediterranean-50',
  vip: 'border-green-200 bg-green-50',
  'new-nurture': 'border-beige-500 bg-cream-400',
};

const TAG_LABELS: Record<SegmentTagId, string> = {
  'top-spender': 'Top spender',
  promoter: 'Promoter',
  'at-risk': 'At-risk',
};

export function CustomerSegments() {
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/segments`);
      if (res.ok) {
        const data = await res.json();
        setSegments(data.segments || []);
      }
    } catch {
      setStatus('Could not load segments.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-cream-500">
      <header className="bg-mediterranean-800 text-white px-4 py-6 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-mediterranean-200 text-sm uppercase tracking-widest mb-1">Admin</p>
          <h1 className="font-display text-3xl sm:text-4xl">Segments</h1>
          <p className="text-mediterranean-100 mt-2 text-sm sm:text-base">
            Each customer has one primary segment. Tags (top spender, promoter, at-risk) can overlap.
            Message segments from the Messages tab.
          </p>
          <CustomerAdminNav />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:px-8 space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 text-sm text-mediterranean-700 font-medium"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <Link
            to="/customers/messages"
            className="text-sm font-medium text-mediterranean-700 underline"
          >
            Open Messages →
          </Link>
        </div>

        {status && (
          <p className="text-sm text-ink-700 bg-white border border-beige-600 rounded-lg px-4 py-3">
            {status}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-mediterranean-700" />
          </div>
        ) : (
          <div className="space-y-4">
            {segments.map((segment) => {
              const isOpen = expanded === segment.id;
              const style = SEGMENT_STYLES[segment.id] || 'border-beige-600 bg-white';

              return (
                <section
                  key={segment.id}
                  className={`rounded-xl border shadow-sm overflow-hidden ${style}`}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : segment.id)}
                    className="w-full flex items-start justify-between gap-3 p-5 text-left hover:opacity-90 transition-opacity"
                  >
                    <div>
                      <h2 className="font-display text-lg text-ink-900 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-mediterranean-700" />
                        {segment.name}
                      </h2>
                      <p className="text-sm text-ink-600 mt-1">
                        <strong>Who:</strong> {segment.who}
                      </p>
                      <p className="text-sm text-ink-600">
                        <strong>Suggested promo:</strong> {segment.promo} · Reply{' '}
                        <code className="bg-white/60 px-1 rounded text-mediterranean-800">
                          {segment.campaign.keyword}
                        </code>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-display text-mediterranean-800">{segment.count}</p>
                      <p className="text-xs text-ink-500">customers</p>
                      {isOpen ? (
                        <ChevronDown className="w-5 h-5 text-ink-500 mt-2 ml-auto" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-ink-500 mt-2 ml-auto" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-beige-500/60 bg-white/70 px-5 pb-5">
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Link
                          to={`/customers/messages?segment=${encodeURIComponent(segment.id)}`}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-mediterranean-800 hover:bg-mediterranean-900 px-4 py-2 rounded-lg"
                        >
                          Message this segment →
                        </Link>
                        <p className="text-xs text-ink-500">
                          Promo: {segment.promo} · reply{' '}
                          <code className="bg-white/80 px-1 rounded">{segment.campaign.keyword}</code>
                        </p>
                      </div>

                      {segment.contacts.length === 0 ? (
                        <p className="text-sm text-ink-500 mt-4 text-center py-4">
                          No customers in this segment right now.
                        </p>
                      ) : (
                        <ul className="mt-3 divide-y divide-beige-400 border border-beige-500 rounded-lg bg-white overflow-hidden">
                          {segment.contacts.map((c) => (
                            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-ink-900 truncate flex items-center gap-1.5 flex-wrap">
                                  {c.name}
                                  <MessagePrefChip pref={c.message_pref} />
                                  {c.tags?.map((tag) => (
                                    <span
                                      key={tag}
                                      className="text-[10px] font-medium text-violet-800 bg-violet-100 px-1.5 py-0.5 rounded"
                                    >
                                      {TAG_LABELS[tag as SegmentTagId] ?? tag}
                                    </span>
                                  ))}
                                </p>
                                <p className="font-mono text-xs text-ink-500">{c.phone}</p>
                              </div>
                              <div className="text-right text-xs text-ink-600 shrink-0">
                                <p>{c.order_count} order{c.order_count !== 1 ? 's' : ''}</p>
                                {c.totalSpend > 0 && (
                                  <p className="font-medium text-mediterranean-800">
                                    {formatSgd(c.totalSpend)} total
                                  </p>
                                )}
                                {c.daysSinceOrder != null && (
                                  <p className="text-ink-400">
                                    {c.daysSinceOrder === 0 ? 'today' : `${c.daysSinceOrder}d ago`}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
