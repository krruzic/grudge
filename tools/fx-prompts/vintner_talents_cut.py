# Gristle's evolution icons: assets/generated/vintner_talents_raw.png (4 x 2 painted icons on black gutters)
# -> assets/ui/talents/<id>.png (96 px, like the other talent icons). The 8th cell (Thick Skin) is unused.
import os
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
IDS = ["stompin", "houserules", "batteringram", "thickhead", "ironhide", "trample", "vintageyear", None]
a = np.asarray(Image.open(os.path.join(ROOT, "assets/generated/vintner_talents_raw.png")).convert("RGB")).astype(np.float32)
lum = a.mean(-1)


def spans(prof, n):
    on = prof > 30
    out, s = [], None
    for i, v in enumerate(on):
        if v and s is None:
            s = i
        if not v and s is not None:
            if i - s > 100:
                out.append((s, i))
            s = None
    if s is not None:
        out.append((s, len(on)))
    assert len(out) == n, out
    return out


cols = spans(lum.mean(0), 4)
rows = spans(lum.mean(1), 2)
for k, tid in enumerate(IDS):
    if not tid:
        continue
    x0, x1 = cols[k % 4]
    y0, y1 = rows[k // 4]
    side = min(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    crop = Image.fromarray(a[cy - side // 2:cy + side // 2, cx - side // 2:cx + side // 2].astype(np.uint8))
    crop.resize((96, 96), Image.LANCZOS).convert("RGBA").save(os.path.join(ROOT, "assets/ui/talents", tid + ".png"))
    print(tid)
