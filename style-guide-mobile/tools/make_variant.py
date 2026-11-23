#!/usr/bin/env python3
"""
Turn a Gemini/ChatGPT edit of the model photo into a Dressing Room try-on piece (SPEC 6.8).

    python tools/make_variant.py --base resources/model.png --edit edited.png \
        --id b-jeans-grey --cat bottom --name "Grey jeans" --desc "grey straight-leg jeans"

Writes resources/new-pieces/<id>.webp (quality 90) and <id>-mask.png (R = paste, G = recolour)
and adds the piece to resources/new-pieces/pieces.json. Then run `npm run content`: the piece
appears in the Dressing Room's swap tab. No code changes.
Needs: pip install numpy pillow scipy
"""
import argparse, json, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

W, H = 683, 1024
# vertical bands on the 1536-high original, plus x limits for small pieces
BANDS = {
    'bottom': (470, 1475), 'top': (215, 1010), 'shoes': (1240, 1536), 'jewellery': (120, 470), 'bag': (250, 1300),
    'earrings': (140, 300), 'necklace': (200, 600), 'wrist': (600, 1000), 'rings': (650, 1000),
    'head': (0, 330), 'eyewear': (100, 260), 'belt': (440, 660), 'scarf': (180, 1450),
}
XLIM = {'earrings': [(430, 495), (552, 620)], 'necklace': [(360, 650)], 'eyewear': [(380, 640)]}
SMALL = {'jewellery', 'earrings', 'necklace', 'wrist', 'rings', 'eyewear', 'head', 'belt'}
TINY = {'rings', 'jewellery'}
GARMENTS = {'top': 0, 'bottom': 1, 'shoes': 2}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    X = (c[..., 0] * .4124 + c[..., 1] * .3576 + c[..., 2] * .1805) / .95047
    Y = c[..., 0] * .2126 + c[..., 1] * .7152 + c[..., 2] * .0722
    Z = (c[..., 0] * .0193 + c[..., 1] * .1192 + c[..., 2] * .9505) / 1.08883
    f = lambda t: np.where(t > .008856, np.cbrt(t), 7.787 * t + 16 / 116)
    fx, fy, fz = f(X), f(Y), f(Z)
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], -1)


def kmeans(x, k, iters=20, seed=1):
    rng = np.random.default_rng(seed)
    c = x[rng.choice(len(x), k, replace=False)]
    for _ in range(iters):
        lbl = ((x[:, None, :] - c[None]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            if (lbl == j).any(): c[j] = x[lbl == j].mean(0)
    return c, lbl


def skin_mask(base_rgb):
    """Pixels close to the base photo's skin colours (k = 6 Lab clusters, L weighted 0.35)."""
    L = lab(base_rgb.astype(np.float64))
    Lw = L * np.array([0.35, 1, 1])
    sample = Lw.reshape(-1, 3)[::37]
    centres, _ = kmeans(sample, 6)
    # skin clusters: warm, mid-light hue (a > 8, b > 10, 35 < L < 85)
    real = centres / np.array([0.35, 1, 1])
    skin = [c for c, r in zip(centres, real) if r[1] > 8 and r[2] > 10 and 35 < r[0] < 85]
    if not skin: return np.zeros(base_rgb.shape[:2], bool)
    d = np.min([np.linalg.norm(Lw - c, axis=-1) for c in skin], 0)
    return d < 9


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True, help='original model.png (1024 x 1536)')
    ap.add_argument('--edit', required=True, help='the edited image from Gemini/ChatGPT')
    ap.add_argument('--base-mask', default=os.path.join(ROOT, 'src/assets/tryon/base-mask.png'))
    ap.add_argument('--id', required=True); ap.add_argument('--cat', required=True, choices=sorted(BANDS))
    ap.add_argument('--name', required=True); ap.add_argument('--desc', default='')
    ap.add_argument('--prompt', default='')
    a = ap.parse_args()

    base = np.asarray(Image.open(a.base).convert('RGB').resize((W, H), Image.LANCZOS)).astype(np.int16)
    edit = np.asarray(Image.open(a.edit).convert('RGB').resize((1024, 1536), Image.LANCZOS).resize((W, H), Image.LANCZOS)).astype(np.int16)
    diff = np.abs(edit - base).max(-1)
    thr = 12 if a.cat in SMALL else 22
    m = diff > thr

    # limit to the category's band
    sy = H / 1536.0
    y0, y1 = BANDS[a.cat]
    band = np.zeros_like(m); band[int(y0 * sy):int(y1 * sy), :] = True
    if a.cat in XLIM:
        xb = np.zeros_like(m)
        for x0, x1 in XLIM[a.cat]: xb[:, int(x0 * W / 1024):int(x1 * W / 1024)] = True
        band &= xb
    m &= band

    # drop specks
    lbl, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lbl, range(1, n + 1))
        biggest = sizes.max()
        if a.cat in SMALL:
            keep_min = max(40, (0.02 if a.cat in TINY else 0.10) * biggest)
        else:
            keep_min = max(250, 0.15 * biggest) if a.cat == 'scarf' else 250
        keep = np.isin(lbl, [i + 1 for i, s in enumerate(sizes) if s >= keep_min])
        m = keep
    # close, then feather 2 px
    m = ndimage.binary_closing(m, iterations=3)
    m = ndimage.binary_fill_holes(m) if a.cat not in SMALL else m

    # cover the old garment fully
    if a.cat in GARMENTS:
        bm = np.asarray(Image.open(a.base_mask).convert('RGB').resize((W, H), Image.NEAREST))[..., GARMENTS[a.cat]] > 128
        m |= bm
    paste = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))).astype(np.float64)

    # recolour area = paste minus skin
    skin = skin_mask(edit.astype(np.uint8))
    rec = np.where(skin, 0, paste)

    ys, xs = np.nonzero(paste > 0)
    if not len(ys): raise SystemExit('No change found in that band. Check the edit and the category.')
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    out_dir = os.path.join(ROOT, 'resources/new-pieces'); os.makedirs(out_dir, exist_ok=True)
    Image.fromarray(edit[y0:y1, x0:x1].astype(np.uint8)).save(os.path.join(out_dir, f'{a.id}.webp'), quality=90)
    mask = np.zeros((y1 - y0, x1 - x0, 3), np.uint8)
    mask[..., 0] = paste[y0:y1, x0:x1].round().astype(np.uint8)
    mask[..., 1] = rec[y0:y1, x0:x1].round().astype(np.uint8)
    Image.fromarray(mask).save(os.path.join(out_dir, f'{a.id}-mask.png'))

    entry = {'id': a.id, 'name': a.name, 'cat': a.cat, 'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'desc': a.desc, 'prompt': a.prompt}
    path = os.path.join(out_dir, 'pieces.json')
    data = json.load(open(path)) if os.path.exists(path) else []
    data = [d for d in data if d['id'] != a.id] + [entry]
    json.dump(data, open(path, 'w'), indent=1)
    print(json.dumps(entry))


if __name__ == '__main__':
    main()
