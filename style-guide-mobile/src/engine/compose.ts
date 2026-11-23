import type { SwapCategory } from '../content/types';
import { effMasks, layerPieces, PARTS } from './layers';
import { recolour } from './recolour';
import type { Part, PieceData, Pixels, Region } from './types';

/**
 * Full CPU composition, a straight port of ui3.js compose(). The app draws the same result on the
 * GPU (see gpu.ts); this version is the reference for tests and is used for thumbnails off-device.
 */
export function composeModel(src: Pixels, baseMask: ArrayLike<number>, V: Partial<Record<SwapCategory, PieceData>>, parts: Partial<Record<Part, string>>) {
  const out = new Uint8ClampedArray(src.data);
  const N = src.w * src.h;
  const eff = effMasks(baseMask, N, V);
  layerPieces(out, V);
  for (const [k] of PARTS) { const col = parts[k]; if (col) recolour(out, eff[k], col); }
  return { image: { w: src.w, h: src.h, data: out } as Pixels, eff };
}

export function composeLook(src: Pixels, regions: Region[]): Pixels {
  const out = new Uint8ClampedArray(src.data);
  for (const r of regions) if (r.col) recolour(out, r.mask, r.col);
  return { w: src.w, h: src.h, data: out };
}
