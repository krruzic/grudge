import sys, numpy as np
from PIL import Image
CELL = 128
def keyed(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    H, W, _ = a.shape
    cols = [x for x in range(W) if min(x % (W // 4), W // 4 - x % (W // 4)) < 14]
    rowbg = np.median(a[:, cols], axis=1)
    k = 31
    pad = np.pad(rowbg, ((k, k), (0, 0)), mode="edge")
    rowbg = np.stack([np.convolve(pad[:, c], np.ones(2 * k + 1) / (2 * k + 1), mode="same")[k:-k] for c in range(3)], 1)
    bg = np.broadcast_to(rowbg[:, None, :], a.shape)
    mean = rowbg.mean(0)
    green = mean[1] > 150 and mean[0] < 110
    if green:
        key = a[..., 1] - np.maximum(a[..., 0], a[..., 2])
        bk = bg[..., 1] - np.maximum(bg[..., 0], bg[..., 2])
    else:
        key = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
        bk = np.minimum(bg[..., 0], bg[..., 2]) - bg[..., 1]
    alpha = np.clip(((1 - key / np.maximum(bk, 30)) - 0.08) / 0.85, 0, 1)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.minimum(alpha, np.clip((d - 18) / 40, 0, 1))
    al = alpha[..., None]
    a = np.where(al > 0, (a - bg * (1 - al)) / np.maximum(al, 0.05), a)
    a = np.clip(a, 0, 255)
    if green:
        a[..., 1] = np.minimum(a[..., 1], (a[..., 0] + a[..., 2]) / 2 + 30 * alpha ** 4)
    else:
        a[..., 0] = np.minimum(a[..., 0], np.maximum(a[..., 1], a[..., 2] * 0 + a[..., 0]))
    return np.clip(a, 0, 255), alpha
def fit(a, al, rect, m=3):
    x0, y0, x1, y1 = rect
    sub = al[y0:y1, x0:x1].copy()
    e = 10
    sub[:e] = 0; sub[-e:] = 0; sub[:, :e] = 0; sub[:, -e:] = 0
    ys, xs = np.where(sub > 0.3)
    bx0, bx1 = max(0, xs.min() - m), min(x1 - x0, xs.max() + m + 1)
    by0, by1 = max(0, ys.min() - m), min(y1 - y0, ys.max() + m + 1)
    side = max(bx1 - bx0, by1 - by0)
    sq = np.zeros((side, side, 4), np.float32)
    ox, oy = (side - (bx1 - bx0)) // 2, (side - (by1 - by0)) // 2
    sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0, :3] = a[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1]
    sq[oy:oy + by1 - by0, ox:ox + bx1 - bx0, 3] = sub[by0:by1, bx0:bx1] * 255
    pre = sq.copy(); pre[..., :3] *= pre[..., 3:4] / 255
    sm = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((CELL, CELL), Image.LANCZOS)).astype(np.float32)
    al2 = sm[..., 3:4]
    sm[..., :3] = np.where(al2 > 0, sm[..., :3] * 255 / np.maximum(al2, 1), 0)
    return Image.fromarray(np.clip(sm, 0, 255).astype(np.uint8), "RGBA")
for name in sys.argv[1:]:
    a, al = keyed(f"out/{name}.png")
    H, W = al.shape
    out = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    for i in range(16):
        cx, cy = i % 4, i // 4
        out.paste(fit(a, al, (cx * W // 4, cy * H // 4, (cx + 1) * W // 4, (cy + 1) * H // 4)), (cx * CELL, cy * CELL))
    out.save(f"cut/{name}.png")
    chk = Image.new("RGBA", (1024, 512), (40, 60, 40, 255))
    chk.paste(Image.new("RGBA", (512, 512), (200, 190, 170, 255)), (512, 0))
    chk.alpha_composite(out, (0, 0)); chk.alpha_composite(out, (512, 0))
    chk.convert("RGB").save(f"cut/{name}_chk.jpg", quality=90)
    print(name)
