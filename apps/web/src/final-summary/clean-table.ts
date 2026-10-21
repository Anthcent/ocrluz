/*
 * Prepares a photo of a ruled form for OCR, on grayscale pixels (0–255):
 *  1. Lighting is flattened by dividing each pixel by its neighbourhood mean, so shadows disappear while
 *     glyph edges keep their anti-aliasing.
 *  2. Table rules are erased. OCR reads them as «|», «[», «]» and glues neighbouring cells together.
 *     A rule is a dark run much longer than any letter; the mask is thickened across the run so a
 *     slightly tilted line still forms one long run.
 * Pure function (no DOM) so it runs the same in the browser and in tests.
 */
export function cleanTablePixels(gray: Float32Array, width: number, height: number): Uint8ClampedArray {
  const radius = Math.max(8, Math.floor(Math.min(width, height) / 60));
  const integral = buildIntegral(gray, width, height);
  const localMean = (r: number) => boxMean(integral, width, height, r);
  const near = localMean(radius);
  const wide = localMean(radius * 2);

  const dark = new Uint8Array(width * height);
  for (let i = 0; i < dark.length; i++) dark[i] = gray[i] < near[i] - 18 ? 1 : 0;

  const band = 2;
  const rules = new Uint8Array(width * height);
  markRuns(dark, rules, width, height, Math.max(60, Math.floor(width / 25)), band, true);
  markRuns(dark, rules, width, height, Math.max(60, Math.floor(height / 18)), band, false);
  const grown = dilate(rules, width, height);

  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < out.length; i++) out[i] = grown[i] ? 255 : (gray[i] / (wide[i] + 1)) * 245;
  return out;
}

function buildIntegral(gray: Float32Array, width: number, height: number) {
  const stride = width + 1;
  const sum = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x];
      sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + row;
    }
  }
  return sum;
}

function boxMean(sum: Float64Array, width: number, height: number, r: number) {
  const stride = width + 1;
  const mean = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const total = sum[y1 * stride + x1] - sum[y0 * stride + x1] - sum[y1 * stride + x0] + sum[y0 * stride + x0];
      mean[y * width + x] = total / ((y1 - y0) * (x1 - x0));
    }
  }
  return mean;
}

/**
 * Marks dark pixels that belong to a run of at least `minLength` along rows (`horizontal`) or columns,
 * where a position counts as dark if any pixel within `band` across the run direction is dark.
 */
function markRuns(dark: Uint8Array, rules: Uint8Array, width: number, height: number, minLength: number, band: number, horizontal: boolean) {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const at = (line: number, pos: number) => (horizontal ? line * width + pos : pos * width + line);
  const thick = new Uint8Array(length);
  for (let line = 0; line < lines; line++) {
    thick.fill(0);
    for (let d = -band; d <= band; d++) {
      const other = line + d;
      if (other < 0 || other >= lines) continue;
      for (let pos = 0; pos < length; pos++) if (dark[at(other, pos)]) thick[pos] = 1;
    }
    let start = -1;
    for (let pos = 0; pos <= length; pos++) {
      const on = pos < length && thick[pos] === 1;
      if (on && start < 0) start = pos;
      else if (!on && start >= 0) {
        if (pos - start >= minLength) for (let p = start; p < pos; p++) if (dark[at(line, p)]) rules[at(line, p)] = 1;
        start = -1;
      }
    }
  }
}

function dilate(mask: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width) out[yy * width + xx] = 1;
        }
      }
    }
  }
  return out;
}
