import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
ang = float(sys.argv[3]) if len(sys.argv) > 3 else 72
im = Image.open(src).convert("RGB")
S = im.width / 700
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
bg = np.median(np.concatenate([a[:20, :20].reshape(-1, 3), a[:20, -20:].reshape(-1, 3)]), 0)
Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
edge = (X < 60 * S) | (X > W - 60 * S) | (Y < 30 * S)
xs, ys = X[edge] / W, Y[edge] / H
M = np.stack([np.ones_like(xs), xs, ys, xs * xs, ys * ys, xs * ys], 1)
coef = np.linalg.lstsq(M, a[edge], rcond=None)[0]
xn, yn = X / W, Y / H
bgm = np.stack([np.ones_like(xn), xn, yn, xn * xn, yn * yn, xn * yn], -1) @ coef
fg = np.sqrt(((a - bgm) ** 2).sum(-1)) > 14


def rot_sample(img, msk, P, th):
    c, s = np.cos(th), np.sin(th)
    dx, dy = X - P[0], Y - P[1]
    sx = P[0] + c * dx + s * dy
    sy = P[1] - s * dx + c * dy
    xi = np.clip(np.round(sx).astype(int), 0, W - 1)
    yi = np.clip(np.round(sy).astype(int), 0, H - 1)
    ok = (sx >= 0) & (sx < W) & (sy >= 0) & (sy < H) & msk[yi, xi]
    return img[yi, xi], ok


res = a.copy()
layers = []
for A, B, P, sgn in (((229, 163), (198, 268), (216, 213), 1), ((476, 158), (516, 268), (496, 213), -1)):
    A, B, P = np.array(A) * S, np.array(B) * S, np.array(P) * S
    n = np.array([B[1] - A[1], -(B[0] - A[0])])
    side = (X - A[0]) * n[0] + (Y - A[1]) * n[1]
    ref = (0 - A[0]) * n[0] + (0 - A[1]) * n[1] if sgn > 0 else (W - A[0]) * n[0] + (0 - A[1]) * n[1]
    reg = (np.sign(side) == np.sign(ref)) & (Y < 285 * S)
    arm = fg & reg
    res[reg] = bgm[reg]
    root = arm & (np.hypot(X - P[0], Y - P[1]) < 55 * S)
    th = -np.radians(ang) * sgn
    for k in np.linspace(0, 1, 24)[:-1]:
        layers.append(rot_sample(a, root, P, th * k))
    layers.append(rot_sample(a, arm, P, th))
for px, ok in layers:
    res[ok] = px[ok]
Image.fromarray(np.clip(res, 0, 255).astype(np.uint8)).save(out)
