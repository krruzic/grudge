"""Professor Hoot's 8 evolution icons from assets/generated/architect_talents_raw.png (4 x 2 framed squares on black,
the model added name captions under each, which are cut away): each framed square -> assets/ui/talents/<id>.png
(96 px, like the other painted talent icons). The 8th cell (OWL HOP, the dodge trick) is not a talent and is skipped."""
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
IDS = ["belfry", "collapse", "bastion", "frostfort", "longmeasure", "frostbite", "glacier", "owlhop"]
im = Image.open(os.path.join(ROOT, "assets", "generated", "architect_talents_raw.png")).convert("RGB")
a = np.asarray(im).astype(np.float32)
H, W = a.shape[:2]
lum = a.mean(-1)
for k, name in enumerate(IDS):
    if name == "owlhop":
        continue
    cx, cy = k % 4, k // 4
    x0, x1 = cx * W // 4, (cx + 1) * W // 4
    y0, y1 = cy * H // 2, (cy + 1) * H // 2
    sub = lum[y0:y1, x0:x1]
    cols = np.where((sub > 30).mean(0) > 0.55)[0]
    rows = np.where((sub > 30).mean(1) > 0.55)[0]
    # the framed square: the longest run of bright rows / columns
    def run(ix):
        best, cur, start, bs = 0, 0, 0, 0
        for i in range(len(ix)):
            if i and ix[i] == ix[i - 1] + 1:
                cur += 1
            else:
                cur, start = 1, ix[i]
            if cur > best:
                best, bs = cur, start
        return bs, bs + best
    c0, c1 = run(cols)
    r0, r1 = run(rows)
    side = min(c1 - c0, r1 - r0)
    crop = im.crop((x0 + c0, y0 + r0, x0 + c0 + side, y0 + r0 + side)).resize((96, 96), Image.LANCZOS)
    crop.save(os.path.join(ROOT, "assets", "ui", "talents", f"{name}.png"))
    print(name, c1 - c0, r1 - r0)
