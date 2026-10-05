"""Cut a painted 3x2 texture sheet (tools/gen-map-art.mjs sheet) into seamless map palette textures.

    python3 tools/slice-map-tex.py <sheet.png> <palette> name0 name1 name2 name3 name4 name5

Cells are numbered row by row; a name of "-" skips that cell. Each cell is cropped inside its gutters, made
seamless with phototex's seam-cut wrap and saved as assets/textures/<palette>_<name>.png (512 px).
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from phototex import flatten, wrap_tile  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE = 512
WRAP = 0.16


def main() -> None:
    src, palette, *names = sys.argv[1:]
    sheet = np.asarray(Image.open(src).convert("RGB"), np.float32) / 255
    h, w = sheet.shape[:2]
    cw, ch = w / 3, h / 2
    inset = int(min(cw, ch) * 0.03)
    for k, name in enumerate(names):
        if name == "-":
            continue
        r, c = divmod(k, 3)
        x0, y0 = int(c * cw) + inset, int(r * ch) + inset
        s = int(min(cw, ch)) - 2 * inset
        a = sheet[y0:y0 + s, x0:x0 + s]
        n = int(SIZE * WRAP)
        img = Image.fromarray((a * 255).astype(np.uint8)).resize((SIZE + n, SIZE + n), Image.LANCZOS)
        a = np.asarray(img, np.float32) / 255
        a = flatten(a, a.shape[0] // 4)
        a = wrap_tile(a, n)
        out = os.path.join(ROOT, "assets", "textures", f"{palette}_{name}.png")
        Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out)
        print(name, "->", os.path.relpath(out, ROOT), a.shape)


if __name__ == "__main__":
    main()
