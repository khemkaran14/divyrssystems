/** @jest-environment node */
import pieces from '../src/content/pieces.json';
import { warpUniforms } from '../src/engine/warpMath';
import { bodyWarp } from '../src/engine/bodyType';
import { hexRGB } from '../src/engine/colour';
import { CATS, effMasks, layerPieces, PARTS, pieceToFrame } from '../src/engine/layers';
import { curve, sequentialMeans } from '../src/engine/recolour';
import type { PieceData } from '../src/engine/types';
import { decode, hasResources, webEngine } from '../tools/web-reference';

const W = 683, H = 1024, N = W * H;
const run = hasResources() ? describe : describe.skip;

/** What the GPU does: layered image, then each recolour pass in float (no 8-bit rounding between passes). */
function gpuEmulate(src: Uint8ClampedArray, V: Record<string, PieceData>, mask: Uint8ClampedArray, parts: Record<string, string>) {
  const layered = new Uint8ClampedArray(src);
  layerPieces(layered, V);
  const eff = effMasks(mask, N, V);
  const steps = PARTS.filter(([k]) => parts[k]).map(([k]) => ({ mask: eff[k], hex: parts[k] }));
  const means = sequentialMeans(layered, steps);
  const out = new Float32Array(layered);
  steps.forEach((s, j) => {
    const T = hexRGB(s.hex), m = means[j]!;
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      const a = s.mask[i] / 255;
      if (a <= 0) continue;
      const sl = (0.299 * out[p] + 0.587 * out[p + 1] + 0.114 * out[p + 2]) / m;
      for (let c = 0; c < 3; c++) out[p + c] = out[p + c] * (1 - a) + Math.min(1, curve(T[c], sl)) * 255 * a;
    }
  });
  return out;
}

/** The web's compose() for the model, using ui3.js's own recolour(). */
function webCompose(web: ReturnType<typeof webEngine>, src: Uint8ClampedArray, V: Record<string, PieceData>, mask: Uint8ClampedArray, parts: Record<string, string>) {
  const out = { data: new Uint8ClampedArray(src) };
  const eff = effMasks(mask, N, V);
  // layering exactly as ui3.js compose()
  for (const c of CATS) { const v = V[c]; if (!v) continue; for (let i = 0, p = 0; i < v.comp.length; i++, p += 4) { const a = v.comp[i] / 255; if (a > 0) { out.data[p] = out.data[p] * (1 - a) + v.img[p] * a; out.data[p + 1] = out.data[p + 1] * (1 - a) + v.img[p + 1] * a; out.data[p + 2] = out.data[p + 2] * (1 - a) + v.img[p + 2] * a; } } }
  for (const [k] of PARTS) if (parts[k]) web.recolour(out, eff[k], 0, 1, parts[k]);
  return out.data;
}

const meanDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0, n = 0; for (let p = 0; p < a.length; p += 4) { for (let c = 0; c < 3; c++) s += Math.abs(a[p + c] - b[p + c]); n += 3; } return s / n; };

async function piece(id: string): Promise<PieceData> {
  const p = pieces.find(x => x.id === id)!;
  const img = await decode(`assets/img/tryon/${id}.webp`), m = await decode(`assets/img/tryon/${id}-mask.png`);
  return pieceToFrame(W, H, p, img.data, m.data);
}

run('Dressing Room engine vs the web (phase 3–5)', () => {
  let src: Uint8ClampedArray, mask: Uint8ClampedArray, web: ReturnType<typeof webEngine>;
  beforeAll(async () => {
    src = (await decode('assets/img/tryon/base.webp')).data;
    mask = (await decode('assets/img/tryon/base-mask.png')).data;
    web = webEngine();
  });

  it('golden: bottom = #1F2A55 matches the web compose() (mean pixel difference < 2)', () => {
    const parts = { bottom: '#1F2A55' };
    const d = meanDiff(gpuEmulate(src, {}, mask, parts), webCompose(web, src, {}, mask, parts));
    expect(d).toBeLessThan(2);
    // and it actually changed the trousers
    expect(meanDiff(webCompose(web, src, {}, mask, parts), src)).toBeGreaterThan(1);
  });

  it('golden: swaps plus three recolours match the web', async () => {
    const V = { bottom: await piece('b-jeans-blue'), earrings: await piece('e-chandbali'), bag: await piece('g-tote-tan') };
    const parts = { top: '#D6246E', bottom: '#1F2A55', shoes: '#151515' };
    expect(meanDiff(gpuEmulate(src, V, mask, parts), webCompose(web, src, V, mask, parts))).toBeLessThan(2);
  });

  it('every piece in every category renders without errors', async () => {
    for (const p of pieces) {
      const V = { [p.category]: await piece(p.id) } as Record<string, PieceData>;
      const out = gpuEmulate(src, V, mask, { top: '#0B6E4F' });
      expect(out.length).toBe(N * 4);
      let covered = 0; for (const v of V[p.category].comp) if (v > 0) covered++;
      expect(covered).toBeGreaterThan(0);
    }
  }, 120000);

  it('body warp shader maths equals the web bodyWarp(), and feet stay in frame', () => {
    for (const bt of ['petite', 'slim', 'curvy', 'plus', 'tall'] as const) {
      web.BT = bt; web.D = { w: W, h: H, cx: 337, who: 'model' };
      const mine = bodyWarp({ w: W, h: H, data: src }, bt, 337, true).data;
      const theirs = web.bodyWarp(new (class { data = src; width = W; height = H })()).data;
      expect(meanDiff(mine, theirs)).toBeLessThan(0.5);
      expect(warpUniforms(bt, W, H, 337, true)).toHaveLength(7 + 18);
    }
    // feet: the shoe mask (B) must still be inside the frame for petite and tall
    for (const bt of ['petite', 'tall'] as const) {
      const shoes = new Uint8ClampedArray(N * 4);
      for (let i = 0; i < N; i++) { shoes[i * 4] = mask[i * 4 + 2]; shoes[i * 4 + 3] = 255; }
      const w = bodyWarp({ w: W, h: H, data: shoes }, bt, 337, true).data;
      let before = 0, after = 0;
      for (let i = 0; i < N; i++) { if (shoes[i * 4] > 128) before++; if (w[i * 4] > 128) after++; }
      expect(after).toBeGreaterThan(before * (bt === 'petite' ? 0.75 : 0.85));
    }
  });
});
