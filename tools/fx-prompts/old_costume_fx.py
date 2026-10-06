#!/usr/bin/env python3
"""Themed FX for the original champions' recolour costumes (tools/fx-prompts/old_costume_themes.json).
  inputs: base atlas on magenta (2048 px, 4x4) and the base HQ paintings packed 2x2 per hero -> /tmp/opencode/oldfx/in
  cut:    /tmp/opencode/oldfx/out/{atlas,hq}_<hero>_<costume>.png -> assets/fx/<atlas>@<costume>.png (4x4 x 128 px,
          costume_fx_cut.fit) and assets/fx/hq/<id>@<costume>.png at the base painting's size."""
import json, os, sys
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
W = "/tmp/opencode/oldfx/"
ATLAS = {"marksman": "wren"}
# HQ paintings each hero's costume needs (ids with a base painting), quadrant order.
HQ = {
    "warlord": ["warlord.impact", "warlord.rage"],
    "raider": ["raider.smoke", "raider.vortex"],
    "summoner": ["summoner.burst", "summoner.circle", "summoner.hex"],
    "warden": ["warden.natureBurst", "warden.rune", "warden.wisp", "zone.bramble"],
    "marksman": ["wren.arrowRing", "wren.spiral"],
    "friar": ["friar.blast", "friar.hopRing", "friar.puddle", "friar.splash"],
    "scribe": ["scribe.hiveRing", "scribe.ring", "scribe.rune", "scribe.splat"],
}
MAG = (255, 0, 255)
GRN = (0, 255, 0)

def on_magenta(im, size, col=MAG):
    im = im.convert("RGBA").resize((size, size), Image.LANCZOS)
    bg = Image.new("RGBA", (size, size), col + (255,))
    bg.alpha_composite(im)
    return bg.convert("RGB")

