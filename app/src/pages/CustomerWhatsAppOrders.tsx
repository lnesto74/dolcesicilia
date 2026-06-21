import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  MessageCircle,
  MapPin,
  CheckCircle2,
  XCircle,
  Truck,
  CreditCard,
  ChevronRight,
  Users,
  Plus,
  Trash2,
  Radio,
  Send,
  Navigation,
} from 'lucide-react';
import { AdminPageShell } from '../components/messaging/AdminPageShell';
import { WhatsAppStatusLed } from '../components/WhatsAppStatusLed';
import { WaOrderMap } from '../components/waOrders/WaOrderMap';
import { API_URL, apiUnreachableMessage, parseApiJson } from '../lib/api';
import { WA_ORDER_STATUS_LABELS, WA_ORDER_TIMELINE, resolveWaTimelineStep, waTimelineStepIndex, formatWaOrderBagTag, type WaOrderStatus } from '@shared/waOrderProducts';
import {
  waOrderRowMetrics,
  waOrderRowHint,
  type WaDispatchSnapshot,
} from '@shared/waOrderDispatchUi';

interface WaCartItem {
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
}

interface WaOrder {
  id: string;
  order_number?: number | null;
  customer_phone: string;
  customer_name?: string | null;
  status: WaOrderStatus | string;
  items: WaCartItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  delivery_type?: string | null;
  scheduled_for?: string | null;
  address_text?: string | null;
  postal_code?: string | null;
  lat?: number | null;
  lng?: number | null;
  in_grab_zone?: boolean;
  payment_provider?: string | null;
  payment_link?: string | null;
  payment_status?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  dispatch?: WaDispatchSnapshot | null;
}

interface WaMetrics {
  ordersToday: number;
  revenueToday: number;
  inZone: number;
  outZone: number;
  avgOrderValue: number;
}

interface WaMessage {
  direction: string;
  body?: string;
  messageType?: string;
  createdAt?: string;
  created_at?: string;
}

interface WaDriver {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  notes?: string | null;
}

interface WaDriverDispatchInfo {
  dispatch?: WaDispatchSnapshot & {
    accepted_driver_phone?: string | null;
    eta_minutes?: number | null;
  };
  driver?: WaDriver | null;
}

type PageTab = 'orders' | 'drivers';

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'awaiting_payment', label: 'Awaiting pay' },
  { key: 'paid', label: 'Paid' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'out_for_delivery', label: 'Delivering' },
  { key: 'completed', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
];

function formatMoney(n?: number | null) {
  return `S$${Number(n || 0).toFixed(2)}`;
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-SG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusChipClass(status: string) {
  const step = resolveWaTimelineStep(status);
  if (step === 'completed') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (step === 'cancelled') return 'bg-stone-100 text-stone-600 ring-stone-300';
  if (step === 'awaiting_payment') return 'bg-amber-50 text-amber-900 ring-amber-200';
  if (step === 'out_for_delivery') return 'bg-sky-50 text-sky-800 ring-sky-200';
  if (step === 'paid') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (step === 'scheduled') return 'bg-violet-50 text-violet-800 ring-violet-200';
  return 'bg-cream-400 text-ink-700 ring-beige-600';
}

function timelineStatusLabel(status: string) {
  if (status === 'cancelled') return 'Cancelled';
  const step = resolveWaTimelineStep(status);
  return WA_ORDER_TIMELINE.find((s) => s.key === step)?.label || WA_ORDER_STATUS_LABELS[step as WaOrderStatus] || status;
}

function AlertLed({ urgent }: { urgent?: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" title={urgent ? 'Overdue — follow up' : 'Action needed'}>
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
          urgent ? 'bg-red-400' : 'bg-amber-400'
        }`}
      />
      <span
        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
          urgent ? 'bg-red-500' : 'bg-amber-500'
        }`}
      />
    </span>
  );
}

