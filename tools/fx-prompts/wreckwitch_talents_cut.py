"""Cut Mother Kelp's talent icon sheet (4x2 painted square panels, labels underneath) into assets/ui/talents/<id>.png.
Each panel is found as the bright block inside its grid cell above the label band.
Usage: python3 wreckwitch_talents_cut.py <raw.png> <outdir>"""
import sys
import numpy as np
from PIL import Image

IDS = ["brinesquall", "scurvy", "keelhaul", "longchain", "barnacle", "maelstrom", "davyslocker", "hightide"]
im = Image.open(sys.argv[1]).convert("RGB")
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
lum = a.mean(-1)
for k, name in enumerate(IDS):
    cx, cy = k % 4, k // 4
    x0, x1 = cx * W // 4, (cx + 1) * W // 4
    y0, y1 = cy * H // 2, (cy + 1) * H // 2
    sub = lum[y0:y1, x0:x1] > 28
    cols = np.where(sub.mean(0) > 0.6)[0]
    rows = np.where(sub[:, cols.min():cols.max() + 1].mean(1) > 0.9)[0]
    l, r = cols.min(), cols.max() + 1
    t = rows.min()
    side = r - l
    box = (x0 + l + 4, y0 + t + 4, x0 + l + side - 4, y0 + t + side - 4)
    im.crop(box).resize((96, 96), Image.LANCZOS).save(f"{sys.argv[2]}/{name}.png", optimize=True)
    print(name, box)
