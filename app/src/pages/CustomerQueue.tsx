import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { AdminPageShell } from '../components/messaging/AdminPageShell';
import { WhatsAppStatusLed } from '../components/WhatsAppStatusLed';
import { OpenWASettingsPanel } from '../components/messaging/OpenWASettingsPanel';
import { SurveyQueuePanel } from '../components/messaging/SurveyQueuePanel';
import { CustomerMessages } from './CustomerMessages';

export function CustomerQueue() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'promo' ? 'promo' : 'survey';
  const [tab, setTab] = useState<'survey' | 'promo'>(initialTab);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setTab(searchParams.get('tab') === 'promo' ? 'promo' : 'survey');
  }, [searchParams]);

  return (
    <AdminPageShell
      title="Queue"
      subtitle="OpenWA connection, survey follow-up, and promo sends — review then send."
      maxWidth="max-w-6xl"
      headerExtra={
        <div className="flex flex-col items-end gap-2">
          <WhatsAppStatusLed variant="header" />
          <Link
            to="/customers/results"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-mediterranean-100 hover:text-white"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            View results
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <OpenWASettingsPanel onStatus={setStatus} />

        {status && (
          <p className="text-sm text-ink-700 bg-white border border-beige-600 rounded-lg px-4 py-3">
            {status}
          </p>
        )}

        <div className="flex gap-2 border-b border-beige-600 pb-2">
          <button
            type="button"
            onClick={() => setTab('survey')}
            className={`px-4 py-2 rounded-t-lg text-sm font-semibold ${
              tab === 'survey'
                ? 'bg-white border border-beige-600 border-b-white -mb-[1px] text-mediterranean-800'
                : 'text-ink-500 hover:text-ink-800'
            }`}
          >
            Survey follow-up
          </button>
          <button
            type="button"
            onClick={() => setTab('promo')}
            className={`px-4 py-2 rounded-t-lg text-sm font-semibold ${
              tab === 'promo'
                ? 'bg-white border border-beige-600 border-b-white -mb-[1px] text-mediterranean-800'
                : 'text-ink-500 hover:text-ink-800'
            }`}
          >
            Promo messages
          </button>
        </div>

        {tab === 'survey' ? (
          <SurveyQueuePanel onStatus={setStatus} />
        ) : (
          <CustomerMessages variant="queue" />
        )}
      </div>
    </AdminPageShell>
  );
}
