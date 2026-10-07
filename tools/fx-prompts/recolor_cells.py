"""Recolour cells of a costume's effect sheet from the champion's base sheet, keeping their shading: each cell's
luminance is mapped dark -> `colour` -> near white. For cells a costume sheet copied unchanged from the base that
should carry the costume's colour (found by the costume audit: the base sheet vs every @costume sheet, cell by cell).

    python3 tools/fx-prompts/recolor_cells.py <atlas> <costume> <cell>=<#rrggbb> [...]
    e.g. python3 tools/fx-prompts/recolor_cells.py harpooner deepglow spark=#c890ff glint=#c890ff
"""
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
atlas, costume, *pairs = sys.argv[1:]
src = open(os.path.join(ROOT, "src", "render", "fx", "atlas.ts")).read()
m = re.search(r'atlas\(\s*"%s",\s*\w+,\s*\[(.*?)\]' % atlas, src, re.S)
names = re.findall(r'"(\w+)"', m.group(1))
base = Image.open(os.path.join(ROOT, "assets", "fx", f"{atlas}.png")).convert("RGBA")
path = os.path.join(ROOT, "assets", "fx", f"{atlas}@{costume}.png")
out = Image.open(path).convert("RGBA")
W = base.width // 4
for pair in pairs:
    name, hexcol = pair.split("=")
    col = np.array([int(hexcol.lstrip("#")[k:k + 2], 16) for k in (0, 2, 4)], float)
    i = names.index(name)
    box = ((i % 4) * W, (i // 4) * W, (i % 4 + 1) * W, (i // 4 + 1) * W)
    a = np.asarray(base.crop(box)).astype(float)
    lum = a[..., :3] @ np.array([0.3, 0.55, 0.15]) / 255
    vis = a[..., 3] > 8
    lo, hi = np.percentile(lum[vis], 2), np.percentile(lum[vis], 99.5)
    t = np.clip((lum - lo) / max(hi - lo, 1e-6), 0, 1)[..., None]
    dark = col * 0.45
    rgb = np.where(t < 0.6, dark + (col - dark) * (t / 0.6), col + (np.array([255, 252, 240]) - col) * ((t - 0.6) / 0.4))
    cell = np.dstack([rgb, a[..., 3]]).clip(0, 255).astype(np.uint8)
    out.paste(Image.fromarray(cell, "RGBA"), box[:2])
    print(f"{atlas}@{costume} {name} -> {hexcol}")
out.save(path)
