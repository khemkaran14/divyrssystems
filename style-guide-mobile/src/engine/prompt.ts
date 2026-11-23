import piecesJson from '../content/pieces.json';
import pendingJson from '../content/pieces-pending.json';
import looksJson from '../content/looks.json';
import promptText from '../content/prompt-text.json';
import type { Look, SwapCategory } from '../content/types';
import { BODY_TYPES } from './bodyType';
import { colourName } from './colour';
import { CATS, PARTS } from './layers';
import { partName } from './regions';
import type { BodyType, Part, Region } from './types';

const LOOKS = looksJson as Look[];
const ALL = [...(piecesJson as { id: string; name: string; desc: string }[]), ...(pendingJson as { id: string; name: string; desc: string }[])];
export const KEEP: string = promptText.keep;
const cap = (s: string) => s.replace(/^./, c => c.toUpperCase());
const btName = (bt: BodyType) => BODY_TYPES.find(b => b[0] === bt)![1].toLowerCase();

export const MODEL_EMPTY = 'Pick a piece and a colour, or try on a new piece. The edit prompt for your exact changes appears here.';
export const LOOK_EMPTY = 'Tap a garment on the photo and pick a colour. The edit prompt for your changes appears here.';

/** Gemini prompt for the model photo, changes in layer order (SPEC 6.7). */
export function modelPrompt(parts: Partial<Record<Part, string>>, variant: Partial<Record<SwapCategory, string>>, bt: BodyType): string {
  const ch: string[] = [];
  for (const [k] of PARTS) if (parts[k]) ch.push(`change the colour of the ${partName(k, variant).toLowerCase()} to ${colourName(parts[k]!)}`);
  const desc = (id: string) => ALL.find(x => x.id === id)?.desc ?? id;
  for (const k of CATS.slice().reverse()) {
    const v = variant[k];
    if (!v) continue;
    ch.unshift(k === 'top' ? `replace the t-shirt with ${desc(v)}` : k === 'bottom' ? `replace the trousers with ${desc(v)}` : k === 'shoes' ? `replace the sneakers with ${desc(v)}` : `add ${desc(v)}`);
  }
  if (bt !== 'regular') ch.push(`give her a ${btName(bt)} body type while keeping the same face`);
  return ch.length ? `Edit the attached photo. ${cap(ch.join('; '))}. ${KEEP.replace('skin tone, body, pose', 'skin tone, pose')}` : MODEL_EMPTY;
}

/** Zone name for a flood region by its height on the photo. */
export function zoneFor(mask: Uint8Array, w: number, h: number): string {
  let sy = 0, c = 0;
  for (let i = 0; i < mask.length; i += 7) if (mask[i] > 128) { sy += Math.floor(i / w); c++; }
  const f = c ? sy / c / h : 0.5;
  return f < 0.3 ? 'the blouse or top' : f < 0.5 ? 'the middle of the outfit (waist and drape)' : f < 0.78 ? 'the skirt, trousers or lower drape' : 'the hem and border';
}

/** Gemini prompt for a look photo. */
export function lookPrompt(who: string, regions: Region[], w: number, h: number, bt: BodyType): string {
  const o = LOOKS.find(l => l.id === who);
  const ch = regions.filter(r => r.col).map(r => r.pid
    ? `change the ${r.name} ${r.seg === 'Outfit' ? 'part of the outfit' : r.seg!.toLowerCase()} to ${colourName(r.col!)}`
    : `make ${zoneFor(r.mask, w, h)} ${colourName(r.col!)}`);
  if (bt !== 'regular') ch.push(`give her a ${btName(bt)} body type (same face and outfit)`);
  return ch.length
    ? `Edit the attached photo of the ${(o?.name || who).toLowerCase()}. ${cap(ch.join('; '))}. Keep the fabric texture, embroidery, jewellery, the woman, her pose, the lighting and background exactly the same. Photorealistic, no watermark.`
    : LOOK_EMPTY;
}
