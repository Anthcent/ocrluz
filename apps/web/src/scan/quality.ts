import type { PageQuality } from '../lib/pages-store';

/** Side of the downscaled grayscale copy used for the checks; small keeps it under a few ms. */
const SAMPLE_SIDE = 480;
/** Below this variance of the Laplacian the text edges are too soft to read reliably. */
const BLUR_VARIANCE = 55;
/** Mean luminance (0–255) below which the photo is considered underexposed. */
const DARK_MEAN = 75;

/**
 * Cheap capture-quality heuristic: variance of the Laplacian (sharpness) and mean brightness
 * on a downscaled grayscale copy. Never throws; returns no warnings when it cannot analyze.
 */
export async function assessQuality(image: Blob): Promise<PageQuality> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(image);
    const scale = Math.min(1, SAMPLE_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(3, Math.round(bitmap.width * scale));
    const h = Math.max(3, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return {};
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const gray = new Float32Array(w * h);
    let total = 0;
    for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      total += gray[p];
    }
    const mean = total / gray.length;
    let spread = 0;
    for (let p = 0; p < gray.length; p++) spread += (gray[p] - mean) ** 2;
    // A nearly blank sheet has no edges at all; that is not blur.
    const blank = Math.sqrt(spread / gray.length) < 12;

    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const lap = gray[p - w] + gray[p + w] + gray[p - 1] + gray[p + 1] - 4 * gray[p];
        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }
    const variance = count ? sumSq / count - (sum / count) ** 2 : Infinity;

    return {
      blurry: (!blank && variance < BLUR_VARIANCE) || undefined,
      dark: mean < DARK_MEAN || undefined,
    };
  } catch {
    return {};
  } finally {
    bitmap?.close();
  }
}

export const hasQualityIssue = (q?: PageQuality) => Boolean(q?.blurry || q?.dark);

/** Short label and explanation shown on cards and in the viewer. */
export function qualityCopy(q?: PageQuality): { label: string; hint: string } | null {
  if (q?.blurry && q?.dark) return { label: 'Movida y oscura', hint: 'La foto salió poco nítida y con poca luz. Repetirla mejora mucho el texto reconocido.' };
  if (q?.blurry) return { label: 'Poco nítida', hint: 'Las letras se ven difusas. Sostén el teléfono quieto o acércate un poco y repite la foto.' };
  if (q?.dark) return { label: 'Muy oscura', hint: 'Falta luz en la hoja. Busca más claridad o enciende la luz de la cámara y repite la foto.' };
  return null;
}
