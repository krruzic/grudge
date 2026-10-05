#!/usr/bin/env python3
"""Warlord quake-fissure lava core per recolour costume: remap assets/fx/lava.png's luminance onto a 3-stop palette
(edge, mid, hot core) -> assets/fx/lava@<costume>.png (used by COSTUME_SKIN.<costume>.fisMat.core)."""
import os
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
PALETTES = {
    "bloodmoon": [(40, 0, 8), (170, 10, 30), (255, 90, 90)],  # dark blood, crimson, hot pink-red
    "gilded": [(70, 40, 0), (230, 160, 20), (255, 245, 170)],  # bronze, molten gold, white-gold
    "swamp": [(14, 30, 6), (90, 170, 30), (215, 255, 120)],  # bog, toxic green, glowing lime
}
src = np.asarray(Image.open(os.path.join(ROOT, "assets/fx/lava.png")).convert("RGBA")).astype(np.float32)
lum = (src[..., :3] @ np.array([0.3, 0.55, 0.15])) / 255
t = np.clip((lum - lum[src[..., 3] > 30].min()) / (np.percentile(lum[src[..., 3] > 30], 99) - lum[src[..., 3] > 30].min()), 0, 1)
for name, (a, b, c) in PALETTES.items():
    a, b, c = (np.array(x, np.float32) for x in (a, b, c))
    lo = t[..., None] < 0.5
    k = np.where(lo, t[..., None] * 2, (t[..., None] - 0.5) * 2)
    rgb = np.where(lo, a + (b - a) * k, b + (c - b) * k)
    out = np.concatenate([rgb, src[..., 3:]], -1)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA").save(os.path.join(ROOT, f"assets/fx/lava@{name}.png"))
    print(name)
