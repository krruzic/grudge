"""Cut the costume runtime-props sheet into clean single-prop (or paired) fronts for Tripo.

python3 tools/costume/costume_runtime_props_crop.py <sheet.png> <out_dir>
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

CELLS = {
    "spike_colossus": [(12, 12, 676, 754)],
    "hexidol_shadowplay": [(700, 12, 1364, 754)],
    "tomb_shadowplay": [(1388, 12, 2052, 754)],
    "wallstone_suntotem": [(12, 782, 676, 1524)],
    "desert_suntotem": [(700, 782, 1364, 1524), (1388, 782, 2740, 1524)],
}
BG = np.array((200, 199, 203), np.float32)


def cut(a, box):
    x0, y0, x1, y1 = box
    q = a[y0:y1, x0:x1]
    h, w = q.shape[:2]
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
    edge = (X < 10) | (X > w - 10) | (Y < 10) | (Y > h - 10)
    xs, ys = X[edge] / w, Y[edge] / h
    M = np.stack([np.ones_like(xs), xs, ys, xs * xs, ys * ys, xs * ys], 1)
    coef = np.linalg.lstsq(M, q[edge], rcond=None)[0]
    bgm = np.stack([np.ones_like(X), X / w, Y / h, (X / w) ** 2, (Y / h) ** 2, X * Y / w / h], -1) @ coef
    fg = np.sqrt(((q - bgm) ** 2).sum(-1)) > 18
    m = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    fg = np.asarray(m) > 0
    ys_, xs_ = np.where(fg)
    yy0, yy1, xx0, xx1 = ys_.min(), ys_.max() + 1, xs_.min(), xs_.max() + 1
    al = np.asarray(Image.fromarray((fg[yy0:yy1, xx0:xx1] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32)[..., None] / 255
    return q[yy0:yy1, xx0:xx1], al


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    for name, boxes in CELLS.items():
        pieces = [cut(a, b) for b in boxes]
        gap = 160
        W = sum(p[0].shape[1] for p in pieces) + gap * (len(pieces) - 1)
        H = max(p[0].shape[0] for p in pieces)
        S = int(max(W, H) * 1.25)
        canvas = np.empty((S, S, 3), np.float32)
        canvas[:] = BG
        x = (S - W) // 2
        for crop, al in pieces:
            h, w = crop.shape[:2]
            y = (S - H) // 2 + (H - h)
            canvas[y:y + h, x:x + w] = canvas[y:y + h, x:x + w] * (1 - al) + crop * al
            x += w + gap
        im = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
        if S < 1024:
            im = im.resize((1024, 1024), Image.LANCZOS)
        im.save(os.path.join(out, name + "_front.png"))
        print(name, S)


if __name__ == "__main__":
    main()
