# Gristle's HQ ground paintings (assets/generated/fx/hq_vintner[@costume].png, 2x2 on green) -> assets/fx/hq/vintner.<key>.png
import os, sys
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
# keyed / quad / premul_resize from the shared HQ cutter (the rest of that file is a one-off script)
exec(open(os.path.join(HERE, "hq_decals_cut.py")).read().split("def save")[0])
ROOT = os.path.join(HERE, "..", "..")
KEYS = [("puddle", 512), ("crater", 1024), ("splat", 1024), ("swap", 512)]
for c in sys.argv[1:] or [""]:
    suf = "@" + c if c else ""
    a, al = keyed(os.path.join(ROOT, "assets/generated/fx", f"hq_vintner{suf}.png"))
    for q, (k, size) in enumerate(KEYS):
        sq = quad(a, al, q)
        # The painter tinted the dust halo green from the key colour: fade green-dominant pixels, clamp the rest.
        g = sq[..., 1] - np.maximum(sq[..., 0], sq[..., 2])
        sq[..., 3] *= np.clip(1 - g / 40, 0, 1)
        sq[..., 1] = np.minimum(sq[..., 1], np.maximum(sq[..., 0], sq[..., 2]))
        im = Image.fromarray(premul_resize(sq, size).astype(np.uint8), "RGBA")
        im.save(os.path.join(ROOT, "assets/fx/hq", f"vintner.{k}{suf}.png"), optimize=True)
        print("saved", k + suf, im.size)
