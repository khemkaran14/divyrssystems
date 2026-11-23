/** @jest-environment node */
import * as fs from 'node:fs';
import * as path from 'node:path';
import looks from '../src/content/looks.json';
import occasions from '../src/content/occasions.json';
import combos from '../src/content/combos.json';
import rules from '../src/content/rules.json';
import pieces from '../src/content/pieces.json';
import lookparts from '../src/content/lookparts.json';
import packCats from '../src/content/pack-cats.json';
import manifest from '../src/content/asset-manifest.json';

const ASSETS = path.join(__dirname, '../src/assets');

describe('content (phase 1)', () => {
  it('has the counts from the spec', () => {
    expect(looks).toHaveLength(47);
    expect(looks.filter(l => l.category === 'western')).toHaveLength(20);
    expect(looks.filter(l => l.category === 'ethnic')).toHaveLength(16);
    expect(looks.filter(l => l.category === 'fusion')).toHaveLength(11);
    expect(occasions).toHaveLength(16);
    expect(combos).toHaveLength(12);
    expect(rules).toHaveLength(6);
    expect(pieces).toHaveLength(108);
    expect(packCats).toHaveLength(13);
  });

  it('has the per-category piece counts', () => {
    const n: Record<string, number> = {};
    for (const p of pieces) n[p.category] = (n[p.category] || 0) + 1;
    expect(n).toEqual({ top: 10, bottom: 10, shoes: 16, bag: 20, jewellery: 8, earrings: 6, necklace: 6, wrist: 8, rings: 3, head: 8, eyewear: 5, belt: 4, scarf: 4 });
  });

  it('every look photo, part map, piece image and mask is in src/assets', () => {
    const files = [...manifest.looks.map(f => ['looks', f]), ...manifest.parts.map(f => ['parts', f]), ...manifest.tryon.map(f => ['tryon', f])];
    for (const [g, f] of files) expect(fs.existsSync(path.join(ASSETS, g, path.basename(f)))).toBe(true);
    for (const l of looks) expect(manifest.looks.some(f => path.basename(f).startsWith(l.id + '.'))).toBe(true);
    for (const p of pieces) {
      expect(fs.existsSync(path.join(ASSETS, 'tryon', `${p.id}.webp`))).toBe(true);
      expect(fs.existsSync(path.join(ASSETS, 'tryon', `${p.id}-mask.png`))).toBe(true);
    }
    for (const id of Object.keys(lookparts)) expect(fs.existsSync(path.join(ASSETS, 'parts', `${id}.png`))).toBe(true);
  });

  it('every combo points at a real look and every look occasion exists', () => {
    const ids = new Set(looks.map(l => l.id));
    const occ = new Set(occasions.map(o => o.id));
    for (const c of combos) expect(ids.has(c.lookId)).toBe(true);
    for (const l of looks) for (const o of l.occasions) expect(occ.has(o)).toBe(true);
  });
});
