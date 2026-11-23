import type { BodyType, Pixels } from './types';

export const BODY_TYPES: [BodyType, string][] = [['petite', 'Petite'], ['slim', 'Slim'], ['regular', 'Regular'], ['curvy', 'Curvy'], ['plus', 'Plus-size'], ['tall', 'Tall']];
/** Width keys: [y fraction, width factor] (SPEC 6.6). */
export const BTW: Partial<Record<BodyType, [number, number][]>> = {
  slim: [[0, 1], [0.163, 1], [0.215, 0.9], [1, 0.9]],
  curvy: [[0, 1], [0.163, 1], [0.215, 1.04], [0.273, 1.1], [0.339, 1], [0.417, 1.16], [0.534, 1.12], [0.716, 1.05], [1, 1.02]],
  plus: [[0, 1], [0.163, 1], [0.215, 1.12], [0.273, 1.22], [0.365, 1.26], [0.456, 1.25], [0.651, 1.15], [1, 1.08]],
};
/** Leg scale. */
export const BTV: Partial<Record<BodyType, number>> = { petite: 0.9, tall: 1.06 };
export const LEG_START = 0.365;

export function lerpK(keys: [number, number][], t: number): number {
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const [a, fa] = keys[i - 1], [b, fb] = keys[i];
    return fa + ((fb - fa) * (t - a)) / (b - a || 1);
  }
  return keys[keys.length - 1][1];
}

/** Per-row width factor f and source row vy (ui3.js btMaps). */
export function btMaps(h: number, bt: BodyType) {
  const f = new Float32Array(h), vy = new Float32Array(h);
  const k = BTW[bt], s = BTV[bt], y0 = h * LEG_START;
  const kk = s ? (y0 + (h - y0) * s) / h : 1; // whole-frame scale so the feet stay in frame
  for (let y = 0; y < h; y++) {
    const yv = y * kk;
    f[y] = (k ? lerpK(k, y / h) : 1) / kk;
    vy[y] = Math.min(h - 1, s && yv > y0 ? y0 + (yv - y0) / s : yv);
  }
  return { f, vy, kk };
}

/** Body warp on the CPU (reference implementation; the app runs the same maths in a shader). */
export function bodyWarp(src: Pixels, bt: BodyType, cx: number, opaqueOutside: boolean): Pixels {
  if (bt === 'regular') return src;
  const { w, h } = src, s = src.data, { f, vy } = btMaps(h, bt);
  const o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = vy[y], y1 = Math.floor(sy), y2 = Math.min(h - 1, y1 + 1), fy = sy - y1, fr = f[y];
    for (let x = 0; x < w; x++) {
      const sx = cx + (x - cx) / fr, p = (y * w + x) * 4;
      if (sx < 0 || sx > w - 1) { o[p + 3] = opaqueOutside ? 255 : 0; continue; }
      const x1 = Math.floor(sx), x2 = Math.min(w - 1, x1 + 1), fx = sx - x1;
      for (let c = 0; c < 4; c++) {
        const a = s[(y1 * w + x1) * 4 + c], b = s[(y1 * w + x2) * 4 + c], cc = s[(y2 * w + x1) * 4 + c], d = s[(y2 * w + x2) * 4 + c];
        o[p + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
      }
    }
  }
  return { w, h, data: o };
}

/** Map a tap on the warped photo back to the source photo (ui3.js toSrc). */
export function toSrc(x: number, y: number, w: number, h: number, bt: BodyType, cx: number): [number, number] {
  if (bt === 'regular') return [x, y];
  const { f, vy } = btMaps(h, bt);
  const yy = Math.max(0, Math.min(h - 1, y));
  return [Math.round(cx + (x - cx) / f[yy]), Math.round(vy[yy])];
}
