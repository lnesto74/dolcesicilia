import { useEffect, useRef } from 'react';
import {
  WHOLESALE_ZONES,
  STATUS_PIN_COLORS,
  type WholesaleLeadStatus,
} from '../../lib/wholesaleZones';

export interface MapLead {
  id: string;
  name: string;
  status: string;
  lat?: number | null;
  lng?: number | null;
  type?: string | null;
  phone?: string | null;
  fit_note?: string | null;
  last_contacted_at?: string | null;
}

type LeafletMap = {
  remove: () => void;
  removeLayer: (layer: object) => void;
  setView: (center: [number, number], zoom: number) => LeafletMap;
};

type LeafletLayer = object;

type LeafletApi = {
  map: (el: HTMLElement, opts?: object) => LeafletMap;
  tileLayer: (url: string, opts?: object) => LeafletLayer & { addTo: (map: LeafletMap) => void };
  circle: (
    latlng: [number, number],
    opts?: object,
  ) => LeafletLayer & {
    bindTooltip: (html: string, opts?: object) => LeafletLayer;
    on: (ev: string, fn: () => void) => LeafletLayer;
    addTo: (map: LeafletMap) => LeafletLayer;
  };
  circleMarker: (
    latlng: [number, number],
    opts?: object,
  ) => LeafletLayer & {
    bindPopup: (html: string) => LeafletLayer;
    on: (ev: string, fn: () => void) => LeafletLayer;
    addTo: (map: LeafletMap) => LeafletLayer;
  };
};

declare global {
  interface Window {
    L?: LeafletApi;
  }
}

function loadLeaflet(): Promise<LeafletApi> {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet-css', '1');
      document.head.appendChild(link);
    }
    const existing = document.querySelector('script[data-leaflet-js]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L!));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.setAttribute('data-leaflet-js', '1');
    script.onload = () => resolve(window.L!);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.body.appendChild(script);
  });
}

export function WholesaleMap({
  leads,
  selectedZoneId,
  selectedLeadId,
  onZoneSelect,
  onLeadSelect,
}: {
  leads: MapLead[];
  selectedZoneId: string | null;
  selectedLeadId: string | null;
  onZoneSelect: (zoneId: string) => void;
  onLeadSelect: (leadId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<{ zones: LeafletLayer[]; pins: LeafletLayer[] }>({
    zones: [],
    pins: [],
  });

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(
          [1.2766, 103.8458],
          15,
        );
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
      })
      .catch(() => {
        /* map unavailable offline */
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;

    for (const layer of layersRef.current.zones) map.removeLayer(layer);
    for (const layer of layersRef.current.pins) map.removeLayer(layer);
    layersRef.current = { zones: [], pins: [] };

    for (const zone of WHOLESALE_ZONES) {
      const active = zone.id === selectedZoneId;
      const circle = L.circle([zone.center.lat, zone.center.lng], {
        radius: zone.radiusM,
        color: active ? '#1e4d6b' : '#94a3b8',
        fillColor: active ? '#2d6a8f' : '#cbd5e1',
        fillOpacity: active ? 0.18 : 0.06,
        weight: active ? 2 : 1,
      });
      circle.bindTooltip(`<strong>${zone.name}</strong><br/>${zone.label}`, {
        direction: 'center',
        permanent: zone.id === 'tanjong-pagar-cbd',
        className: 'wholesale-zone-tooltip',
      });
      circle.on('click', () => onZoneSelect(zone.id));
      circle.addTo(map);
      layersRef.current.zones.push(circle);
    }

    for (const lead of leads) {
      if (lead.lat == null || lead.lng == null) continue;
      const status = (lead.status || 'new') as WholesaleLeadStatus;
      const color = STATUS_PIN_COLORS[status] || STATUS_PIN_COLORS.new;
      const marker = L.circleMarker([lead.lat, lead.lng], {
        radius: selectedLeadId === lead.id ? 10 : 7,
        color: selectedLeadId === lead.id ? '#111' : color,
        fillColor: color,
        fillOpacity: 0.95,
        weight: selectedLeadId === lead.id ? 3 : 1.5,
      });
      const last = lead.last_contacted_at
        ? `<br/>Last contact: ${lead.last_contacted_at}`
        : '';
      marker.bindPopup(
        `<strong>${lead.name}</strong><br/>${lead.type || ''}<br/>${lead.phone || 'No phone'}${last}`,
      );
      marker.on('click', () => onLeadSelect(lead.id));
      marker.addTo(map);
      layersRef.current.pins.push(marker);
    }
  }, [leads, selectedZoneId, selectedLeadId, onZoneSelect, onLeadSelect]);

  return (
    <div className="rounded-xl border border-beige-600 overflow-hidden bg-white shadow-sm">
      <div ref={containerRef} className="h-[320px] w-full z-0" />
      <p className="text-[10px] text-ink-500 px-3 py-2 border-t border-beige-500">
        Tanjong Pagar zone centred on Guoco Tower. Click a circle to filter leads; future zones shown
        lightly.
      </p>
    </div>
  );
}
