import numpy as np, os, sys
from PIL import Image, ImageDraw, ImageFilter
sheet, out = sys.argv[1], sys.argv[2]
names = ["harpooner_classic", "harpooner_admiral", "harpooner_bog", "harpooner_abyss"]
im = Image.open(sheet).convert("RGB")
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
bg = np.median(a[:20].reshape(-1, 3), 0)
fg = np.sqrt(((a - bg) ** 2).sum(-1)) > 28
m = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
pad = Image.new("L", (W + 2, H + 2), 0)
pad.paste(m, (1, 1))
ImageDraw.floodfill(pad, (0, 0), 128)
solid = np.asarray(pad)[1:-1, 1:-1] != 128
lab = np.zeros((H, W), np.int32)
boxes = []
for y in range(0, H, 4):
    for x in range(0, W, 4):
        if solid[y, x] and not lab[y, x]:
            k = len(boxes) + 1
            stack = [(y, x)]
            lab[y, x] = k
            y0 = y1 = y
            x0 = x1 = x
            n = 0
            while stack:
                cy, cx = stack.pop()
                n += 1
                y0, y1, x0, x1 = min(y0, cy), max(y1, cy), min(x0, cx), max(x1, cx)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and solid[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = k
                        stack.append((ny, nx))
            boxes.append((k, n, y0, y1 + 1, x0, x1 + 1))
boxes = [b for b in boxes if b[1] > 20000]
assert len(boxes) == len(names), [(b[1], b[2:]) for b in boxes]
rowh = H / 2
boxes.sort(key=lambda b: (round(((b[2] + b[3]) / 2) / rowh), b[4]))
for (k, n, by0, by1, bx0, bx1), name in zip(boxes, names):
    mask = (lab[by0:by1, bx0:bx1] == k).astype(np.float32)
    soft = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32)
    hh, ww = by1 - by0, bx1 - bx0
    side = int(max(ww, hh) * 1.04)
    sq = np.zeros((side, side, 4), np.float32)
    ox, oy = (side - ww) // 2, (side - hh) // 2
    sq[oy:oy + hh, ox:ox + ww, :3] = a[by0:by1, bx0:bx1]
    sq[oy:oy + hh, ox:ox + ww, 3] = soft
    Image.fromarray(np.clip(sq, 0, 255).astype(np.uint8), "RGBA").resize((96, 96), Image.LANCZOS).save(os.path.join(out, name + ".png"))
    print(name, ww, hh)
