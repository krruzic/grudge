"""Hollin's Beekeeper effect sheet (assets/fx/scribe@beekeeper.png) kept the base sheet's ink cells - the ink glob,
drop, splat, brush stroke and ink cloud - so her Ink Bolt, its blot and the dust at her feet came out black - and
her HQ splat painting (assets/fx/hq/scribe.splat@beekeeper.png, the full-charge blot) was the ink one too. This
recolours those five cells from the base sheet and the HQ splat from the base painting: the ink becomes glossy amber honey (its own shading mapped onto a
dark-amber -> gold -> pale-highlight ramp), the ink cloud becomes pale golden smoker smoke. Alpha is kept.

    python3 tools/fx-prompts/scribe_beekeeper_honey.py
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
BASE = os.path.join(ROOT, "assets", "fx", "scribe.png")
OUT = os.path.join(ROOT, "assets", "fx", "scribe@beekeeper.png")
# Cell order of the scribe atlas (src/render/fx/atlas.ts SCRIBE).
CELLS = ["ink", "drop", "splat", "stroke", "bee", "bees", "comb", "hiveRing", "page", "pages", "quill", "rune",
         "sigil", "star", "inkCloud", "ring"]
HONEY = [(0.0, (70, 34, 4)), (0.35, (170, 92, 10)), (0.65, (236, 162, 32)), (0.85, (255, 214, 96)), (1.0, (255, 246, 210))]
# Splats are a flat dark tone in the middle, so they get a brighter floor (a pool of runny honey, not toffee).
HONEY_POOL = [(0.0, (150, 78, 8)), (0.4, (214, 132, 24)), (0.75, (246, 192, 64)), (1.0, (255, 242, 196))]
SMOKE = [(0.0, (120, 98, 64)), (0.5, (196, 176, 136)), (1.0, (250, 240, 214))]


def ramp(t, stops):
    out = np.zeros(t.shape + (3,))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        m = (t >= a) & (t <= b)
        k = ((t - a) / max(b - a, 1e-6))[m][:, None]
        out[m] = np.array(ca) * (1 - k) + np.array(cb) * k
    return out


def recolour(cell, stops, gamma):
    a = np.asarray(cell).astype(float)
    rgb, alpha = a[..., :3], a[..., 3]
    lum = rgb @ np.array([0.3, 0.55, 0.15]) / 255
    vis = alpha > 8
    lo, hi = np.percentile(lum[vis], 2), np.percentile(lum[vis], 99.5)
    t = np.clip((lum - lo) / max(hi - lo, 1e-6), 0, 1) ** gamma
    out = np.dstack([ramp(t, stops), alpha])
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGBA")


base = Image.open(BASE).convert("RGBA")
out = Image.open(OUT).convert("RGBA")
W = base.width // 4
for name, stops, gamma in (("ink", HONEY, 0.8), ("drop", HONEY, 0.8), ("splat", HONEY_POOL, 0.6), ("stroke", HONEY, 0.75),
                           ("inkCloud", SMOKE, 0.7)):
    i = CELLS.index(name)
    box = ((i % 4) * W, (i // 4) * W, (i % 4 + 1) * W, (i // 4 + 1) * W)
    out.paste(recolour(base.crop(box), stops, gamma), box[:2])
out.save(OUT)
print("recoloured", OUT)
HQ = os.path.join(ROOT, "assets", "fx", "hq")
recolour(Image.open(os.path.join(HQ, "scribe.splat.png")).convert("RGBA"), HONEY_POOL, 0.6).save(
    os.path.join(HQ, "scribe.splat@beekeeper.png"))
print("recoloured HQ splat")
