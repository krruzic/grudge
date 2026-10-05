# Gristle's ability glyph strip: assets/generated/vintner_ability_glyphs_raw.png (4 white glyphs on black, cells split
# by thin white lines) -> assets/ui/ability_glyphs/vintner.png (4 x 96 px, white with alpha).
import os
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
a = np.asarray(Image.open(os.path.join(ROOT, "assets/generated/vintner_ability_glyphs_raw.png")).convert("L")).astype(np.float32)
H, W = a.shape
C = 96
out = Image.new("L", (C * 4, C), 0)
for k in range(4):
    x0, x1 = k * W // 4 + 12, (k + 1) * W // 4 - 12
    m = np.clip((a[12:H - 12, x0:x1] - 60) / 140, 0, 1)
    # Drop white areas glued to the cell's edges (the first glyph came with a solid "ground" slab behind it).
    lab, n = ndimage.label(m > 0.5)
    b = 40
    edge = set(np.unique(np.concatenate([lab[:b].ravel(), lab[-b:].ravel(), lab[:, :b].ravel(), lab[:, -b:].ravel()])))
    edge -= {0}
    for e in edge if k == 0 else []:
        m[ndimage.binary_dilation(lab == e, iterations=2)] = 0
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
img.save(os.path.join(ROOT, "assets/ui/ability_glyphs/vintner.png"), optimize=True)
bg = Image.new("RGBA", img.size, (200, 170, 120, 255))
bg.paste(Image.new("RGBA", img.size, (74, 48, 24, 255)), (0, 0), img.split()[3])
bg.convert("RGB").resize((C * 8, C * 2)).save("/tmp/opencode/vintner/glyph_check.png")
