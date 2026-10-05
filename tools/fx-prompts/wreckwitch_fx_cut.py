"""Cut Mother Kelp's painted FX sheet (magenta key) into assets/fx/wreckwitch.png (4x4 cells of 128 px).
The whirlpool and drowned-hand ring came back as full squares, so they get a soft circular (ring) mask.
Usage: python3 wreckwitch_fx_cut.py <raw.png> <out.png>"""
import sys
import numpy as np
from PIL import Image

CELL = 128
src, dst = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
bg = np.array([255, 0, 255], np.float32)
d = np.sqrt(((a - bg) ** 2).sum(-1))
alpha = np.clip((d - 40) / 90, 0, 1)
spill = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None) * (1 - alpha) ** 0.5
a[..., 0] -= spill * 0.9
a[..., 2] -= spill * 0.9
H, W = alpha.shape
MASK = {13: (0.0, 0.47), 14: (0.17, 0.48)}


def fit(rect, i, m=3):
    x0, y0, x1, y1 = rect
    sub = alpha[y0:y1, x0:x1].copy()
    e = 10
    sub[:e] = 0
    sub[-e:] = 0
    sub[:, :e] = 0
    sub[:, -e:] = 0
    rgb = a[y0:y1, x0:x1]
    if i in MASK:
        h, w = sub.shape
        yy, xx = np.mgrid[0:h, 0:w]
        r = np.hypot((xx + 0.5) / w - 0.5, (yy + 0.5) / h - 0.5)
        lo, hi = MASK[i]
        ring = np.clip((hi - r) / 0.03, 0, 1) * (np.clip((r - lo) / 0.03, 0, 1) if lo > 0 else 1)
        sub = np.minimum(sub, ring) if i != 14 else np.minimum(sub, np.clip((hi - r) / 0.03, 0, 1))
    ys, xs = np.where(sub > 0.3)
    bx0, bx1 = max(0, xs.min() - m), min(x1 - x0, xs.max() + m + 1)
    by0, by1 = max(0, ys.min() - m), min(y1 - y0, ys.max() + m + 1)
    side = max(bx1 - bx0, by1 - by0)
    sq = np.zeros((side, side, 4), np.float32)
    ox, oy = (side - (bx1 - bx0)) // 2, (side - (by1 - by0)) // 2
    sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0, :3] = rgb[by0:by1, bx0:bx1]
    sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0, 3] = sub[by0:by1, bx0:bx1] * 255
    pre = sq.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    sm = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((CELL, CELL), Image.LANCZOS)).astype(np.float32)
    al2 = sm[..., 3:4]
    sm[..., :3] = np.where(al2 > 0, sm[..., :3] * 255 / np.maximum(al2, 1), 0)
    return Image.fromarray(np.clip(sm, 0, 255).astype(np.uint8), "RGBA")


out = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
for i in range(16):
    cx, cy = i % 4, i // 4
    out.paste(fit((cx * W // 4, cy * H // 4, (cx + 1) * W // 4, (cy + 1) * H // 4), i), (cx * CELL, cy * CELL))
out.save(dst)
