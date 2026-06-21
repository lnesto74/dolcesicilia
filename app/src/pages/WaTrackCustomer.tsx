import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, MapPin, Truck } from 'lucide-react';
import { WaLiveTrackMap } from '../components/waOrders/WaLiveTrackMap';
import { API_URL, parseApiJson } from '../lib/api';

interface TrackView {
  active: boolean;
  orderTag?: string;
  destination?: { lat: number | null; lng: number | null; label?: string | null };
  driver?: { lat: number; lng: number; updatedAt?: string | null } | null;
  endedAt?: string | null;
}

export function WaTrackCustomer() {
  const { orderNumber } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [view, setView] = useState<TrackView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderNumber || !token) {
      setError('Invalid tracking link');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/track/${encodeURIComponent(orderNumber)}?token=${encodeURIComponent(token)}`,
        );
        const data = (await parseApiJson(res)) as unknown as TrackView & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Tracking unavailable');
        if (!cancelled) {
          setView(data);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Tracking unavailable');
          setView(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderNumber, token]);

  const dest =
    view?.destination?.lat != null && view?.destination?.lng != null
      ? {
          lat: view.destination.lat,
          lng: view.destination.lng,
          label: view.destination.label,
        }
      : null;

  const driver = view?.driver ?? null;

  return (
    <div className="min-h-screen bg-cream-500 text-ink-900">
      <div className="max-w-lg mx-auto px-4 py-8">
        <header className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-mediterranean-800 mb-1">
            Dolce Sicilia
          </p>
          <h1 className="text-2xl font-serif font-bold">Live delivery</h1>
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
            <WaLiveTrackMap destination={dest} driver={driver} />

            <div className="rounded-xl border border-beige-500 bg-white px-4 py-3 space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 text-emerald-700 shrink-0" />
                <div>
                  <p className="font-semibold">Delivery address</p>
                  <p className="text-ink-600">{view.destination?.label || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Truck className="w-4 h-4 mt-0.5 text-blue-700 shrink-0" />
                <div>
                  <p className="font-semibold">Driver</p>
                  {driver ? (
                    <p className="text-ink-600">
                      On the way
                      {driver.updatedAt
                        ? ` · updated ${new Date(driver.updatedAt).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })}`
                        : ''}
                    </p>
                  ) : view.active ? (
                    <p className="text-ink-500">Waiting for driver GPS…</p>
                  ) : (
                    <p className="text-ink-500">Delivery completed</p>
                  )}
                </div>
              </div>
            </div>

            {!view.active && (
              <p className="text-center text-xs text-ink-500">This tracking link is no longer active.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
