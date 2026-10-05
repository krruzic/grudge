"""Cut Hollin's HQ 2x2 sheets (magenta) into assets/fx/hq/scribe.<key>[@costume].png.
Usage: python3 tools/fx-prompts/scribe_hq_cut.py   (base sheet scribe_hq.png: rune, ring, splat, hiveRing; costume
sheets scribe_hq_costume_a/b.png: the costume runes, manuscript rings and honey / red ink splats)."""
import os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SHEETS = {
    "scribe_hq.png": [("rune", 512, True), ("ring", 1024, False), ("splat", 512, False), ("hiveRing", 512, False)],
    "scribe_hq_costume_a.png": [("rune@queenbee", 512, False), ("rune@vigil", 512, False), ("rune@redink", 512, False), ("ring@queenbee", 1024, False)],  # noqa: E501
    "scribe_hq_costume_b.png": [("ring@vigil", 1024, False), ("ring@redink", 1024, False), ("splat@queenbee", 512, False), ("splat@redink", 512, False)],
}


def keyed(a):
    bg = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3)]), 0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    # Glows blend into the magenta: also key on magenta-ness (min(r, b) - g) so halos fade out instead of tinting.
    mag = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    alpha = np.clip((d - 26) / 80, 0, 1) * np.clip((190 - mag) / 130, 0, 1)
    al = alpha[..., None]
    a = np.where(al > 0, (a - bg * (1 - al)) / np.maximum(al, 0.05), a)
    spill = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1] - 30, 0, None) * (1 - alpha) ** 0.5
    a[..., 0] -= spill
    a[..., 2] -= spill
    return np.clip(a, 0, 255), alpha


def cut(src, KEYS):
    raw = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    H, W = raw.shape[:2]
    for q, (key, size, glow) in enumerate(KEYS):
        x0, y0 = (q % 2) * W // 2, (q // 2) * H // 2
        c = raw[y0:y0 + H // 2, x0:x0 + W // 2].copy()
        if glow:
            g = c[..., 1]
            al = np.clip((g - 30) / 120, 0, 1) * np.clip((np.sqrt(((c - [255, 0, 255]) ** 2).sum(-1)) - 26) / 80, 0, 1)
            c[..., 2] = np.minimum(c[..., 2], g * 0.8)
            c[..., 0] = np.maximum(c[..., 0], g)
            a = c
        else:
            a, al = keyed(c)
        ys, xs = np.where(al > 0.25)
        cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
        half = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 4
        box = (int(cx - half), int(cy - half), int(cx + half), int(cy + half))
        rgba = np.dstack([a, al * 255]).astype(np.float32)
        pre = rgba.copy()
        pre[..., :3] *= pre[..., 3:4] / 255
        im = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").crop(box).resize((size, size), Image.LANCZOS)
        sm = np.asarray(im).astype(np.float32)
        a2 = sm[..., 3:4]
        sm[..., :3] = np.where(a2 > 0, sm[..., :3] * 255 / np.maximum(a2, 1), 0)
        Image.fromarray(np.clip(sm, 0, 255).astype(np.uint8), "RGBA").save(os.path.join(ROOT, f"assets/fx/hq/scribe.{key}.png"), optimize=True)


for name, keys in SHEETS.items():
    cut(os.path.join(ROOT, "assets/generated/fx", name), keys)
