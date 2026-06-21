const PICKUP = { lat: 1.3691, lng: 103.7764, label: 'Kitchen pickup' };

function osmEmbedUrl(lat: number, lng: number, delta = 0.012) {
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function WaOrderMap({
  destLat,
  destLng,
  destLabel,
}: {
  destLat?: number | null;
  destLng?: number | null;
  destLabel?: string | null;
}) {
  if (destLat == null || destLng == null) {
    return (
      <div className="rounded-lg border border-beige-500 bg-cream-400/40 px-3 py-4 text-xs text-ink-500">
        Map appears once the delivery address is geocoded.
      </div>
    );
  }

  const mapsLink = `https://www.google.com/maps/dir/?api=1&origin=${PICKUP.lat},${PICKUP.lng}&destination=${destLat},${destLng}`;

  return (
    <div className="rounded-lg border border-beige-500 overflow-hidden">
      <iframe
        title={destLabel || 'Delivery map'}
        src={osmEmbedUrl(destLat, destLng)}
        className="w-full h-44 border-0"
        loading="lazy"
      />
      <p className="text-[10px] text-ink-500 px-2 py-1.5 border-t border-beige-500 flex flex-wrap gap-x-3">
        <span>Green pin: delivery</span>
        <span>Pickup: {PICKUP.label}</span>
        <a href={mapsLink} target="_blank" rel="noreferrer" className="text-mediterranean-800 underline">
          Route in Google Maps
        </a>
      </p>
    </div>
  );
}
