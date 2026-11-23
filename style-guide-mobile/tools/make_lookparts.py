#!/usr/bin/env python3
"""
Make the part label map and parts list for a new look photo (SPEC 6.8).

    python tools/make_lookparts.py --id newlook --photo resources/new-looks/newlook.webp

Add the look itself to resources/new-looks/looks.json (same fields as src/content/looks.json,
with "photo": "<id>"), put the photo at resources/new-looks/<id>.webp, run this, then
`npm run content`. The look appears everywhere in the app. No code changes.

Uses rembg's u2net_cloth_seg model to find the clothes (Upper-clothes / Lower / Full outfit), then
splits each garment into colour clusters in Lab space, merging clusters closer than 11 (L scaled
by 0.35). Writes resources/new-looks/<id>-parts.png (greyscale, pixel = part id, 0 = background) and adds
{"parts": [...], "map": id} to resources/new-looks/lookparts.json.
Needs: pip install numpy pillow scipy rembg
"""
import argparse, json, os
import numpy as np
from PIL import Image
from scipy import ndimage
from make_variant import kmeans, lab, ROOT

SEGS = ['Upper-clothes', 'Lower', 'Outfit']  # u2net_cloth_seg classes: upper, lower, full


def colour_name(rgb):
    pal = json.load(open(os.path.join(ROOT, 'src/content/palette.json')))
    best, bd = pal[0]['name'], 1e9
    for p in pal:
        h = int(p['hex'][1:], 16); c = np.array([h >> 16, (h >> 8) & 255, h & 255])
        d = ((rgb - c) ** 2).sum()
        if d < bd: best, bd = p['name'], d
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True); ap.add_argument('--photo', required=True)
    ap.add_argument('--clusters', type=int, default=4)
    a = ap.parse_args()
    from rembg import new_session, remove  # imported here so make_variant works without rembg
    img = Image.open(a.photo).convert('RGB')
    sess = new_session('u2net_cloth_seg')
    seg = np.asarray(remove(img, session=sess, only_mask=True))  # stacked masks: upper, lower, full
    h = img.height
    masks = [seg[i * h:(i + 1) * h] > 128 for i in range(3)] if seg.shape[0] == 3 * h else [seg > 128]
    rgb = np.asarray(img).astype(np.float64)
    L = lab(rgb) * np.array([0.35, 1, 1])
    label = np.zeros(rgb.shape[:2], np.uint8)
    parts, pid = [], 0
    total = sum(m.sum() for m in masks) or 1
    for si, m in enumerate(masks):
        if m.sum() < 500: continue
        px = L[m]
        k = min(a.clusters, max(1, len(px) // 2000))
        centres, lbl = kmeans(px[::7] if len(px) > 7 * k else px, k)
        # merge clusters within Lab distance 11
        groups = []
        for c in centres:
            for g in groups:
                if np.linalg.norm(g[0] - c) < 11: g.append(c); break
            else: groups.append([c])
        gc = np.array([np.mean(g, 0) for g in groups])
        assign = ((px[:, None, :] - gc[None]) ** 2).sum(-1).argmin(1)
        full = np.zeros(m.shape, int) - 1; full[m] = assign
        for j in range(len(gc)):
            region = ndimage.binary_opening(full == j, iterations=1)
            if region.sum() < 300: continue
            pid += 1
            label[region] = pid
            parts.append({'id': pid, 'seg': SEGS[si] if len(masks) == 3 else 'Outfit', 'name': colour_name(rgb[region].mean(0)), 'share': round(float(region.sum() / total), 2)})
    out = os.path.join(ROOT, 'resources/new-looks'); os.makedirs(out, exist_ok=True)
    Image.fromarray(label, 'L').save(os.path.join(out, f'{a.id}-parts.png'))
    path = os.path.join(out, 'lookparts.json')
    data = json.load(open(path)) if os.path.exists(path) else {}
    data[a.id] = {'parts': parts, 'map': a.id}
    json.dump(data, open(path, 'w'), indent=1)
    print(json.dumps(data[a.id]))


if __name__ == '__main__':
    main()
