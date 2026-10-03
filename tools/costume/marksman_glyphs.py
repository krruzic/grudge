import sys
import numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
C = 128
a = np.asarray(Image.open(src).convert("L")).astype(np.float32)
dark = (a < 60).mean(0)
cols, s = [], None
for i, v in enumerate(dark):
    if v > 0.5 and s is None:
        s = i
    if v <= 0.5 and s is not None:
        if i - s > 100:
            cols.append((s, i))
        s = None
if s is not None and len(a[0]) - s > 100:
    cols.append((s, len(a[0])))
rows = np.where((a < 60).mean(1) > 0.5)[0]
y0, y1 = rows.min(), rows.max() + 1
strip = Image.new("L", (C * len(cols), C), 0)
for k, (x0, x1) in enumerate(cols):
    m = np.clip((a[y0 + 8:y1 - 8, x0 + 8:x1 - 8] - 60) / 140, 0, 1)
    ys, xs = np.where(m > 0.3)
    by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    side = max(by1 - by0, bx1 - bx0)
    pad = int(side * 0.06)
    sq = np.zeros((side + 2 * pad, side + 2 * pad), np.float32)
    oy, ox = (side - (by1 - by0)) // 2 + pad, (side - (bx1 - bx0)) // 2 + pad
    sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0] = m[by0:by1, bx0:bx1]
    strip.paste(Image.fromarray((sq * 255).astype(np.uint8), "L").resize((C, C), Image.LANCZOS), (k * C, 0))
print(cols)
Image.merge("RGBA", [Image.new("L", strip.size, 255)] * 3 + [strip]).save(out, optimize=True)
