import { BTV, BTW, LEG_START } from './bodyType';
import type { BodyType } from './types';

/** Uniforms for WARP_SKSL: size, cx, opaqueOutside, kk, legScale, y0, ky[9], kf[9]. */
export function warpUniforms(bt: BodyType, w: number, h: number, cx: number, opaqueOutside: boolean): number[] {
  const keys = (BTW[bt] ?? [[0, 1], [1, 1]]).slice();
  while (keys.length < 9) keys.push([1, keys[keys.length - 1][1]]);
  const s = BTV[bt] ?? 0, y0 = h * LEG_START;
  const kk = s ? (y0 + (h - y0) * s) / h : 1;
  return [w, h, cx, opaqueOutside ? 1 : 0, kk, s, y0, ...keys.map(k => k[0]), ...keys.map(k => k[1])];
}
