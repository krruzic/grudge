import numpy as np, os, sys
from PIL import Image, ImageDraw, ImageFilter
sheet, out = sys.argv[1], sys.argv[2]
names = ["marksman_starfall", "marksman_sunfire", "marksman_raven", "marksman_winter", "marksman_classic"]
im = Image.open(sheet).convert("RGB").transpose(Image.FLIP_LEFT_RIGHT)
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
bg = np.median(np.concatenate([a[:20].reshape(-1, 3), a[-20:].reshape(-1, 3)]), 0)
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
cells = []
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
    top = mask[by0:by0 + int((by1 - by0) * 0.62)]
    tx = np.where(top.max(0) > 0)[0]
    cells.append((n, x0, mask, soft, by0, by1, tx.min(), tx.max() + 1))
side = int(max(max((c[7] - c[6]) * 1.06 for c in cells), float(np.median([(c[5] - c[4]) * 0.84 for c in cells]))))
for n, x0, mask, soft, by0, by1, tx0, tx1 in cells:
    cx = (tx0 + tx1) // 2
    sx0 = cx - side // 2
    sq = np.zeros((side, side, 4), np.float32)
    hh = min(by1 - by0, side - 3)
    for xx in range(side):
        sxx = sx0 + xx
        if 0 <= sxx < mask.shape[1]:
            sq[3:3 + hh, xx, :3] = a[by0:by0 + hh, x0 + sxx]
            sq[3:3 + hh, xx, 3] = soft[by0:by0 + hh, sxx]
    Image.fromarray(np.clip(sq, 0, 255).astype(np.uint8), "RGBA").resize((96, 96), Image.LANCZOS).save(os.path.join(out, n + ".png"))
