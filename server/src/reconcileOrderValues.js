import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractContactsFromImage } from './ocr.js';
import { extractImageCaptureMs } from './extractImageTimestamp.js';
import { extractOrderTimestamp } from '../../shared/orderTimestamp.js';
import { detectGrabScreenshotType, extractOrderValue } from '../../shared/parseOrderValue.js';
import { linkScreenshotToOrder, SCREENSHOTS_DIR } from './screenshots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MATCH_WINDOW_MS = 30 * 60 * 1000;

function parseMs(iso) {
  if (!iso) return null;
  const ms = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(ms) ? null : ms;
}

function namesMatch(ocrName, dbName) {
  if (!ocrName || !dbName) return true;
  const a = ocrName.toLowerCase().trim();
  const b = dbName.toLowerCase().trim();
  if (a === b) return true;
  const aFirst = a.split(/\s+/)[0];
  const bFirst = b.split(/\s+/)[0];
  if (aFirst.length > 1 && aFirst === bFirst) return true;
  if (b.includes(a) || a.includes(b)) return true;
  return false;
}

function shotOrderedMs(shot) {
  return parseMs(shot.ordered_at) ?? (shot.image_capture_ms ? Number(shot.image_capture_ms) : null);
}

async function refreshScreenshotMeta(shot) {
  const fullPath = path.join(SCREENSHOTS_DIR, shot.file_path);
  if (!fs.existsSync(fullPath)) {
    return { ...shot, contacts: [], orderValue: null, error: 'file missing' };
  }

  const buffer = fs.readFileSync(fullPath);
  let captureMs = shot.image_capture_ms ?? null;
  if (!captureMs) {
    captureMs = (await extractImageCaptureMs(buffer)) ?? null;
  }

  const { text, contacts } = await extractContactsFromImage(buffer);
  const screenType = detectGrabScreenshotType(text);
  const orderTs = extractOrderTimestamp(text, captureMs);
  const orderVal = extractOrderValue(text);

  return {
    ...shot,
    image_capture_ms: captureMs,
    ordered_at: orderTs?.orderedAt ?? shot.ordered_at,
    order_value: orderVal?.orderValue ?? null,
    currency: orderVal?.currency ?? 'SGD',
    value_source: orderVal?.source ?? null,
    screenType,
    contacts: contacts.length ? contacts : JSON.parse(shot.contacts_json || '[]'),
    ocr_text: text,
  };
}

/**
 * Match archived screenshots to existing orders by phone + EXIF time + name.
 * Only updates order_value fields — never creates contacts or orders.
 */
export async function reconcileOrderValues(db, normalizePhone) {
  const screenshots = db.prepare('SELECT * FROM order_screenshots ORDER BY created_at ASC').all();
  const orders = db.prepare(`
    SELECT o.id, o.contact_id, o.ordered_at, o.order_value, o.value_source, o.screenshot_id,
           c.name, c.phone
    FROM customer_orders o
    JOIN contacts c ON c.id = o.contact_id
  `).all();

  const pairs = [];

  for (const raw of screenshots) {
    const shot = await refreshScreenshotMeta(raw);
    if (shot.error) continue;

    const shotMs = shotOrderedMs(shot);

    const orderValue = shot.order_value;
    if (!shotMs || !orderValue || orderValue <= 0) continue;

    const contacts = shot.contacts || [];
    if (!contacts.length) continue;

    for (const contact of contacts) {
      const phone = contact.phone ? normalizePhone(contact.phone) : null;

      for (const order of orders) {
        if (phone) {
          if (normalizePhone(order.phone) !== phone) continue;
        } else if (!contact.name || contact.name === 'Unknown') {
          continue;
        } else if (!namesMatch(contact.name, order.name)) {
          continue;
        }

        const orderMs = parseMs(order.ordered_at);
        if (orderMs == null) continue;

        const diff = Math.abs(orderMs - shotMs);
        if (diff > MATCH_WINDOW_MS) continue;

        pairs.push({
          screenshotId: shot.id,
          orderId: order.id,
          contactId: order.contact_id,
          contactName: order.name,
          phone: order.phone,
          orderValue,
          currency: shot.currency || 'SGD',
          valueSource: shot.value_source,
          diff,
          filename: shot.original_filename,
          needsValue:
            order.order_value == null || order.order_value <= 0,
        });
      }
    }
  }

  pairs.sort((a, b) => a.diff - b.diff);

  const usedScreenshots = new Set();
  const usedOrders = new Set();
  const results = [];

  for (const pair of pairs) {
    if (usedScreenshots.has(pair.screenshotId) || usedOrders.has(pair.orderId)) continue;
    if (!pair.needsValue) {
      results.push({
        orderId: pair.orderId,
        name: pair.contactName,
        phone: pair.phone,
        status: 'skipped_has_value',
        orderValue: pair.orderValue,
      });
      continue;
    }

    db.prepare(`
      UPDATE customer_orders SET
        order_value = ?,
        currency = ?,
        value_source = ?,
        screenshot_id = ?
      WHERE id = ?
    `).run(pair.orderValue, pair.currency, pair.valueSource, pair.screenshotId, pair.orderId);

    linkScreenshotToOrder(db, pair.screenshotId, {
      contactId: pair.contactId,
      orderId: pair.orderId,
    });

    usedScreenshots.add(pair.screenshotId);
    usedOrders.add(pair.orderId);

    results.push({
      orderId: pair.orderId,
      name: pair.contactName,
      phone: pair.phone,
      status: 'updated',
      orderValue: pair.orderValue,
      filename: pair.filename,
      timeDiffMin: Math.round((pair.diff / 60_000) * 10) / 10,
    });
  }

  const updated = results.filter((r) => r.status === 'updated').length;
  const skippedHasValue = results.filter((r) => r.status === 'skipped_has_value').length;
  const unmatchedOrders = orders.filter(
    (o) => (o.order_value == null || o.order_value <= 0) && !usedOrders.has(o.id),
  ).length;
  const unmatchedScreenshots = screenshots.length - usedScreenshots.size;

  return {
    updated,
    skippedHasValue,
    unmatchedOrders,
    unmatchedScreenshots,
    results,
  };
}
