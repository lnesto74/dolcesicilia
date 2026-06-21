import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { AdminPageShell } from '../components/messaging/AdminPageShell';
import { WhatsAppStatusLed } from '../components/WhatsAppStatusLed';
import { OpenWASettingsPanel } from '../components/messaging/OpenWASettingsPanel';
import { SurveySettingsPanel } from '../components/messaging/SurveySettingsPanel';
import { SurveyQueuePanel } from '../components/messaging/SurveyQueuePanel';
import { CustomerMessages } from '../pages/CustomerMessages';
import { API_URL } from '../lib/api';

export function CustomerMessagesHub() {
  const [surveyOpen, setSurveyOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [surveyReady, setSurveyReady] = useState(0);
  const [surveyWaiting, setSurveyWaiting] = useState(0);

  const loadSurveyCounts = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/onboarding/queue`);
      if (!res.ok) return;
      const data = await res.json();
      const queue = data.queue || [];
      setSurveyReady(queue.filter((q: { is_due: boolean }) => q.is_due).length);
      setSurveyWaiting(queue.filter((q: { is_due: boolean }) => !q.is_due).length);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    loadSurveyCounts();
    const id = setInterval(loadSurveyCounts, 15000);
    return () => clearInterval(id);
  }, [loadSurveyCounts]);

  return (
    <AdminPageShell
      title="Messages"
      subtitle="Claude (MCP) or Manual — pick a segment, review messages, send via OpenWA."
      headerExtra={
        <div className="flex flex-col items-end gap-2">
          <WhatsAppStatusLed variant="header" />
          <Link
            to="/customers/results"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-mediterranean-100 hover:text-white"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Survey results
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        <section className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Manual send only</p>
          <p className="text-xs mt-1 text-amber-900">
            No automatic WhatsApp messages — nothing goes out on a timer or after orders. You send
            explicitly from Send / onboarding queue / OpenWA buttons.
          </p>
        </section>

        {status && (
          <p className="text-sm text-ink-700 bg-white border border-beige-600 rounded-lg px-4 py-3">
            {status}
          </p>
        )}

        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-beige-600 bg-white text-sm font-medium text-ink-800 hover:bg-cream-400"
        >
          <span className="inline-flex items-center gap-2">
            <Settings className="w-4 h-4 text-mediterranean-700" />
            WhatsApp connection (OpenWA)
          </span>
          {settingsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {settingsOpen && <OpenWASettingsPanel onStatus={setStatus} />}

        <button
          type="button"
          onClick={() => setSurveyOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-mediterranean-200 bg-mediterranean-50 text-sm font-medium text-mediterranean-900 hover:bg-mediterranean-100"
        >
          <span>
            First-order onboarding (auto ~2h after delivery)
            {(surveyReady > 0 || surveyWaiting > 0) && (
              <span className="ml-2 text-xs font-normal text-mediterranean-700">
                {surveyReady} due now · {surveyWaiting} scheduled
              </span>
            )}
          </span>
          {surveyOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {surveyOpen && (
          <div className="space-y-4 pl-1 border-l-2 border-mediterranean-200 ml-2">
            <SurveySettingsPanel onStatus={setStatus} />
            <SurveyQueuePanel
              onStatus={(msg) => {
                setStatus(msg);
                loadSurveyCounts();
              }}
            />
          </div>
        )}

        <CustomerMessages variant="hub" onSurveyCountsChange={loadSurveyCounts} />
      </div>
    </AdminPageShell>
  );
}
