from PIL import Image
import numpy as np, glob, os
os.makedirs("assets/ui/talents", exist_ok=True)
for p in sorted(glob.glob("assets/generated/talents/*_raw.png")):
    n = os.path.basename(p)[:-8]
    a = np.asarray(Image.open(p).convert("RGB")).astype(np.int32)
    c = np.concatenate([a[:10, :10].reshape(-1, 3), a[:10, -10:].reshape(-1, 3), a[-10:, :10].reshape(-1, 3), a[-10:, -10:].reshape(-1, 3)])
    bg = np.median(c, 0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 45) / 45, 0, 1)
    m = alpha > 0.5
    ys, xs = np.where(m)
    pad = 12
    y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad)
    side = max(y1 - y0, x1 - x0)
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    rgb = a.copy()
    rgb[~m] = [30, 20, 14]
    img = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")
    img = img.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)).resize((96, 96), Image.LANCZOS)
    arr = np.asarray(img).astype(np.int32)
    q = (arr[..., :3] >> 3) << 3
    al = np.where(arr[..., 3] > 110, 255, 0)
    Image.fromarray(np.dstack([q, al]).astype(np.uint8), "RGBA").save(f"assets/ui/talents/{n}.png")
print(len(glob.glob("assets/ui/talents/*.png")))
