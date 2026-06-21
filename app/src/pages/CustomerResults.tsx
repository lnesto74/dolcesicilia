import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CustomerAdminNav } from '../components/CustomerAdminNav';
import {
  computeCampaignAnalytics,
  displayAnswer,
  type CampaignAnalytics,
  type CampaignInsight,
} from '@shared/campaignAnalytics';

const API_URL = import.meta.env.VITE_API_URL || '';

const CHART_COLORS = {
  positive: '#2d6a4f',
  good: '#52b788',
  neutral: '#f4a261',
  negative: '#e76f51',
  pie: ['#2d6a4f', '#52b788', '#95d5b2', '#f4a261', '#e76f51', '#40916c'],
};

interface CampaignResult {
  id: string;
  name: string;
  phone: string;
  followup_status: string | null;
  current_step: string;
  waiting_for: string | null;
  answers: Record<string, unknown>;
  completed_at: string | null;
  interactionCount: number;
}

interface Interaction {
  id: string;
  direction: string;
  body: string;
  campaign_step: string | null;
  created_at: string;
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const color =
    score >= 80 ? 'text-green-700' : score >= 60 ? 'text-amber-700' : score > 0 ? 'text-red-700' : 'text-ink-400';
  const bg =
    score >= 80 ? 'bg-green-100' : score >= 60 ? 'bg-amber-100' : score > 0 ? 'bg-red-100' : 'bg-cream-400';
  return (
    <div className={`rounded-xl border border-beige-600 p-4 ${bg}`}>
      <p className="text-xs text-ink-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-display mt-1 ${color}`}>{score > 0 ? score : '—'}</p>
      {score > 0 && <p className="text-xs text-ink-500 mt-0.5">out of 100</p>}
    </div>
  );
}

