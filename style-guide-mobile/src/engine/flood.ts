import type { Lab } from './colour';
import type { Pixels } from './types';

export const MIN_FILL = 300;
export const MAX_FILL_SHARE = 0.4;

/** 1-D morphology pass helper: dilate (true) or erode (false) with radius r, rows then columns. */
function morph(m: Uint8Array, w: number, h: number, r: number, dil: boolean): Uint8Array {
  const N = w * h, t = new Uint8Array(N), o = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dil ? 0 : 1;
    for (let k = -r; k <= r; k++) { const xx = x + k; if (xx < 0 || xx >= w) continue; const q = m[y * w + xx]; if (dil ? q : !q) { v = dil ? 1 : 0; break; } }
    t[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dil ? 0 : 1;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy < 0 || yy >= h) continue; const q = t[yy * w + x]; if (dil ? q : !q) { v = dil ? 1 : 0; break; } }
    o[y * w + x] = v;
  }
  return o;
}

/** Lab flood fill from (x0, y0) with tolerance tol (ui3.js flood). Returns a 0–255 soft mask. */
export function flood(src: Pixels, lab: Lab, x0: number, y0: number, tol: number): Uint8Array {
  const { w, h } = src, d = src.data, N = w * h, seen = new Uint8Array(N);
  let mask: Uint8Array = new Uint8Array(N);
  const { L: La, A, B } = lab;
  let sa = 0, sb = 0, sl = 0, n = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = Math.min(w - 1, Math.max(0, x0 + dx)), y = Math.min(h - 1, Math.max(0, y0 + dy)), i = y * w + x;
    sa += A[i]; sb += B[i]; sl += La[i]; n++;
  }
  sa /= n; sb /= n; sl /= n;
  const chroma = Math.hypot(sa, sb), lw = 0.15 + 0.85 * Math.max(0, 1 - chroma / 22);
  const st = [y0 * w + x0];
  while (st.length) {
    const i = st.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const dist = Math.hypot(A[i] - sa, B[i] - sb) + Math.abs(La[i] - sl) * lw;
    if (d[i * 4 + 3] < 100 || dist > tol) continue;
    mask[i] = 1;
    const x = i % w;
    if (x > 0) st.push(i - 1);
    if (x < w - 1) st.push(i + 1);
    if (i >= w) st.push(i - w);
    if (i < N - w) st.push(i + w);
  }
  mask = morph(morph(mask, w, h, 4, true), w, h, 4, false);
  const out = new Uint8Array(N);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += mask[i + dy * w + dx];
    out[i] = Math.round((s / 9) * 255);
  }
  for (let i = 0; i < N; i++) if (d[i * 4 + 3] < 60) out[i] = 0;
  return out;
}

export type FloodVerdict = 'ok' | 'small' | 'background';
export function checkFill(mask: Uint8Array): FloodVerdict {
  let cnt = 0;
  for (const v of mask) if (v > 128) cnt++;
  if (cnt < MIN_FILL) return 'small';
  if (cnt > mask.length * MAX_FILL_SHARE) return 'background';
  return 'ok';
}
