/** @jest-environment node */
import looks from '../src/content/looks.json';
import lookparts from '../src/content/lookparts.json';
import type { LookParts } from '../src/content/types';
import { btMaps, toSrc } from '../src/engine/bodyType';
import { labOf } from '../src/engine/colour';
import { checkFill, flood } from '../src/engine/flood';
import { lookPrompt, modelPrompt, MODEL_EMPTY } from '../src/engine/prompt';
import { hitLookRegion, nextSelection, regionName, regionsFromLabelMap } from '../src/engine/regions';
import { decode, hasResources } from '../tools/web-reference';

const LP = lookparts as Record<string, LookParts>;
const run = hasResources() ? describe : describe.skip;

run('look photos (phase 4)', () => {
  it('every look photo (except the model look) has at least one selectable region', async () => {
    for (const l of looks) {
      if (l.id === 'ivorytee') continue; // opens the model
      expect(LP[l.id]).toBeDefined();
      const img = await decode(`assets/img/looks/${l.id}.webp`);
      const map = await decode(`assets/img/parts/${l.id}.png`, img.w, img.h);
      const regions = regionsFromLabelMap(map.data, 4, img.w, img.h, LP[l.id].parts);
      expect(regions.some(r => r.mask.some(v => v > 128))).toBe(true);
    }
  }, 120000);

  it('group then single selection, with nearest-region snap', async () => {
    const id = 'kanjeevaram';
    const img = await decode(`assets/img/looks/${id}.webp`);
    const map = await decode(`assets/img/parts/${id}.png`, img.w, img.h);
    const regions = regionsFromLabelMap(map.data, 4, img.w, img.h, LP[id].parts);
    const i0 = regions[0].mask.findIndex(v => v > 200);
    const x = i0 % img.w, y = Math.floor(i0 / img.w);
    const idx = hitLookRegion(regions, x, y, img.w, img.h);
    expect(idx).toBe(0);
    const first = nextSelection(regions, idx, null);
    expect(first).toBe('g:Outfit');
    expect(nextSelection(regions, idx, first)).toBe(0);
    expect(regionName(id, regions, regions[0])).toMatch(/^Saree · /);
  });

  it('flood fill selects fabric and rejects tiny areas', async () => {
    const img = await decode('assets/img/looks/lbd.webp');
    const lab = labOf(img);
    const m = flood(img, lab, Math.round(img.w / 2), Math.round(img.h * 0.45), 30);
    expect(['ok', 'small', 'background']).toContain(checkFill(m));
    expect(checkFill(new Uint8Array(img.w * img.h))).toBe('small');
  });
});

describe('body types and prompts (phase 5)', () => {
  it('taps map back through the warp', () => {
    expect(toSrc(100, 200, 683, 1024, 'regular', 337)).toEqual([100, 200]);
    const [x] = toSrc(337, 500, 683, 1024, 'plus', 337);
    expect(x).toBe(337);
    const { f } = btMaps(1024, 'plus');
    expect(f[100]).toBeCloseTo(1); // head untouched
  });

  it('"blue jeans + chandbali + navy" lists all three changes in layer order', () => {
    const p = modelPrompt({ bottom: '#1F2A55' }, { bottom: 'b-jeans-blue', earrings: 'e-chandbali' }, 'regular');
    const a = p.indexOf('Replace the trousers with'), b = p.indexOf('add '), c = p.indexOf('to navy');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(p).toContain('change the colour of the blue straight jeans to navy');
    expect(p).toContain('skin tone, pose');
    expect(p).not.toContain('skin tone, body, pose');
  });

  it('body type and empty prompts', () => {
    expect(modelPrompt({}, {}, 'regular')).toBe(MODEL_EMPTY);
    expect(modelPrompt({}, {}, 'curvy')).toContain('Give her a curvy body type while keeping the same face');
    const mask = new Uint8Array(100 * 100); for (let i = 80 * 100; i < 90 * 100; i++) mask[i] = 255;
    const lp = lookPrompt('banarasi', [{ mask, col: '#0B6E4F', seed: [5, 85, 30] }], 100, 100, 'regular');
    expect(lp).toContain('Edit the attached photo of the banarasi silk saree.');
    expect(lp).toContain('Make the hem and border emerald');
  });
});
