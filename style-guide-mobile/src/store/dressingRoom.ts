import type { SkImage } from '@shopify/react-native-skia';
import { create } from 'zustand';
import baseJson from '../content/base.json';
import { BASE_IMAGE, BASE_MASK, BODY_BASES, LOOK_IMAGES, PART_MAPS, PIECE_IMAGES } from '../content/images';
import lookparts from '../content/lookparts.json';
import piecesJson from '../content/pieces.json';
import type { BaseInfo, LookParts, SwapCategory, TryOnPiece } from '../content/types';
import { loadSkImage } from '../engine/assets';
import { toSrc } from '../engine/bodyType';
import { labOf, type Lab } from '../engine/colour';
import { checkFill, flood } from '../engine/flood';
import { finishOnGpu, imageFromRGBA, layerOnGpu, packMasks, readRGBA, resampleRGBA, thumbnail, type LayerPiece, type RecolourStep } from '../engine/gpu';
import { CATS, effMasks, PARTS, pieceToFrame } from '../engine/layers';
import { lookPrompt, modelPrompt } from '../engine/prompt';
import { sequentialMeans } from '../engine/recolour';
import { bodyCentreX, hitLookRegion, hitModel, nextSelection, partName, regionName, regionsFromLabelMap, segLabel, selectedRegions } from '../engine/regions';
import type { BodyType, HistoryEntry, Part, PieceData, Pixels, Region, SavedLook, Selection } from '../engine/types';

const BASE = baseJson as BaseInfo;
const PIECES = piecesJson as TryOnPiece[];
const LOOKPARTS = lookparts as Record<string, LookParts>;
export const MODEL = 'model';
export const TOL_DEFAULT = 30;

type Subject = {
  who: string; w: number; h: number; cx: number; bt: BodyType | null;
  srcImage: SkImage; src: Pixels; baseMask: Pixels | null; lab: Lab | null;
};

type State = {
  ready: boolean;
  busy: boolean;
  who: string;
  w: number;
  h: number;
  bt: BodyType;
  parts: Partial<Record<Part, string>>;
  variant: Partial<Record<SwapCategory, string>>;
  regions: Region[];
  sel: Selection;
  history: HistoryEntry[];
  swapCat: SwapCategory;
  tol: number;
  frame: SkImage | null;
  frameId: number;
  prompt: string;
  error: string | null;
};

type Actions = {
  pickSubject(who: string, keepBody?: boolean): Promise<void>;
  /** Tap at image pixel (x, y) of the displayed (warped) photo. Returns a message for a toast. */
  tap(x: number, y: number): Promise<string | null>;
  applyColour(hex: string): string | null;
  selectPart(k: Part): void;
  selectRegion(i: number): void;
  selectGroup(seg: string): void;
  setBodyType(bt: BodyType): void;
  setSwapCat(c: SwapCategory): void;
  swap(id: string): void;
  setTol(v: number): void;
  undo(): string | null;
  reset(): Promise<void>;
  loadSaved(s: SavedLook): Promise<void>;
  snapshot(): SavedLook | null;
};

let subject: Subject | null = null;
let drawToken = 0;
const pieceCache = new Map<string, Promise<{ data: PieceData; layer: LayerPiece }>>();
const maskImages = new WeakMap<Uint8Array, SkImage>();
let layeredCache: { key: string; image: SkImage; px: Pixels; eff: Record<Part, Uint8Array>; effImage: SkImage } | null = null;
let effNow: Record<Part, Uint8Array> | null = null;

function loadPiece(id: string) {
  let p = pieceCache.get(id);
  if (!p) {
    p = (async () => {
      const piece = PIECES.find(x => x.id === id)!;
      const files = PIECE_IMAGES[id];
      const [img, mask] = await Promise.all([loadSkImage(files.img), loadSkImage(files.mask)]);
      const ip = readRGBA(img), mp = readRGBA(mask);
      // crop with alpha = mask R, drawn 1:1 at (x, y) on the GPU
      const crop = new Uint8Array(piece.w * piece.h * 4);
      for (let i = 0, q = 0; i < piece.w * piece.h; i++, q += 4) {
        crop[q] = ip.data[q]; crop[q + 1] = ip.data[q + 1]; crop[q + 2] = ip.data[q + 2]; crop[q + 3] = mp.data[q];
      }
      return {
        data: pieceToFrame(BASE.w, BASE.h, piece, ip.data, mp.data),
        layer: { image: imageFromRGBA(crop, piece.w, piece.h), x: piece.x, y: piece.y, w: piece.w, h: piece.h },
      };
    })();
    pieceCache.set(id, p);
    p.catch(() => pieceCache.delete(id));
  }
  return p;
}

