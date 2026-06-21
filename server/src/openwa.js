import { getSetting } from './db.js';

export function openwaConfig() {
  // Node 18 on Mac resolves localhost → ::1; OpenWA Docker binds 127.0.0.1 only
  const rawUrl = getSetting('openwa_url', 'http://127.0.0.1:2785').replace(/\/$/, '');
  const url = rawUrl.replace(/\/\/localhost\b/i, '//127.0.0.1');
  return {
    enabled: getSetting('openwa_enabled', 'false') === 'true',
    url,
    apiKey: getSetting('openwa_api_key', ''),
    sessionId: getSetting('openwa_session_id', ''),
  };
}

/** WhatsApp chat id: digits only + @c.us */
export function phoneToChatId(phone) {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@c.us`;
}

/** chatId or from field → normalized +phone (only valid for @c.us ids) */
export function chatIdToPhone(chatId) {
  const digits = String(chatId).replace(/@c\.us$/i, '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

/** Poll votes arrive as @lid ids — resolve to the real @c.us contact */
export async function resolveContactByChatId(chatId) {
  const cfg = openwaConfig();
  if (!cfg.apiKey || !cfg.sessionId) return null;
  try {
    const data = await openwaFetch(
      `/api/sessions/${cfg.sessionId}/contacts/${encodeURIComponent(chatId)}`,
    );
    return data?.data || data;
  } catch (err) {
    console.warn('OpenWA contact resolve failed:', chatId, err.message);
    return null;
  }
}

export async function phoneFromWhatsAppFrom(from) {
  if (!from) return '';
  if (/@lid$/i.test(from)) {
    const resolved = await resolveContactByChatId(from);
    if (resolved?.id) return chatIdToPhone(resolved.id);
  }
  return chatIdToPhone(from);
}

async function openwaFetch(path, options = {}) {
  const cfg = openwaConfig();
  if (!cfg.apiKey || !cfg.sessionId) {
    throw new Error('OpenWA not configured (API key and session ID required)');
  }
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': cfg.apiKey,
    ...options.headers,
  };
  const res = await fetch(`${cfg.url}${path}`, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `OpenWA ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

export async function getSessionStatus() {
  const cfg = openwaConfig();
  const data = await openwaFetch(`/api/sessions/${cfg.sessionId}`);
  return data?.data?.status || data?.status || 'unknown';
}

async function fetchOpenwaHealth() {
  const cfg = openwaConfig();
  try {
    const res = await fetch(`${cfg.url}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startWhatsAppSession() {
  const cfg = openwaConfig();
  return openwaFetch(`/api/sessions/${cfg.sessionId}/start`, { method: 'POST' });
}

export async function waitForSessionReady(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let status = 'unknown';
    try {
      status = await getSessionStatus();
    } catch {
      /* API may still be waking up */
    }
    if (status === 'ready') return { ok: true, status };
    if (status === 'qr_ready') return { ok: false, status, needsQr: true };
    await sleep(2000);
  }
  let status = 'unknown';
  try {
    status = await getSessionStatus();
  } catch {
    /* ignore */
  }
  return { ok: false, status };
}

async function maybeRegisterWebhook() {
  const webhookUrl = getSetting('openwa_webhook_url', '');
  if (!webhookUrl) return;
  try {
    await registerWebhook(webhookUrl);
    console.log('[OpenWA] Webhook re-registered');
  } catch (err) {
    console.warn('[OpenWA] Webhook re-register failed:', err.message);
  }
}

/** Start session if stopped; poll until ready. Called on API boot and by watchdog. */
export async function ensureOpenwaSession(options = {}) {
  const cfg = openwaConfig();
  if (!cfg.enabled) return { skipped: true, reason: 'disabled' };
  if (!cfg.apiKey || !cfg.sessionId) return { skipped: true, reason: 'not_configured' };

  const healthy = await fetchOpenwaHealth();
  if (!healthy) return { ok: false, error: 'OpenWA API not reachable' };

  let status;
  try {
    status = await getSessionStatus();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  if (status === 'ready') return { ok: true, status: 'ready', already: true };
  if (status === 'qr_ready') {
    return { ok: false, status, needsQr: true, error: 'Scan QR at localhost:2886' };
  }

  if (status === 'disconnected') {
    console.log('[OpenWA] Session disconnected — starting…');
    try {
      await startWhatsAppSession();
    } catch (err) {
      return { ok: false, status, error: err.message };
    }
  }

  const waited = await waitForSessionReady(options.timeoutMs ?? 90_000);
  if (waited.ok) {
    await maybeRegisterWebhook();
    return { ok: true, status: 'ready', started: status === 'disconnected' };
  }
  return {
    ok: false,
    status: waited.status,
    needsQr: waited.needsQr,
    error: waited.needsQr ? 'QR scan required at localhost:2886' : `Timed out (status: ${waited.status})`,
  };
}

let watchdogStarted = false;
let reconnectInFlight = null;

/** Poll every 30s and auto-reconnect if OpenWA drops to disconnected. */
export function startOpenwaWatchdog(intervalMs = 30_000) {
  if (watchdogStarted) return;
  watchdogStarted = true;

  const tick = async () => {
    if (reconnectInFlight) return;
    const cfg = openwaConfig();
    if (!cfg.enabled || !cfg.apiKey || !cfg.sessionId) return;

    reconnectInFlight = (async () => {
      try {
        if (!(await fetchOpenwaHealth())) return;
        const status = await getSessionStatus().catch(() => null);
        if (status !== 'disconnected') return;
        console.log('[OpenWA] Watchdog: reconnecting disconnected session…');
        const result = await ensureOpenwaSession();
        if (!result.ok) {
          console.warn('[OpenWA] Watchdog reconnect failed:', result.error || result.status);
        }
      } catch (err) {
        console.warn('[OpenWA] Watchdog error:', err.message);
      } finally {
        reconnectInFlight = null;
      }
    })();
  };

  setInterval(tick, intervalMs);
}

export async function getOpenwaStatus() {
  const cfg = openwaConfig();
  if (!cfg.enabled) {
    return { enabled: false, connected: false, message: 'OpenWA disabled' };
  }
  if (!cfg.apiKey || !cfg.sessionId) {
    return { enabled: true, connected: false, message: 'Add API key and session ID in settings' };
  }
  try {
    const status = await getSessionStatus();
    const connected = status === 'ready';
    const hints = {
      qr_ready: 'Scan the QR code in OpenWA dashboard first (localhost:2886)',
      initializing: 'Session is starting — wait a moment',
      connecting: 'Connecting to WhatsApp…',
      disconnected: 'Reconnecting automatically…',
    };
    return {
      enabled: true,
      connected,
      status,
      sessionId: cfg.sessionId,
      message: connected
        ? 'WhatsApp connected — ready to send'
        : hints[status] || `Session status: ${status}`,
    };
  } catch (err) {
    return { enabled: true, connected: false, message: err.message };
  }
}

export async function ensureWhatsAppReady() {
  let status;
  try {
    status = await getSessionStatus();
  } catch (err) {
    return { ok: false, status: 'unknown', error: err.message };
  }

  if (status === 'ready') return { ok: true, status };

  if (status === 'disconnected') {
    const recovered = await ensureOpenwaSession({ timeoutMs: 60_000 });
    if (recovered.ok) return { ok: true, status: 'ready', recovered: true };
    return { ok: false, status: recovered.status || status, error: recovered.error };
  }

  if (status === 'initializing' || status === 'connecting') {
    const waited = await waitForSessionReady(45_000);
    if (waited.ok) return { ok: true, status: 'ready' };
    status = waited.status;
  }

  const hints = {
    qr_ready: 'WhatsApp not linked yet — open localhost:2886, show QR, scan with your phone',
    initializing: 'WhatsApp session is still starting — try again in 30 seconds',
    connecting: 'WhatsApp is connecting — try again shortly',
    disconnected: 'WhatsApp session is stopped — auto-reconnect failed, check OpenWA',
  };
  return { ok: false, status, error: hints[status] || `WhatsApp not ready (status: ${status})` };
}

export async function sendTextMessage(phone, text) {
  const cfg = openwaConfig();
  const chatId = phoneToChatId(phone);
  return openwaFetch(`/api/sessions/${cfg.sessionId}/messages/send-text`, {
    method: 'POST',
    body: JSON.stringify({ chatId, text }),
  });
}

/** Fetch order cart from an incoming order message via OpenWA (best-effort). */
export async function fetchOpenWaOrderFromMessage(webhookData) {
  const cfg = openwaConfig();
  const msgId = webhookData?.id || webhookData?.messageId;
  const chatId = webhookData?.chatId || webhookData?.from;
  if (!msgId || !cfg.apiKey) return null;

  if (webhookData?.order?.products?.length) {
    return webhookData.order;
  }

  if (chatId) {
    try {
      const data = await openwaFetch(
        `/api/sessions/${cfg.sessionId}/messages/resolve-order`,
        {
          method: 'POST',
          body: JSON.stringify({ messageId: msgId, chatId }),
        },
      );
      const order = data?.order || data?.data?.order;
      if (order?.products?.length || order?.productItems?.length) return order;
    } catch (err) {
      console.warn('[OpenWA] resolve-order failed:', msgId, err.message);
    }
  }

  const tries = [
    `/api/sessions/${cfg.sessionId}/messages/${encodeURIComponent(msgId)}/order`,
    `/api/sessions/${cfg.sessionId}/messages/${encodeURIComponent(msgId)}`,
  ];
  for (const path of tries) {
    try {
      const data = await openwaFetch(path);
      const order = data?.order || data?.data?.order || data?.data;
      if (order?.products?.length || order?.productItems?.length) return order;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Fetch WhatsApp Business catalog order details when webhook only includes order id. */
export async function fetchOpenWaOrder(orderId) {
  if (!orderId) return null;
  const cfg = openwaConfig();
  try {
    const data = await openwaFetch(
      `/api/sessions/${cfg.sessionId}/orders/${encodeURIComponent(orderId)}`,
    );
    return data?.data || data?.order || data;
  } catch {
    return null;
  }
}

export async function sendPollMessage(phone, question, options) {
  const cfg = openwaConfig();
  const chatId = phoneToChatId(phone);
  return openwaFetch(`/api/sessions/${cfg.sessionId}/messages/send-poll`, {
    method: 'POST',
    body: JSON.stringify({ chatId, question, options }),
  });
}

export async function registerWebhook(webhookUrl, secret = 'dolcesicilia-webhook') {
  const cfg = openwaConfig();
  return openwaFetch(`/api/sessions/${cfg.sessionId}/webhooks`, {
    method: 'POST',
    body: JSON.stringify({
      url: webhookUrl,
      events: ['message.received'],
      secret,
    }),
  });
}
