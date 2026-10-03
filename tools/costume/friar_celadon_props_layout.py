import sys
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
h2, w2 = H // 2, W // 2
canvas = np.empty((H, W, 3), np.float32)
canvas[:] = (200, 199, 203)
alpha_all = np.zeros((H, W), np.float32)
for qy in range(2):
    for qx in range(2):
        q = a[qy * h2:(qy + 1) * h2, qx * w2:(qx + 1) * w2]
        Y, X = np.mgrid[0:h2, 0:w2].astype(np.float32)
        edge = (X < 12) | (X > w2 - 12) | (Y < 12) | (Y > h2 - 12)
        xs, ys = X[edge] / w2, Y[edge] / h2
        M = np.stack([np.ones_like(xs), xs, ys, xs * xs, ys * ys, xs * ys], 1)
        coef = np.linalg.lstsq(M, q[edge], rcond=None)[0]
        bgm = np.stack([np.ones_like(X), X / w2, Y / h2, (X / w2) ** 2, (Y / h2) ** 2, X * Y / w2 / h2], -1) @ coef
        mx, mn = q.max(-1), q.min(-1)
        sat = (mx - mn) / np.maximum(mx, 1)
        shadow = (sat < 0.09) & (q.mean(-1) < bgm.mean(-1) + 4)
        fg = (np.sqrt(((q - bgm) ** 2).sum(-1)) > 16) & ~shadow
        m = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
        fg = np.asarray(m) > 0
        ys_, xs_ = np.where(fg)
        y0, y1, x0, x1 = ys_.min(), ys_.max() + 1, xs_.min(), xs_.max() + 1
        crop = q[y0:y1, x0:x1]
        al = np.asarray(Image.fromarray((fg[y0:y1, x0:x1] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
        s = 760 / max(y1 - y0, x1 - x0)
        nw, nh = int((x1 - x0) * s), int((y1 - y0) * s)
        crop = np.asarray(Image.fromarray(crop.astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(np.float32)
        al = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(np.float32)[..., None] / 255
        ox, oy = qx * w2 + (w2 - nw) // 2, qy * h2 + (h2 - nh) // 2
        canvas[oy:oy + nh, ox:ox + nw] = canvas[oy:oy + nh, ox:ox + nw] * (1 - al) + crop * al
Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).save(out)