function orderRowSurfaceClass(phase: string, selected: boolean, pickupOverdue: boolean): string {
  if (phase === 'delivered') {
    return selected
      ? 'bg-emerald-700 text-white ring-2 ring-inset ring-emerald-900'
      : 'bg-emerald-600 text-white hover:bg-emerald-700';
  }
  if (phase === 'finding_driver' || phase === 'needs_driver') {
    return `wa-order-row-finding ${selected ? 'ring-2 ring-inset ring-amber-500' : ''}`;
  }
  if (pickupOverdue) {
    return `wa-order-row-overdue ${selected ? 'ring-2 ring-inset ring-red-400' : ''}`;
  }
  if (phase === 'delivering') {
    return selected ? 'bg-sky-50 ring-2 ring-inset ring-sky-400' : 'bg-sky-50/90 hover:bg-sky-100';
  }
  if (phase === 'awaiting_pickup') {
    return selected ? 'bg-amber-50 ring-2 ring-inset ring-amber-400' : 'bg-amber-50/70 hover:bg-amber-100';
  }
  return selected ? 'bg-cream-400' : 'hover:bg-cream-400/60';
}

function WaOrderListRow({
  order,
  selected,
  onSelect,
}: {
  order: WaOrder;
  selected: boolean;
  onSelect: () => void;
}) {
  const metrics =
    order.status === 'cancelled'
      ? { phase: 'none' as const, label: null, elapsedMs: 0, pickupOverdue: false, totalMs: 0 }
      : waOrderRowMetrics(order);
  const hint = waOrderRowHint(metrics);
  const delivered = metrics.phase === 'delivered';
  const actionNeeded = metrics.phase === 'needs_driver' || metrics.phase === 'finding_driver';
  const muted = delivered ? 'text-emerald-100' : 'text-ink-500';
  const titleClass = delivered ? 'text-white' : 'text-ink-900';
  const tagClass = delivered ? 'text-emerald-100' : 'text-ink-500';

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 flex items-center gap-2 transition-colors ${orderRowSurfaceClass(
          metrics.phase,
          selected,
          metrics.pickupOverdue,
        )}`}
      >
        <div className="flex items-center justify-center shrink-0 w-5">
          {actionNeeded && <AlertLed urgent={metrics.pickupOverdue} />}
          {metrics.phase === 'awaiting_pickup' && metrics.pickupOverdue && <AlertLed urgent />}
          {metrics.phase === 'delivering' && (
            <span className="text-base leading-none" title="Out for delivery">
              🛵
            </span>
          )}
          {metrics.phase === 'delivered' && <CheckCircle2 className="w-4 h-4 text-white shrink-0" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`font-medium truncate ${titleClass}`}>
            {order.customer_name || order.customer_phone}
            {order.order_number != null && (
              <span className={`ml-1.5 font-semibold ${tagClass}`}>
                {formatWaOrderBagTag(order.order_number)}
              </span>
            )}
          </p>
          <p className={`text-xs ${muted}`}>
            {formatTime(order.created_at)}
            {order.updated_at &&
              order.updated_at.slice(0, 16) !== order.created_at?.slice(0, 16) && (
                <span className={delivered ? 'text-emerald-200' : 'text-ink-400'}>
                  {' '}
                  · active {formatTime(order.updated_at)}
                </span>
              )}
            {' · '}
            {formatMoney(order.total)}
          </p>
          {hint && metrics.phase !== 'none' && (
            <p
              className={`text-[11px] mt-0.5 font-semibold ${
                delivered
                  ? 'text-emerald-100'
                  : metrics.pickupOverdue
                    ? 'text-red-700'
                    : metrics.phase === 'delivering'
                      ? 'text-sky-800'
                      : 'text-amber-800'
              }`}
            >
              {metrics.phase === 'delivered' && '✓ '}
              {(metrics.phase === 'needs_driver' || metrics.phase === 'finding_driver') && '🔔 '}
              {metrics.pickupOverdue && metrics.phase !== 'needs_driver' && '⚠ '}
              {hint}
              {metrics.label && (
                <span className="ml-1 font-mono tabular-nums">{metrics.label}</span>
              )}
            </p>
          )}
        </div>

        {!delivered ? (
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ring-1 ring-inset shrink-0 ${statusChipClass(order.status)}`}
          >
            {timelineStatusLabel(order.status)}
          </span>
        ) : (
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-800/40 text-white shrink-0">
            Delivered
          </span>
        )}
        <ChevronRight className={`w-4 h-4 shrink-0 ${delivered ? 'text-emerald-200' : 'text-ink-300'}`} />
      </button>
    </li>
  );
}

function isOrderDeliveredForList(order: WaOrder): boolean {
  return order.status === 'completed' || order.dispatch?.status === 'delivered';
}

