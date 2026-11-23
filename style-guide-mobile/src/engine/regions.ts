import looksJson from '../content/looks.json';
import piecesJson from '../content/pieces.json';
import type { Look, LookPart, TryOnPiece } from '../content/types';
import { PARTS } from './layers';
import type { Part, Region, Selection } from './types';

const LOOKS = looksJson as Look[];
const PIECES = piecesJson as TryOnPiece[];
export const HIT_THRESHOLD = 110;

/** Build one soft mask per part from a greyscale label map (map pixel == part id, then 3×3 box blur). */
export function regionsFromLabelMap(labels: ArrayLike<number>, stride: number, w: number, h: number, parts: LookPart[]): Region[] {
  const N = w * h, out: Region[] = [];
  for (const p of parts) {
    const raw = new Uint8Array(N);
    for (let i = 0; i < N; i++) raw[i] = labels[i * stride] === p.id ? 1 : 0;
    const m = new Uint8Array(N);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += raw[i + dy * w + dx];
      m[i] = Math.round((s / 9) * 255);
    }
    out.push({ mask: m, col: null, pid: p.id, seg: p.seg, name: p.name });
  }
  return out;
}

/** Horizontal body centre: centroid of all part masks (sampled every 5th pixel like the web). */
export function bodyCentreX(regions: Region[], w: number): number {
  let sx = 0, n = 0;
  for (const r of regions) for (let i = 0; i < r.mask.length; i += 5) if (r.mask[i] > 128) { sx += i % w; n++; }
  return n ? sx / n : w / 2;
}

/** Model tap: the part with the highest effective-mask value above 110. */
export function hitModel(eff: Record<Part, Uint8Array> | null, i: number): Part | null {
  let best: Part | null = null, bv = HIT_THRESHOLD;
  for (const [k] of PARTS) { const v = eff ? eff[k][i] : 0; if (v > bv) { bv = v; best = k; } }
  return best;
}

/** Look tap: region under the tap, else nearest-region snap at radius 4, 8, 12, 16 in 8 directions. */
export function hitLookRegion(regions: Region[], x: number, y: number, w: number, h: number): number {
  let idx = regions.findIndex(r => r.pid && r.mask[y * w + x] > 128);
  for (let rad = 4; idx < 0 && rad <= 16; rad += 4) {
    for (const [dx, dy] of [[rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad, rad], [-rad, rad], [rad, -rad], [-rad, -rad]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = regions.findIndex(r => r.pid && r.mask[yy * w + xx] > 128);
      if (j >= 0) { idx = j; break; }
    }
  }
  return idx;
}

/** First tap on a multi-region garment selects the whole group, the next tap just that region. */
export function nextSelection(regions: Region[], idx: number, current: Selection): Selection {
  const r = regions[idx];
  const sib = regions.filter(q => q.pid && q.seg === r.seg);
  return sib.length > 1 && current !== `g:${r.seg}` && current !== idx ? (`g:${r.seg}` as const) : idx;
}

/** Garment class name for a segment of a look (ui3.js segLabel). */
export function segLabel(who: string, seg: string): string {
  const o = LOOKS.find(l => l.id === who);
  const t = o?.type || '';
  const id = o?.id || '';
  if (seg === 'Outfit') {
    if (/saree|mekhela/.test(t) || id === 'mekhela' || id === 'beltedsaree') return 'Saree';
    if (['lehenga', 'halfsaree', 'cape'].includes(t)) return 'Lehenga';
    if (t === 'anarkali') return 'Anarkali';
    if (['sharara', 'gharara', 'patiala', 'dhoti', 'kurta_pants', 'kurta_palazzo', 'kurta_jeans'].includes(t)) return 'Kurta set';
    if (t === 'jumpsuit') return 'Jumpsuit';
    if (t === 'kaftan') return 'Kaftan';
    if (t === 'coat') return 'Coat';
    if (['pencil', 'skirt_top', 'coord_skirt', 'shrugset'].includes(t)) return 'Skirt';
    if (['dress', 'maxi', 'mermaid', 'gown', 'sareegown'].includes(t)) return 'Dress';
    return 'Outfit';
  }
  if (seg === 'Top') return ['dhotijacket', 'smartdenim', 'pantsuit', 'suit'].includes(t) || ['dhotijacket', 'smartdenim', 'pantsuit'].includes(id) ? 'Top & jacket' : 'Top';
  return 'Bottom';
}

/** "Saree · red", "Saree · red 2" or "Selected area" (ui3.js regName). */
export function regionName(who: string, regions: Region[], r: Region): string {
  if (!r.pid) return 'Selected area';
  const same = regions.filter(q => q.pid && q.seg === r.seg && q.name === r.name);
  const n = same.length > 1 ? ' ' + (same.indexOf(r) + 1) : '';
  return `${segLabel(who, r.seg!)} · ${r.name}${n}`;
}

/** Name of the piece worn for a model part, e.g. "Blue straight jeans" (ui3.js partName). */
export function partName(k: Part, variant: Partial<Record<string, string>>): string {
  const v = variant[k];
  if (v) { const p = PIECES.find(x => x.id === v); if (p) return p.name.replace(/ \(.*\)/, ''); }
  return PARTS.find(p => p[0] === k)![1];
}

/** Regions a selection covers. */
export function selectedRegions(regions: Region[], sel: Selection): Region[] {
  if (typeof sel === 'string' && sel.startsWith('g:')) return regions.filter(r => r.seg === sel.slice(2));
  if (typeof sel === 'number' && regions[sel]) return [regions[sel]];
  return [];
}
