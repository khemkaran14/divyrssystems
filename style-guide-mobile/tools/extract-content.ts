/**
 * Converts the web version's content files into typed JSON for the app.
 * Reads resources/ultimate-style-guide-app/public/assets/js/{data,assets,packdata,ui3,engine}.js
 * with Node's vm module (never hand-copied) and writes src/content/*.json.
 * Run: npx tsx tools/extract-content.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'resources/ultimate-style-guide-app/public');
const JS = path.join(RES, 'assets/js');
const OUT = path.join(ROOT, 'src/content');

const read = (f: string) => fs.readFileSync(path.join(JS, f), 'utf8');
// Top-level const/let become context globals.
const asVars = (src: string) => src.replace(/^(const|let) /gm, 'var ');

const ctx: any = {};
vm.createContext(ctx);
for (const f of ['data.js', 'assets.js', 'packdata.js']) vm.runInContext(asVars(read(f)), ctx, { filename: f });

// Pieces of ui3.js and engine.js that are content (not DOM code).
const ui3 = read('ui3.js');
const engine = read('engine.js');
function grabConst(src: string, name: string): any {
  const start = src.indexOf(`const ${name}=`);
  if (start < 0) throw new Error(`Could not find ${name}`);
  // Walk brackets (skipping strings) to find the end of the literal.
  let i = start + `const ${name}=`.length, depth = 0, quote = '';
  const from = i;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') quote = ch;
    else if (ch === '[' || ch === '{' || ch === '(') depth++;
    else if (ch === ']' || ch === '}' || ch === ')') { depth--; if (depth === 0) { i++; break; } }
  }
  return vm.runInContext(`(${src.slice(from, i)})`, ctx);
}
const QZ = grabConst(ui3, 'QZ');
const COMBOLOOK: string[] = grabConst(ui3, 'COMBOLOOK');
const heroDefault: string[] = JSON.parse(
  ui3.match(/:\[('banarasi'[^\]]*)\]\)/)![1].replace(/'/g, '"').replace(/^/, '[').replace(/$/, ']')
);
const SETTING = grabConst(engine, 'SETTING');
// promptFor() from engine.js, with the default MODEL (reference photo, regular body). Text only.
const promptForSrc = engine.match(/function promptFor\(o\)\{[\s\S]*?\n\}/)![0];
vm.runInContext(`var MODEL={ref:true,bt:'regular'};var BODY={};var SETTING=${JSON.stringify(SETTING)};${promptForSrc}`, ctx);

// Owner additions (SPEC 6.8): resources/new-pieces and resources/new-looks, merged in as data.
const readJson = (f: string, d: any) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const NEWP = path.join(ROOT, 'resources/new-pieces'), NEWL = path.join(ROOT, 'resources/new-looks');
for (const p of readJson(path.join(NEWP, 'pieces.json'), [])) {
  ctx.VARIANT_PHOTOS[p.id] = { name: p.name, cat: p.cat, x: p.x, y: p.y, w: p.w, h: p.h, img: `../../new-pieces/${p.id}.webp`, mask: `../../new-pieces/${p.id}-mask.png` };
  if (!ctx.ALL_PACK.some((x: any) => x.id === p.id)) ctx.ALL_PACK.push({ cat: p.cat, id: p.id, name: p.name, desc: p.desc || p.name.toLowerCase(), prompt: p.prompt || '' });
}
const newLooks: any[] = readJson(path.join(NEWL, 'looks.json'), []);
for (const [id, lp] of Object.entries<any>(readJson(path.join(NEWL, 'lookparts.json'), {}))) ctx.LOOKPARTS[id] = { parts: lp.parts, map: `../../new-looks/${id}-parts.png` };
for (const l of newLooks) ctx.PHOTOS[l.id] = `../../new-looks/${l.id}.webp`;

const PHOTOS: Record<string, string> = ctx.PHOTOS;
const PHOTOFIT: Record<string, string> = ctx.PHOTOFIT || {};
const VP: Record<string, any> = ctx.VARIANT_PHOTOS;
const file = (p: string) => path.basename(p).replace(/-parts\.png$/, '.png');

const looks = ctx.L.filter((o: any) => PHOTOS[o.id]).map((o: any) => ({
  id: o.id, name: o.n, category: o.c, region: o.r, type: o.t, palette: o.col, occasions: o.occ,
  mood: o.m, colourName: o.cn, description: o.d, pieces: o.pc, footwear: o.ft, accessories: o.ac, tip: o.tip,
  ...(o.p ? { pattern: o.p } : {}),
  photo: o.id,
  ...(PHOTOFIT[o.id] === 'contain' ? { photoFit: 'contain' } : {}),
}));
for (const l of newLooks) if (!looks.some((x: any) => x.id === l.id)) looks.push({ ...l, photo: l.id });
const lookPrompts: Record<string, string> = {};
for (const o of ctx.L) if (PHOTOS[o.id]) lookPrompts[o.id] = ctx.promptFor(o);

const occasions = Object.entries(ctx.OCC).map(([id, v]: [string, any]) => ({
  id, name: v.n, subtitle: v.s, colour: v.c, dressing: v.d, whatToWear: v.w, avoid: v.a, colours: v.t,
}));
const combos = ctx.COMBOS.map(([name, a, b, usedFor]: string[], i: number) => ({ name, a, b, usedFor, lookId: COMBOLOOK[i] }));
const rules = ctx.RULES.map(([title, body]: string[]) => ({ title, body }));
const palette = ctx.PAL.map(([hex, name]: string[]) => ({ hex, name }));
const packCats = ctx.PACK_CATS.map(([id, label]: string[]) => ({ id, label }));
const all = ctx.ALL_PACK as any[];
const pieces = all.filter(x => VP[x.id]).map(x => {
  const v = VP[x.id];
  return { id: x.id, name: x.name, category: x.cat, x: v.x, y: v.y, w: v.w, h: v.h, desc: x.desc, prompt: x.prompt };
});
const piecesPending = all.filter(x => !VP[x.id]).map(x => ({ id: x.id, name: x.name, category: x.cat, desc: x.desc, prompt: x.prompt }));
const lookparts: Record<string, any> = {};
for (const [id, lp] of Object.entries<any>(ctx.LOOKPARTS)) lookparts[id] = { parts: lp.parts, map: id };
const quiz = QZ.map((q: any) => ({ question: q.q, answers: q.o.map(([label, value]: [string, any]) => ({ label, value })) }));
const base = { w: 683, h: 1024, means: ctx.BASE_MEANS, bodyCentreX: 337 };

const write = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + '\n');
  console.log(`wrote src/content/${name}`);
};
fs.mkdirSync(OUT, { recursive: true });
write('looks.json', looks);
write('look-prompts.json', lookPrompts);
write('occasions.json', occasions);
write('combos.json', combos);
write('rules.json', rules);
write('palette.json', palette);
write('pack-cats.json', packCats);
write('pieces.json', pieces);
write('pieces-pending.json', piecesPending);
write('lookparts.json', lookparts);
write('quiz.json', quiz);
write('base.json', base);
write('prompt-text.json', { keep: ctx.KEEP, catRule: ctx.CAT_RULE, heroDefault });

// Real body-type photos, once the owner adds them (SPEC 6.6). Paths are relative to public/.
const BODY_DIR = path.join(ROOT, 'resources/body-types');
const bodyBases = ['petite', 'slim', 'curvy', 'plus', 'tall'].filter(bt =>
  fs.existsSync(path.join(BODY_DIR, `base-${bt}.webp`)) && fs.existsSync(path.join(BODY_DIR, `base-${bt}-mask.png`)));
const bodyFiles = bodyBases.flatMap(bt => [`../../body-types/base-${bt}.webp`, `../../body-types/base-${bt}-mask.png`]);

// Static image registry (React Native needs literal require() calls).
const lines: string[] = [
  '// GENERATED by tools/extract-content.ts. Do not edit.',
  '/* eslint-disable */',
  'export const LOOK_IMAGES: Record<string, number> = {',
  ...looks.map((l: any) => `  ${JSON.stringify(l.id)}: require('../assets/looks/${file(PHOTOS[l.id])}'),`),
  '};',
  'export const PART_MAPS: Record<string, number> = {',
  ...Object.entries<any>(ctx.LOOKPARTS).map(([id, lp]) => `  ${JSON.stringify(id)}: require('../assets/parts/${file(lp.map)}'),`),
  '};',
  'export const PIECE_IMAGES: Record<string, { img: number; mask: number }> = {',
  ...pieces.map((p: any) => `  ${JSON.stringify(p.id)}: { img: require('../assets/tryon/${file(VP[p.id].img)}'), mask: require('../assets/tryon/${file(VP[p.id].mask)}') },`),
  '};',
  `export const BASE_IMAGE: number = require('../assets/tryon/${file(ctx.BASE_DARK)}');`,
  `export const BASE_MASK: number = require('../assets/tryon/${file(ctx.BASE_MASK)}');`,
  '/** Real body-type base photos (resources/body-types/base-<type>.webp + base-<type>-mask.png). */',
  'export const BODY_BASES: Partial<Record<string, { img: number; mask: number }>> = {',
  ...bodyBases.map(bt => `  ${bt}: { img: require('../assets/tryon/base-${bt}.webp'), mask: require('../assets/tryon/base-${bt}-mask.png') },`),
  '};',
  '',
];
fs.writeFileSync(path.join(OUT, 'images.ts'), lines.join('\n'));
console.log('wrote src/content/images.ts');

// Asset manifest for copy-assets.ts and the content test.
const manifest = {
  looks: looks.map((l: any) => PHOTOS[l.id]),
  parts: Object.values<any>(ctx.LOOKPARTS).map(lp => lp.map),
  tryon: [ctx.BASE_DARK, ctx.BASE_MASK, ...pieces.flatMap((p: any) => [VP[p.id].img, VP[p.id].mask]), ...bodyFiles],
};
write('asset-manifest.json', manifest);
