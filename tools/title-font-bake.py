import json
import numpy as np
from PIL import Image

ROOT = "/home/krruzic/Projects/grudge/"
CAP = 64
meta = json.load(open(ROOT + "assets/generated/titlefont/sheet.json"))
rows = meta["rows"]
a = np.asarray(Image.open(ROOT + "assets/generated/titlefont/sheet.png").convert("RGB")).astype(np.int32)
H, W = a.shape[:2]
bg = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)]), 0)
d = np.sqrt(((a - bg) ** 2).sum(-1))
alpha = np.clip((d - 50) / 50, 0, 1)
k = np.minimum(a[..., 0] - a[..., 1], a[..., 2] - a[..., 1])
alpha *= np.clip((90 - k) / 40, 0, 1)
from scipy import ndimage
lab, n = ndimage.label(alpha > 0.5)
objs = ndimage.find_objects(lab)
comps = []
for i, sl in enumerate(objs):
    ys, xs = sl
    area = (lab[sl] == i + 1).sum()
    if area < 60:
        continue
    comps.append([xs.start, xs.stop, ys.start, ys.stop, area, {i + 1}])
rh = H / len(rows)
glyphs = {}
own = {}
for r, row in enumerate(rows):
    band = [c for c in comps if r * rh <= (c[2] + c[3]) / 2 < (r + 1) * rh]
    band.sort(key=lambda c: c[0])
    merged = []
    for c in band:
        if merged and c[0] < merged[-1][1] - 4:
            m = merged[-1]
            merged[-1] = [min(m[0], c[0]), max(m[1], c[1]), min(m[2], c[2]), max(m[3], c[3]), m[4] + c[4], m[5] | c[5]]
        else:
            merged.append([c[0], c[1], c[2], c[3], c[4], set(c[5])])
    if len(merged) > len(row):
        merged.sort(key=lambda c: -c[4])
        merged = sorted(merged[:len(row)], key=lambda c: c[0])
    assert len(merged) == len(row), (row, len(merged))
    tall = [m for m, g in zip(merged, row) if g.isalnum()]
    top = int(np.median([m[2] for m in tall]))
    bot = int(np.median([m[3] for m in tall]))
    for (x0, x1, y0, y1, _, ids), g in zip(merged, row):
        glyphs[g] = (x0, y0, x1 - x0, y1 - y0, (y0 - top) / (bot - top), bot - top)
        own[g] = ids
out_w = 0
pieces = []
for g, (x, y, w, h, off, cap) in glyphs.items():
    s = CAP / cap
    rgb = Image.fromarray(a[y:y + h, x:x + w].astype(np.uint8))
    sub = alpha[y:y + h, x:x + w].copy()
    near = ndimage.binary_dilation(np.isin(lab[y:y + h, x:x + w], list(own[g])), iterations=3)
    sub *= near
    al = Image.fromarray((sub * 255).astype(np.uint8))
    tw, th = max(1, round(w * s)), max(1, round(h * s))
    im = Image.merge("RGBA", (*rgb.resize((tw, th), Image.LANCZOS).split(), al.resize((tw, th), Image.LANCZOS)))
    arr = np.asarray(im).astype(np.int32)
    arr[..., :3] = (arr[..., :3] >> 3) << 3
    arr[..., 3] = np.where(arr[..., 3] > 100, 255, 0)
    pieces.append((g, Image.fromarray(arr.astype(np.uint8), "RGBA"), off))
    out_w += tw + 4
atlas_h = max(p[1].height for p in pieces)
atlas = Image.new("RGBA", (out_w, atlas_h), (0, 0, 0, 0))
info = {}
x = 0
for g, im, off in pieces:
    atlas.paste(im, (x, 0))
    info[g] = {"x": x, "w": im.width, "h": im.height, "top": round(off * CAP, 1)}
    x += im.width + 4
atlas.save(ROOT + "assets/ui/titlefont.png")
json.dump({"cap": CAP, "glyphs": info}, open(ROOT + "assets/ui/titlefont.json", "w"))
print(len(info), atlas.size)
