import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
H, W = a.shape[:2]
bg = np.median(a[:30].reshape(-1, 3), 0)


def sample(img, X, Y):
    h, w = img.shape[:2]
    x0 = np.clip(np.floor(X).astype(int), 0, w - 2)
    y0 = np.clip(np.floor(Y).astype(int), 0, h - 2)
    fx = np.clip(X - x0, 0, 1)[..., None]
    fy = np.clip(Y - y0, 0, 1)[..., None]
    r = img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy
    oob = (X < 0) | (X > w - 1) | (Y < 0) | (Y > h - 1)
    r[oob] = bg
    return r


def cut_rows(img, y0, y1):
    return np.concatenate([img[:y0], img[y1:]], 0)


def bulge(img, cx, cy, rx, ry, k):
    h, w = img.shape[:2]
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = (X - cx) / rx, (Y - cy) / ry
    d = np.sqrt(dx * dx + dy * dy)
    f = np.where(d < 1, np.power(np.maximum(d, 1e-4), k), 1.0)
    return sample(img, cx + dx * f * rx, cy + dy * f * ry)


def pad(img, l, r, t, b):
    h, w = img.shape[:2]
    o = np.empty((h + t + b, w + l + r, 3), np.float32)
    o[:] = bg
    o[t:t + h, l:l + w] = img
    return o


s = W / 470
img = pad(a, int(300 * s), int(300 * s), int(80 * s), 0)
ox, oy = 300 * s, 80 * s
img = cut_rows(img, int(oy + 470 * s), int(oy + 540 * s))
img = bulge(img, ox + 235 * s, oy + 300 * s, 330 * s, 240 * s, 0.55)
img = bulge(img, ox + 235 * s, oy + 90 * s, 120 * s, 120 * s, 0.6)
h, w = img.shape[:2]
fg = np.sqrt(((img - bg) ** 2).sum(-1)) > 30
ys, xs = np.where(fg)
y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
side = int(max(y1 - y0, x1 - x0) * 1.1)
o = np.empty((side, side, 3), np.float32)
o[:] = bg
cy, cx = (side - (y1 - y0)) // 2, (side - (x1 - x0)) // 2
o[cy:cy + y1 - y0, cx:cx + x1 - x0] = img[y0:y1, x0:x1]
Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).resize((1400, 1400), Image.LANCZOS).save(out)
