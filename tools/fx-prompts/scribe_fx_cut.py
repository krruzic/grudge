"""Cut Hollin's FX sheets (4x4 on magenta) into 512 px atlases: python3 tools/fx-prompts/scribe_fx_cut.py <raw.png> <out.png>
Same keying and per-cell fit as newhero_fx_cut.py. Default: assets/generated/fx/scribe.png -> assets/fx/scribe.png. `--costumes [names]` cuts the costume sheets
assets/generated/fx/scribe@<costume>.png -> assets/fx/scribe@<costume>.png."""
import os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
CELL = 128


def keyed(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    bg = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3), a[:8, -8:].reshape(-1, 3)]), 0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 22) / 70, 0, 1)
    if bg[1] < 80:
        spill = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None)
        a[..., 0] -= spill * 0.9
        a[..., 2] -= spill * 0.9
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
    pre = sq.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    sm = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((CELL, CELL), Image.LANCZOS)).astype(np.float32)
    al2 = sm[..., 3:4]
    sm[..., :3] = np.where(al2 > 0, sm[..., :3] * 255 / np.maximum(al2, 1), 0)
    return Image.fromarray(np.clip(sm, 0, 255).astype(np.uint8), "RGBA")


GLOW = (11, 12, 13)


def deglow(a, al, rect):
    """Glowing cells pick up a magenta halo: alpha from the green channel there, and blue clamped under green."""
    x0, y0, x1, y1 = rect
    c = a[y0:y1, x0:x1]
    g = c[..., 1]
    al[y0:y1, x0:x1] = np.minimum(al[y0:y1, x0:x1], np.clip((g - 20) / 110, 0, 1))
    c[..., 2] = np.minimum(c[..., 2], g * 0.85)


def cut(src, dst, glow=GLOW):
    a, al = keyed(src)
    H, W = al.shape
    for i in glow:
        cx, cy = i % 4, i // 4
        deglow(a, al, (cx * W // 4, cy * H // 4, (cx + 1) * W // 4, (cy + 1) * H // 4))
    out = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    for i in range(16):
        cx, cy = i % 4, i // 4
        out.paste(fit(a, al, (cx * W // 4, cy * H // 4, (cx + 1) * W // 4, (cy + 1) * H // 4)), (cx * CELL, cy * CELL))
    out.save(dst)





def cut_costumes(names):
    """Costume sheets (green background, prompts costume_fx_scribe_<costume>_prompt.txt) with costume_fx_cut's keyer."""
    import sys as _s
    argv, _s.argv = _s.argv, ["x"]
    ns = {}
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "costume_fx_cut.py")).read(), ns)
    _s.argv = argv
    for c in names:
        a, al = ns["keyed"](os.path.join(ROOT, f"assets/generated/fx/scribe@{c}.png"))
        H, W = al.shape
        out = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        for i in range(16):
            cx, cy = i % 4, i // 4
            out.paste(ns["fit"](a, al, (cx * W // 4, cy * H // 4, (cx + 1) * W // 4, (cy + 1) * H // 4)), (cx * CELL, cy * CELL))
        out.save(os.path.join(ROOT, f"assets/fx/scribe@{c}.png"))


if __name__ == "__main__":
    if sys.argv[1:2] == ["--costumes"]:
        cut_costumes(sys.argv[2:] or ["queenbee", "vigil", "redink"])
        sys.exit(0)
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "assets/generated/fx/scribe.png")
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "assets/fx/scribe.png")
    cut(src, dst)
    if dst.endswith("scribe.png"):
        open(dst[:-4] + ".json", "w").write('{"cols": 4, "rows": 4, "cell": 128}')
