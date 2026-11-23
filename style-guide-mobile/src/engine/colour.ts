import palette from '../content/palette.json';
import type { Pixels } from './types';

export const PAL: { hex: string; name: string }[] = palette;
export const hexEq = (a?: string | null, b?: string | null) => (a || '').toLowerCase() === (b || '').toLowerCase();

export function hexRGB(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Palette name, or the nearest palette colour's name (ui3.js colourName). */
export function colourName(h: string): string {
  const p = PAL.find(x => hexEq(x.hex, h));
  if (p) return p.name;
  const n = parseInt(h.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  let best = PAL[0], bd = 1e9;
  for (const x of PAL) {
    const m = parseInt(x.hex.slice(1), 16);
    const d = (r - (m >> 16)) ** 2 + (g - ((m >> 8) & 255)) ** 2 + (b - (m & 255)) ** 2;
    if (d < bd) { bd = d; best = x; }
  }
  return best.name;
}

export type Lab = { L: Float32Array; A: Float32Array; B: Float32Array };

/** CIE Lab of every pixel (ui3.js labOf). */
export function labOf(src: Pixels): Lab {
  const d = src.data, N = src.w * src.h;
  const La = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);
  const LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const r = LUT[d[p]], g = LUT[d[p + 1]], b = LUT[d[p + 2]];
    const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, Y = r * 0.2126 + g * 0.7152 + b * 0.0722, Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const fx = f(X), fy = f(Y), fz = f(Z);
    La[i] = 116 * fy - 16; A[i] = 500 * (fx - fy); B[i] = 200 * (fy - fz);
  }
  return { L: La, A, B };
}
