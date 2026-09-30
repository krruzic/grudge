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
ncol = len(rows[0])
cw, ch = W / ncol, H / len(rows)
glyphs = {}
for r, row in enumerate(rows):
    boxes = []
    for c, g in enumerate(row):
        x0, y0 = int(c * cw), int(r * ch)
        cell = alpha[y0:int(y0 + ch), x0:int(x0 + cw)]
        ys, xs = np.where(cell > 0.5)
        boxes.append((g, x0, y0, xs.min(), xs.max() + 1, ys.min(), ys.max() + 1))
    tall = [b for b in boxes if b[0].isalnum()]
    top = int(np.median([b[5] + b[2] for b in tall]))
    bot = int(np.median([b[6] + b[2] for b in tall]))
    for g, x0, y0, cx0, cx1, cy0, cy1 in boxes:
        glyphs[g] = (x0 + cx0, y0 + cy0, cx1 - cx0, cy1 - cy0, (y0 + cy0 - top) / (bot - top), bot - top)
out_w = 0
pieces = []
for g, (x, y, w, h, off, cap) in glyphs.items():
    s = CAP / cap
    rgb = Image.fromarray(a[y:y + h, x:x + w].astype(np.uint8))
    al = Image.fromarray((alpha[y:y + h, x:x + w] * 255).astype(np.uint8))
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
