"""Cut the Starfall crescent bow out of the props sheet: a texture (front projection plus colour swatches) and per-row
silhouette spans that tools/blender/tripo_heroes/marksman_starfall.py lofts into the bow mesh.

python3 tools/costume/marksman_starfall_bow.py assets/generated/costumes/marksman_starfall_props_out.png
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
X0, Y0, X1, Y1 = 250, 70, 880, 1470
BAND = (728, 783)
STEP = 8
TW, TH = 512, 1024
SWATCH = {"silver": (214, 218, 230), "violet": (92, 62, 146), "glow": (226, 250, 255), "blue": (28, 38, 104), "magenta": (206, 70, 176), "dark": (74, 42, 104)}

im = Image.open(sys.argv[1]).convert("RGB").crop((X0, Y0, X1, Y1))
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
bg = np.median(np.concatenate([a[:10].reshape(-1, 3), a[:, :10].reshape(-1, 3)]), 0)
fill = im.copy()
for seed in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)):
    ImageDraw.floodfill(fill, seed, (255, 0, 255), thresh=26)
outside = np.all(np.asarray(fill) == (255, 0, 255), axis=-1)
mask = ~outside
near = np.sqrt(((a - bg) ** 2).sum(-1)) < 14
cand = mask & near
seen = np.zeros_like(cand)
for y0 in range(H):
    for x0 in np.where(cand[y0] & ~seen[y0])[0]:
        comp, todo = [], [(y0, x0)]
        seen[y0, x0] = True
        while todo:
            y, x = todo.pop()
            comp.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and cand[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    todo.append((yy, xx))
        if len(comp) > 1500 and np.mean([c[1] for c in comp]) > W * 0.25:
            ys, xs = zip(*comp)
            mask[list(ys), list(xs)] = False
b0, b1 = BAND[0] - X0, BAND[1] - X0
string = mask[:, b0:b1].copy()
srows = np.where(string.sum(1) > 0)[0]
mask[:, b0:b1] = False
for y in range(H):
    if mask[y, b0 - 1] and mask[y, b1]:
        mask[y, b0:b1] = True
m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))
mask = np.asarray(m) > 0

rows = []
for y in range(2, H - 2, STEP):
    xs = np.where(mask[y])[0]
    if len(xs) == 0:
        continue
    runs, st, pv = [], xs[0], xs[0]
    for x in xs[1:]:
        if x - pv > 4:
            runs.append([int(st), int(pv) + 1])
            st = x
        pv = x
    runs.append([int(st), int(pv) + 1])
    runs = [r for r in runs if r[1] - r[0] >= 3]
    if runs:
        rows.append([y, runs[:2]])

mid = [r for r in rows if len(r[1]) == 2]
gy = mid[len(mid) // 2][0]
g = mid[len(mid) // 2][1][1]
grip = [(g[0] + g[1]) / 2, gy]
sx = (BAND[0] + BAND[1]) / 2 - X0
ys_on = [y for y in range(H) if mask[y, int(sx) - 3:int(sx) + 4].any()]
top = min(ys_on)
bot = max(ys_on)

px = a.copy()
known = mask.copy()
for _ in range(40):
    if known.all():
        break
    k = known.astype(np.float32)
    acc = np.zeros_like(px)
    cnt = np.zeros(k.shape, np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        acc += np.roll(np.roll(px * k[..., None], dy, 0), dx, 1)
        cnt += np.roll(np.roll(k, dy, 0), dx, 1)
    new = (~known) & (cnt > 0)
    px[new] = acc[new] / cnt[new][:, None]
    known |= new
tex = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8)).resize((TW, TH), Image.LANCZOS)
d = ImageDraw.Draw(tex)
sw = {}
for i, (n, c) in enumerate(SWATCH.items()):
    x, y = 6, 6 + i * 26
    d.rectangle((x, y, x + 20, y + 20), fill=c)
    sw[n] = [(x + 10) / TW, 1 - (y + 10) / TH]
out = os.path.join(ROOT, "assets", "source")
tex.save(os.path.join(out, "marksman_starfall_bow_tex.jpg"), quality=92)
json.dump({"W": W, "H": H, "rows": rows, "grip": grip, "nock": [sx, top, bot], "swatch": sw}, open(os.path.join(out, "marksman_starfall_bow.json"), "w"))
Image.fromarray((mask * 255).astype(np.uint8)).save("/tmp/opencode/skin_starfall/bow_mask.png")
print("rows", len(rows), "grip", grip, "nock", sx, top, bot, "string rows", srows.min(), srows.max())
