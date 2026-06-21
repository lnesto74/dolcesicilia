import { useCallback, useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

interface WhatsAppStatus {
  enabled: boolean;
  connected: boolean;
  status?: string;
  message: string;
}

type LedState = 'loading' | 'off' | 'live' | 'waiting' | 'down' | 'error';

type LedMeta = { state: LedState; label: string; detail: string; href?: string };

function ledMeta(wa: WhatsAppStatus | null, loading: boolean): LedMeta {
  if (loading && !wa) {
    return { state: 'loading' as LedState, label: 'Checking…', detail: 'Connecting to server' };
  }
  if (!wa?.enabled) {
    return { state: 'off' as LedState, label: 'OpenWA off', detail: 'Enable in Queue settings' };
  }
  if (wa.connected && wa.status === 'ready') {
    return { state: 'live' as LedState, label: 'WhatsApp live', detail: wa.message };
  }
  if (wa.status === 'qr_ready') {
    return {
      state: 'waiting' as LedState,
      label: 'Scan QR',
      detail: 'Open http://127.0.0.1:2886 — wait ~15s if it just started',
      href: 'http://127.0.0.1:2886/',
    };
  }
  if (wa.status === 'initializing' || wa.status === 'connecting') {
    return { state: 'waiting' as LedState, label: 'Connecting…', detail: wa.message };
  }
  if (wa.status === 'disconnected') {
    return { state: 'down' as LedState, label: 'Disconnected', detail: wa.message };
  }
  if (!wa.connected) {
    return { state: 'down' as LedState, label: 'Not connected', detail: wa.message };
  }
  return { state: 'error' as LedState, label: wa.status || 'Unknown', detail: wa.message };
}

const LED_DOT: Record<LedState, string> = {
  loading: 'bg-ink-400 animate-pulse',
  off: 'bg-ink-400',
  live: 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.9)]',
  waiting: 'bg-amber-400 animate-pulse',
  down: 'bg-red-500',
  error: 'bg-amber-500',
};

const LED_RING: Record<LedState, string> = {
  loading: 'border-ink-300/40',
  off: 'border-ink-300/40',
  live: 'border-green-400/50',
  waiting: 'border-amber-400/50',
  down: 'border-red-400/50',
  error: 'border-amber-400/50',
};

export function WhatsAppStatusLed({
  variant = 'inline',
  pollMs = 12000,
}: {
  variant?: 'header' | 'inline';
  pollMs?: number;
}) {
  const [wa, setWa] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/status`);
      if (res.ok) setWa(await res.json());
      else setWa({ enabled: false, connected: false, message: 'Status check failed' });
    } catch {
      setWa({ enabled: false, connected: false, message: 'Dolce server offline' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const meta = ledMeta(wa, loading);
  const { state, label, detail, href } = meta;
  const isHeader = variant === 'header';

  const inner = (
    <>
      <span className="relative flex h-2.5 w-2.5">
        {state === 'live' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${LED_DOT[state]}`} />
      </span>
      <span
        className={`text-xs font-semibold leading-none ${
          isHeader ? 'text-mediterranean-50' : state === 'live' ? 'text-green-800' : 'text-ink-700'
        }`}
      >
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2.5 shrink-0 rounded-full border px-3 py-1.5 hover:opacity-90 ${
          isHeader
            ? `bg-white/10 ${LED_RING[state]} border`
            : `bg-cream-400 border-beige-600 ${LED_RING[state]}`
        }`}
        title={detail}
      >
        {inner}
      </a>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2.5 shrink-0 rounded-full border px-3 py-1.5 ${
        isHeader
          ? `bg-white/10 ${LED_RING[state]} border`
          : `bg-cream-400 border-beige-600 ${LED_RING[state]}`
      }`}
      title={detail}
    >
      {inner}
    </div>
  );
}
