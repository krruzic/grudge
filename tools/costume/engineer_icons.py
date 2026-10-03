import numpy as np, os, sys
from PIL import Image, ImageDraw, ImageFilter
sheet, out = sys.argv[1], sys.argv[2]
names = ["engineer_classic", "engineer_clock", "engineer_ember", "engineer_frost", "engineer_calliope"]
im = Image.open(sheet).convert("RGB")
im = im.crop((0, 0, im.width, int(im.height * 0.81)))
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
bg = np.median(a[:20].reshape(-1, 3), 0)
fg = np.sqrt(((a - bg) ** 2).sum(-1)) > 28
m = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
colfg = np.asarray(m).max(0) > 0
runs, x = [], 0
while x < W:
    if colfg[x]:
        s0 = x
        while x < W and colfg[x]:
            x += 1
        if x - s0 > 40:
            runs.append((s0, x))
    x += 1
assert len(runs) == len(names), runs
for i, n in enumerate(names):
    x0 = runs[i][0] - 4
    cell = m.crop((x0, 0, runs[i][1] + 4, H)).convert("L")
    pad = Image.new("L", (cell.width + 2, cell.height + 2), 0)
    pad.paste(cell, (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    mask = (np.asarray(pad)[1:-1, 1:-1] != 128).astype(np.float32)
    ys, xs = np.where(mask > 0)
    by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    soft = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32)
    hh, ww = by1 - by0, bx1 - bx0
    side = int(max(ww, hh) * 1.04)
    sq = np.zeros((side, side, 4), np.float32)
    ox, oy = (side - ww) // 2, (side - hh) // 2
    sq[oy:oy + hh, ox:ox + ww, :3] = a[by0:by1, x0 + bx0:x0 + bx1]
    sq[oy:oy + hh, ox:ox + ww, 3] = soft[by0:by1, bx0:bx1]
    Image.fromarray(np.clip(sq, 0, 255).astype(np.uint8), "RGBA").resize((96, 96), Image.LANCZOS).save(os.path.join(out, n + ".png"))
