import exifr from 'exifr';

const EXIF_PICK = ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'DateTime'];

function pickCaptureDate(tags) {
  if (!tags) return null;
  const date = tags.DateTimeOriginal || tags.CreateDate || tags.ModifyDate || tags.DateTime;
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  return null;
}

/**
 * Read the real capture time from image bytes (iPhone Photos "Original" date).
 * JPEG, HEIC, and iOS PNG screenshots (eXIf chunk).
 */
export async function extractImageCaptureMs(buffer) {
  if (!buffer?.length) return null;
  const attempts = [
    { pick: EXIF_PICK, reviveValues: true },
    { reviveValues: true, tiff: true, xmp: true },
  ];
  for (const opts of attempts) {
    try {
      const date = pickCaptureDate(await exifr.parse(buffer, opts));
      if (date) return date.getTime();
    } catch {
      // try next strategy
    }
  }
  return null;
}

/** Client may read EXIF before iOS Safari strips it on upload — trust ISO string from phone. */
export function parseClientCaptureIso(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}
