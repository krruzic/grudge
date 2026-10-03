import numpy as np
from PIL import Image
from scipy import ndimage
a = np.asarray(Image.open("/tmp/opencode/friar/glyphs_raw2.png").convert("L")).astype(np.float32)
dark = a < 60
lab, n = ndimage.label(ndimage.binary_fill_holes(dark))
objs = ndimage.find_objects(lab)
sizes = ndimage.sum(dark, lab, range(1, n + 1))
big = sorted([objs[i] for i in np.argsort(-sizes)[:4]], key=lambda sl: sl[1].start)
runs = [(sl[1].start, sl[1].stop, sl[0].start, sl[0].stop) for sl in big]
C = 96
out = Image.new("L", (C * 4, C), 0)
for k, (x0, x1, y0, y1) in enumerate(runs):
    m = np.clip((a[y0 + 10:y1 - 10, x0 + 10:x1 - 10] - 60) / 140, 0, 1)
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
img.save("/home/krruzic/Projects/grudge/assets/ui/ability_glyphs/friar.png", optimize=True)
bg = Image.new("RGBA", img.size, (200, 170, 120, 255))
r, g, b, al = img.split()
bg.paste(Image.new("RGBA", img.size, (74, 48, 24, 255)), (0, 0), al)
bg.convert("RGB").resize((C * 8, C * 2)).save("/tmp/opencode/friar/glyph_check.png")
print(runs)