function InsightCard({ insight }: { insight: CampaignInsight }) {
  const styles = {
    success: 'border-green-200 bg-green-50 text-green-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    action: 'border-mediterranean-200 bg-mediterranean-50 text-mediterranean-900',
  };
  const icons = {
    success: Sparkles,
    warning: AlertTriangle,
    action: Lightbulb,
  };
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

function QuestionChart({ question }: { question: CampaignAnalytics['questions'][0] }) {
  const data = question.options
    .filter((o) => o.count > 0)
    .map((o) => ({
      name: o.label.length > 28 ? `${o.label.slice(0, 26)}…` : o.label,
      full: o.label,
      count: o.count,
      pct: o.pct,
      fill:
        o.sentiment === 'positive'
          ? CHART_COLORS.positive
          : o.sentiment === 'neutral'
            ? CHART_COLORS.neutral
            : CHART_COLORS.negative,
    }));

  if (data.length === 0) {
    return <p className="text-sm text-ink-400 py-8 text-center">No answers yet</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8e0d4" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(v: number, _n, props) => [
            `${v} (${(props.payload as { pct: number }).pct}%)`,
            'Responses',
          ]}
          labelFormatter={(_l, payload) => (payload?.[0]?.payload as { full: string })?.full || ''}
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function statusBadge(result: CampaignResult) {
  if (result.completed_at || result.followup_status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-800 bg-green-100 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> Completed
      </span>
    );
  }
  if (result.waiting_for) {
    return (
      <span className="text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
        Waiting: {result.waiting_for}
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-mediterranean-800 bg-mediterranean-100 px-2 py-0.5 rounded-full">
      In progress
    </span>
  );
}

export function CustomerResults() {
  const [results, setResults] = useState<CampaignResult[]>([]);
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<Record<string, Interaction[]>>({});
  const [loadingInteractions, setLoadingInteractions] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/campaign/results`);
      if (res.ok) {
        const data = await res.json();
        const rows = data.results || [];
        setResults(rows);
        setAnalytics(data.analytics || computeCampaignAnalytics(rows));
      }
    } catch {
      // offline
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!interactions[id]) {
      setLoadingInteractions(id);
      try {
        const res = await fetch(`${API_URL}/api/campaign/interactions/${id}`);
        if (res.ok) {
          const data = await res.json();
          setInteractions((prev) => ({ ...prev, [id]: data.interactions || [] }));
        }
      } catch {
        // ignore
      }
      setLoadingInteractions(null);
    }
  };

  const funnelData = analytics
    ? [
        { stage: 'Enrolled', count: analytics.enrolled, fill: CHART_COLORS.pie[0] },
        { stage: 'Answered Q1+', count: analytics.questions[0]?.responseCount || 0, fill: CHART_COLORS.pie[2] },
        { stage: 'Completed', count: analytics.completed, fill: CHART_COLORS.pie[4] },
        { stage: 'Grab review', count: analytics.reviewDone, fill: CHART_COLORS.good },
      ]
    : [];

  return (
    <div className="min-h-screen bg-cream-500">
      <header className="bg-mediterranean-800 text-white px-4 py-6 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-mediterranean-200 text-sm uppercase tracking-widest mb-1">Admin</p>
          <h1 className="font-display text-3xl sm:text-4xl">Feedback Intelligence</h1>
          <p className="text-mediterranean-100 mt-2 text-sm sm:text-base">
            Charts, scores, and actionable suggestions from your customer surveys.
          </p>
          <CustomerAdminNav />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:px-8 space-y-6">
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
        ) : !analytics || results.length === 0 ? (
          <section className="bg-white rounded-xl border border-beige-600 p-8 text-center">
            <BarChart3 className="w-10 h-10 text-ink-300 mx-auto mb-3" />
            <p className="text-ink-600">No feedback data yet.</p>
            <p className="text-sm text-ink-400 mt-2">
              <Link to="/customers/messages" className="text-mediterranean-700 underline">
                Messages
              </Link>{' '}
              to start building insights.
            </p>
          </section>
        ) : (
          <>
            {/* Scores */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <ScoreRing score={analytics.overallScore} label="Overall score" />
              {analytics.questions.map((q) => (
                <ScoreRing key={q.key} score={q.score} label={q.short} />
              ))}
              <div className="rounded-xl border border-beige-600 bg-white p-4">
                <p className="text-xs text-ink-500 uppercase tracking-wide">Completion</p>
                <p className="text-3xl font-display text-mediterranean-800 mt-1">
                  {analytics.completionRate}%
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {analytics.completed}/{analytics.enrolled} finished
                </p>
              </div>
            </section>

            {/* AI-style insights */}
            {analytics.insights.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg text-ink-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-mediterranean-700" />
                  What to improve
                </h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {analytics.insights.map((insight, i) => (
                    <InsightCard key={i} insight={insight} />
                  ))}
                </div>
              </section>
            )}

            {/* Charts */}
            <section className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm">
                <h3 className="font-display text-base text-ink-900 mb-1">Survey funnel</h3>
                <p className="text-xs text-ink-500 mb-4">How many customers reach each stage</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={funnelData}
                      dataKey="count"
                      nameKey="stage"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ stage, count }) => (count > 0 ? `${stage}: ${count}` : '')}
                    >
                      {funnelData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {analytics.questions.map((q) => (
                <div key={q.key} className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-display text-base text-ink-900">{q.title}</h3>
                    {q.score > 0 && (
                      <span
                        className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                          q.score >= 80
                            ? 'bg-green-100 text-green-800'
                            : q.score >= 60
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {q.score}/100
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-500 mb-2">{q.responseCount} response(s)</p>
                  <QuestionChart question={q} />
                </div>
              ))}
            </section>

            {/* Customer table with readable answers */}
            <section className="bg-white rounded-xl border border-beige-600 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-beige-500">
                <h3 className="font-display text-base text-ink-900">Individual responses</h3>
                <p className="text-xs text-ink-500 mt-0.5">Tap a row for WhatsApp message history</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-ink-500 border-b border-beige-500 bg-cream-400">
                      <th className="p-3 w-8" />
                      <th className="p-3">Customer</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 min-w-[9rem]">Tiramisù</th>
                      <th className="p-3 min-w-[9rem]">Delivery</th>
                      <th className="p-3 min-w-[9rem]">Recommend</th>
                      <th className="p-3">Review</th>
                      <th className="p-3 text-center">WA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <Fragment key={r.id}>
                        <tr
                          className="border-b border-beige-400 hover:bg-cream-400/50 cursor-pointer"
                          onClick={() => toggleExpand(r.id)}
                        >
                          <td className="p-3 text-ink-400">
                            {expandedId === r.id ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </td>
                          <td className="p-3">
                            <p className="font-medium text-ink-800">{r.name}</p>
                            <p className="font-mono text-xs text-ink-500">{r.phone}</p>
                          </td>
                          <td className="p-3">{statusBadge(r)}</td>
                          <td className="p-3">
                            <AnswerPill text={displayAnswer('q1', r.answers?.q1)} />
                          </td>
                          <td className="p-3">
                            <AnswerPill text={displayAnswer('q2', r.answers?.q2)} />
                          </td>
                          <td className="p-3">
                            <AnswerPill text={displayAnswer('q3', r.answers?.q3)} />
                          </td>
                          <td className="p-3">
                            <AnswerPill text={displayAnswer('done', r.answers?.done)} />
                          </td>
                          <td className="p-3 text-center text-ink-600">{r.interactionCount}</td>
                        </tr>
                        {expandedId === r.id && (
                          <tr className="bg-cream-400/30">
                            <td colSpan={8} className="p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <MessageSquare className="w-4 h-4 text-mediterranean-700" />
                                <p className="text-sm font-semibold text-ink-800">WhatsApp timeline</p>
                              </div>
                              {loadingInteractions === r.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-mediterranean-700" />
                              ) : (interactions[r.id] || []).length === 0 ? (
                                <p className="text-xs text-ink-500">No messages logged yet (new sends will appear here).</p>
                              ) : (
                                <ul className="space-y-2 max-h-48 overflow-y-auto">
                                  {(interactions[r.id] || []).map((ix) => (
                                    <li
                                      key={ix.id}
                                      className={`text-xs rounded-lg px-3 py-2 border ${
                                        ix.direction === 'out'
                                          ? 'bg-mediterranean-50 border-mediterranean-200'
                                          : 'bg-white border-beige-500'
                                      }`}
                                    >
                                      <span className="font-medium">
                                        {ix.direction === 'out' ? '→ Sent' : '← Received'}
                                      </span>
                                      <span className="text-ink-400 mx-2">
                                        {new Date(ix.created_at).toLocaleString()}
                                      </span>
                                      <p className="text-ink-800 mt-1">{ix.body?.slice(0, 200)}</p>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function AnswerPill({ text }: { text: string }) {
  if (text === '—') return <span className="text-ink-300">—</span>;
  const negative = /not|issue|probably not|okay/i.test(text) && !/loved|perfect|100%|good/i.test(text);
  const positive = /loved|perfect|100%|recommend/i.test(text);
  return (
    <span
      className={`inline-block text-xs leading-snug px-2 py-1 rounded-lg max-w-[11rem] ${
        positive
          ? 'bg-green-50 text-green-900 border border-green-200'
          : negative
            ? 'bg-amber-50 text-amber-900 border border-amber-200'
            : 'bg-cream-400 text-ink-800 border border-beige-500'
      }`}
      title={text}
    >
      {text}
    </span>
  );
}
