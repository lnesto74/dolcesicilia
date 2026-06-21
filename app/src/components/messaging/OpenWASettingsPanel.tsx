import { useCallback, useEffect, useState } from 'react';
import { WhatsAppStatusLed } from '../WhatsAppStatusLed';
import { API_URL } from '../../lib/api';

export interface OpenWASettings {
  openwaEnabled: boolean;
  openwaUrl: string;
  openwaApiKey: string;
  openwaSessionId: string;
  senderName: string;
  followupCampaignEnabled: boolean;
}

export function useOpenwaSettings() {
  const [settings, setSettings] = useState<OpenWASettings>({
    openwaEnabled: false,
    openwaUrl: 'http://127.0.0.1:2785',
    openwaApiKey: '',
    openwaSessionId: '',
    senderName: 'Luca',
    followupCampaignEnabled: true,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      if (res.ok) {
        const s = await res.json();
        setSettings({
          openwaEnabled: s.openwaEnabled ?? false,
          openwaUrl: s.openwaUrl || 'http://127.0.0.1:2785',
          openwaApiKey: s.openwaApiKey || '',
          openwaSessionId: s.openwaSessionId || '',
          senderName: s.senderName || 'Luca',
          followupCampaignEnabled: s.followupCampaignEnabled ?? true,
        });
      }
    } catch {
      /* offline */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Partial<OpenWASettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await fetch(`${API_URL}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openwaEnabled: next.openwaEnabled,
        openwaUrl: next.openwaUrl,
        openwaApiKey: next.openwaApiKey,
        openwaSessionId: next.openwaSessionId,
        senderName: next.senderName,
        followupCampaignEnabled: next.followupCampaignEnabled,
      }),
    });
  };

  return { settings, setSettings, loading, load, save };
}

export function OpenWASettingsPanel({
  onStatus,
}: {
  onStatus?: (msg: string) => void;
}) {
  const { settings, setSettings, save } = useOpenwaSettings();

  const saveAll = async () => {
    await save(settings);
    onStatus?.('OpenWA settings saved');
  };

  const setupWebhook = async () => {
    const res = await fetch(`${API_URL}/api/whatsapp/setup-webhook`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) onStatus?.(`Webhook registered → ${data.webhookUrl}`);
    else onStatus?.(data.error || 'Webhook setup failed');
  };

  return (
    <section className="bg-white rounded-xl border border-beige-600 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-ink-900">WhatsApp via OpenWA</h2>
          <p className="text-sm text-ink-500 mt-1">
            Connection settings for automated send and reply detection.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <span className="text-sm font-medium text-ink-700">
            {settings.openwaEnabled ? 'ON' : 'OFF'}
          </span>
          <input
            type="checkbox"
            checked={settings.openwaEnabled}
            onChange={(e) => setSettings((s) => ({ ...s, openwaEnabled: e.target.checked }))}
            className="w-5 h-5 accent-mediterranean-700"
          />
        </label>
      </div>

      {settings.openwaEnabled && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-500">API URL</label>
              <input
                value={settings.openwaUrl}
                onChange={(e) => setSettings((s) => ({ ...s, openwaUrl: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-beige-600 rounded-lg text-sm"
                placeholder="http://127.0.0.1:2785"
              />
            </div>
            <div>
              <label className="text-xs text-ink-500">Session ID</label>
              <input
                value={settings.openwaSessionId}
                onChange={(e) => setSettings((s) => ({ ...s, openwaSessionId: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-beige-600 rounded-lg text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-ink-500">API Key</label>
              <input
                type="password"
                value={settings.openwaApiKey}
                onChange={(e) => setSettings((s) => ({ ...s, openwaApiKey: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-beige-600 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveAll}
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
  );
}
