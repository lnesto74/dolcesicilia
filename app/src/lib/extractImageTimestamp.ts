import exifr from 'exifr';

const EXIF_PICK = ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'DateTime'];

function pickCaptureDate(tags: Record<string, unknown> | undefined): Date | null {
  if (!tags) return null;
  const date = (tags.DateTimeOriginal || tags.CreateDate || tags.ModifyDate || tags.DateTime) as
    | Date
    | undefined;
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  return null;
}

/**
 * iPhone Photos "Original" timestamp — read immediately when user picks the file,
 * before Safari can strip metadata on upload.
 */
export async function extractImageCaptureMs(file: File): Promise<number | null> {
  const attempts = [
    { pick: EXIF_PICK, reviveValues: true },
    { reviveValues: true, tiff: true, xmp: true },
  ];
  for (const opts of attempts) {
    try {
      const date = pickCaptureDate((await exifr.parse(file, opts)) as Record<string, unknown>);
      if (date) return date.getTime();
    } catch {
      // try next
    }
  }
  return null;
}