const maskImage = (m: Uint8Array, w: number, h: number) => {
  let img = maskImages.get(m);
  if (!img) { img = packMasks([m], w, h); maskImages.set(m, img); }
  return img;
};

async function loadSubject(who: string, bt: BodyType): Promise<Subject> {
  if (who === MODEL) {
    const realBody = bt !== 'regular' ? BODY_BASES[bt] : undefined;
    const [img, mask] = await Promise.all([loadSkImage(realBody?.img ?? BASE_IMAGE), loadSkImage(realBody?.mask ?? BASE_MASK)]);
    return { who, w: BASE.w, h: BASE.h, cx: BASE.bodyCentreX, bt: realBody ? bt : null, srcImage: img, src: resampleRGBA(img, BASE.w, BASE.h), baseMask: resampleRGBA(mask, BASE.w, BASE.h), lab: null };
  }
  const img = await loadSkImage(LOOK_IMAGES[who]);
  const sc = Math.min(1, 1024 / img.height());
  const w = Math.round(img.width() * sc), h = Math.round(img.height() * sc);
  return { who, w, h, cx: w / 2, bt: null, srcImage: img, src: resampleRGBA(img, w, h), baseMask: null, lab: null };
}

function lookRegions(who: string, w: number, h: number): Promise<Region[]> {
  const lp = LOOKPARTS[who];
  if (!lp) return Promise.resolve([]);
  return loadSkImage(PART_MAPS[who]).then(m => {
    const px = resampleRGBA(m, w, h);
    return regionsFromLabelMap(px.data, 4, w, h, lp.parts);
  });
}

