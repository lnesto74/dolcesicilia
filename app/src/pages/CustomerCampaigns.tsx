import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPageShell } from '../components/messaging/AdminPageShell';
import { SurveySettingsPanel } from '../components/messaging/SurveySettingsPanel';
import { CustomerMessages } from './CustomerMessages';

export function CustomerCampaigns() {
  const [status, setStatus] = useState('');

  return (
    <AdminPageShell
      title="Campaigns"
      subtitle="Configure first-order onboarding and compose promo messages — sending happens in Queue."
    >
      <div className="space-y-8">
        {status && (
          <p className="text-sm text-ink-700 bg-white border border-beige-600 rounded-lg px-4 py-3">
            {status}
          </p>
        )}

        <SurveySettingsPanel onStatus={setStatus} />

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-xl text-ink-900">Promo &amp; ad-hoc messages</h2>
            <Link
              to="/customers/queue?tab=promo"
              className="text-sm font-medium text-mediterranean-700 hover:underline"
            >
              Go to Queue →
            </Link>
          </div>
          <CustomerMessages variant="compose" />
        </section>
      </div>
    </AdminPageShell>
  );
}
