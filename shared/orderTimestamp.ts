const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export type TimestampSource = 'exif' | 'ocr' | 'unknown';

export interface OrderTimestampResult {
  orderedAt: string;
  source: TimestampSource;
  label: string;
}

function formatLabel(d: Date): string {
  return d.toLocaleString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Singapore',
  });
}

function parse12h(h: number, m: number, ampm: string): { h: number; m: number } {
  let hour = h % 12;
  if (/pm/i.test(ampm)) hour += 12;
  return { h: hour, m };
}

function setTime(base: Date, h: number, m: number): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Order time from iPhone photo metadata (EXIF) first, then Grab OCR text.
 * Never uses file.lastModified — that is wrong on iOS Safari uploads.
 */
export function extractOrderTimestamp(
  ocrText: string,
  imageCaptureMs?: number | null,
  referenceDate: Date = new Date(),
): OrderTimestampResult | null {
  // 1. Real photo capture time (iPhone Photos → Original date)
  if (imageCaptureMs && imageCaptureMs > 0) {
    const d = new Date(imageCaptureMs);
    return { orderedAt: d.toISOString(), source: 'exif', label: formatLabel(d) };
  }

  const text = ocrText || '';
  const now = referenceDate;

  // 2. Grab OCR patterns
  const todayMatch = text.match(/today[,\s]*(\d{1,2})[:\.](\d{2})\s*(am|pm)/i);
  if (todayMatch) {
    const { h, m } = parse12h(+todayMatch[1], +todayMatch[2], todayMatch[3]);
    const d = setTime(now, h, m);
    return { orderedAt: d.toISOString(), source: 'ocr', label: formatLabel(d) };
  }

  const yesterdayMatch = text.match(/yesterday[,\s]*(\d{1,2})[:\.](\d{2})\s*(am|pm)/i);
  if (yesterdayMatch) {
    const { h, m } = parse12h(+yesterdayMatch[1], +yesterdayMatch[2], yesterdayMatch[3]);
    const base = new Date(now);
    base.setDate(base.getDate() - 1);
    const d = setTime(base, h, m);
    return { orderedAt: d.toISOString(), source: 'ocr', label: formatLabel(d) };
  }

  const dateTimeMatch = text.match(
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,\s]+(\d{1,2})[:\.](\d{2})(?::(\d{2}))?\s*(am|pm)?/i,
  );
  if (dateTimeMatch) {
    const day = +dateTimeMatch[1];
    const month = MONTHS[dateTimeMatch[2].slice(0, 3).toLowerCase()];
    let h = +dateTimeMatch[3];
    const min = +dateTimeMatch[4];
    const sec = dateTimeMatch[5] ? +dateTimeMatch[5] : 0;
    const ampm = dateTimeMatch[6];
    if (ampm) ({ h } = parse12h(h, min, ampm));
    const d = new Date(now.getFullYear(), month, day, h, min, sec, 0);
    if (d > now) d.setFullYear(d.getFullYear() - 1);
    return { orderedAt: d.toISOString(), source: 'ocr', label: formatLabel(d) };
  }

  const statusBarMatch = text.match(/(?:^|\n)\s*(\d{1,2}):(\d{2})\s+all\b/i);
  if (statusBarMatch) {
    const h = +statusBarMatch[1];
    const m = +statusBarMatch[2];
    const d = setTime(now, h, m);
    return { orderedAt: d.toISOString(), source: 'ocr', label: formatLabel(d) };
  }

  return null;
}
