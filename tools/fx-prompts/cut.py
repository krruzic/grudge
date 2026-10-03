import json, sys
import numpy as np
from PIL import Image

ROOT = "/home/krruzic/Projects/grudge/"
CELL = 128
G = "/tmp/opencode/fxtex/gen/"


def keyed(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    bg = np.array([255.0, 0.0, 255.0])
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 60) / 110, 0, 1)
    spill = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None)
    a[..., 0] -= spill * 0.9
    a[..., 2] -= spill * 0.9
    return a, alpha


def fit(a, alpha, rect, w=CELL, h=CELL, square=True, m=3):
    x0, y0, x1, y1 = rect
    al = alpha[y0:y1, x0:x1]
    ys, xs = np.where(al > 0.3)
    bx0, bx1 = max(0, xs.min() - m), min(x1 - x0, xs.max() + m + 1)
    by0, by1 = max(0, ys.min() - m), min(y1 - y0, ys.max() + m + 1)
    if square:
        side = max(bx1 - bx0, by1 - by0)
        sq = np.zeros((side, side, 4), np.float32)
        ox, oy = (side - (bx1 - bx0)) // 2, (side - (by1 - by0)) // 2
    else:
        sq = np.zeros((by1 - by0, bx1 - bx0, 4), np.float32)
        ox = oy = 0
    sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0, :3] = a[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1]
    sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0, 3] = al[by0:by1, bx0:bx1] * 255
    pre = sq.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    small = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((w, h), Image.LANCZOS)).astype(np.float32)
    al2 = small[..., 3:4]
    small[..., :3] = np.where(al2 > 0, small[..., :3] * 255 / np.maximum(al2, 1), 0)
    small[..., :3] = np.floor(small[..., :3] / 8) * 8
    return Image.fromarray(np.clip(small, 0, 255).astype(np.uint8), "RGBA")


def put(atlas, idx, img):
    p = ROOT + f"assets/fx/{atlas}.png"
    im = Image.open(p).convert("RGBA")
    x, y = (idx % 4) * CELL, (idx // 4) * CELL
    im.paste(Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0)), (x, y))
    im.paste(img, (x, y))
    im.save(p)


S = 2400 / 1100
a, alpha = keyed(G + "mix_out.png")
R = lambda x0, y0, x1, y1: tuple(int(v * S) for v in (x0, y0, x1, y1))
cuts = {
    ("warlord", 13): R(30, 20, 250, 240),
    ("warlord", 6): R(355, 80, 465, 190),
    ("warlord", 4): R(35, 270, 245, 445),
    ("engineer", 15): R(335, 280, 495, 440),
    ("duelist", 0): R(585, 250, 805, 470),
    ("duelist", 4): R(65, 470, 215, 620),
    ("FX", 7): R(340, 475, 485, 620),
    ("FX", 9): R(610, 475, 765, 620),
    ("FX", 10): R(70, 650, 210, 780),
}
names = {"FX": "common"}
for (atlas, idx), rect in cuts.items():
    put(names.get(atlas, atlas), idx, fit(a, alpha, rect))
strip = fit(a, alpha, R(548, 40, 1100, 225), 256, 64, square=False, m=0)
strip.save(ROOT + "assets/fx/lava.png")
print("ok")
