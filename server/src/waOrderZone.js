import { waOrderConfig } from '../../shared/waOrderConfig.js';

let cachedOnemapToken = null;
let tokenExpiresAt = 0;

async function fetchOnemapToken(cfg) {
  if (cfg.onemapToken) return cfg.onemapToken;
  if (!cfg.onemapEmail || !cfg.onemapPassword) return null;
  if (cachedOnemapToken && Date.now() < tokenExpiresAt) return cachedOnemapToken;

  const res = await fetch('https://www.onemap.gov.sg/api/auth/post/getToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.onemapEmail, password: cfg.onemapPassword }),
  });
  if (!res.ok) throw new Error(`OneMap auth failed (${res.status})`);
  const data = await res.json();
  cachedOnemapToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expiry_timestamp ? data.expiry_timestamp * 1000 - Date.now() - 60_000 : 3600_000);
  return cachedOnemapToken;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function extractPostalCode(text) {
  const m = String(text || '').match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

export async function geocodeSingaporeAddress(addressText) {
  const cfg = waOrderConfig();
  const postal = extractPostalCode(addressText);
  const searchVal = postal || String(addressText || '').trim().slice(0, 120);
  if (!searchVal) return { ok: false, error: 'No address provided' };

  try {
    const token = await fetchOnemapToken(cfg).catch(() => null);
    const headers = token ? { Authorization: token } : {};
    const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(searchVal)}&returnGeom=Y&getAddrDetails=Y`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      const hit = data?.results?.[0];
      if (hit?.LATITUDE && hit?.LONGITUDE) {
        const lat = Number(hit.LATITUDE);
        const lng = Number(hit.LONGITUDE);
        const distanceKm = haversineKm(lat, lng, cfg.bakeryLat, cfg.bakeryLng);
        const inGrabZone = distanceKm <= cfg.grabZoneRadiusKm;
        return {
          ok: true,
          lat,
          lng,
          postalCode: hit.POSTAL || postal,
          formatted: hit.ADDRESS || addressText,
          distanceKm: Math.round(distanceKm * 100) / 100,
          inGrabZone,
          deliveryFee: inGrabZone ? cfg.deliveryFeeInZone : cfg.deliveryFeeOutZone,
        };
      }
    }
  } catch (err) {
    console.warn('[wa-order] OneMap geocode failed:', err.message);
  }

  if (postal) {
    return {
      ok: true,
      lat: null,
      lng: null,
      postalCode: postal,
      formatted: String(addressText).trim(),
      distanceKm: null,
      inGrabZone: false,
      deliveryFee: cfg.deliveryFeeOutZone,
      geocodeFallback: true,
    };
  }

  return { ok: false, error: 'Address not found — please include your 6-digit postal code' };
}
