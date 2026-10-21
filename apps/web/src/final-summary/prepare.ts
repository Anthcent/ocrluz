import { encodeUnderLimit } from '../lib/image';
import { cleanTablePixels } from './clean-table';

// A dense 35-row grid needs more pixels than an ordinary page; the cleaned grayscale JPEG still fits 1 MB.
const MAX_SIDE = 2600;

/** Orients, scales and cleans a photo of the form (flat lighting, no table rules) before OCR. */
export async function prepareFormImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = image;
    const gray = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    const clean = cleanTablePixels(gray, canvas.width, canvas.height);
    for (let i = 0; i < clean.length; i++) {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = clean[i];
      data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return await encodeUnderLimit(canvas);
  } finally {
    bitmap.close();
  }
}
