"""Cut Hollin's ability glyph strip (4 x 96 px, white on transparent) from the Nano Banana sheet.
The sheet's black panels came out uneven (two stacked on the right), so the panel boxes are measured by hand and
each white glyph is fitted into a square cell."""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
a = np.asarray(Image.open(os.path.join(ROOT, "assets/generated/scribe_ability_glyphs_raw.png")).convert("L")).astype(np.float32)
H, W = a.shape
# Panel boxes (x0, x1, y0, y1) measured on the raw sheet: left, middle, top right, bottom right.
panels = [(14, 570, 12, 660), (599, 1108, 12, 660), (1113, 1570, 12, 328), (1156, 1570, 345, 660)]
assert len(panels) == 4, panels
C = 96
out = Image.new("L", (C * 4, C), 0)
for k, (x0, x1, y0, y1) in enumerate(panels):
    m = np.clip((a[y0 + 12:y1 - 12, x0 + 12:x1 - 12] - 60) / 140, 0, 1)
    yy, xx = np.where(m > 0.3)
    by0, by1, bx0, bx1 = yy.min(), yy.max() + 1, xx.min(), xx.max() + 1
    side = max(by1 - by0, bx1 - bx0)
    pad = int(side * 0.06)
    sq = np.zeros((side + 2 * pad, side + 2 * pad), np.float32)
    oy = (side - (by1 - by0)) // 2 + pad
    ox = (side - (bx1 - bx0)) // 2 + pad
    sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0] = m[by0:by1, bx0:bx1]
    out.paste(Image.fromarray((sq * 255).astype(np.uint8), "L").resize((C, C), Image.LANCZOS), (k * C, 0))
img = Image.merge("RGBA", [Image.new("L", out.size, 255)] * 3 + [out])
img.save(os.path.join(ROOT, "assets/ui/ability_glyphs/scribe.png"), optimize=True)
bg = Image.new("RGBA", img.size, (200, 170, 120, 255))
bg.paste(Image.new("RGBA", img.size, (74, 48, 24, 255)), (0, 0), img.split()[3])
bg.convert("RGB").resize((C * 8, C * 2)).save("/tmp/opencode/scribe/glyph_check.png")
print(panels)
