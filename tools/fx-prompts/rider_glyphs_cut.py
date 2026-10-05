"""Cut Bramble's ability glyphs (a ladle, b honey pot, r rising bee, z crowned honeycomb) from the raw sheet into
assets/ui/ability_glyphs/rider.png (4 x 96 px, white on transparent). The sheet came back as one big panel plus a
2x2 block, so the panels are listed by hand (fractions of the image)."""
import os, sys
import numpy as np
from PIL import Image
raw = sys.argv[1]
a = np.asarray(Image.open(raw).convert("L")).astype(np.float32)
H, W = a.shape
PANELS = [(0.0, 0.0, 0.495, 1.0), (0.505, 0.0, 0.735, 0.49), (0.745, 0.0, 1.0, 0.49), (0.745, 0.51, 1.0, 1.0)]
C = 96
out = Image.new("L", (C * 4, C), 0)
for k, (fx0, fy0, fx1, fy1) in enumerate(PANELS):
    x0, y0, x1, y1 = int(fx0 * W), int(fy0 * H), int(fx1 * W), int(fy1 * H)
    sub = a[y0:y1, x0:x1]
    dark = sub < 60
    ys, xs = np.where(dark)
    # inside the black panel only (skip its white surround)
    px0, px1, py0, py1 = xs.min() + 12, xs.max() - 12, ys.min() + 12, ys.max() - 12
    m = np.clip((sub[py0:py1, px0:px1] - 60) / 140, 0, 1)
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
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "ui", "ability_glyphs", "rider.png")
img.save(dst, optimize=True)
bg = Image.new("RGBA", img.size, (200, 170, 120, 255))
bg.paste(Image.new("RGBA", img.size, (74, 48, 24, 255)), (0, 0), img.split()[3])
bg.convert("RGB").resize((C * 8, C * 2)).save("/tmp/opencode/rider/glyph_check.png")