def inputs():
    for h in {k.split("/")[0] for k in json.load(open(os.path.join(HERE, "old_costume_themes.json")))}:
        a = ATLAS.get(h, h)
        on_magenta(Image.open(os.path.join(ROOT, "assets/fx", f"{a}.png")), 2048).save(W + f"in/atlas_{h}.png")
        if h in HQ:
            # Two backgrounds: green screen by default (warm glows painted into magenta come back pink), magenta for
            # green-themed costumes (old_costume_fx.mjs picks).
            for col, tag in ((MAG, "mag"), (GRN, "grn")):
                g = Image.new("RGB", (2048, 2048), col)
                for q, hid in enumerate(HQ[h]):
                    p = on_magenta(Image.open(os.path.join(ROOT, "assets/fx/hq", f"{hid}.png")), 920, col)
                    g.paste(p, ((q % 2) * 1024 + 52, (q // 2) * 1024 + 52))
                g.save(W + f"in/hq_{h}_{tag}.png")
        print(h)

def key(a):
    """Magenta- or green-screen key (picked from the corners) -> (rgb, alpha) with spill removed."""
    a = a.astype(np.float32)
    corner = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)]), 0)
    green = corner[1] > corner[0] and corner[1] > corner[2]
    bg = np.array(GRN if green else MAG, np.float32)
    k = a[..., 1] - np.maximum(a[..., 0], a[..., 2]) if green else np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    al = np.clip(((1 - k / 255) - 0.08) / 0.85, 0, 1)
    d = np.sqrt(((a - corner) ** 2).sum(-1))
    al = np.minimum(al, np.clip((d - 18) / 40, 0, 1))
    rgb = np.where(al[..., None] > 0, (a - bg * (1 - al[..., None])) / np.maximum(al[..., None], 0.05), a)
    rgb = np.clip(rgb, 0, 255)
    # Glows painted into the screen keep its cast: pull the screen channel(s) back, fade strongly tinted soft edges.
    soft = 1 - al
    if green:
        # Standard despill: on a green screen no pixel keeps more green than its red/blue allow (green themes use
        # the magenta screen instead).
        spill = np.clip(rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2]), 0, None)
        rgb[..., 1] -= spill
    else:
        spill = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1] - 12, 0, None)
        rgb[..., 0] -= spill * np.clip(0.35 + soft, 0, 1)
        rgb[..., 2] -= spill * np.clip(0.35 + soft, 0, 1)
    al = al * np.clip(1 - spill / 255 * 4 * soft, 0, 1)
    # Soft glow edges were painted mixed with the screen, so their colour can't be unmixed: take it from the nearby
    # opaque interior instead (normalised blur of the solid pixels), keeping the soft alpha.
    from PIL import ImageFilter
    solid = (al > 0.95).astype(np.float32)
    def blur(x, r):
        # PIL can't blur float images: blur a 16-bit-range copy through 8-bit planes (hi/lo) is overkill here, so
        # downsample, box-blur in numpy (separable cumulative sums) and upsample.
        k = max(1, int(r))
        s = 4
        small = np.asarray(Image.fromarray(x.astype(np.float32), "F").resize((x.shape[1] // s, x.shape[0] // s), Image.BILINEAR))
        kk = max(1, k // s)
        for ax in (0, 1):
            c = np.cumsum(np.pad(small, [(kk + 1, kk) if a == ax else (0, 0) for a in (0, 1)], mode="edge"), axis=ax)
            small = (np.take(c, range(2 * kk + 1, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - 2 * kk - 1), axis=ax)) / (2 * kk + 1)
        return np.asarray(Image.fromarray(small.astype(np.float32), "F").resize((x.shape[1], x.shape[0]), Image.BILINEAR))
    fill = np.zeros_like(rgb)
    for r in (6, 24, 64):
        m = blur(solid, r)
        f = np.stack([blur(rgb[..., c] * solid, r) for c in range(3)], -1) / np.maximum(m, 1e-4)[..., None]
        fill = np.where((m > 0.02)[..., None] & (fill.sum(-1) == 0)[..., None], f, fill)
    w = np.clip((al - 0.82) / 0.16, 0, 1)[..., None]
    rgb = np.where(fill.sum(-1, keepdims=True) > 0, rgb * w + fill * (1 - w), rgb)
    al = np.where(al < 0.97, al**1.6, al)
    return np.clip(rgb, 0, 255), al

def cut(only):
    sys.path.insert(0, HERE)
    src = open(os.path.join(HERE, "costume_fx_cut.py")).read().split("for name in sys.argv")[0]
    g = {}
    exec(src, g)
    for f in sorted(os.listdir(W + "out")):
        kind, h, c = f[:-4].split("_", 2)
        if only and f"{h}/{c}" not in only and h not in only:
            continue
        if kind == "atlas":
            a, al = g["keyed"](W + "out/" + f)
            H, Wd = al.shape
            out = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
            for i in range(16):
                cx, cy = i % 4, i // 4
                out.paste(g["fit"](a, al, (cx * Wd // 4, cy * H // 4, (cx + 1) * Wd // 4, (cy + 1) * H // 4)), (cx * 128, cy * 128))
            suf = "" if c == "base" else f"@{c}"
            out.save(os.path.join(ROOT, "assets/fx", f"{ATLAS.get(h, h)}{suf}.png"), optimize=True)
        else:
            rgb, al = key(np.asarray(Image.open(W + "out/" + f).convert("RGB").resize((2048, 2048), Image.LANCZOS)))
            for q, hid in enumerate(HQ[h]):
                x0, y0 = (q % 2) * 1024, (q // 2) * 1024
                sub = al[y0 + 6:y0 + 1018, x0 + 6:x0 + 1018]
                ys, xs = np.where(sub > 0.3)
                if not len(xs):
                    print("EMPTY", f, hid); continue
                cx, cy = (xs.min() + xs.max()) / 2 + 6, (ys.min() + ys.max()) / 2 + 6
                half = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 4
                side = int(np.ceil(half * 2))
                sq = np.zeros((side, side, 4), np.float32)
                bx0, by0 = int(round(cx - half)), int(round(cy - half))
                for yy in range(side):
                    sy = by0 + yy
                    if 0 <= sy < 1024:
                        lo, hi = max(0, -bx0), min(side, 1024 - bx0)
                        sq[yy, lo:hi, :3] = rgb[y0 + sy, x0 + bx0 + lo:x0 + bx0 + hi]
                        sq[yy, lo:hi, 3] = al[y0 + sy, x0 + bx0 + lo:x0 + bx0 + hi] * 255
                base = os.path.join(ROOT, "assets/fx/hq", f"{hid}.png")
                size = Image.open(base if os.path.exists(base) else base.replace(".png", "@beekeeper.png")).size[0]
                pre = sq.copy(); pre[..., :3] *= pre[..., 3:4] / 255
                sm = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)).astype(np.float32)
                a2 = sm[..., 3:4]
                sm[..., :3] = np.where(a2 > 0, sm[..., :3] * 255 / np.maximum(a2, 1), 0)
                suf = "" if c == "base" else f"@{c}"
                Image.fromarray(np.clip(sm, 0, 255).astype(np.uint8), "RGBA").save(os.path.join(ROOT, "assets/fx/hq", f"{hid}{suf}.png"), optimize=True)
        print("cut", f)

if __name__ == "__main__":
    inputs() if sys.argv[1] == "inputs" else cut(sys.argv[2:])
