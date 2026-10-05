"""Cut Bramble's talent icons (4 x 2 sheet, each icon framed above a caption strip the model added) into
assets/ui/talents/<id>.png at 96 px. The framed square is found per cell as the largest dark-bordered square."""
import os, sys
import numpy as np
from PIL import Image
raw = sys.argv[1]
ids = ["stingerdive", "tailwind", "beeswax", "swarmpot", "secondhelping", "honeydrizzle", "queensfeast"]
im = Image.open(raw).convert("RGB")
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "ui", "talents")
for k, name in enumerate(ids):
    cx, cy = k % 4, k // 4
    x0, x1 = cx * W // 4, (cx + 1) * W // 4
    y0, y1 = cy * H // 2, (cy + 1) * H // 2
    cell = a[y0:y1, x0:x1]
    cw = x1 - x0
    # the framed icon is square, cw wide minus the outer margin, starting near the top of the cell
    m = int(cw * 0.035)
    side = cw - 2 * m
    crop = Image.fromarray(cell[m:m + side, m:m + side].astype(np.uint8))
    crop.resize((96, 96), Image.LANCZOS).save(os.path.join(dst, name + ".png"))
