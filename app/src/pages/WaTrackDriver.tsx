import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, MapPin, Radio, Crosshair } from 'lucide-react';
import { WaLiveTrackMap } from '../components/waOrders/WaLiveTrackMap';
import { API_URL, parseApiJson } from '../lib/api';

interface DriverTrackView {
  active: boolean;
  orderTag?: string;
  destination?: { lat: number | null; lng: number | null; label?: string | null };
}

export function WaTrackDriver() {
  const { token } = useParams();
  const [view, setView] = useState<DriverTrackView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [driverPin, setDriverPin] = useState<{ lat: number; lng: number } | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [shareError, setShareError] = useState('');
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const needsPinMode = typeof window !== 'undefined' && !window.isSecureContext;

  useEffect(() => {
    if (!token) {
      setError('Invalid link');
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetch(`${API_URL}/api/track/driver/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = (await parseApiJson(res)) as unknown as DriverTrackView & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Session not found');
        if (!cancelled) {
          setView(data);
          setError('');
          if (!window.isSecureContext) setPinMode(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Session not found');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const stopSharing = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSharing(false);
  }, []);

  const sendLocation = useCallback(
    async (lat: number, lng: number) => {
      if (!token) return;
      const res = await fetch(`${API_URL}/api/track/driver/${encodeURIComponent(token)}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      const data = await parseApiJson(res);
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Upload failed');
      setLastSent(new Date().toISOString());
      setShareError('');
      setDriverPin({ lat, lng });
    },
    [token],
  );

  const startGpsSharing = useCallback(() => {
    if (!token || !view?.active) return;
    setShareError('');
    setPinMode(false);

    if (!window.isSecureContext) {
      setPinMode(true);
      return;
    }

    if (!navigator.geolocation) {
      setShareError('GPS not available — tap the map instead');
      setPinMode(true);
      return;
    }

    const push = (pos: GeolocationPosition) => {
      sendLocation(pos.coords.latitude, pos.coords.longitude).catch((err) => {
        setShareError(err instanceof Error ? err.message : 'Upload failed');
      });
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        push(pos);
        setSharing(true);
        watchIdRef.current = navigator.geolocation.watchPosition(
          push,
          () => {
            setShareError('GPS lost — tap the map to update your position');
            setPinMode(true);
          },
          { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
        );

        intervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(push, () => {}, {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 15000,
          });
        }, 30000);
      },
      () => {
        setShareError('GPS blocked — tap the map where you are');
        setPinMode(true);
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }, [token, view?.active, sendLocation]);

  const handleMapPick = useCallback(
    (lat: number, lng: number) => {
      sendLocation(lat, lng).catch((err) => {
        setShareError(err instanceof Error ? err.message : 'Upload failed');
      });
    },
    [sendLocation],
  );

  useEffect(() => () => stopSharing(), [stopSharing]);

  const dest =
    view?.destination?.lat != null && view?.destination?.lng != null
      ? { lat: view.destination.lat, lng: view.destination.lng, label: view.destination.label }
      : null;

  return (
    <div className="min-h-screen bg-cream-500 text-ink-900">
      <div className="max-w-lg mx-auto px-4 py-8">
        <header className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-mediterranean-800 mb-1">
            Dolce Sicilia · Driver
          </p>
          <h1 className="text-2xl font-serif font-bold">Share location</h1>
          {view?.orderTag && <p className="text-sm text-ink-600 mt-1">{view.orderTag}</p>}
        </header>

        {loading && (
          <div className="flex justify-center py-16 text-ink-500">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">
            {error}
          </div>
        )}

        {!loading && view && (
          <div className="space-y-4">
            <div className="rounded-xl border border-beige-500 bg-white px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 text-emerald-700 shrink-0" />
                <div>
                  <p className="font-semibold">Drop-off</p>
                  <p className="text-ink-600">{view.destination?.label || '—'}</p>
                </div>
              </div>
            </div>

            {!view.active ? (
              <p className="text-center text-sm text-ink-500">This delivery is complete — sharing stopped.</p>
            ) : (
              <>
                {needsPinMode && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                    Safari blocks auto-GPS on this link (not HTTPS). <strong>Tap the map</strong> where you are — works
                    the same for the customer.
                  </div>
                )}

                <WaLiveTrackMap
                  destination={dest}
                  driver={driverPin}
                  pickMode={pinMode}
                  onPick={handleMapPick}
                  emptyLabel="Loading map…"
                  className="h-64"
                />

                {pinMode ? (
                  <p className="text-center text-sm font-semibold text-emerald-800 flex items-center justify-center gap-2">
                    <Crosshair className="w-4 h-4" />
                    Tap the map where you are
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={sharing ? stopSharing : startGpsSharing}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-base font-semibold shadow-sm ${
                      sharing ? 'bg-ink-800 text-white' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    <Radio className={`w-5 h-5 ${sharing ? 'animate-pulse' : ''}`} />
                    {sharing ? 'Stop GPS sharing' : 'Share location (auto GPS)'}
                  </button>
                )}

                {!pinMode && needsPinMode && (
                  <button
                    type="button"
                    onClick={() => {
                      stopSharing();
                      setPinMode(true);
                    }}
                    className="w-full text-sm text-mediterranean-800 underline"
                  >
                    Or tap the map instead
                  </button>
                )}

                {lastSent && (
                  <p className="text-center text-xs text-emerald-800">
                    Location sent
                    {lastSent
                      ? ` · ${new Date(lastSent).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`
                      : ''}
                  </p>
                )}

                {shareError && <p className="text-center text-sm text-red-700">{shareError}</p>}

                {!dest && (
                  <p className="text-center text-xs text-ink-500">
                    Map centred on Singapore — tap where you are on the route.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
