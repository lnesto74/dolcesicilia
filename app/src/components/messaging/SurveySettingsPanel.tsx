import { useCallback, useEffect, useState } from 'react';
import { Megaphone, UserPlus, Loader2 } from 'lucide-react';
import { API_URL } from '../../lib/api';

interface PendingContact {
  id: string;
  name: string;
  phone: string;
}

export function SurveySettingsPanel({ onStatus }: { onStatus?: (msg: string) => void }) {
  const [followupEnabled, setFollowupEnabled] = useState(false);
  const [senderName, setSenderName] = useState('Luca');
  const [enrollmentSummary, setEnrollmentSummary] = useState<{
    totalFirstTime: number;
    inQueue: number;
    completed: number;
    notEnrolled: number;
  } | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState<PendingContact[]>([]);
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [queueRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/campaign/queue`),
        fetch(`${API_URL}/api/settings`),
      ]);
      if (queueRes.ok) {
        const data = await queueRes.json();
        setEnrollmentSummary(data.summary || null);
        setPendingEnrollment(data.pendingEnrollment || data.summary?.pendingEnrollment || []);
        setSenderName(data.senderName || 'Luca');
        setFollowupEnabled(data.followupEnabled ?? true);
      }
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setFollowupEnabled(s.followupCampaignEnabled);
        setSenderName(s.senderName || 'Luca');
      }
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async (enabled: boolean) => {
    setFollowupEnabled(enabled);
    const res = await fetch(`${API_URL}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followupCampaignEnabled: enabled, senderName }),
    });
    if (res.ok) {
      const data = await res.json();
      setEnrollmentSummary(data.enrollmentSummary || null);
      if (data.newlyEnrolled?.length) {
        onStatus?.(
          `Follow-up ON — added ${data.newlyEnrolled.map((c: { name: string }) => c.name).join(', ')}`,
        );
      }
      await load();
    }
  };

  const enrollPending = async () => {
    if (!followupEnabled) {
      onStatus?.('Turn follow-up ON first — then add customers to the queue.');
      return;
    }
    setEnrolling(true);
    try {
      const res = await fetch(`${API_URL}/api/campaign/sync-enrollments`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const names = (data.enrolled || []).map((c: { name: string }) => c.name);
        onStatus?.(names.length ? `Scheduled onboarding: ${names.join(', ')}` : 'No new customers to schedule.');
        await load();
      } else {
        onStatus?.(data.error || 'Could not enroll customers.');
      }
    } catch {
      onStatus?.('Cannot reach server.');
    }
    setEnrolling(false);
  };

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg text-ink-900 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-mediterranean-700" />
              First-order onboarding
            </h2>
            <p className="text-sm text-ink-500 mt-1">
              OFF by default — schedule only, no auto-send. Turn ON to queue new first orders for
              manual onboarding (still no auto-send while manual-only mode is active).
              {enrollmentSummary && (
                <span className="block mt-1 text-ink-600">
                  {enrollmentSummary.inQueue} scheduled · {enrollmentSummary.completed} sent
                </span>
              )}
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span className="text-sm font-medium text-ink-700">{followupEnabled ? 'ON' : 'OFF'}</span>
            <input
              type="checkbox"
              checked={followupEnabled}
              onChange={(e) => saveSettings(e.target.checked)}
              className="w-5 h-5 accent-mediterranean-700"
            />
          </label>
        </div>
        <div className="mt-4">
          <label className="text-sm text-ink-600">Sender name in messages</label>
          <input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            onBlur={() =>
              fetch(`${API_URL}/api/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senderName, followupCampaignEnabled: followupEnabled }),
              })
            }
            className="mt-1 w-full max-w-xs px-3 py-2 border border-beige-600 rounded-lg"
          />
        </div>
      </section>

      {pendingEnrollment.length > 0 && (
        <section className="bg-amber-50 rounded-xl border border-amber-300 p-4 text-sm text-amber-900">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <p className="font-semibold">
                {pendingEnrollment.length} first-time — not scheduled yet
              </p>
              <ul className="mt-2 space-y-1">
                {pendingEnrollment.map((c) => (
                  <li key={c.id} className="font-medium text-amber-950">
                    {c.name}{' '}
                    <span className="font-mono text-xs font-normal text-amber-800">{c.phone}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={enrollPending}
              disabled={!followupEnabled || enrolling}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shrink-0"
            >
              {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Schedule onboarding
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
