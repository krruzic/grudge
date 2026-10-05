"""Cut Mother Kelp's ability glyphs (white on black, 4 glyphs a/b/r/z) into assets/ui/ability_glyphs/wreckwitch.png.
Usage: python3 wreckwitch_glyphs_cut.py <raw.png> <out.png>"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

a = np.asarray(Image.open(sys.argv[1]).convert("L")).astype(np.float32)
white = a > 110
lab, n = ndimage.label(ndimage.binary_dilation(white, iterations=14))
sizes = ndimage.sum(white, lab, range(1, n + 1))
objs = ndimage.find_objects(lab)
big = [objs[i] for i in np.argsort(-sizes)[:4]]
big.sort(key=lambda sl: (sl[1].start + sl[1].stop) / 2)
big = [big[0]] + sorted(big[1:3], key=lambda sl: sl[0].start) + [big[3]]
C = 96
out = Image.new("L", (C * 4, C), 0)
for k, sl in enumerate(big):
    m = np.clip((a[sl] - 60) / 140, 0, 1) * (lab[sl] == lab[sl][np.unravel_index(np.argmax(white[sl]), white[sl].shape)])
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
img.save(sys.argv[2], optimize=True)
