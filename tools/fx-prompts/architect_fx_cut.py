"""Professor Hoot's FX: the 4x4 atlas assets/fx/architect.png (128 px cells) from assets/generated/fx/architect.png,
and the HQ paintings assets/fx/hq/architect.<key>.png from the 2x2 sheet assets/generated/fx/hq_architect/sheet.png.
Magenta is keyed by its (min(r,b) - g) excess so pale ice/white sprites keep their soft edges."""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
GEN = os.path.join(ROOT, "assets", "generated", "fx")
OUT = os.path.join(ROOT, "assets", "fx")
CELL = 128


def key(a):
    # The background is "magenta" but not always pure #FF00FF: measure it in the corners.
    bg = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3), a[:8, -8:].reshape(-1, 3)]), 0)
    kb = max(60.0, min(bg[0], bg[2]) - bg[1])
    k = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    alpha = np.clip(1 - (k - kb * 0.17) / (kb * 0.6), 0, 1)
    al = alpha[..., None]
    rgb = np.where(al > 0.02, (a - bg * (1 - al)) / np.maximum(al, 0.05), 0)
    rgb = np.clip(rgb, 0, 255)
    sp = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0, None)
    rgb[..., 0] -= sp
    rgb[..., 2] -= sp
    return rgb, alpha


def feather(al, f=0.06):
    """Fade alpha to zero toward the edges of a sheet cell (paintings that run into the cell border)."""
    h, w = al.shape
    ry = np.clip(np.minimum(np.arange(h), h - 1 - np.arange(h)) / (h * f), 0, 1)
    rx = np.clip(np.minimum(np.arange(w), w - 1 - np.arange(w)) / (w * f), 0, 1)
    return al * np.minimum(ry[:, None], rx[None, :])


def fit(rgb, al, size, m=4, square=True):
    ys, xs = np.where(al > 0.25)
    y0, y1 = max(0, ys.min() - m), min(al.shape[0], ys.max() + m + 1)
    x0, x1 = max(0, xs.min() - m), min(al.shape[1], xs.max() + m + 1)
    side = max(y1 - y0, x1 - x0)
    sq = np.zeros((side, side, 4), np.float32)
    oy, ox = (side - (y1 - y0)) // 2, (side - (x1 - x0)) // 2
    sq[oy:oy + y1 - y0, ox:ox + x1 - x0, :3] = rgb[y0:y1, x0:x1]
    sq[oy:oy + y1 - y0, ox:ox + x1 - x0, 3] = al[y0:y1, x0:x1] * 255
    pre = sq.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    sm = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)).astype(np.float32)
    a2 = sm[..., 3:4]
    sm[..., :3] = np.where(a2 > 0, sm[..., :3] * 255 / np.maximum(a2, 1), 0)
    return Image.fromarray(np.clip(sm, 0, 255).astype(np.uint8), "RGBA")


def cut_atlas(name):
    src = np.asarray(Image.open(os.path.join(GEN, f"{name}.png")).convert("RGB")).astype(np.float32)
    rgb, al = key(src)
    H, W = al.shape
    atlas = Image.new("RGBA", (CELL * 4, CELL * 4), (0, 0, 0, 0))
    for i in range(16):
        cx, cy = i % 4, i // 4
        y0, y1, x0, x1 = cy * H // 4, (cy + 1) * H // 4, cx * W // 4, (cx + 1) * W // 4
        atlas.paste(fit(rgb[y0:y1, x0:x1], al[y0:y1, x0:x1], CELL), (cx * CELL, cy * CELL))
    atlas.save(os.path.join(OUT, f"{name}.png"))
    return atlas


# Base atlas plus one themed sheet per costume (costume_fx_architect_<costume>_prompt.txt): same cell meanings.
atlas = cut_atlas("architect")
for c in ["snowy", "temple", "clockwork"]:
    if os.path.exists(os.path.join(GEN, f"architect@{c}.png")):
        v = cut_atlas(f"architect@{c}")
        chk = Image.new("RGBA", v.size, (40, 50, 70, 255))
        chk.alpha_composite(v)
        chk.convert("RGB").save(f"/tmp/opencode/architect/atlas_chk_{c}.png")
with open(os.path.join(OUT, "architect.json"), "w") as f:
    json.dump({"cols": 4, "rows": 4, "cell": CELL}, f)

# HQ ids follow the atlas keys they override: the dome painting is the ice-crack disc (only drawn as the dome),
# the avalanche burst the snow spray, the construction circle the drafting circle. sheet@<costume>.png -> @<costume>.
for suffix in ["", "@snowy", "@temple", "@clockwork"]:
    path = os.path.join(GEN, "hq_architect", f"sheet{suffix}.png")
    if not os.path.exists(path):
        continue
    hq = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    rgb, al = key(hq)
    H, W = al.shape
    for q, name in enumerate(["iceCrack", "frostRing", "spray", "drafting"]):
        y0, y1, x0, x1 = (q // 2) * H // 2, (q // 2 + 1) * H // 2, (q % 2) * W // 2, (q % 2 + 1) * W // 2
        fit(rgb[y0:y1, x0:x1], feather(al[y0:y1, x0:x1]), 512, m=2).save(os.path.join(OUT, "hq", f"architect.{name}{suffix}.png"))
chk = Image.new("RGBA", atlas.size, (40, 50, 70, 255))
chk.alpha_composite(atlas)
chk.convert("RGB").save("/tmp/opencode/architect/atlas_chk.png")
print("ok")
