from PIL import Image
import numpy as np
src = "assets/generated/loading/"
a = np.asarray(Image.open(src + "logo_raw.png").convert("RGB")).astype(np.int32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
alpha = np.clip((90 - np.minimum(r - g, b - g)) / 50, 0, 1)
m = alpha > 0.5
rows = np.where(m.sum(1) >= 6)[0]; cols = np.where(m.sum(0) >= 6)[0]
y0, y1 = max(0, rows.min() - 4), min(a.shape[0], rows.max() + 5)
x0, x1 = max(0, cols.min() - 4), min(a.shape[1], cols.max() + 5)
rgb = a.copy(); rgb[~m] = [40, 24, 16]
img = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8)[y0:y1, x0:x1], "RGBA")
H = 96; img = img.resize((round(img.width * H / img.height), H), Image.LANCZOS)
q = np.asarray(img.convert("RGB").quantize(32, method=Image.Quantize.MEDIANCUT).convert("RGB"))
al = np.where(np.asarray(img)[..., 3] > 100, 255, 0).astype(np.uint8)
Image.fromarray(np.dstack([q, al]), "RGBA").save("public/loading/logo.png", optimize=True)
art = np.asarray(Image.open(src + "art_raw.png").convert("RGB").resize((480, 270), Image.LANCZOS)).astype(np.int32)
bayer = np.array([[0, 2], [3, 1]]) * 2 - 3
d = np.tile(bayer, (135, 240))[..., None]
art = np.clip(((art + d) >> 3) << 3 | ((art + d) >> 5), 0, 255).astype(np.uint8)
Image.fromarray(art, "RGB").save("public/loading/art.png", optimize=True)
print("ok")

nw = Image.open("assets/generated/names/m_loading_raw.png").convert("RGB")
a = np.asarray(nw).astype(np.int32)
c = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
d = np.sqrt(((a - np.median(c, 0)) ** 2).sum(-1))
k = np.minimum(a[..., 0] - a[..., 1], a[..., 2] - a[..., 1])
al = np.clip((d - 40) / 50, 0, 1) * np.clip((70 - k) / 40, 0, 1)
m = al > 0.5
rows = np.where(m.sum(1) >= 6)[0]; cols = np.where(m.sum(0) >= 6)[0]
im = Image.fromarray(np.dstack([a, al * 255]).astype(np.uint8)[rows.min():rows.max() + 1, cols.min():cols.max() + 1], "RGBA")
im = im.resize((round(im.width * 72 / im.height), 72), Image.LANCZOS)
q = np.asarray(im.convert("RGB").quantize(32, method=Image.Quantize.MEDIANCUT).convert("RGB"))
Image.fromarray(np.dstack([q, np.where(np.asarray(im)[..., 3] > 100, 255, 0).astype(np.uint8)]), "RGBA").save("public/loading/now.png", optimize=True)
Image.open("assets/textures/gold.png").convert("RGB").save("public/loading/gold.png", optimize=True)
