const MAX_SIDE = 2200;
// Límite del plan gratuito de OCR.space.
const MAX_BYTES = 1024 * 1024 - 32 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', quality),
  );
}

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas no disponible');
  return ctx;
}

/**
 * Encodes a canvas as JPEG under the OCR size limit, lowering quality first and then
 * resolution until it fits.
 */
async function encodeUnderLimit(source: HTMLCanvasElement): Promise<Blob> {
  let scale = 1;
  let quality = 0.9;
  for (let attempt = 0; attempt < 8; attempt++) {
    let canvas = source;
    if (scale < 1) {
      canvas = document.createElement('canvas');
      canvas.width = Math.round(source.width * scale);
      canvas.height = Math.round(source.height * scale);
      context(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
    }
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= MAX_BYTES) return blob;
    if (quality > 0.65) quality -= 0.1;
    else scale *= 0.85;
  }
  throw new Error('La imagen es demasiado grande');
}

/**
 * Normaliza una foto para OCR: corrige la orientación, reduce el tamaño y la comprime a JPEG
 * por debajo de 1 MB para que sea aceptada por todos los motores.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = context(canvas);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await encodeUnderLimit(canvas);
  } finally {
    bitmap.close();
  }
}

export type RotateDirection = 'cw' | 'ccw';

/** Gira una imagen 90° (por defecto en el sentido de las agujas del reloj). */
export async function rotateImage(file: Blob, direction: RotateDirection = 'cw'): Promise<Blob> {
  return editImage(file, { rotation: direction === 'cw' ? 90 : 270 });
}

export type ImageFilter = 'none' | 'gray' | 'bw' | 'contrast';
export type Rotation = 0 | 90 | 180 | 270;

/** Crop rectangle in normalized coordinates (0–1) of the already rotated image. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageEdits {
  rotation?: Rotation;
  crop?: CropRect | null;
  filter?: ImageFilter;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

export const isFullCrop = (c?: CropRect | null) => !c || (c.x <= 0.001 && c.y <= 0.001 && c.w >= 0.999 && c.h >= 0.999);

/** Draws `bitmap` rotated by `rotation` into a new canvas, optionally scaled down to fit `maxSide`. */
export function drawRotated(bitmap: ImageBitmap, rotation: Rotation, maxSide = Infinity) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const sideways = rotation === 90 || rotation === 270;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = context(canvas);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  return canvas;
}

/** Applies a pixel filter in place. Works without `ctx.filter`, which Safari lacks. */
export function applyFilter(canvas: HTMLCanvasElement, filter: ImageFilter) {
  if (filter === 'none') return;
  const ctx = context(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const n = d.length / 4;
  const lum = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; p < n; i += 4, p++) lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

  if (filter === 'gray') {
    for (let i = 0, p = 0; p < n; i += 4, p++) d[i] = d[i + 1] = d[i + 2] = lum[p];
  } else if (filter === 'bw') {
    const t = otsuThreshold(lum);
    for (let i = 0, p = 0; p < n; i += 4, p++) d[i] = d[i + 1] = d[i + 2] = lum[p] > t ? 255 : 0;
  } else {
    // Stretch levels between the 2nd and 98th luminance percentiles, keeping color.
    const hist = histogram(lum);
    const lo = percentile(hist, n, 0.02);
    const hi = Math.max(lo + 1, percentile(hist, n, 0.98));
    const k = 255 / (hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = (d[i] - lo) * k;
      d[i + 1] = (d[i + 1] - lo) * k;
      d[i + 2] = (d[i + 2] - lo) * k;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function histogram(lum: Uint8ClampedArray) {
  const hist = new Uint32Array(256);
  for (let p = 0; p < lum.length; p++) hist[lum[p]]++;
  return hist;
}

function percentile(hist: Uint32Array, total: number, q: number) {
  const target = total * q;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

function otsuThreshold(lum: Uint8ClampedArray) {
  const hist = histogram(lum);
  const total = lum.length;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += v * hist[v];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = v;
    }
  }
  return threshold;
}

/** Rotates, crops and filters an image, returning a new JPEG ready for OCR. */
export async function editImage(file: Blob, { rotation = 0, crop, filter = 'none' }: ImageEdits): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    let canvas = drawRotated(bitmap, rotation);
    if (!isFullCrop(crop) && crop) {
      const sx = Math.round(crop.x * canvas.width);
      const sy = Math.round(crop.y * canvas.height);
      const sw = Math.max(1, Math.round(crop.w * canvas.width));
      const sh = Math.max(1, Math.round(crop.h * canvas.height));
      const cropped = document.createElement('canvas');
      cropped.width = sw;
      cropped.height = sh;
      context(cropped).drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas = cropped;
    }
    applyFilter(canvas, filter);
    return await encodeUnderLimit(canvas);
  } finally {
    bitmap.close();
  }
}
