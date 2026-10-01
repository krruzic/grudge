from PIL import Image
import numpy as np, glob, os
os.makedirs("assets/ui/talents", exist_ok=True)
for p in sorted(glob.glob("assets/generated/talents/*_raw.png")):
    n = os.path.basename(p)[:-8]
    a = np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = np.median(np.concatenate([a[:6, :6].reshape(-1, 3), a[-6:, -6:].reshape(-1, 3), a[:6, -6:].reshape(-1, 3), a[-6:, :6].reshape(-1, 3)]), 0)
    dist = np.sqrt(((a - bg) ** 2).sum(-1))
    key = np.clip(1 - (dist - 45) / 60, 0, 1)
    alpha = 1 - key
    H, W = alpha.shape
    solid = alpha > 0.5
    for _ in range(2):
        for ax in (0, 1):
            frac = solid.mean(axis=1 - ax)
            size = frac.shape[0]
            lines = [i for i in np.where(frac > 0.6)[0] if i < 12 or i >= size - 12]
            for i in lines:
                if ax == 0:
                    alpha[i, :] = 0
                else:
                    alpha[:, i] = 0
            solid = alpha > 0.5
    spill = np.clip(np.minimum(r, b) - g, 0, None) * (1 - alpha) ** 0.5
    a[..., 0] -= spill * 0.8
    a[..., 2] -= spill * 0.8
    m = alpha > 0.5
    ys, xs = np.where(m)
    pad = 3
    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
    side = max(y1 - y0, x1 - x0)
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    rgba = np.dstack([np.clip(a, 0, 255), alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img.crop((x0, y0, x1, y1)), ((side - (x1 - x0)) // 2, (side - (y1 - y0)) // 2))
    pre = np.asarray(canvas).astype(np.float32)
    pre[..., :3] *= pre[..., 3:4] / 255
    small = np.asarray(Image.fromarray(pre.astype(np.uint8), "RGBA").resize((96, 96), Image.LANCZOS)).astype(np.float32)
    al = small[..., 3:4]
    small[..., :3] = np.where(al > 0, small[..., :3] * 255 / np.maximum(al, 1), 0)
    q = (np.clip(small[..., :3], 0, 255).astype(np.int32) >> 3) << 3
    alq = np.where(small[..., 3] > 100, 255, 0)
    Image.fromarray(np.dstack([q, alq]).astype(np.uint8), "RGBA").save(f"assets/ui/talents/{n}.png")
print(len(glob.glob("assets/ui/talents/*.png")))
