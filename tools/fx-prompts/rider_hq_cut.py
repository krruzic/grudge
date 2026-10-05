"""Cut Bramble's 2x2 HQ FX painting into assets/fx/hq/rider.<key>[@costume].png:
rider_hq_cut.py <raw.png> [costume]. Quadrants: pool (512), ring (1024), splash (512), gust (512)."""
import os, sys
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
raw = sys.argv[1]
suf = "@" + sys.argv[2] if len(sys.argv) > 2 else ""
a = np.asarray(Image.open(raw).convert("RGB").resize((2048, 2048), Image.LANCZOS)).astype(np.float32)
bg = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3), a[:8, -8:].reshape(-1, 3)]), 0)
d = np.sqrt(((a - bg) ** 2).sum(-1))
al = np.clip((d - 26) / 80, 0, 1)
spill = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1] - 30, 0, None) * (1 - al) ** 0.5
a[..., 0] -= spill
a[..., 2] -= spill
a = np.clip(a, 0, 255)
for q, (key, size) in enumerate((("pool", 512), ("ring", 1024), ("splash", 512), ("gust", 512))):
    x0, y0 = (q % 2) * 1024, (q // 2) * 1024
    sub = al[y0:y0 + 1024, x0:x0 + 1024]
    ys, xs = np.where(sub > 0.3)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    half = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 4
    side = int(np.ceil(half * 2))
    sq = np.zeros((side, side, 4), np.float32)
    bx0, by0 = int(round(cx - half)), int(round(cy - half))
    for yy in range(side):
        sy = by0 + yy
        if 0 <= sy < 1024:
            lo, hi = max(0, -bx0), min(side, 1024 - bx0)
            sq[yy, lo:hi, :3] = a[y0 + sy, x0 + bx0 + lo:x0 + bx0 + hi]
            sq[yy, lo:hi, 3] = sub[sy, bx0 + lo:bx0 + hi] * 255
    pre = sq.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    sm = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)).astype(np.float32)
    a2 = sm[..., 3:4]
    sm[..., :3] = np.where(a2 > 0, sm[..., :3] * 255 / np.maximum(a2, 1), 0)
    Image.fromarray(np.clip(sm, 0, 255).astype(np.uint8), "RGBA").save(os.path.join(ROOT, "assets", "fx", "hq", f"rider.{key}{suf}.png"), optimize=True)
    print(key, side)
