import { hexRGB } from './colour';

const luma = (d: ArrayLike<number>, p: number) => 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];

/** Mean luma of pixels with mask > 128 and alpha > 100. Null when the mask is empty. */
export function maskMean(d: ArrayLike<number>, mask: Uint8Array): number | null {
  let sum = 0, cnt = 0;
  for (let q = 0, p = 0; q < mask.length; q++, p += 4) if (mask[q] > 128 && d[p + 3] > 100) { sum += luma(d, p); cnt++; }
  return cnt ? sum / cnt : null;
}

/** The recolour curve for one channel (SPEC 6.4). Keeps folds and shadows. */
export function curve(T: number, s: number): number {
  return s <= 1 ? T * Math.pow(s, 1.15) : T + (1 - T) * Math.min(1, (s - 1) * 1.2);
}

/** Recolour one pixel in place given its weight a (0–1). */
export function recolourPixel(d: Uint8Array | Uint8ClampedArray | Float32Array, p: number, a: number, T: [number, number, number], mean: number) {
  const s = luma(d, p) / mean;
  for (let c = 0; c < 3; c++) d[p + c] = d[p + c] * (1 - a) + Math.min(1, curve(T[c], s)) * 255 * a;
}

/** ui3.js recolour(): recolours `d` (RGBA) inside `mask` towards `hex`. */
export function recolour(d: Uint8Array | Uint8ClampedArray, mask: Uint8Array, hex: string) {
  const mean = maskMean(d, mask);
  if (mean == null) return;
  const T = hexRGB(hex);
  for (let q = 0, p = 0; q < mask.length; q++, p += 4) {
    const a = mask[q] / 255;
    if (a <= 0) continue;
    recolourPixel(d, p, a, T, mean);
  }
}

/**
 * Means for a sequence of recolours applied one after another, without touching the image.
 * Pixel values for later masks include the effect of earlier recolours, exactly as the
 * web code's sequential recolour() calls see them. Used to feed the GPU shader.
 */
export function sequentialMeans(d: ArrayLike<number>, steps: { mask: Uint8Array; hex: string }[]): (number | null)[] {
  const means: (number | null)[] = [];
  const px = new Float32Array(4);
  for (let k = 0; k < steps.length; k++) {
    const m = steps[k].mask;
    let sum = 0, cnt = 0;
    for (let q = 0, p = 0; q < m.length; q++, p += 4) {
      if (m[q] <= 128 || d[p + 3] <= 100) continue;
      px[0] = d[p]; px[1] = d[p + 1]; px[2] = d[p + 2]; px[3] = d[p + 3];
      for (let j = 0; j < k; j++) {
        const mj = means[j], a = steps[j].mask[q] / 255;
        if (mj == null || a <= 0) continue;
        recolourPixel(px, 0, a, hexRGB(steps[j].hex), mj);
        // the web stores into a Uint8ClampedArray between steps
        px[0] = Math.round(px[0]); px[1] = Math.round(px[1]); px[2] = Math.round(px[2]);
      }
      sum += luma(px, 0); cnt++;
    }
    means.push(cnt ? sum / cnt : null);
  }
  return means;
}
