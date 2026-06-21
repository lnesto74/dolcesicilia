import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractContactsFromImage } from './ocr.js';
import { extractImageCaptureMs } from './extractImageTimestamp.js';
import { extractOrderTimestamp } from '../../shared/orderTimestamp.js';
import { detectGrabScreenshotType, extractOrderValue } from '../../shared/parseOrderValue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCREENSHOTS_DIR = path.join(__dirname, '..', 'data', 'screenshots');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function extFromFilename(name, mimeType) {
  const fromName = path.extname(name || '').toLowerCase();
  if (fromName) return fromName;
  if (mimeType?.includes('png')) return '.png';
  if (mimeType?.includes('heic') || mimeType?.includes('heif')) return '.heic';
  return '.jpg';
}

/** Persist screenshot bytes + OCR metadata to disk and DB. */
export function storeScreenshot(db, {
  buffer,
  originalFilename,
  mimeType,
  ocrText,
  imageCaptureMs,
  contactsJson,
}) {
  const id = uniqueId();
  const ext = extFromFilename(originalFilename, mimeType);
  const storedFilename = `${id}${ext}`;
  const filePath = path.join(SCREENSHOTS_DIR, storedFilename);
  fs.writeFileSync(filePath, buffer);

  const captureMs = imageCaptureMs ?? null;
  const orderTs = extractOrderTimestamp(ocrText || '', captureMs);
  const orderVal = extractOrderValue(ocrText || '');

  db.prepare(`
    INSERT INTO order_screenshots (
      id, original_filename, file_path, mime_type, file_size,
      ocr_text, image_capture_ms, ordered_at, order_value, currency, value_source,
      timestamp_source, contacts_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    originalFilename || storedFilename,
    storedFilename,
    mimeType || 'image/jpeg',
    buffer.length,
    ocrText || '',
    captureMs,
    orderTs?.orderedAt ?? null,
    orderVal?.orderValue ?? null,
    orderVal?.currency ?? 'SGD',
    orderVal?.source ?? null,
    orderTs?.source ?? null,
    contactsJson ? JSON.stringify(contactsJson) : null,
  );

  return {
    id,
    filePath,
    storedFilename,
    orderTimestamp: orderTs,
    orderValue: orderVal,
  };
}

export function linkScreenshotToOrder(db, screenshotId, { contactId, orderId }) {
  if (!screenshotId) return;
  db.prepare(`
    UPDATE order_screenshots
    SET contact_id = COALESCE(?, contact_id),
        order_id = COALESCE(?, order_id)
    WHERE id = ?
  `).run(contactId || null, orderId || null, screenshotId);
}

export function getScreenshotFilePath(db, id) {
  const row = db.prepare('SELECT file_path FROM order_screenshots WHERE id = ?').get(id);
  if (!row) return null;
  const full = path.join(SCREENSHOTS_DIR, row.file_path);
  return fs.existsSync(full) ? full : null;
}

export function listScreenshots(db) {
  return db.prepare(`
    SELECT s.*, c.name AS contact_name, c.phone AS contact_phone
    FROM order_screenshots s
    LEFT JOIN contacts c ON c.id = s.contact_id
    ORDER BY s.created_at DESC
  `).all();
}

/** Re-run OCR + timestamp + value extraction on every stored screenshot. */
export async function reprocessAllScreenshots(db) {
  const rows = db.prepare('SELECT * FROM order_screenshots ORDER BY created_at ASC').all();
  const results = [];

  for (const row of rows) {
    const fullPath = path.join(SCREENSHOTS_DIR, row.file_path);
    if (!fs.existsSync(fullPath)) {
      results.push({ id: row.id, filename: row.original_filename, error: 'file missing' });
      continue;
    }

    const buffer = fs.readFileSync(fullPath);
    let captureMs = row.image_capture_ms ?? null;
    if (!captureMs) {
      captureMs = (await extractImageCaptureMs(buffer)) ?? null;
    }

    const { text, contacts } = await extractContactsFromImage(buffer);
    const orderTs = extractOrderTimestamp(text, captureMs);
    const orderVal = extractOrderValue(text);

    db.prepare(`
      UPDATE order_screenshots SET
        ocr_text = ?,
        image_capture_ms = ?,
        ordered_at = ?,
        order_value = ?,
        currency = ?,
        value_source = ?,
        timestamp_source = ?,
        contacts_json = ?,
        processed_at = datetime('now')
      WHERE id = ?
    `).run(
      text,
      captureMs,
      orderTs?.orderedAt ?? null,
      orderVal?.orderValue ?? null,
      orderVal?.currency ?? 'SGD',
      orderVal?.source ?? null,
      orderTs?.source ?? null,
      JSON.stringify(contacts),
      row.id,
    );

    let orderUpdated = false;
    if (row.order_id) {
      const upd = db.prepare(`
        UPDATE customer_orders SET
          ordered_at = COALESCE(?, ordered_at),
          screenshot_at = COALESCE(?, screenshot_at),
          order_value = ?,
          currency = ?,
          value_source = ?,
          timestamp_source = COALESCE(?, timestamp_source),
          screenshot_id = COALESCE(screenshot_id, ?)
        WHERE id = ?
      `).run(
        orderTs?.orderedAt ?? null,
        captureMs ? new Date(captureMs).toISOString() : null,
        orderVal?.orderValue ?? null,
        orderVal?.currency ?? 'SGD',
        orderVal?.source ?? null,
        orderTs?.source ?? null,
        row.id,
        row.order_id,
      );
      orderUpdated = upd.changes > 0;
    } else if (row.contact_id) {
      const latest = db.prepare(`
        SELECT id FROM customer_orders
        WHERE contact_id = ? AND (screenshot_id = ? OR source_image = ?)
        ORDER BY ordered_at DESC LIMIT 1
      `).get(row.contact_id, row.id, row.original_filename);
      if (latest) {
        db.prepare(`
          UPDATE customer_orders SET
            screenshot_id = ?,
            ordered_at = COALESCE(?, ordered_at),
            screenshot_at = COALESCE(?, screenshot_at),
            order_value = ?,
            currency = ?,
            value_source = ?,
            timestamp_source = COALESCE(?, timestamp_source)
          WHERE id = ?
        `).run(
          row.id,
          orderTs?.orderedAt ?? null,
          captureMs ? new Date(captureMs).toISOString() : null,
          orderVal?.orderValue ?? null,
          orderVal?.currency ?? 'SGD',
          orderVal?.source ?? null,
          orderTs?.source ?? null,
          latest.id,
        );
        linkScreenshotToOrder(db, row.id, { contactId: row.contact_id, orderId: latest.id });
        orderUpdated = true;
      }
    }

    const screenType = detectGrabScreenshotType(text);
    results.push({
      id: row.id,
      filename: row.original_filename,
      orderValue: orderVal?.orderValue ?? null,
      orderedAt: orderTs?.orderedAt ?? null,
      contactsFound: contacts.length,
      screenType,
      orderUpdated,
    });
  }

  return { processed: results.length, results };
}
