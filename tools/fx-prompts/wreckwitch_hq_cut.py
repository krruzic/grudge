"""Cut Mother Kelp's HQ 2x2 painting (magenta key) into assets/fx/hq/wreckwitch.<cell>.png.
Usage: python3 wreckwitch_hq_cut.py <raw.png> <outdir>"""
import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
H, W = a.shape[:2]
bg = np.array([255, 0, 255], np.float32)
d = np.sqrt(((a - bg) ** 2).sum(-1))
alpha = np.clip((d - 40) / 90, 0, 1)
spill = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None) * (1 - alpha) ** 0.5
a[..., 0] -= spill * 0.95
a[..., 2] -= spill * 0.95
a = np.clip(a, 0, 255)
for q, (name, size) in enumerate([("puddle", 512), ("gripRing", 1024), ("whirlpool", 512), ("cloud", 512)]):
    x0, y0 = (q % 2) * W // 2, (q // 2) * H // 2
    sub = alpha[y0:y0 + H // 2, x0:x0 + W // 2].copy()
    e = 8
    sub[:e] = sub[-e:] = 0
    sub[:, :e] = sub[:, -e:] = 0
    ys, xs = np.where(sub > 0.3)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    half = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 4
    side = int(np.ceil(half * 2))
    sq = np.zeros((side, side, 4), np.float32)
    bx0, by0 = int(round(cx - half)), int(round(cy - half))
    for yy in range(side):
        sy = by0 + yy
        if 0 <= sy < sub.shape[0]:
            lo, hi = max(0, -bx0), min(side, sub.shape[1] - bx0)
            sq[yy, lo:hi, :3] = a[y0 + sy, x0 + bx0 + lo:x0 + bx0 + hi]
            sq[yy, lo:hi, 3] = sub[sy, bx0 + lo:bx0 + hi] * 255
    pre = sq.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    sm = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)).astype(np.float32)
    al = sm[..., 3:4]
    sm[..., :3] = np.where(al > 0, sm[..., :3] * 255 / np.maximum(al, 1), 0)
    Image.fromarray(np.clip(sm, 0, 255).astype(np.uint8), "RGBA").save(f"{out}/wreckwitch.{name}.png", optimize=True)
