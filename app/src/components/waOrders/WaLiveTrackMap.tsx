import { useEffect, useRef } from 'react';

type MapPoint = { lat: number; lng: number; label?: string | null };

type AnyMap = {
  setView: (latlng: [number, number], zoom: number) => void;
  fitBounds: (bounds: unknown, opts?: object) => void;
  remove: () => void;
  on: (event: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void;
  off: (event: string, fn?: (e: { latlng: { lat: number; lng: number } }) => void) => void;
};

type AnyMarker = {
  setLatLng: (latlng: [number, number]) => void;
  addTo: (m: AnyMap) => AnyMarker;
  bindPopup: (html: string) => AnyMarker;
  remove: () => void;
};

type AnyLeaflet = {
  map: (el: HTMLElement, opts?: object) => AnyMap;
  tileLayer: (url: string, opts?: object) => { addTo: (m: AnyMap) => void };
  marker: (latlng: [number, number], opts?: object) => AnyMarker;
  divIcon: (opts: object) => object;
  latLngBounds: (points: [number, number][]) => { pad: (n: number) => unknown };
};

function getLeaflet(): AnyLeaflet | undefined {
  return (window as unknown as { L?: AnyLeaflet }).L;
}

let leafletLoading: Promise<AnyLeaflet> | null = null;

function loadLeaflet() {
  const existing = getLeaflet();
  if (existing) return Promise.resolve(existing);
  if (leafletLoading) return leafletLoading;

  leafletLoading = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet-css', '1');
      document.head.appendChild(link);
    }

    const scriptEl = document.querySelector('script[data-leaflet-js]');
    if (scriptEl) {
      scriptEl.addEventListener('load', () => {
        const L = getLeaflet();
        if (L) resolve(L);
        else reject(new Error('Leaflet failed to load'));
      });
      scriptEl.addEventListener('error', () => reject(new Error('Leaflet failed to load')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.setAttribute('data-leaflet-js', '1');
    script.onload = () => {
      const L = getLeaflet();
      if (L) resolve(L);
      else reject(new Error('Leaflet failed to load'));
    };
    script.onerror = () => reject(new Error('Leaflet failed to load'));
    document.body.appendChild(script);
  });

  return leafletLoading;
}

export function WaLiveTrackMap({
  destination,
  driver,
  pickMode = false,
  onPick,
  className = 'h-72',
  emptyLabel = 'Waiting for driver location…',
}: {
  destination?: MapPoint | null;
  driver?: MapPoint | null;
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
  emptyLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AnyMap | null>(null);
  const destMarkerRef = useRef<AnyMarker | null>(null);
  const driverMarkerRef = useRef<AnyMarker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;

        if (!mapRef.current) {
          const center: [number, number] =
            driver != null
              ? [driver.lat, driver.lng]
              : destination != null
                ? [destination.lat, destination.lng]
                : [1.3521, 103.8198];

          const map = L.map(containerRef.current, {
            zoomControl: true,
            attributionControl: true,
          });
          map.setView(center, 14);
          mapRef.current = map;

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap',
          }).addTo(map);
        }

        const map = mapRef.current;
        if (!map) return;

        if (destination) {
          if (!destMarkerRef.current) {
            destMarkerRef.current = L.marker([destination.lat, destination.lng], {
              title: destination.label || 'Delivery',
            })
              .addTo(map)
              .bindPopup(destination.label || 'Your delivery address');
          } else {
            destMarkerRef.current.setLatLng([destination.lat, destination.lng]);
          }
        }

        if (driver) {
          const icon = L.divIcon({
            className: '',
            html: '<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });

          if (!driverMarkerRef.current) {
            driverMarkerRef.current = L.marker([driver.lat, driver.lng], { icon })
              .addTo(map)
              .bindPopup('Driver');
          } else {
            driverMarkerRef.current.setLatLng([driver.lat, driver.lng]);
          }
        }

        const points: [number, number][] = [];
        if (destination) points.push([destination.lat, destination.lng]);
        if (driver) points.push([driver.lat, driver.lng]);
        if (points.length === 1) {
          map.setView(points[0], 15);
        } else if (points.length > 1) {
          map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 16 });
        }
      })
      .catch(() => {
        /* map unavailable */
      });

    return () => {
      cancelled = true;
    };
  }, [destination?.lat, destination?.lng, driver?.lat, driver?.lng, destination?.label]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickMode) return;

    const handler = (e: { latlng: { lat: number; lng: number } }) => {
      onPickRef.current?.(e.latlng.lat, e.latlng.lng);
    };
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [pickMode]);

  useEffect(() => {
    return () => {
      destMarkerRef.current?.remove();
      driverMarkerRef.current?.remove();
      mapRef.current?.remove();
      destMarkerRef.current = null;
      driverMarkerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  if (!destination && !driver && !pickMode) {
    return (
      <div className="rounded-xl border border-beige-500 bg-cream-400/40 px-4 py-8 text-center text-sm text-ink-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-xl border border-beige-500 overflow-hidden ${className} ${pickMode ? 'cursor-crosshair ring-2 ring-emerald-500/40' : ''}`}
    />
  );
}
