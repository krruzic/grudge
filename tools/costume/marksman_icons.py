import numpy as np, os, sys
from PIL import Image, ImageDraw, ImageFilter
sheet, out = sys.argv[1], sys.argv[2]
names = ["marksman_sunfire", "marksman_raven", "marksman_winter", "marksman_classic"]
im = Image.open(sheet).convert("RGB").transpose(Image.FLIP_LEFT_RIGHT)
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
bg = np.median(np.concatenate([a[:20].reshape(-1, 3), a[-20:].reshape(-1, 3)]), 0)
fg = np.sqrt(((a - bg) ** 2).sum(-1)) > 28
m = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
cw = W / 4
for i, n in enumerate(names):
    x0 = int(i * cw)
    cell = m.crop((x0, 0, int(x0 + cw), H)).convert("L")
    pad = Image.new("L", (cell.width + 2, cell.height + 2), 0)
    pad.paste(cell, (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    mask = (np.asarray(pad)[1:-1, 1:-1] != 128).astype(np.float32)
    ys, xs = np.where(mask > 0)
    by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    soft = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32)
    hh, ww = by1 - by0, bx1 - bx0
    side = int(max(ww * 1.06, hh * 0.84))
    hh = min(hh, side - 3)
    by1 = by0 + hh
    sq = np.zeros((side, side, 4), np.float32)
    ox, oy = (side - ww) // 2, 3
    sq[oy:oy + hh, ox:ox + ww, :3] = a[by0:by1, x0 + bx0:x0 + bx1]
    sq[oy:oy + hh, ox:ox + ww, 3] = soft[by0:by1, bx0:bx1]
    Image.fromarray(np.clip(sq, 0, 255).astype(np.uint8), "RGBA").resize((96, 96), Image.LANCZOS).save(os.path.join(out, n + ".png"))
