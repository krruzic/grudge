import json, glob
import numpy as np
from PIL import Image

def segments(proj, min_gap):
    on = proj > 0
    segs, start, gap = [], None, 0
    for i, v in enumerate(on):
        if v:
            if start is None:
                start = i
            gap = 0
            end = i
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                segs.append([start, end + 1])
                start = None
    if start is not None:
        segs.append([start, end + 1])
    return segs

def fit(segs, n, proj):
    segs = [s for s in segs if proj[s[0]:s[1]].sum() > 0]
    while len(segs) > n:
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        weights = [proj[s[0]:s[1]].sum() for s in segs]
        k = min(range(len(segs)), key=lambda i: weights[i])
        j = k - 1 if k == len(segs) - 1 or (k > 0 and gaps[k - 1] < gaps[k]) else k
        segs[j] = [segs[j][0], segs[j + 1][1]]
        del segs[j + 1]
    return segs

for sj in sorted(glob.glob("assets/generated/talents/sheet_*.json")):
    meta = json.load(open(sj))
    if meta.get("manual"):
        continue
    a = np.asarray(Image.open(sj.replace(".json", ".png")).convert("RGB")).astype(np.int32)
    H, W = a.shape[:2]
    mag = (a[..., 0] > 170) & (a[..., 2] > 170) & (a[..., 1] < 110)
    dark_line = np.zeros_like(mag)
    fg = ~mag
    rows_fg = fg.mean(1)
    cols_fg = fg.mean(0)
    fg[rows_fg > 0.85, :] = False
    fg[:, cols_fg > 0.85] = False
    ids = meta["ids"]
    cols = meta["cols"]
    nrows = (len(ids) + cols - 1) // cols
    rproj = fg.sum(1).astype(float)
    rproj[rproj < W * 0.01] = 0
    rsegs = fit(segments(rproj, 6), nrows, rproj)
    k = 0
    for r, (y0, y1) in enumerate(rsegs):
        need = min(cols, len(ids) - k)
        band = fg[y0:y1]
        cproj = band.sum(0).astype(float)
        cproj[cproj < (y1 - y0) * 0.02] = 0
        csegs = fit(segments(cproj, 10), need, cproj)
        for (x0, x1) in csegs:
            if k >= len(ids):
                break
            sub = band[:, x0:x1]
            ys = np.where(sub.any(1))[0]
            cy0, cy1 = y0 + ys.min(), y0 + ys.max() + 1
            pad = 6
            bx0, bx1 = max(0, x0 - pad), min(W, x1 + pad)
            by0, by1 = max(0, cy0 - pad), min(H, cy1 + pad)
            cell = Image.fromarray(a[by0:by1, bx0:bx1].astype(np.uint8))
            side = max(cell.size)
            sq = Image.new("RGB", (side, side), (255, 0, 255))
            sq.paste(cell, ((side - cell.size[0]) // 2, (side - cell.size[1]) // 2))
            sq.save(f"assets/generated/talents/{ids[k]}_raw.png")
            k += 1
    print(sj, k, "of", len(ids))
