"""Cut Brindle's FX sheet (4x4 Nano Banana sheet on magenta, 2K) into assets/fx/harpooner[@costume].png (128 px
cells) and the big cells into HQ paintings assets/fx/hq/harpooner.<key>[@costume].png (512 px).
python3 tools/fx-prompts/harpooner_fx_cut.py <sheet.png> [costume]"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KEYS = ["drop", "splash", "ripple", "foam", "bubble", "spray", "puddle", "whirl",
        "wave", "rope", "spark", "shell", "kelp", "glint", "tongue", "impact"]
# Seen-from-above cells painted in perspective: stretch to round. Rope: keep it a full-width strip.
STRETCH = {"ripple", "puddle", "whirl", "rope"}
HQ = {"splash", "puddle", "whirl", "impact", "ripple"}
CELL = 128


def keyed(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    bg = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)]), 0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 70) / 110, 0, 1)
    spill = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None) * (1 - alpha) ** 0.5
    a[..., 0] -= spill * 0.9
    a[..., 2] -= spill * 0.9
    return a, alpha


def fit(a, alpha, rect, size, stretch, m=4):
    x0, y0, x1, y1 = rect
    al = alpha[y0:y1, x0:x1]
    ys, xs = np.where(al > 0.3)
    bx0, bx1 = max(0, xs.min() - m), min(x1 - x0, xs.max() + m + 1)
    by0, by1 = max(0, ys.min() - m), min(y1 - y0, ys.max() + m + 1)
    w, h = bx1 - bx0, by1 - by0
    if stretch:
        sq = np.zeros((h, w, 4), np.float32)
        ox = oy = 0
    else:
        side = max(w, h)
        sq = np.zeros((side, side, 4), np.float32)
        ox, oy = (side - w) // 2, (side - h) // 2
    sq[oy:oy + h, ox:ox + w, :3] = a[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1]
    sq[oy:oy + h, ox:ox + w, 3] = al[by0:by1, bx0:bx1] * 255
    pre = sq.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    out_h = size // 4 if stretch == "strip" else size
    small = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((size, out_h), Image.LANCZOS)).astype(np.float32)
    if stretch == "strip":
        pad = np.zeros((size, size, 4), np.float32)
        pad[(size - out_h) // 2:(size - out_h) // 2 + out_h] = small
        small = pad
    al2 = small[..., 3:4]
    small[..., :3] = np.where(al2 > 0, small[..., :3] * 255 / np.maximum(al2, 1), 0)
    if size == CELL:
        small[..., :3] = np.floor(small[..., :3] / 8) * 8
    return Image.fromarray(np.clip(small, 0, 255).astype(np.uint8), "RGBA")


def main():
    src = sys.argv[1]
    cos = sys.argv[2] if len(sys.argv) > 2 else ""
    suf = f"@{cos}" if cos else ""
    a, alpha = keyed(src)
    H, W = alpha.shape
    sheet = Image.new("RGBA", (CELL * 4, CELL * 4), (0, 0, 0, 0))
    os.makedirs(os.path.join(ROOT, "assets", "fx", "hq"), exist_ok=True)
    for i, k in enumerate(KEYS):
        c, r = i % 4, i // 4
        rect = (c * W // 4 + 6, r * H // 4 + 6, (c + 1) * W // 4 - 6, (r + 1) * H // 4 - 6)
        st = ("strip" if k == "rope" else True) if k in STRETCH else False
        sheet.paste(fit(a, alpha, rect, CELL, st), (c * CELL, r * CELL))
        if k in HQ:
            fit(a, alpha, rect, 512, st).save(os.path.join(ROOT, "assets", "fx", "hq", f"harpooner.{k}{suf}.png"), optimize=True)
    sheet.save(os.path.join(ROOT, "assets", "fx", f"harpooner{suf}.png"), optimize=True)
    if not cos:
        open(os.path.join(ROOT, "assets", "fx", "harpooner.json"), "w").write('{"cols": 4, "rows": 4, "cell": 128}')


if __name__ == "__main__":
    main()