function WaOrderStatusTimeline({ status }: { status: string }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-lg bg-stone-100 text-stone-700 text-sm font-semibold border border-stone-300">
        <XCircle className="w-4 h-4 shrink-0" /> Cancelled
      </div>
    );
  }

  const current = resolveWaTimelineStep(status);
  const currentIdx = waTimelineStepIndex(current);
  const progressPct =
    WA_ORDER_TIMELINE.length <= 1
      ? 0
      : (currentIdx / (WA_ORDER_TIMELINE.length - 1)) * 100;

  return (
    <nav className="mb-6 px-2 pt-4 pb-2" aria-label="Order progress">
      <div className="relative">
        <div
          className="absolute left-[10%] right-[10%] top-[14px] h-0.5 -translate-y-1/2 bg-beige-500"
          aria-hidden
        />
        <div
          className="absolute left-[10%] top-[14px] h-0.5 -translate-y-1/2 bg-emerald-500 transition-all duration-300"
          style={{ width: `${progressPct * 0.8}%` }}
          aria-hidden
        />
        <ol className="relative flex justify-between items-start gap-0">
          {WA_ORDER_TIMELINE.map((step, idx) => {
            const done = idx < currentIdx;
            const active = idx === currentIdx;
            return (
              <li key={step.key} className="flex flex-col items-center gap-2 flex-1 min-w-0 z-10">
                <span
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ring-2 shrink-0 box-border ${
                    active
                      ? 'bg-ink-800 text-white ring-ink-800'
                      : done
                        ? 'bg-emerald-600 text-white ring-emerald-600'
                        : 'bg-white text-ink-400 ring-beige-500'
                  }`}
                >
                  {done ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase text-center leading-tight px-0.5 ${
                    active ? 'text-ink-900' : done ? 'text-emerald-800' : 'text-ink-400'
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

export function CustomerWhatsAppOrders() {
  const [pageTab, setPageTab] = useState<PageTab>('orders');
  const [orders, setOrders] = useState<WaOrder[]>([]);
  const [metrics, setMetrics] = useState<WaMetrics | null>(null);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    order: WaOrder;
    events: { event: string; from_state?: string; to_state?: string; created_at: string }[];
    messages: WaMessage[];
    driver?: WaDriverDispatchInfo | null;
  } | null>(null);
  const [drivers, setDrivers] = useState<WaDriver[]>([]);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [trackingBaseUrl, setTrackingBaseUrl] = useState('');
  const [trackingBaseSource, setTrackingBaseSource] = useState('');
  const [trackingBaseDraft, setTrackingBaseDraft] = useState('');
  const [, setClock] = useState(0);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/wa-orders?status=${filter}`);
      if (!res.ok) throw new Error((await parseApiJson(res) as { error?: string }).error || 'Load failed');
      const data = await res.json();
      setOrders(data.orders || []);
      setMetrics(data.metrics || null);
    } catch (err) {
      setStatusMsg(apiUnreachableMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/wa-orders/${id}`);
      if (!res.ok) throw new Error('Detail load failed');
      const data = await res.json();
      setDetail(data);
    } catch {
      setDetail(null);
    }
  }, []);

  const loadDrivers = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/wa-drivers`);
      if (!res.ok) throw new Error('Drivers load failed');
      const data = await res.json();
      setDrivers(data.drivers || []);
    } catch (err) {
      setStatusMsg(apiUnreachableMessage(err));
    }
  }, []);

  const loadTrackingSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/wa-orders/settings`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        trackingEnabled?: boolean;
        trackingBaseUrl?: string;
        trackingBaseUrlSource?: string;
      };
      setTrackingEnabled(Boolean(data.trackingEnabled));
      const base = data.trackingBaseUrl || '';
      setTrackingBaseUrl(base);
      setTrackingBaseSource(data.trackingBaseUrlSource || '');
      setTrackingBaseDraft(base);
    } catch {
      /* optional */
    }
  }, []);

  const saveTrackingSettings = async (next: { trackingEnabled?: boolean; trackingBaseUrl?: string }) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/wa-orders/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = (await parseApiJson(res)) as {
        trackingEnabled?: boolean;
        trackingBaseUrl?: string;
        trackingBaseUrlSource?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setTrackingEnabled(Boolean(data.trackingEnabled));
      const base = data.trackingBaseUrl || '';
      setTrackingBaseUrl(base);
      setTrackingBaseSource(data.trackingBaseUrlSource || '');
      setTrackingBaseDraft(base);
      setStatusMsg(next.trackingEnabled === false ? 'GPS tracking off ✓' : 'GPS tracking updated ✓');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadOrders();
    loadTrackingSettings();
  }, [loadOrders, loadTrackingSettings]);

  useEffect(() => {
    const refresh = () => {
      loadOrders();
      if (selectedIdRef.current) loadDetail(selectedIdRef.current);
    };

    let es: EventSource | null = null;
    try {
      es = new EventSource(`${API_URL}/api/wa-orders/stream`);
      es.onmessage = refresh;
      es.onerror = () => es?.close();
    } catch {
      /* SSE unavailable */
    }

    const fallback = setInterval(refresh, 4000);
    return () => {
      es?.close();
      clearInterval(fallback);
    };
  }, [loadOrders, loadDetail]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (pageTab === 'drivers') loadDrivers();
  }, [pageTab, loadDrivers]);

  useEffect(() => {
    const id = setInterval(() => setClock((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const sortedOrders = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const aDelivered = isOrderDeliveredForList(a);
        const bDelivered = isOrderDeliveredForList(b);
        if (aDelivered !== bDelivered) return aDelivered ? 1 : -1;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }),
    [filtered],
  );

  const selected = detail?.order;

  const runAction = async (path: string, body?: object, method = 'POST') => {
    if (!selectedId) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await fetch(`${API_URL}/api/wa-orders/${selectedId}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await parseApiJson(res);
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Action failed');
      await loadOrders();
      await loadDetail(selectedId);
      const wa = (data as { whatsapp?: { sent?: boolean } }).whatsapp;
      const notified = (data as { driversNotified?: number }).driversNotified;
      if (notified) {
        setStatusMsg(`Driver poll sent to ${notified} driver(s) ✓`);
      } else {
        setStatusMsg(wa?.sent ? 'Updated — customer notified on WhatsApp ✓' : 'Updated ✓');
      }
      return data;
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const patchStatus = (status: string) =>
    runAction('/status', { status }, 'PATCH');

  const sendReply = () => runAction('/reply', { message: replyText }).then(() => setReplyText(''));

  const findDriver = () =>
    runAction('/find-driver').then((data) => {
      const notified = (data as { driversNotified?: number }).driversNotified;
      if (notified) setStatusMsg(`Driver poll sent to ${notified} driver(s) ✓`);
      loadOrders();
    });

  const sendTestAdToLuca = async () => {
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await fetch(`${API_URL}/api/wa-orders/send-test-ad`, { method: 'POST' });
      const data = await parseApiJson(res);
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Send failed');
      setStatusMsg(`Test ad sent to ${(data as { name?: string }).name || 'Luca'} ✓`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  const addDriver = async () => {
    if (!driverName.trim() || !driverPhone.trim()) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await fetch(`${API_URL}/api/wa-drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: driverName.trim(), phone: driverPhone.trim() }),
      });
      const data = await parseApiJson(res);
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Add failed');
      setDriverName('');
      setDriverPhone('');
      await loadDrivers();
      setStatusMsg('Driver added ✓');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleDriverActive = async (driver: WaDriver) => {
    setBusy(true);
    try {
      await fetch(`${API_URL}/api/wa-drivers/${driver.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !driver.active }),
      });
      await loadDrivers();
    } finally {
      setBusy(false);
    }
  };

  const removeDriver = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`${API_URL}/api/wa-drivers/${id}`, { method: 'DELETE' });
      await loadDrivers();
    } finally {
      setBusy(false);
    }
  };

  const mapUrl =
    selected?.lat && selected?.lng
      ? `https://www.google.com/maps?q=${selected.lat},${selected.lng}`
      : selected?.address_text
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address_text)}`
        : null;

  return (
    <AdminPageShell
      title="WhatsApp Orders"
      subtitle="Inbound orders from Meta ads — Chef Luca bot on +65 9132 9303"
      maxWidth="max-w-6xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <WhatsAppStatusLed />
          {pageTab === 'orders' && (
            <button
              type="button"
              disabled={busy}
              onClick={sendTestAdToLuca}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-beige-600 text-ink-700 hover:bg-cream-400 disabled:opacity-50"
              title="Send standard Meta ad message to Luca for testing"
            >
              <Send className="w-3.5 h-3.5" />
              Send test ad to Luca
            </button>
          )}
        </div>
        {statusMsg && (
          <p className={`text-sm ${statusMsg.includes('✓') ? 'text-emerald-700' : 'text-amber-800'}`}>
            {statusMsg}
          </p>
        )}
      </div>

      {pageTab === 'orders' && (
        <div className="mb-6 rounded-xl border border-beige-500 bg-white/80 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Navigation className="w-4 h-4 mt-0.5 text-mediterranean-800 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-ink-900">GPS tracking (test mode)</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  When on, driver pickup sends WhatsApp links for live GPS. Off = current flow unchanged.
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
              <span className="text-xs font-semibold text-ink-600">{trackingEnabled ? 'On' : 'Off'}</span>
              <input
                type="checkbox"
                className="sr-only peer"
                checked={trackingEnabled}
                disabled={busy}
                onChange={(e) => saveTrackingSettings({ trackingEnabled: e.target.checked })}
              />
              <span className="relative w-11 h-6 rounded-full bg-beige-600 peer-checked:bg-emerald-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            </label>
          </div>
          {trackingEnabled && (
            <div className="mt-3 pt-3 border-t border-beige-400 space-y-2">
              {trackingBaseUrl ? (
                <p className="text-xs text-ink-600">
                  Track links:{' '}
                  <span className="font-mono text-ink-800">{trackingBaseUrl}</span>
                  {trackingBaseSource === 'tailscale' && (
                    <span className="ml-1.5 text-emerald-800">(Tailscale IP — driver phone needs Tailscale on)</span>
                  )}
                  {trackingBaseSource === 'env' && (
                    <span className="ml-1.5 text-ink-500">(from PUBLIC_BASE_URL)</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-amber-800">
                  Tailscale not detected — install/run Tailscale on this Mac, or set PUBLIC_BASE_URL in server/.env
                </p>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer text-ink-500 hover:text-ink-700">Override base URL</summary>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="flex-1 min-w-[200px]">
                    <input
                      type="url"
                      value={trackingBaseDraft}
                      onChange={(e) => setTrackingBaseDraft(e.target.value)}
                      placeholder="http://100.x.x.x:5173"
                      className="mt-1 w-full rounded-lg border border-beige-500 px-2.5 py-1.5 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || trackingBaseDraft === trackingBaseUrl}
                    onClick={() => saveTrackingSettings({ trackingBaseUrl: trackingBaseDraft })}
                    className="text-xs font-semibold px-3 py-2 rounded-lg bg-mediterranean-800 text-white disabled:opacity-40"
                  >
                    Save override
                  </button>
                  {trackingBaseSource === 'setting' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveTrackingSettings({ trackingBaseUrl: '' })}
                      className="text-xs font-semibold px-3 py-2 rounded-lg border border-beige-600 text-ink-600"
                    >
                      Reset to auto
                    </button>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-6 border-b border-beige-500 pb-3">
        {([
          ['orders', 'Orders', null],
          ['drivers', 'Drivers', Users],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPageTab(key)}
            className={`inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
              pageTab === key
                ? 'bg-ink-800 text-white'
                : 'bg-white text-ink-600 border border-beige-600 hover:bg-cream-400'
            }`}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {label}
          </button>
        ))}
      </div>

      {pageTab === 'drivers' ? (
        <div className="bg-white rounded-xl border border-beige-600 p-5 max-w-xl">
          <h2 className="font-semibold text-ink-900 mb-1">Delivery drivers</h2>
          <p className="text-sm text-ink-500 mb-4">
            Add mobile numbers manually. When you tap Find a driver on an order, all active drivers get a
            WhatsApp poll with ETA options — first to accept gets pickup + drop-off details.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="Name"
              className="flex-1 min-w-[120px] text-sm border border-beige-600 rounded-lg px-3 py-2"
            />
            <input
              type="text"
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value)}
              placeholder="+65…"
              className="flex-1 min-w-[140px] text-sm border border-beige-600 rounded-lg px-3 py-2"
            />
            <button
              type="button"
              disabled={busy || !driverName.trim() || !driverPhone.trim()}
              onClick={addDriver}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-lg bg-mediterranean-800 text-white hover:bg-mediterranean-900 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          <ul className="divide-y divide-beige-400 border border-beige-500 rounded-lg overflow-hidden">
            {drivers.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 bg-cream-400/20">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink-900">{d.name}</p>
                  <p className="text-sm font-mono text-ink-600">{d.phone}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggleDriverActive(d)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    d.active
                      ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                      : 'bg-stone-100 text-stone-600 ring-1 ring-stone-300'
                  }`}
                >
                  {d.active ? 'Active' : 'Paused'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeDriver(d.id)}
                  className="p-1.5 text-stone-500 hover:text-red-700"
                  aria-label="Remove driver"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
            {drivers.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-ink-500">No drivers yet — add one above.</li>
            )}
          </ul>
        </div>
      ) : (
        <>
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            ['Orders today', metrics.ordersToday],
            ['Revenue today', formatMoney(metrics.revenueToday)],
            ['In zone', metrics.inZone],
            ['Avg order', formatMoney(metrics.avgOrderValue)],
          ].map(([label, val]) => (
            <div key={String(label)} className="bg-white rounded-xl border border-beige-600 px-4 py-3">
              <p className="text-xs text-ink-500 uppercase tracking-wide">{label}</p>
              <p className="text-xl font-semibold text-ink-900 mt-1">{val}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              filter === key
                ? 'bg-ink-800 text-white border-ink-800'
                : 'bg-white text-ink-600 border-beige-600 hover:bg-cream-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-ink-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-beige-600 overflow-hidden">
            <div className="px-4 py-3 border-b border-beige-400 bg-cream-400/50">
              <h2 className="font-semibold text-ink-800">Orders ({sortedOrders.length})</h2>
            </div>
            <ul className="divide-y divide-beige-400 max-h-[32rem] overflow-y-auto">
              {sortedOrders.map((o) => (
                <WaOrderListRow
                  key={o.id}
                  order={o}
                  selected={selectedId === o.id}
                  onSelect={() => setSelectedId(o.id)}
                />
              ))}
              {sortedOrders.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-ink-500">No orders in this filter.</li>
              )}
            </ul>
          </div>

          <div className="lg:col-span-3 bg-white rounded-xl border border-beige-600 p-5 min-h-[24rem]">
            {!selected ? (
              <p className="text-ink-500 text-sm py-12 text-center">Select an order to view details.</p>
            ) : (
              <>
                <WaOrderStatusTimeline status={selected.status} />

                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-ink-900">
                      {selected.customer_name || 'Guest'}
                      {selected.order_number != null && (
                        <span className="ml-2 text-base font-bold text-mediterranean-800">
                          {formatWaOrderBagTag(selected.order_number)}
                        </span>
                      )}
                    </h2>
                    <p className="text-sm font-mono text-ink-600">{selected.customer_phone}</p>
                    <p className="text-xs text-ink-400 mt-1">{formatTime(selected.created_at)}</p>
                  </div>
                </div>

                <div className="space-y-3 text-sm mb-5">
                  <div>
                    <p className="text-xs font-semibold text-ink-500 uppercase mb-1">Items</p>
                    <ul className="text-ink-800">
                      {(selected.items || []).map((i) => (
                        <li key={`${i.sku}-${i.qty}`}>
                          {i.qty}× {i.name} — {formatMoney(i.qty * i.unit_price)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-ink-700">
                      Delivery {formatMoney(selected.delivery_fee)} ·{' '}
                      <strong>Total {formatMoney(selected.total)}</strong>
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-ink-500 uppercase mb-1">Timing</p>
                    <p className="text-ink-800">
                      {selected.delivery_type === 'now'
                        ? 'ASAP today'
                        : selected.scheduled_for
                          ? formatTime(selected.scheduled_for)
                          : '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-ink-500 uppercase mb-1">Address</p>
                    <p className="text-ink-800">
                      {selected.address_text || '—'}
                      {selected.postal_code ? ` · ${selected.postal_code}` : ''}
                    </p>
                    <p className="text-xs mt-1">
                      {selected.in_grab_zone ? (
                        <span className="text-emerald-700">In Grab zone</span>
                      ) : selected.address_text ? (
                        <span className="text-indigo-700">Concierge delivery</span>
                      ) : null}
                      {mapUrl && (
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-mediterranean-800 underline"
                        >
                          <MapPin className="w-3 h-3" /> Open in Maps
                        </a>
                      )}
                    </p>
                    <div className="mt-3">
                      <WaOrderMap
                        destLat={selected.lat}
                        destLng={selected.lng}
                        destLabel={selected.address_text || undefined}
                      />
                    </div>
                  </div>

                  {detail?.driver?.dispatch && (
                    <div>
                      <p className="text-xs font-semibold text-ink-500 uppercase mb-1">Driver</p>
                      <p className="text-ink-800 text-sm">
                        {detail.driver.dispatch.status === 'assigned' ? (
                          <>
                            {detail.driver.driver?.name || detail.driver.dispatch.accepted_driver_phone} ·
                            awaiting pickup · ETA under {detail.driver.dispatch.eta_minutes} min
                          </>
                        ) : detail.driver.dispatch.status === 'picked_up' ? (
                          <>
                            {detail.driver.driver?.name || detail.driver.dispatch.accepted_driver_phone} ·
                            en route · ETA under {detail.driver.dispatch.eta_minutes} min
                          </>
                        ) : detail.driver.dispatch.status === 'delivered' ? (
                          <>
                            Delivered by{' '}
                            {detail.driver.driver?.name || detail.driver.dispatch.accepted_driver_phone}
                          </>
                        ) : detail.driver.dispatch.status === 'open' ? (
                          <span className="text-sky-800">Searching — poll sent to drivers…</span>
                        ) : (
                          detail.driver.dispatch.status
                        )}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-ink-500 uppercase mb-1">Payment</p>
                    <p className="text-ink-800 capitalize">
                      {selected.payment_provider || '—'} · {selected.payment_status || 'pending'}
                    </p>
                    {selected.payment_link && (
                      <a
                        href={selected.payment_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-mediterranean-800 underline break-all"
                      >
                        Payment link
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-5">
                  {selected.payment_status !== 'paid' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAction('/mark-paid')}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Mark paid
                    </button>
                  )}
                  {selected.status === 'paid' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => patchStatus('scheduled')}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-beige-600 hover:bg-cream-400 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Scheduled
                    </button>
                  )}
                  {['paid', 'scheduled', 'out_for_delivery'].includes(selected.status) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => patchStatus('out_for_delivery')}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-beige-600 hover:bg-cream-400"
                    >
                      <Truck className="w-3.5 h-3.5" /> Out for delivery
                    </button>
                  )}
                  {selected.payment_status === 'paid' &&
                    selected.address_text &&
                    !['open', 'assigned', 'picked_up'].includes(detail?.driver?.dispatch?.status || '') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={findDriver}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-sky-700 text-white hover:bg-sky-800 disabled:opacity-50"
                      >
                        <Radio className="w-3.5 h-3.5" /> Find a driver
                      </button>
                    )}
                  {!['completed', 'cancelled'].includes(selected.status) && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => patchStatus('completed')}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => patchStatus('cancelled')}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-stone-100 text-stone-700 border border-stone-300"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </>
                  )}
                </div>

                <div className="border-t border-beige-400 pt-4">
                  <p className="text-xs font-semibold text-ink-500 uppercase mb-2 flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5" /> Reply via WhatsApp
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Message to customer…"
                      className="flex-1 text-sm border border-beige-600 rounded-lg px-3 py-2"
                    />
                    <button
                      type="button"
                      disabled={busy || !replyText.trim()}
                      onClick={sendReply}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-mediterranean-800 text-white hover:bg-mediterranean-900 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>

                {detail?.messages && detail.messages.length > 0 && (
                  <div className="mt-4 border-t border-beige-400 pt-4 max-h-40 overflow-y-auto">
                    <p className="text-xs font-semibold text-ink-500 uppercase mb-2">Recent chat</p>
                    {detail.messages.slice(-8).map((m, i) => (
                      <p
                        key={i}
                        className={`text-xs mb-1 ${m.direction === 'out' ? 'text-mediterranean-800' : 'text-ink-700'}`}
                      >
                        <span className="font-semibold">{m.direction === 'out' ? 'Luca' : 'Customer'}:</span>{' '}
                        {(m.body || '').slice(0, 120)}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
        </>
      )}
    </AdminPageShell>
  );
}
