"""Bake Brindle's costume repaints (2x2 sheets: front, left, back, right) onto his body texture.
Run from anywhere after tools/costume/exp.py made /tmp/opencode/costume/harpooner_body_{mesh.npz,orig.png}:
  python3 tools/costume/harpooner_bake.py
SKIP lists views Nano Banana got wrong (it painted the front again in the back cell for tideadmiral and bogtoad); texels only
those views saw take colours learned from the rest (bake2's original->new colour lookup)."""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "bake2.py")).read().split("if __name__")[0]
SRC = SRC.replace("w=np.clip(-(nrm@f),0,1)**3", "w=np.clip(-(nrm@f),0,1)**3*(0.0 if k in SKIP else 1.0)")
SKIP = set()
exec(SRC)
from PIL import Image  # noqa: E402

C = "/tmp/opencode/costume/"
F = "/tmp/opencode/harpooner/cos/"
G = os.path.join(HERE, "..", "..", "assets", "costumes", "harpooner")
VIEWS_WRONG = {"tideadmiral": {2}, "bogtoad": {2}, "deepglow": set()}
for cid in sys.argv[1:] or ["tideadmiral", "bogtoad", "deepglow"]:
    SKIP.clear()
    SKIP.update(VIEWS_WRONG.get(cid, set()))
    os.makedirs(os.path.join(G, cid), exist_ok=True)
    b = Image.open(F + f"cos_{cid}_body.png").convert("RGB").resize((2048, 2048), Image.LANCZOS)
    tl = [b.crop(((i % 2) * 1024, (i // 2) * 1024, (i % 2 + 1) * 1024, (i // 2 + 1) * 1024)) for i in range(4)]
    bake(C + "harpooner_body_mesh.npz", C + "harpooner_body_orig.png", tl, F + f"bake_{cid}_body.png")
    Image.open(F + f"bake_{cid}_body.png").convert("RGB").save(os.path.join(G, cid, "harpooner.jpg"), quality=90)
    _ = np
