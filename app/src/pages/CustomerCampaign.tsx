import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Megaphone,
  CheckCircle2,
  Loader2,
  ExternalLink,
  UserPlus,
  RefreshCw,
  Copy,
  Send,
  RotateCcw,
} from 'lucide-react';

const TEST_CONTACT = { name: 'Luca', phone: '+393343782367' };
import { CustomerAdminNav } from '../components/CustomerAdminNav';
import { WhatsAppStatusLed } from '../components/WhatsAppStatusLed';
import {
  getMessageForStep,
  fillCampaignMessage,
  stepLabel,
  type CampaignStep,
} from '@shared/firstVisitCampaign';
import { whatsappUrl } from '@shared/messageTemplates';

const API_URL = import.meta.env.VITE_API_URL || '';

interface QueueItem {
  id: string;
  name: string;
  phone: string;
  customer_type: string;
  enrollment_id: string;
  current_step: CampaignStep;
  waiting_for: string | null;
  answers: Record<string, string>;
  enrolled_at: string;
  last_sent_at: string | null;
}

interface PendingContact {
  id: string;
  name: string;
  phone: string;
  order_count?: number;
  last_seen_at?: string;
}

export function CustomerCampaign() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [followupEnabled, setFollowupEnabled] = useState(true);
  const [senderName, setSenderName] = useState('Luca');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [openwaEnabled, setOpenwaEnabled] = useState(false);
  const [openwaUrl, setOpenwaUrl] = useState('http://127.0.0.1:2785');
  const [openwaApiKey, setOpenwaApiKey] = useState('');
  const [openwaSessionId, setOpenwaSessionId] = useState('');
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [enrollmentSummary, setEnrollmentSummary] = useState<{
    totalFirstTime: number;
    inQueue: number;
    completed: number;
    notEnrolled: number;
  } | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState<PendingContact[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queueRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/campaign/queue`),
        fetch(`${API_URL}/api/settings`),
      ]);
      if (queueRes.ok) {
        const data = await queueRes.json();
        setQueue(data.queue || []);
        setSenderName(data.senderName || 'Luca');
        setFollowupEnabled(data.followupEnabled ?? true);
        setEnrollmentSummary(data.summary || null);
        setPendingEnrollment(data.pendingEnrollment || data.summary?.pendingEnrollment || []);
        if (data.newlyEnrolled?.length) {
          setStatus(
            `Added ${data.newlyEnrolled.length} customer(s) to follow-up: ${data.newlyEnrolled.map((c: { name: string }) => c.name).join(', ')}`,
          );
        }
      }
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setFollowupEnabled(s.followupCampaignEnabled);
        setSenderName(s.senderName || 'Luca');
        setOpenwaEnabled(s.openwaEnabled ?? false);
        setOpenwaUrl(s.openwaUrl || 'http://127.0.0.1:2785');
        setOpenwaApiKey(s.openwaApiKey || '');
        setOpenwaSessionId(s.openwaSessionId || '');
      }
    } catch {
      setStatus('Cannot reach server.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const readyIds = new Set(queue.filter((q) => !q.waiting_for).map((q) => q.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => readyIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [queue]);

  useEffect(() => {
    if (!openwaEnabled) return;
    const id = setInterval(() => {
      fetch(`${API_URL}/api/campaign/queue`)
        .then((r) => r.json())
        .then((d) => setQueue(d.queue || []))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [openwaEnabled]);

  const saveOpenwaSettings = async () => {
    await fetch(`${API_URL}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openwaEnabled,
        openwaUrl,
        openwaApiKey,
        openwaSessionId,
        senderName,
        followupCampaignEnabled: followupEnabled,
      }),
    });
    setStatus('OpenWA settings saved');
  };

  const setupWebhook = async () => {
    const res = await fetch(`${API_URL}/api/whatsapp/setup-webhook`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) setStatus(`Webhook registered → ${data.webhookUrl}`);
    else setStatus(data.error || 'Webhook setup failed');
  };

  const enrollPending = async () => {
    if (!followupEnabled) {
      setStatus('Turn Follow-up ON first — then add customers to the queue.');
      return;
    }
    setEnrolling(true);
    try {
      const res = await fetch(`${API_URL}/api/campaign/sync-enrollments`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setQueue(data.queue || []);
        setEnrollmentSummary(data.summary || null);
        const names = (data.enrolled || []).map((c: { name: string }) => c.name);
        setStatus(
          names.length
            ? `Added to queue: ${names.join(', ')}`
            : 'No new customers to enroll.',
        );
        await load();
      } else {
        setStatus(data.error || 'Could not enroll customers.');
      }
    } catch {
      setStatus('Cannot reach server.');
    }
    setEnrolling(false);
  };

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
        setStatus(
          `Follow-up ON — added ${data.newlyEnrolled.map((c: { name: string }) => c.name).join(', ')}`,
        );
      }
      await load();
    }
  };

  const active = queue.find((q) => q.id === activeId) ?? queue[0] ?? null;

  const getOutboundMessage = (item: QueueItem) => {
    const msg = getMessageForStep(item.current_step);
    if (!msg) return null;
    return fillCampaignMessage(msg.body, item.name, senderName);
  };

  const openWhatsAppDesktop = (item: QueueItem) => {
    const text = getOutboundMessage(item);
    if (!text) return;
    window.open(whatsappUrl(item.phone, text), '_blank');
  };

  const copyMessage = async (item: QueueItem) => {
    const text = getOutboundMessage(item);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus('Message copied — paste in WhatsApp (fixes emoji issues)');
  };

  const markSent = async (item: QueueItem) => {
    const text = getOutboundMessage(item);
    if (!text) return;
    setSending(true);
    const res = await fetch(`${API_URL}/api/campaign/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        openwaEnabled
          ? { contactId: item.id, viaOpenwa: true }
          : {
              contactId: item.id,
              step: item.current_step,
              messageBody: text,
            }
      ),
    });
    setSending(false);
    if (res.ok) {
      const data = await res.json();
      setQueue(data.queue || []);
      setStatus(
        data.sentViaOpenwa
          ? `Sent via OpenWA to ${item.name} 🎉`
          : `Sent ${stepLabel(item.current_step)} to ${item.name}`
      );
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      setStatus(err.error || 'Send failed');
    }
  };

  const resetCampaign = async (phone: string, name: string) => {
    setResetting(true);
    try {
      const res = await fetch(`${API_URL}/api/campaign/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (res.ok) {
        setQueue(data.queue || []);
        const luca = (data.queue || []).find((q: QueueItem) => q.phone === phone);
        if (luca) setActiveId(luca.id);
        setStatus(`${name} reset — back at welcome message, ready to test again`);
        await load();
      } else {
        setStatus(data.error || 'Reset failed');
      }
    } catch {
      setStatus('Cannot reach server.');
    }
    setResetting(false);
  };

  const recordReply = async (item: QueueItem, key: string, value: string) => {
    const res = await fetch(`${API_URL}/api/campaign/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId: item.id, replyKey: key, replyValue: value }),
    });
    if (res.ok) {
      await load();
      setStatus(`Recorded ${key} reply for ${item.name}`);
    }
  };

  const readyToSend = queue.filter((q) => !q.waiting_for);
  const waitingReply = queue.filter((q) => q.waiting_for);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllReady = () => {
    setSelectedIds(new Set(readyToSend.map((q) => q.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const sendBulk = async () => {
    const ids = [...selectedIds].filter((id) => readyToSend.some((q) => q.id === id));
    if (ids.length === 0) return;

    if (openwaEnabled) {
      setBulkSending(true);
      setStatus(`Sending to ${ids.length} customer(s) sequentially (~5s apart)…`);
      try {
        const res = await fetch(`${API_URL}/api/campaign/send-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactIds: ids }),
        });
        const data = await res.json();
        if (res.ok) {
          setQueue(data.queue || []);
          const names = (data.results || [])
            .filter((r: { ok: boolean }) => r.ok)
            .map((r: { name: string }) => r.name);
          setStatus(
            data.failed
              ? `Sent ${data.sent}/${ids.length}. Failed: ${(data.results || []).filter((r: { ok: boolean }) => !r.ok).map((r: { name: string; error?: string }) => `${r.name} (${r.error})`).join(', ')}`
              : `Bulk send complete — welcome sent to ${names.join(', ')} 🎉`,
          );
          clearSelection();
          await load();
        } else {
          setStatus(data.error || 'Bulk send failed');
        }
      } catch {
        setStatus('Cannot reach server.');
      }
      setBulkSending(false);
      return;
    }

    // Manual mode: send one by one with copy/mark flow isn't bulk — open first only
    setStatus('Turn on OpenWA for bulk send, or send manually one at a time.');
  };

  return (
    <div className="min-h-screen bg-cream-500">
      <header className="bg-mediterranean-800 text-white px-4 py-6 sm:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-mediterranean-200 text-sm uppercase tracking-widest mb-1">Admin</p>
              <h1 className="font-display text-3xl sm:text-4xl">First-Visit Follow-up</h1>
              <p className="text-mediterranean-100 mt-2 text-sm sm:text-base">
                Send follow-up messages and track replies. Use OpenWA for automatic send + reply detection.
              </p>
            </div>
            <WhatsAppStatusLed variant="header" />
          </div>
          <CustomerAdminNav />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:px-8 space-y-6">
        {/* Settings */}
        <section className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg text-ink-900 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-mediterranean-700" />
                Follow-up campaign
              </h2>
              <p className="text-sm text-ink-500 mt-1">
                When ON, first-time customers are auto-enrolled. Returning customers are skipped.
                {enrollmentSummary && (
                  <span className="block mt-1 text-ink-600">
                    {enrollmentSummary.inQueue} in queue · {enrollmentSummary.completed} completed ·{' '}
                    {enrollmentSummary.totalFirstTime} first-time total
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

        {/* OpenWA */}
        <section className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg text-ink-900">WhatsApp via OpenWA</h2>
              <p className="text-sm text-ink-500 mt-1">
                Self-hosted API — sends messages with emojis, detects replies automatically.{' '}
                <a href="https://www.open-wa.org/" target="_blank" rel="noreferrer" className="text-mediterranean-700 underline">
                  open-wa.org
                </a>
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer shrink-0">
              <span className="text-sm font-medium text-ink-700">{openwaEnabled ? 'ON' : 'OFF'}</span>
              <input
                type="checkbox"
                checked={openwaEnabled}
                onChange={(e) => setOpenwaEnabled(e.target.checked)}
                className="w-5 h-5 accent-mediterranean-700"
              />
            </label>
          </div>

          {openwaEnabled && (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-500">API URL</label>
                  <input
                    value={openwaUrl}
                    onChange={(e) => setOpenwaUrl(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-beige-600 rounded-lg text-sm"
                    placeholder="http://127.0.0.1:2785"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-500">Session ID</label>
                  <input
                    value={openwaSessionId}
                    onChange={(e) => setOpenwaSessionId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-beige-600 rounded-lg text-sm"
                    placeholder="sess_abc123"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-ink-500">API Key</label>
                  <input
                    type="password"
                    value={openwaApiKey}
                    onChange={(e) => setOpenwaApiKey(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-beige-600 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveOpenwaSettings}
                  className="px-4 py-2 bg-mediterranean-700 text-white rounded-lg text-sm font-medium"
                >
                  Save OpenWA settings
                </button>
                <button
                  type="button"
                  onClick={setupWebhook}
                  className="px-4 py-2 border border-mediterranean-700 text-mediterranean-700 rounded-lg text-sm font-medium"
                >
                  Register reply webhook
                </button>
              </div>
              <WhatsAppStatusLed variant="inline" />
            </>
          )}
        </section>

        {/* Workflow */}
        <section className="bg-mediterranean-50 rounded-xl border border-mediterranean-200 p-5 text-sm text-ink-700 space-y-2">
          <p className="font-semibold text-mediterranean-800">
            {openwaEnabled ? 'Automated workflow (OpenWA)' : 'Manual workflow (WhatsApp Desktop)'}
          </p>
          {openwaEnabled ? (
            <>
              <ol className="list-decimal list-inside space-y-1 text-ink-600">
                <li>Start OpenWA on Mac, scan QR with your business WhatsApp</li>
                <li>Save settings above → Register reply webhook</li>
                <li>Check customers → <strong>Start bulk send</strong> (sends sequentially, ~5s apart) or send one at a time</li>
                <li>Customer <strong>replies with a number or taps an option</strong> → next question sends automatically</li>
              </ol>
              <p className="text-xs text-ink-500 pt-1">
                WhatsApp no longer allows tap-to-reply buttons on linked phones. Customers see your numbered message (1️⃣2️⃣3️⃣4️⃣) and can reply with a number or tap the option.
              </p>
            </>
          ) : (
            <ol className="list-decimal list-inside space-y-1 text-ink-600">
              <li>Select customer → <strong>Copy message</strong> (fixes broken emojis) → paste in WhatsApp Desktop</li>
              <li>After sending, click <strong>Mark sent</strong></li>
              <li>When customer replies, tap 1️⃣2️⃣3️⃣4️⃣ on this page to log it</li>
            </ol>
          )}
        </section>

        {status && (
          <p className="text-sm text-ink-600 flex items-center gap-2 bg-white rounded-lg border px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-mediterranean-600" />
            {status}
          </p>
        )}

        {pendingEnrollment.length > 0 && (
          <section className="bg-amber-50 rounded-xl border border-amber-300 p-4 text-sm text-amber-900">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {pendingEnrollment.length} in contacts but not in Ready to send
                </p>
                <p className="mt-1 text-amber-800">
                  {followupEnabled
                    ? 'These first-time customers were saved while follow-up was off, or before auto-enroll. Add them to the queue below.'
                    : 'Turn Follow-up ON above — then add them to the queue.'}
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
                Add to queue
              </button>
            </div>
          </section>
        )}

        {enrollmentSummary && enrollmentSummary.notEnrolled > 0 && pendingEnrollment.length === 0 && (
          <section className="bg-amber-50 rounded-xl border border-amber-300 p-4 text-sm text-amber-900">
            <p className="font-semibold">
              {enrollmentSummary.notEnrolled} first-time customer(s) not in the queue
            </p>
            <p className="mt-1 text-amber-800">
              {followupEnabled
                ? 'Tap Refresh — they should be added automatically.'
                : 'Turn Follow-up ON above to enroll saved first-time customers.'}
            </p>
          </section>
        )}

        <section className="bg-amber-50 rounded-xl border border-amber-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Test reset — {TEST_CONTACT.name}</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Completed customers disappear from the queue. Reset {TEST_CONTACT.name} ({TEST_CONTACT.phone}) to run the full flow again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => resetCampaign(TEST_CONTACT.phone, TEST_CONTACT.name)}
            disabled={resetting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-60 shrink-0"
          >
            {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Reset {TEST_CONTACT.name} campaign
          </button>
        </section>

        <div className="flex gap-2">
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
        ) : queue.length === 0 ? (
          <section className="bg-white rounded-xl border border-beige-600 p-8 text-center">
            <UserPlus className="w-10 h-10 text-ink-300 mx-auto mb-3" />
            <p className="text-ink-600">No customers in the follow-up queue.</p>
            <p className="text-sm text-ink-400 mt-2">
              Completed customers are hidden. Use <strong>Reset Luca campaign</strong> above to test again, or{' '}
              <Link to="/customers" className="text-mediterranean-700 underline">
                import a new Grab order
              </Link>
              .
            </p>
          </section>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Queue list */}
            <section className="space-y-4">
              {readyToSend.length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wide">
                      Ready to send ({readyToSend.length})
                    </h3>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={selectAllReady}
                        className="text-mediterranean-700 font-medium hover:underline"
                      >
                        Select all
                      </button>
                      {selectedIds.size > 0 && (
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="text-ink-500 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={sendBulk}
                      disabled={bulkSending || sending}
                      className="w-full mb-3 flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-semibold disabled:opacity-60"
                    >
                      {bulkSending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                      Start bulk send ({selectedIds.size} selected)
                    </button>
                  )}

                  <div className="space-y-2">
                    {readyToSend.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          active?.id === item.id
                            ? 'border-mediterranean-400 bg-mediterranean-50'
                            : selectedIds.has(item.id)
                              ? 'border-[#25D366] bg-green-50/50'
                              : 'border-beige-500 bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="mt-1 w-4 h-4 accent-mediterranean-700 shrink-0"
                          aria-label={`Select ${item.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => setActiveId(item.id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="font-medium text-ink-800">{item.name}</p>
                          <p className="text-xs text-mediterranean-700 mt-1">
                            {stepLabel(item.current_step)}
                          </p>
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-ink-400 mt-2">
                    Bulk send goes one customer at a time (~5s pause). Each welcome uses their name from
                    your contact list — e.g. Ciao Joey!, Ciao Lam! — not a copy-paste blast.
                  </p>
                </div>
              )}

              {waitingReply.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-2">
                    Waiting for reply ({waitingReply.length})
                  </h3>
                  <div className="space-y-2">
                    {waitingReply.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveId(item.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          active?.id === item.id
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-beige-500 bg-white'
                        }`}
                      >
                        <p className="font-medium text-ink-800">{item.name}</p>
                        <p className="text-xs text-amber-700 mt-1">
                          Waiting: {item.waiting_for}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Active customer panel */}
            {active && (
              <section className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm sticky top-4">
                <p className="text-xs text-ink-500 uppercase tracking-wide">Active customer</p>
                <h3 className="font-display text-xl text-ink-900 mt-1">{active.name}</h3>
                <p className="font-mono text-sm text-ink-500">{active.phone}</p>
                <span className="inline-block mt-2 text-xs bg-cream-400 text-ink-600 px-2 py-0.5 rounded-full">
                  {active.customer_type === 'first_time' ? 'First order' : 'Returning'}
                </span>

                <p className="text-sm font-medium text-mediterranean-800 mt-4">
                  {stepLabel(active.current_step)}
                </p>

                {getOutboundMessage(active) && !active.waiting_for && (
                  <pre className="mt-2 text-sm text-ink-700 whitespace-pre-wrap font-sans leading-relaxed bg-cream-400 rounded-lg p-3 border border-beige-500 max-h-64 overflow-y-auto">
                    {getOutboundMessage(active)}
                  </pre>
                )}

                {!active.waiting_for && getOutboundMessage(active) && (
                  <div className="flex flex-col gap-2 mt-4">
                    {openwaEnabled ? (
                      <button
                        type="button"
                        onClick={() => markSent(active)}
                        disabled={sending}
                        className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-semibold disabled:opacity-60"
                      >
                        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        Send via OpenWA
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => copyMessage(active)}
                          className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-semibold"
                        >
                          <Copy className="w-5 h-5" />
                          Copy message (paste in WhatsApp)
                        </button>
                        <button
                          type="button"
                          onClick={() => openWhatsAppDesktop(active)}
                          className="w-full flex items-center justify-center gap-2 border border-[#25D366] text-[#128C7E] py-3 rounded-xl font-semibold"
                        >
                          <ExternalLink className="w-5 h-5" />
                          Open WhatsApp chat
                        </button>
                        <button
                          type="button"
                          onClick={() => markSent(active)}
                          className="w-full flex items-center justify-center gap-2 border border-mediterranean-700 text-mediterranean-700 py-3 rounded-xl font-semibold"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          Mark sent &amp; next step
                        </button>
                      </>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => resetCampaign(active.phone, active.name)}
                  disabled={resetting}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-amber-300 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-50 disabled:opacity-60"
                >
                  {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Reset campaign (start over)
                </button>

                {active.waiting_for && (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-amber-800 font-medium">
                      {openwaEnabled
                        ? 'Waiting for customer reply in WhatsApp (auto-detected)…'
                        : 'Record customer reply in WhatsApp:'}
                    </p>
                    {active.waiting_for === 'done' ? (
                      <button
                        type="button"
                        onClick={() => recordReply(active, 'done', 'done')}
                        className="w-full py-3 bg-mediterranean-700 text-white rounded-xl font-semibold"
                      >
                        Customer replied &quot;done&quot;
                      </button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {['1', '2', '3', '4'].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => recordReply(active, active.waiting_for!, n)}
                            className="py-3 rounded-xl border border-beige-600 bg-cream-400 font-semibold text-ink-800 hover:bg-mediterranean-50"
                          >
                            {n}️⃣
                          </button>
                        ))}
                      </div>
                    )}
                    {active.answers && Object.keys(active.answers).length > 0 && (
                      <p className="text-xs text-ink-500">
                        Answers so far: {JSON.stringify(active.answers)}
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        <p className="text-center text-ink-400 text-sm pb-8">
          <Link to="/" className="hover:text-mediterranean-700 underline">
            ← Back to website
          </Link>
        </p>
      </main>
    </div>
  );
}