export const useDressingRoom = create<State & Actions>((set, get) => {
  /** Re-render the photo for the current state (GPU), then update the prompt. */
  async function redraw() {
    const t = ++drawToken;
    const S = subject;
    if (!S) return;
    const st = get();
    const warpBt: BodyType = S.bt ? 'regular' : st.bt; // a real body-type photo needs no warp
    try {
      let layered: SkImage, px: Pixels;
      const steps: { mask: Uint8Array; hex: string; image: SkImage; channel: 0 | 1 | 2 }[] = [];
      let highlight: SkImage | null = null;
      if (S.who === MODEL) {
        const key = JSON.stringify(CATS.map(c => st.variant[c] || ''));
        if (!layeredCache || layeredCache.key !== key) {
          const V: Partial<Record<SwapCategory, PieceData>> = {};
          const layers: LayerPiece[] = [];
          for (const c of CATS) {
            const id = st.variant[c];
            if (!id) continue;
            const p = await loadPiece(id);
            V[c] = p.data; layers.push(p.layer);
          }
          if (t !== drawToken) return;
          const image = layerOnGpu(S.srcImage, S.w, S.h, layers);
          const eff = effMasks(S.baseMask!.data, S.w * S.h, V);
          layeredCache = { key, image, px: readRGBA(image), eff, effImage: packMasks([eff.top, eff.bottom, eff.shoes], S.w, S.h) };
        }
        layered = layeredCache.image; px = layeredCache.px; effNow = layeredCache.eff;
        PARTS.forEach(([k], ch) => { const hex = st.parts[k]; if (hex) steps.push({ mask: layeredCache!.eff[k], hex, image: layeredCache!.effImage, channel: ch as 0 | 1 | 2 }); });
      } else {
        layered = S.srcImage; px = S.src; effNow = null;
        for (const r of st.regions) if (r.col) steps.push({ mask: r.mask, hex: r.col, image: maskImage(r.mask, S.w, S.h), channel: 0 });
        const hl = selectedRegions(st.regions, st.sel).filter(r => !r.col);
        if (hl.length) {
          const u = new Uint8Array(S.w * S.h);
          for (const r of hl) for (let i = 0; i < u.length; i++) if (r.mask[i] > 128) u[i] = 255;
          highlight = packMasks([u], S.w, S.h);
        }
      }
      const means = sequentialMeans(px.data, steps);
      const gpuSteps: RecolourStep[] = [];
      steps.forEach((s, i) => { const m = means[i]; if (m != null) gpuSteps.push({ masks: s.image, channel: s.channel, hex: s.hex, mean: m }); });
      const frame = finishOnGpu(layered, S.w, S.h, gpuSteps, highlight, { bt: warpBt, cx: S.cx, opaqueOutside: S.who === MODEL });
      if (t !== drawToken) return;
      set({ frame, frameId: t, busy: false, error: null, prompt: promptNow() });
    } catch (e) {
      if (t === drawToken) set({ busy: false, error: (e as Error).message });
    }
  }

  function promptNow() {
    const st = get();
    return st.who === MODEL ? modelPrompt(st.parts, st.variant, st.bt) : lookPrompt(st.who, st.regions, st.w, st.h, st.bt);
  }

  return {
    ready: false, busy: false, who: MODEL, w: BASE.w, h: BASE.h, bt: 'regular', parts: {}, variant: {}, regions: [], sel: 'bottom',
    history: [], swapCat: 'bottom', tol: TOL_DEFAULT, frame: null, frameId: 0, prompt: modelPrompt({}, {}, 'regular'), error: null,

    async pickSubject(who0, keepBody = true) {
      const who = who0 === 'ivorytee' ? MODEL : who0;
      const bt = keepBody ? get().bt : 'regular';
      set({ busy: true, who, bt, parts: {}, variant: {}, regions: [], sel: who === MODEL ? 'bottom' : null, history: [] });
      const t = ++drawToken;
      try {
        const S = await loadSubject(who, bt);
        const regions = who === MODEL ? [] : await lookRegions(who, S.w, S.h);
        if (who !== MODEL) S.cx = bodyCentreX(regions, S.w);
        if (t !== drawToken) return;
        subject = S; layeredCache = null;
        set({ ready: true, w: S.w, h: S.h, regions });
        await redraw();
      } catch (e) {
        if (t === drawToken) set({ busy: false, error: (e as Error).message });
      }
    },

    async tap(x0, y0) {
      const S = subject, st = get();
      if (!S) return null;
      let [x, y] = [Math.round(x0), Math.round(y0)];
      if (x < 0 || y < 0 || x >= S.w || y >= S.h) return null;
      if (!S.bt) [x, y] = toSrc(x, y, S.w, S.h, st.bt, S.cx);
      if (x < 0 || y < 0 || x >= S.w || y >= S.h) return null;
      if (S.who === MODEL) {
        const best = hitModel(effNow, y * S.w + x);
        if (!best) return 'Tap the t-shirt, trousers or shoes';
        set({ sel: best });
        return `${partName(best, st.variant)} selected`;
      }
      const idx = hitLookRegion(st.regions, x, y, S.w, S.h);
      if (idx >= 0) {
        const sel = nextSelection(st.regions, idx, st.sel);
        const r = st.regions[idx];
        set({ sel });
        redraw();
        return typeof sel === 'string'
          ? `Entire ${segLabel(S.who, r.seg!).toLowerCase()} selected. Tap again to pick just ${regionName(S.who, st.regions, r)}.`
          : `${regionName(S.who, st.regions, r)} selected. Now pick a colour.`;
      }
      set({ busy: true });
      await new Promise(r => setTimeout(r, 16)); // let the spinner show
      if (!S.lab) S.lab = labOf(S.src);
      const m = flood(S.src, S.lab, x, y, st.tol);
      const v = checkFill(m);
      if (v !== 'ok') {
        set({ busy: false });
        return v === 'small' ? 'That area is too small. Try a larger selection size.' : 'That looks like the background. Tap the fabric itself, or lower the selection size.';
      }
      const regions = [...get().regions, { mask: m, col: null, seed: [x, y, st.tol] as [number, number, number] }];
      set({ regions, sel: regions.length - 1, history: [...get().history, ['region']] });
      await redraw();
      return 'Area selected. Now pick a colour.';
    },

    applyColour(hex) {
      const st = get();
      if (st.who === MODEL) {
        if (!st.sel || typeof st.sel !== 'string' || st.sel.startsWith('g:')) return 'Choose a piece first';
        const k = st.sel as Part;
        set({ history: [...st.history, ['part', k, st.parts[k]]], parts: { ...st.parts, [k]: hex } });
      } else if (typeof st.sel === 'string' && st.sel.startsWith('g:')) {
        const seg = st.sel.slice(2);
        const idx = st.regions.map((r, i) => [r, i] as const).filter(([r]) => r.seg === seg);
        set({ history: [...st.history, ['cols', idx.map(([r, i]) => [i, r.col] as [number, string | null])]], regions: st.regions.map(r => (r.seg === seg ? { ...r, col: hex } : r)) });
      } else {
        const i = st.sel as number;
        const r = typeof i === 'number' ? st.regions[i] : undefined;
        if (!r) return 'Tap a garment on the photo first';
        set({ history: [...st.history, ['col', i, r.col]], regions: st.regions.map((q, j) => (j === i ? { ...q, col: hex } : q)) });
      }
      redraw();
      return null;
    },

    selectPart(k) { set({ sel: k, prompt: promptNow() }); },
    selectRegion(i) { set({ sel: i }); redraw(); },
    selectGroup(seg) { set({ sel: `g:${seg}` }); redraw(); },
    setBodyType(bt) {
      const prev = get().bt;
      set({ bt });
      const needsNewBase = get().who === MODEL && (BODY_BASES[bt] || (subject?.bt && subject.bt !== bt));
      if (needsNewBase && prev !== bt) { const { parts, variant } = get(); get().pickSubject(MODEL).then(() => { set({ parts, variant }); layeredCache = null; redraw(); }); }
      else redraw();
    },
    setSwapCat(c) { set({ swapCat: c }); },
    swap(id) {
      const st = get(), cat = st.swapCat;
      const variant = { ...st.variant };
      if (id) variant[cat] = id; else delete variant[cat];
      set({ history: [...st.history, ['var', cat, st.variant[cat]]], variant, sel: ['top', 'bottom', 'shoes'].includes(cat) ? (cat as Part) : st.sel, busy: true });
      redraw();
    },
    setTol(v) { set({ tol: Math.round(v) }); },

    undo() {
      const st = get();
      const h = st.history[st.history.length - 1];
      if (!h) return 'Nothing to undo';
      const history = st.history.slice(0, -1);
      if (h[0] === 'region') set({ history, regions: st.regions.slice(0, -1), sel: null });
      else if (h[0] === 'part') { const parts = { ...st.parts }; if (h[2]) parts[h[1]] = h[2]; else delete parts[h[1]]; set({ history, parts }); }
      else if (h[0] === 'col') set({ history, regions: st.regions.map((r, i) => (i === h[1] ? { ...r, col: h[2] } : r)) });
      else if (h[0] === 'cols') { const m = new Map(h[1]); set({ history, regions: st.regions.map((r, i) => (m.has(i) ? { ...r, col: m.get(i)! } : r)) }); }
      else if (h[0] === 'var') { const variant = { ...st.variant }; if (h[2]) variant[h[1]] = h[2]; else delete variant[h[1]]; set({ history, variant }); }
      redraw();
      return null;
    },

    reset() { return get().pickSubject(get().who); },

    async loadSaved(s) {
      set({ bt: s.bt || 'regular' });
      await get().pickSubject(s.who);
      const S = subject;
      if (!S) return;
      let regions = get().regions.map(r => ({ ...r }));
      for (const r of s.regions || []) {
        if ('pid' in r) { const t = regions.find(q => q.pid === r.pid); if (t) t.col = r.col; }
        else {
          if (!S.lab) S.lab = labOf(S.src);
          regions = [...regions, { mask: flood(S.src, S.lab, r.seed[0], r.seed[1], r.seed[2]), col: r.col, seed: r.seed }];
        }
      }
      set({ parts: { ...s.parts }, variant: { ...s.variant }, regions, history: [] });
      layeredCache = null;
      await redraw();
    },

    snapshot() {
      const st = get();
      if (!st.frame) return null;
      return {
        lid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        bt: st.bt, who: st.who, parts: { ...st.parts }, variant: { ...st.variant },
        regions: st.regions.filter(r => r.col).map(r => (r.pid ? { pid: r.pid, col: r.col! } : { seed: r.seed!, col: r.col! })),
        thumb: thumbnail(st.frame, 240),
        t: Date.now(),
      };
    },
  };
});

/** Colour label for the colour tab ("Colour for: …"). */
export function colourTarget(st: State): string {
  if (st.who === MODEL) return `Colour for: ${partName((typeof st.sel === 'string' && !st.sel.startsWith('g:') ? st.sel : 'bottom') as Part, st.variant)}`;
  if (typeof st.sel === 'string' && st.sel.startsWith('g:')) return `Colour for: entire ${segLabel(st.who, st.sel.slice(2)).toLowerCase()}`;
  if (typeof st.sel === 'number' && st.regions[st.sel]) return `Colour for: ${regionName(st.who, st.regions, st.regions[st.sel])}`;
  return 'Pick a piece first';
}

/** The colour currently on the selection, for the swatch ring. */
export function currentColour(st: State): string | null {
  if (st.who === MODEL) return typeof st.sel === 'string' ? st.parts[st.sel as Part] ?? null : null;
  return selectedRegions(st.regions, st.sel)[0]?.col ?? null;
}
