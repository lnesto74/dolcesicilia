import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  ExternalLink,
  UserPlus,
  RefreshCw,
  Copy,
  Send,
  Clock,
} from 'lucide-react';
import { whatsappUrl, fillTemplate } from '@shared/messageTemplates';
import { ONBOARDING_INTRO_BODY } from '@shared/onboardingFlow';
import { API_URL } from '../../lib/api';
import { useOpenwaSettings } from './OpenWASettingsPanel';

interface OnboardingQueueItem {
  id: string;
  name: string;
  phone: string;
  deliver_after: string;
  scheduled_at: string;
  is_due: boolean;
  status: string;
}

function formatDeliverWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function SurveyQueuePanel({
  onStatus,
}: {
  onStatus?: (msg: string) => void;
}) {
  const { settings } = useOpenwaSettings();
  const openwaEnabled = settings.openwaEnabled;
  const [queue, setQueue] = useState<OnboardingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);

  const setMsg = (msg: string) => {
    setStatus(msg);
    onStatus?.(msg);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/onboarding/queue`);
      if (res.ok) {
        const data = await res.json();
        setQueue(data.queue || []);
      }
    } catch {
      setMsg('Cannot reach server.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const dueIds = new Set(queue.filter((q) => q.is_due).map((q) => q.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => dueIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [queue]);

  useEffect(() => {
    if (!openwaEnabled) return;
    const id = setInterval(() => {
      fetch(`${API_URL}/api/onboarding/queue`)
        .then((r) => r.json())
        .then((d) => setQueue(d.queue || []))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [openwaEnabled]);

  const active = queue.find((q) => q.id === activeId) ?? queue[0] ?? null;
  const dueItems = queue.filter((q) => q.is_due);
  const waitingItems = queue.filter((q) => !q.is_due);

  const previewIntro = (name: string) => fillTemplate(ONBOARDING_INTRO_BODY, name);

  const sendOnboarding = async (item: OnboardingQueueItem) => {
    setSending(true);
    const res = await fetch(`${API_URL}/api/onboarding/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId: item.id }),
    });
    setSending(false);
    if (res.ok) {
      setMsg(`Onboarding sent to ${item.name} (intro + preference poll)`);
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      setMsg(err.error || 'Send failed');
    }
  };

  const sendBulk = async () => {
    const ids = [...selectedIds].filter((id) => dueItems.some((q) => q.id === id));
    if (ids.length === 0) {
      setMsg('Select due contacts first.');
      return;
    }
    if (!openwaEnabled) {
      setMsg('Turn on OpenWA for automatic send.');
      return;
    }
    setBulkSending(true);
    let sent = 0;
    for (const id of ids) {
      const res = await fetch(`${API_URL}/api/onboarding/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: id }),
      });
      if (res.ok) sent += 1;
    }
    setBulkSending(false);
    setMsg(`Onboarding sent to ${sent}/${ids.length} contact(s)`);
    setSelectedIds(new Set());
    await load();
  };

  return (
    <div className="space-y-4">
      {status && (
        <p className="text-sm text-ink-600 flex items-center gap-2 bg-white rounded-lg border px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-mediterranean-600" />
          {status}
        </p>
      )}

      <section className="bg-mediterranean-50 rounded-xl border border-mediterranean-200 p-4">
        <p className="text-sm font-semibold text-mediterranean-900">First-order onboarding</p>
        <p className="text-xs text-mediterranean-800 mt-1">
          Chef Luca intro + 5-option preference poll, scheduled ~2 hours after delivery. The old 6-message
          survey is retired — historical results stay in Campaign results.
        </p>
      </section>

      <button
        type="button"
        onClick={load}
        className="inline-flex items-center gap-2 text-sm text-mediterranean-700 font-medium"
      >
        <RefreshCw className="w-4 h-4" /> Refresh
      </button>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-mediterranean-700" />
        </div>
      ) : queue.length === 0 ? (
        <section className="bg-white rounded-xl border border-beige-600 p-8 text-center">
          <UserPlus className="w-10 h-10 text-ink-300 mx-auto mb-3" />
          <p className="text-ink-600">No customers waiting for onboarding.</p>
          <p className="text-sm text-ink-400 mt-2">
            New first orders are scheduled automatically when onboarding is ON.
          </p>
        </section>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <section className="space-y-4">
            {dueItems.length > 0 && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-mediterranean-800 uppercase tracking-wide">
                    Due now ({dueItems.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set(dueItems.map((q) => q.id)))}
                    className="text-xs text-mediterranean-700 font-medium hover:underline"
                  >
                    Select all due
                  </button>
                </div>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={sendBulk}
                    disabled={bulkSending || sending}
                    className="w-full mb-3 flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-semibold disabled:opacity-60"
                  >
                    {bulkSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    Send onboarding ({selectedIds.size})
                  </button>
                )}
                <div className="space-y-2">
                  {dueItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        active?.id === item.id
                          ? 'border-mediterranean-400 bg-mediterranean-50'
                          : 'border-beige-500 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })
                        }
                        className="mt-1 w-4 h-4 accent-mediterranean-700"
                      />
                      <button type="button" onClick={() => setActiveId(item.id)} className="flex-1 text-left">
                        <p className="font-medium text-ink-800">{item.name}</p>
                        <p className="text-xs text-mediterranean-700">Due {formatDeliverWhen(item.deliver_after)}</p>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {waitingItems.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Scheduled ({waitingItems.length})
                </h3>
                <div className="space-y-2">
                  {waitingItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      className={`w-full text-left p-3 rounded-lg border ${
                        active?.id === item.id ? 'border-mediterranean-300 bg-mediterranean-50/50' : 'border-beige-500 bg-white'
                      }`}
                    >
                      <p className="font-medium text-ink-800">{item.name}</p>
                      <p className="text-xs text-ink-500">Sends ~{formatDeliverWhen(item.deliver_after)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {active && (
            <section className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm sticky top-4">
              <h3 className="font-display text-xl text-ink-900">{active.name}</h3>
              <p className="font-mono text-sm text-ink-500">{active.phone}</p>
              <p className="text-sm font-medium text-mediterranean-800 mt-4">
                {active.is_due ? 'Ready — intro + preference poll' : `Scheduled for ${formatDeliverWhen(active.deliver_after)}`}
              </p>
              <pre className="mt-2 text-sm text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-cream-400 rounded-lg p-3 border max-h-64 overflow-y-auto">
                {previewIntro(active.name)}
              </pre>
              <p className="text-xs text-ink-500 mt-2">Then: WhatsApp poll with 5 preference options.</p>
              <div className="flex flex-col gap-2 mt-4">
                {openwaEnabled ? (
                  <button
                    type="button"
                    onClick={() => sendOnboarding(active)}
                    disabled={sending || !active.is_due}
                    className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-semibold disabled:opacity-60"
                  >
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    {active.is_due ? 'Send via OpenWA' : 'Not due yet'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(previewIntro(active.name));
                        setMsg('Intro copied — send manually, then preference poll');
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-semibold"
                    >
                      <Copy className="w-5 h-5" />
                      Copy intro
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(whatsappUrl(active.phone, previewIntro(active.name)), '_blank')}
                      className="w-full flex items-center justify-center gap-2 border border-[#25D366] text-[#128C7E] py-3 rounded-xl font-semibold"
                    >
                      <ExternalLink className="w-5 h-5" />
                      Open WhatsApp
                    </button>
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
