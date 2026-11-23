import type { SwapCategory } from '../content/types';
import type { Part, PieceData } from './types';

/** Layer order, bottom to top (SPEC 6.3). */
export const CATS: SwapCategory[] = ['bottom', 'top', 'belt', 'shoes', 'necklace', 'scarf', 'bag', 'jewellery', 'earrings', 'wrist', 'rings', 'eyewear', 'head'];
/** Model parts and their base-mask channel. */
export const PARTS: [Part, string, number][] = [['top', 'T-shirt', 0], ['bottom', 'Trousers', 1], ['shoes', 'Sneakers', 2]];
export const ORIGINAL: Record<Part, string> = { top: 't-shirt', bottom: 'trousers', shoes: 'sneakers' };

/** Expand a piece crop (img RGBA w×h, mask RGBA w×h) into full-frame arrays. */
export function pieceToFrame(
  frameW: number, frameH: number,
  piece: { x: number; y: number; w: number; h: number },
  img: ArrayLike<number>, mask: ArrayLike<number>,
): PieceData {
  const N = frameW * frameH;
  const out: PieceData = { img: new Uint8Array(N * 4), comp: new Uint8Array(N), rec: new Uint8Array(N) };
  for (let y = 0; y < piece.h; y++) {
    const fy = piece.y + y;
    if (fy < 0 || fy >= frameH) continue;
    for (let x = 0; x < piece.w; x++) {
      const fx = piece.x + x;
      if (fx < 0 || fx >= frameW) continue;
      const s = (y * piece.w + x) * 4, i = fy * frameW + fx;
      out.img[i * 4] = img[s]; out.img[i * 4 + 1] = img[s + 1]; out.img[i * 4 + 2] = img[s + 2]; out.img[i * 4 + 3] = 255;
      out.comp[i] = mask[s];
      out.rec[i] = mask[s + 1];
    }
  }
  return out;
}

/**
 * Recolour masks after layering (ui3.js effMasks): for top/bottom/shoes use the swapped piece's
 * G channel, else the base mask channel, then subtract every piece in a later layer.
 */
export function effMasks(
  baseMask: ArrayLike<number>, N: number, V: Partial<Record<SwapCategory, PieceData>>,
): Record<Part, Uint8Array> {
  const res = {} as Record<Part, Uint8Array>;
  for (const [k, , ch] of PARTS) {
    const m = new Uint8Array(N);
    const v = V[k];
    if (v) m.set(v.rec);
    else for (let i = 0; i < N; i++) m[i] = baseMask[i * 4 + ch];
    for (const c of CATS.slice(CATS.indexOf(k) + 1)) {
      const o = V[c]?.comp;
      if (!o) continue;
      for (let i = 0; i < N; i++) if (o[i]) m[i] = (m[i] * (255 - o[i])) / 255;
    }
    res[k] = m;
  }
  return res;
}

/** Blend pieces over the photo in layer order using the mask R channel as alpha. */
export function layerPieces(out: Uint8Array | Uint8ClampedArray, V: Partial<Record<SwapCategory, PieceData>>) {
  for (const c of CATS) {
    const v = V[c];
    if (!v) continue;
    for (let i = 0, p = 0; i < v.comp.length; i++, p += 4) {
      const a = v.comp[i] / 255;
      if (a > 0) {
        out[p] = out[p] * (1 - a) + v.img[p] * a;
        out[p + 1] = out[p + 1] * (1 - a) + v.img[p + 1] * a;
        out[p + 2] = out[p + 2] * (1 - a) + v.img[p + 2] * a;
      }
    }
  }
}
