"""Cut Brindle's ability glyph strip (a/b/r/z) from the Nano Banana sheet: the four big black cells (the model also
echoed the reference glyphs below them; those are ignored). python3 harpooner_glyphs_cut.py <raw.png> <out.png>"""
import sys
import numpy as np
from PIL import Image

a = np.asarray(Image.open(sys.argv[1]).convert("L")).astype(np.float32)
dark = a < 40
rows = dark.mean(1) > 0.35
y0 = int(np.argmax(rows))
band = dark[y0 + 20:y0 + 220].mean(0)
big, s = [], None
for x, v in enumerate(list(band > 0.05) + [False]):
    if v and s is None:
        s = x
    if not v and s is not None:
        if x - s > 200:
            big.append([s, x])
        s = None
assert len(big) == 4, big
# The cell's bottom edge: where its left border column stops being black.
col = dark[:, big[0][0] + 6]
y1 = y0
while y1 < len(col) and col[y1]:
    y1 += 1
# Cells are square; the echoed reference row crowds their bottom edge, so stop one cell width down.
big = [(slice(y0, min(y1, y0 + int((x1 - x0) * 0.93))), slice(x0, x1)) for x0, x1 in big]
C = 128
out = Image.new("L", (C * 4, C), 0)
for k, sl in enumerate(big):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    m = np.clip((a[y0 + 10:y1 - 10, x0 + 10:x1 - 10] - 60) / 140, 0, 1)
    ys, xs = np.where(m > 0.3)
    by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    side = max(by1 - by0, bx1 - bx0)
    pad = int(side * 0.06)
    sq = np.zeros((side + 2 * pad, side + 2 * pad), np.float32)
    oy, ox = (side - (by1 - by0)) // 2 + pad, (side - (bx1 - bx0)) // 2 + pad
    sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0] = m[by0:by1, bx0:bx1]
    out.paste(Image.fromarray((sq * 255).astype(np.uint8), "L").resize((C, C), Image.LANCZOS), (k * C, 0))
    print(k, (x0, y0, x1, y1))
Image.merge("RGBA", [Image.new("L", out.size, 255)] * 3 + [out]).save(sys.argv[2], optimize=True)
