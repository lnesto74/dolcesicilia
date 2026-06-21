import crypto from 'crypto';
import {
  getSetting,
  setSetting,
  getWaOrder,
  getWaOrderByNumber,
  createWaDeliveryTracking,
  getWaDeliveryTrackingByOrderId,
  getWaDeliveryTrackingByCustomerToken,
  getWaDeliveryTrackingByDriverToken,
  updateWaDeliveryTrackingLocation,
  endWaDeliveryTracking,
} from './db.js';
import { formatOrderNumber, formatOrderTag } from '../../shared/waOrderDrivers.js';
import { waOrderConfig } from '../../shared/waOrderConfig.js';
import { resolvePublicWebBase } from './publicBaseUrl.js';

export function isWaTrackingEnabled() {
  return getSetting('wa_tracking_enabled', 'false') === 'true';
}

export function trackingPublicBase() {
  const { base } = resolvePublicWebBase({
    setting: getSetting('wa_tracking_base_url', ''),
    envUrl: waOrderConfig().publicBaseUrl,
  });
  return base;
}

function trackingBaseMeta() {
  return resolvePublicWebBase({
    setting: getSetting('wa_tracking_base_url', ''),
    envUrl: waOrderConfig().publicBaseUrl,
  });
}

function randomToken() {
  return crypto.randomBytes(18).toString('hex');
}

export function startDeliveryTracking(orderId) {
  if (!orderId) return null;
  const existing = getWaDeliveryTrackingByOrderId(orderId);
  if (existing?.status === 'active') return existing;
  return createWaDeliveryTracking({
    orderId,
    customerToken: randomToken(),
    driverToken: randomToken(),
  });
}

export function buildCustomerTrackUrl(order, customerToken) {
  const base = trackingPublicBase();
  if (!base || !customerToken) return null;
  const num = formatOrderNumber(order.order_number) || '000';
  return `${base}/track/${num}?token=${encodeURIComponent(customerToken)}`;
}

export function buildDriverTrackUrl(driverToken) {
  const base = trackingPublicBase();
  if (!base || !driverToken) return null;
  return `${base}/track/driver/${encodeURIComponent(driverToken)}`;
}

export function endDeliveryTracking(orderId) {
  if (!orderId) return null;
  return endWaDeliveryTracking(orderId);
}

export function getCustomerTrackingView(orderNumberRaw, customerToken) {
  const token = String(customerToken || '').trim();
  if (!token) return null;

  const tracking = getWaDeliveryTrackingByCustomerToken(token);
  if (!tracking) return null;

  const orderNum = parseInt(String(orderNumberRaw || '').replace(/^#/, ''), 10);
  const order = Number.isFinite(orderNum)
    ? getWaOrderByNumber(orderNum)
    : getWaOrder(tracking.orderId);
  if (!order || order.id !== tracking.orderId) return null;

  return {
    active: tracking.status === 'active',
    orderTag: formatOrderTag(order),
    orderNumber: order.order_number,
    destination: {
      lat: order.lat ?? null,
      lng: order.lng ?? null,
      label: order.address_text || null,
    },
    driver:
      tracking.driverLat != null && tracking.driverLng != null
        ? {
            lat: tracking.driverLat,
            lng: tracking.driverLng,
            updatedAt: tracking.driverUpdatedAt,
          }
        : null,
    endedAt: tracking.endedAt,
  };
}

export function getDriverTrackingView(driverToken) {
  const token = String(driverToken || '').trim();
  if (!token) return null;

  const tracking = getWaDeliveryTrackingByDriverToken(token);
  if (!tracking) return null;

  const order = getWaOrder(tracking.orderId);
  if (!order) return null;

  return {
    active: tracking.status === 'active',
    orderTag: formatOrderTag(order),
    destination: {
      lat: order.lat ?? null,
      lng: order.lng ?? null,
      label: order.address_text || null,
    },
  };
}

export function recordDriverGps(driverToken, lat, lng) {
  const token = String(driverToken || '').trim();
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!token || !Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return { ok: false, error: 'Invalid location' };
  }
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
    return { ok: false, error: 'Coordinates out of range' };
  }

  const tracking = getWaDeliveryTrackingByDriverToken(token);
  if (!tracking) return { ok: false, error: 'Unknown session' };
  if (tracking.status !== 'active') return { ok: false, error: 'Tracking ended' };

  updateWaDeliveryTrackingLocation(token, latN, lngN);
  return { ok: true };
}

export function getWaTrackingSettings() {
  const { base, source } = trackingBaseMeta();
  return {
    trackingEnabled: isWaTrackingEnabled(),
    trackingBaseUrl: base,
    trackingBaseUrlSource: source,
  };
}

export function patchWaTrackingSettings({ trackingEnabled, trackingBaseUrl } = {}) {
  if (trackingEnabled !== undefined) {
    setSetting('wa_tracking_enabled', trackingEnabled ? 'true' : 'false');
  }
  if (trackingBaseUrl !== undefined) {
    setSetting('wa_tracking_base_url', String(trackingBaseUrl || '').trim().replace(/\/$/, ''));
  }
  return getWaTrackingSettings();
}
