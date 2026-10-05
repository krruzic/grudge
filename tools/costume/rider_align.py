"""Fit each view of a costume repaint back onto the exp.py render grid (Nano Banana sometimes returns a 16:9 sheet or
shifts the views): per quadrant, scale the painted figure's bounding box onto the render's. Prints the per-view
silhouette IoU (keep > ~0.75)."""
import sys
import numpy as np
from PIL import Image

ref_path, src, out = sys.argv[1:4]
R = np.asarray(Image.open(ref_path).convert("RGB")).astype(np.float32)
bgc = R[5, 5]


def fg(a, bg):
    return np.sqrt(((a - bg) ** 2).sum(-1)) > 30


def bbox(m):
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


A = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
H, W = A.shape[:2]
bg2 = np.median(A[:10, :10].reshape(-1, 3), 0)
img = Image.new("RGB", (2048, 2048), tuple(int(v) for v in bgc))
ious = []
for i in range(4):
    qx, qy = i % 2, i // 2
    rq = R[qy * 1024:(qy + 1) * 1024, qx * 1024:(qx + 1) * 1024]
    rm = fg(rq, bgc)
    rx0, ry0, rx1, ry1 = bbox(rm)
    aq = A[qy * H // 2:(qy + 1) * H // 2, qx * W // 2:(qx + 1) * W // 2]
    ax0, ay0, ax1, ay1 = bbox(fg(aq, bg2))
    crop = Image.fromarray(aq[ay0:ay1, ax0:ax1].astype(np.uint8)).resize((rx1 - rx0, ry1 - ry0), Image.LANCZOS)
    tile = Image.new("RGB", (1024, 1024), tuple(int(v) for v in bgc))
    tile.paste(crop, (rx0, ry0))
    tm = fg(np.asarray(tile).astype(np.float32), bgc)
    ious.append(round(float((tm & rm).sum() / max(1, (tm | rm).sum())), 3))
    img.paste(tile, (qx * 1024, qy * 1024))
img.save(out)
print(out, "iou", ious)
