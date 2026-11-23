/**
 * Copies every photo, part map and try-on layer the content uses from resources/ into src/assets/.
 * Files are copied byte for byte: masks stay lossless, nothing is re-encoded.
 * Run after extract-content: npx tsx tools/copy-assets.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'resources/ultimate-style-guide-app/public');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/asset-manifest.json'), 'utf8'));
let n = 0, bytes = 0;
for (const [group, files] of Object.entries<string[]>(manifest)) {
  const dest = path.join(ROOT, 'src/assets', group);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of files) {
    const src = path.join(RES, f.replace(/^\//, ''));
    if (!fs.existsSync(src)) throw new Error(`Missing resource: ${f}`);
    fs.copyFileSync(src, path.join(dest, path.basename(f).replace(/-parts\.png$/, '.png')));
    n++; bytes += fs.statSync(src).size;
  }
}
console.log(`copied ${n} files (${(bytes / 1048576).toFixed(1)} MB) into src/assets`);
