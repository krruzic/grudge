"""Cut Hollin's 4x2 evolution icon sheet (square painted panels on black gutters) into assets/ui/talents/<id>.png (96 px)."""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
IDS = ["marginnote", "dogeared", "royalhive", "stingingprose", "ricochet", "indelible", "grandcodex"]
im = Image.open(os.path.join(ROOT, "assets/generated/scribe_talents_raw.png")).convert("RGB")
a = np.asarray(im).astype(np.float32).max(-1)


def runs(v):
    out, s = [], None
    for i, x in enumerate(list(v) + [False]):
        if x and s is None:
            s = i
        if not x and s is not None:
            if i - s > 80:
                out.append((s, i))
            s = None
    return out


cols = runs((a > 30).mean(0) > 0.3)
rows = runs((a > 30).mean(1) > 0.3)
assert len(cols) == 4 and len(rows) == 2, (cols, rows)
for k, name in enumerate(IDS):
    (x0, x1), (y0, y1) = cols[k % 4], rows[k // 4]
    im.crop((x0 + 3, y0 + 3, x1 - 3, y1 - 3)).resize((96, 96), Image.LANCZOS).save(os.path.join(ROOT, f"assets/ui/talents/{name}.png"))
print(cols, rows)
