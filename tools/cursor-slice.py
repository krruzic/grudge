import numpy as np
from PIL import Image


def blobs(mask, min_area):
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    out = []
    for y0 in range(0, h, 2):
        for x0 in range(0, w, 2):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            stack = [(y0, x0)]
            seen[y0, x0] = True
            ys, xs = [], []
            while stack:
                y, x = stack.pop()
                ys.append(y); xs.append(x)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(ys) >= min_area:
                out.append((min(ys), max(ys) + 1, min(xs), max(xs) + 1))
    return out


def cut(path, names, heights, rows):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    alpha = 1 - np.clip((np.minimum(r, b) - g - 60) / 60, 0, 1)
    spill = np.clip(np.minimum(r, b) - g, 0, None) * (1 - alpha) ** 0.5
    rgb = a.copy()
    rgb[..., 0] -= spill * 0.8
    rgb[..., 2] -= spill * 0.8
    small = alpha[::2, ::2] > 0.5
    boxes = [(y0 * 2, y1 * 2, x0 * 2, x1 * 2) for y0, y1, x0, x1 in blobs(small, 150)]
    boxes.sort(key=lambda s: (int((s[0] + s[1]) / 2 / (a.shape[0] / rows)), s[2]))
    for name, h, (y0, y1, x0, x1) in zip(names, heights, boxes):
        y0, x0 = max(0, y0 - 3), max(0, x0 - 3)
        y1, x1 = min(a.shape[0], y1 + 3), min(a.shape[1], x1 + 3)
        pre = np.dstack([np.clip(rgb[y0:y1, x0:x1], 0, 255) * alpha[y0:y1, x0:x1, None], alpha[y0:y1, x0:x1] * 255]).astype(np.uint8)
        im = Image.fromarray(pre, "RGBA").resize((round((x1 - x0) * h / (y1 - y0)), h), Image.LANCZOS)
        o = np.asarray(im).astype(np.float32)
        al = o[..., 3:4]
        o[..., :3] = np.where(al > 0, o[..., :3] * 255 / np.maximum(al, 1), 0)
        Image.fromarray(np.dstack([np.clip(o[..., :3], 0, 255), np.where(o[..., 3] > 110, 255, 0)]).astype(np.uint8), "RGBA").save(f"assets/ui/{name}.png")
        print(name, im.size)


cut("assets/generated/cursor/sheet.png", ["chip_1", "chip_2", "chip_3", "chip_4", "chip_cp", "x1", "x2", "x3", "tag_1", "tag_2", "tag_3", "tag_4"], [52, 52, 52, 52, 52, 1, 1, 1, 24, 24, 24, 24], 3)
cut("assets/generated/cursor/gloves.png", ["glove_point", "glove_grab", "glove_open"], [72, 60, 72], 1)
