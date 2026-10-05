"""Cut the 2x2 Bramble costume icon sheet into assets/ui/costume_icons/rider_<costume>.png (96 px, one shared square
so the four heads stay the same size)."""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
sheet = sys.argv[1]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "ui", "costume_icons")
names = ["rider_classic", "rider_warhornet", "rider_lavenderfield", "rider_queencourier"]
im = Image.open(sheet).convert("RGB")
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
bg = np.median(a[:20].reshape(-1, 3), 0)
fg = np.sqrt(((a - bg) ** 2).sum(-1)) > 28
m = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
solid = ndimage.binary_fill_holes(np.asarray(m) > 0)
boxes = []
for k in range(4):
    qx, qy = k % 2, k // 2
    q = solid[qy * H // 2:(qy + 1) * H // 2, qx * W // 2:(qx + 1) * W // 2]
    lab, n = ndimage.label(q)
    sizes = ndimage.sum(q, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 2000])
    ys, xs = np.where(keep)
    boxes.append((qx * W // 2, qy * H // 2, keep, xs.min(), xs.max() + 1, ys.min(), ys.max() + 1))
side = int(max(max(b[4] - b[3], b[6] - b[5]) for b in boxes) * 1.04)
for (ox, oy, keep, x0, x1, y0, y1), name in zip(boxes, names):
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    sx0, sy0 = cx - side // 2, cy - side // 2
    sq = np.zeros((side, side, 4), np.float32)
    for yy in range(side):
        sy = sy0 + yy
        if sy < 0 or sy >= keep.shape[0]:
            continue
        lo = max(0, -sx0)
        hi = min(side, keep.shape[1] - sx0)
        sq[yy, lo:hi, :3] = a[oy + sy, ox + sx0 + lo:ox + sx0 + hi]
        sq[yy, lo:hi, 3] = keep[sy, sx0 + lo:sx0 + hi] * 255
    al = Image.fromarray(sq[..., 3].astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
    sq[..., 3] = np.asarray(al)
    Image.fromarray(np.clip(sq, 0, 255).astype(np.uint8), "RGBA").resize((96, 96), Image.LANCZOS).save(os.path.join(out, name + ".png"))
    print(name, x1 - x0, y1 - y0)
