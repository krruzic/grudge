import sys, numpy as np
from PIL import Image
sys.path.insert(0, "/home/krruzic/Projects/grudge/tools/fx-prompts")
CELL = 128
def keyed(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    bg = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3), a[:8, -8:].reshape(-1, 3)]), 0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 22) / 70, 0, 1)
    if bg[1] < 80:
        spill = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None)
        a[..., 0] -= spill * 0.9; a[..., 2] -= spill * 0.9
    else:
        a = np.where(alpha[..., None] > 0, (a - bg * (1 - alpha[..., None])) / np.maximum(alpha[..., None], 0.05), a)
    return np.clip(a, 0, 255), alpha
def fit(a, al, rect, m=3):
    x0, y0, x1, y1 = rect
    sub = al[y0:y1, x0:x1]
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
for name in ["wren", "friar"]:
    a, al = keyed(f"{name}_out.png")
    H, W = al.shape
    out = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    for i in range(16):
        cx, cy = i % 4, i // 4
        out.paste(fit(a, al, (cx * W // 4, cy * H // 4, (cx + 1) * W // 4, (cy + 1) * H // 4)), (cx * CELL, cy * CELL))
    out.save(f"/home/krruzic/Projects/grudge/assets/fx/{name}.png")
    open(f"/home/krruzic/Projects/grudge/assets/fx/{name}.json", "w").write('{"cols": 4, "rows": 4, "cell": 128}')
    bg = Image.new("RGBA", (512, 512), (40, 60, 40, 255)); bg.alpha_composite(out); bg.convert("RGB").save(f"{name}_chk.png")
