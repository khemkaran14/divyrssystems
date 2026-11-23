/**
 * The web version's Dressing Room maths, loaded verbatim from resources/.../ui3.js with Node's vm
 * module, plus sharp-based image decoding. Tests compare the app's engine against this.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import sharp from 'sharp';

export const ROOT = path.resolve(__dirname, '..');
export const PUB = path.join(ROOT, 'resources/ultimate-style-guide-app/public');
export const hasResources = () => fs.existsSync(path.join(PUB, 'assets/js/ui3.js'));

/** Pull top-level function/const definitions out of ui3.js by name. */
function grab(src: string, names: string[]): string {
  const out: string[] = [];
  for (const n of names) {
    const fn = src.indexOf(`function ${n}(`);
    const cn = src.indexOf(`const ${n}=`);
    const start = fn >= 0 ? fn : cn;
    if (start < 0) throw new Error(`ui3.js: ${n} not found`);
    // a definition ends at the next top-level line that starts a new statement
    const rest = src.slice(start);
    const end = rest.search(/\n(?=(function |const |let |async function |\/\*|\$\(|document\.|cv\.))/);
    out.push((end > 0 ? rest.slice(0, end) : rest).replace(/^const /, 'var '));
  }
  return out.join('\n');
}

export function webEngine() {
  const ui3 = fs.readFileSync(path.join(PUB, 'assets/js/ui3.js'), 'utf8');
  const ctx: any = { ImageData: class { data: Uint8ClampedArray; width: number; height: number; constructor(d: any, w: number, h?: number) { if (typeof d === 'number') { this.width = d; this.height = w; this.data = new Uint8ClampedArray(d * w * 4); } else { this.data = d; this.width = w; this.height = h!; } } }, D: {}, BT: 'regular', Math };
  vm.createContext(ctx);
  vm.runInContext(grab(ui3, ['hexRGB', 'recolour', 'BTW', 'BTV', 'lerpK', 'btMaps', 'bodyWarp']).replace(/\bconst /g, 'var '), ctx);
  return ctx as {
    D: any; BT: string;
    recolour(out: { data: Uint8ClampedArray }, mask: Uint8Array, mi: number, stride: number, hex: string): void;
    bodyWarp(src: any): any;
  };
}

export async function decode(rel: string, w?: number, h?: number) {
  let img = sharp(path.join(PUB, rel)).ensureAlpha();
  if (w && h) img = img.resize(w, h, { fit: 'fill' });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}
