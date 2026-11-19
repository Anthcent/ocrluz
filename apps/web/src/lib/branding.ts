/**
 * School branding shared by the sign-in screens and every exporter (PDF, Word, print).
 * The server keeps the same texts for its own exports in apps/server/src/lib/branding.ts.
 */

export const SCHOOL_NAME = 'Liceo José Antonio Abreu';
export const SCHOOL_LOGO_ALT = `Escudo del ${SCHOOL_NAME}`;

/** Full-resolution crest (transparent background). Files live in apps/web/public/brand. */
export const SCHOOL_LOGO_URL = '/brand/liceo-jose-antonio-abreu.png';
/** Lighter 360 px tall copy for on-screen use. */
export const SCHOOL_LOGO_SMALL_URL = '/brand/liceo-jose-antonio-abreu-360.png';
/** Crest pre-faded to 10 % opacity, used as the watermark behind exported pages. */
export const SCHOOL_WATERMARK_URL = '/brand/liceo-jose-antonio-abreu-watermark.png';
/** Height / width of the crest images. */
export const SCHOOL_LOGO_RATIO = 568 / 439;

export const EXPORT_FOOTER_TEXT = `Documento exportado por el sistema del ${SCHOOL_NAME}`;

/** Footer printed on every exported page, with the export date. */
export function exportFooter(date = new Date()) {
  const day = date.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${EXPORT_FOOTER_TEXT} · ${day}`;
}

/** Loads the watermark as an image element, or null when it cannot be read (the export goes on without it). */
export async function loadWatermark(): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.src = SCHOOL_WATERMARK_URL;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** Fetches the watermark PNG bytes, or null when unavailable. */
export async function fetchWatermark(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(SCHOOL_WATERMARK_URL);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}
