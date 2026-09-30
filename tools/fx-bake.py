import json, sys
import numpy as np
from PIL import Image

ROOT = "/home/krruzic/Projects/grudge/"
CELL = 128
for name in sys.argv[1:]:
    meta = json.load(open(ROOT + f"assets/generated/fx/{name}.json"))
    cols, rows = meta["cols"], meta["rows"]
    a = np.asarray(Image.open(ROOT + f"assets/generated/fx/{name}.png").convert("RGB")).astype(np.float32)
    H, W = a.shape[:2]
    bg = np.array([255.0, 0.0, 255.0])
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 60) / 110, 0, 1)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = np.clip(np.minimum(r, b) - g, 0, None)
    a[..., 0] -= spill * 0.9
    a[..., 2] -= spill * 0.9
    out = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
    cw, ch = W / cols, H / rows
    for k in range(cols * rows):
        cx, cy = k % cols, k // cols
        x0, y0 = int(cx * cw), int(cy * ch)
        x1, y1 = int((cx + 1) * cw), int((cy + 1) * ch)
        al = alpha[y0:y1, x0:x1]
        ys, xs = np.where(al > 0.3)
        if not len(xs):
            continue
        m = 3
        bx0, bx1 = max(0, xs.min() - m), min(x1 - x0, xs.max() + m + 1)
        by0, by1 = max(0, ys.min() - m), min(y1 - y0, ys.max() + m + 1)
        side = max(bx1 - bx0, by1 - by0)
        sq = np.zeros((side, side, 4), np.float32)
        ox, oy = (side - (bx1 - bx0)) // 2, (side - (by1 - by0)) // 2
        sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0, :3] = a[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1]
        sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0, 3] = al[by0:by1, bx0:bx1] * 255
        im = Image.fromarray(np.clip(sq, 0, 255).astype(np.uint8), "RGBA")
        pre = np.asarray(im).astype(np.float32)
        pre[..., :3] *= pre[..., 3:4] / 255
        small = np.asarray(Image.fromarray(pre.astype(np.uint8), "RGBA").resize((CELL, CELL), Image.LANCZOS)).astype(np.float32)
        al2 = small[..., 3:4]
        small[..., :3] = np.where(al2 > 0, small[..., :3] * 255 / np.maximum(al2, 1), 0)
        small[..., :3] = np.floor(small[..., :3] / 8) * 8
        out.paste(Image.fromarray(np.clip(small, 0, 255).astype(np.uint8), "RGBA"), (cx * CELL, cy * CELL))
    out.save(ROOT + f"assets/fx/{name}.png")
    json.dump({"cols": cols, "rows": rows, "cell": CELL}, open(ROOT + f"assets/fx/{name}.json", "w"))
    print(name, out.size)
