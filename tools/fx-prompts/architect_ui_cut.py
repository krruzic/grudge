"""Professor Hoot UI art: portrait (256 px jpg), stage backdrop (768x432 jpg) and the 4-glyph ability strip
(white on transparent, 4 x 96 px) from the raw Nano Banana paintings in assets/generated/."""
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
G = os.path.join(ROOT, "assets", "generated")
UI = os.path.join(ROOT, "assets", "ui")

p = Image.open(os.path.join(G, "architect_portrait_raw.png")).convert("RGB")
s = min(p.size)
p.crop(((p.width - s) // 2, (p.height - s) // 2, (p.width + s) // 2, (p.height + s) // 2)).resize(
    (256, 256), Image.LANCZOS
).save(os.path.join(UI, "portraits", "architect.jpg"), quality=88)

st = Image.open(os.path.join(G, "architect_stage_raw.png")).convert("RGB")
w, h = st.size
th = int(w * 9 / 16)
st.crop((0, (h - th) // 2, w, (h - th) // 2 + th)).resize((768, 432), Image.LANCZOS).save(
    os.path.join(UI, "stages", "architect.jpg"), quality=88
)

a = np.asarray(Image.open(os.path.join(G, "architect_ability_glyphs_raw.png")).convert("L")).astype(np.float32)
dark = a < 60
lab, n = ndimage.label(ndimage.binary_fill_holes(dark))
objs = ndimage.find_objects(lab)
sizes = ndimage.sum(dark, lab, range(1, n + 1))
big = sorted([objs[i] for i in np.argsort(-sizes)[:4]], key=lambda sl: sl[1].start)
C = 96
out = Image.new("L", (C * 4, C), 0)
for k, sl in enumerate(big):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    m = np.clip((a[y0 + 10 : y1 - 10, x0 + 10 : x1 - 10] - 60) / 140, 0, 1)
    yy, xx = np.where(m > 0.3)
    by0, by1, bx0, bx1 = yy.min(), yy.max() + 1, xx.min(), xx.max() + 1
    side = max(by1 - by0, bx1 - bx0)
    pad = int(side * 0.06)
    sq = np.zeros((side + 2 * pad, side + 2 * pad), np.float32)
    oy = (side - (by1 - by0)) // 2 + pad
    ox = (side - (bx1 - bx0)) // 2 + pad
    sq[oy : oy + by1 - by0, ox : ox + bx1 - bx0] = m[by0:by1, bx0:bx1]
    out.paste(Image.fromarray((sq * 255).astype(np.uint8), "L").resize((C, C), Image.LANCZOS), (k * C, 0))
img = Image.merge("RGBA", [Image.new("L", out.size, 255)] * 3 + [out])
img.save(os.path.join(UI, "ability_glyphs", "architect.png"), optimize=True)
bg = Image.new("RGBA", img.size, (200, 170, 120, 255))
bg.paste(Image.new("RGBA", img.size, (74, 48, 24, 255)), (0, 0), img.split()[3])
bg.convert("RGB").resize((C * 8, C * 2)).save("/tmp/opencode/architect/glyph_check.png")
print("ok")
