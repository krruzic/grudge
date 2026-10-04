# Builds the 6x game font atlas (assets/fonts/gameFont.png) from the 1x bake (gameFont_lo.png + gameFont.json,
# see tools/font-bake.py) in two steps:
#   python3 tools/font-hires.py prep  -> assets/generated/font/lowres_sheet.png (every glyph upscaled, one per cell)
#   (repaint that sheet at high resolution: tools/font-upscale.mjs -> assets/generated/font/hires_sheet.png)
#   python3 tools/font-hires.py build -> assets/fonts/gameFont.png (same layout as the 1x atlas at 6x: fill in R,
#                                       outline in G). The metrics json is shared, so it is not rewritten.
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..") + "/"
K = 6
COLS, ROWS, CELL = 12, 7, 96
meta = json.load(open(ROOT + "assets/fonts/gameFont.json"))
atlas = np.asarray(Image.open(ROOT + "assets/fonts/gameFont_lo.png").convert("RGBA")).astype(np.float32)
fill = atlas[..., 0] / 255
H = meta["h"]
chars = [c for c in meta["glyphs"] if c != " "]

def cell_of(ch):
    g = meta["glyphs"][ch]
    return fill[g["y"]:g["y"] + H, g["x"]:g["x"] + g["w"]]

if sys.argv[1] == "prep":
    sheet = Image.new("L", (COLS * CELL, ROWS * CELL), 0)
    for i, ch in enumerate(chars):
        m = cell_of(ch)
        ys, xs = np.where(m > 0.3)
        crop = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        im = Image.fromarray((crop * 255).astype(np.uint8)).resize((crop.shape[1] * K, crop.shape[0] * K), Image.NEAREST)
        cx, cy = (i % COLS) * CELL + CELL // 2, (i // COLS) * CELL + CELL // 2
        sheet.paste(im, (cx - im.width // 2, cy - im.height // 2))
    sheet.convert("RGB").save(ROOT + "assets/generated/font/lowres_sheet.png")
    print(len(chars), sheet.size)
else:
    out = Image.open(ROOT + "assets/generated/font/hires_sheet.png").convert("L").resize((COLS * CELL, ROWS * CELL), Image.LANCZOS)
    o = np.asarray(out).astype(np.float32) / 255
    W = max(g["w"] for g in meta["glyphs"].values())
    cols = 16
    rows = (len(meta["glyphs"]) + cols - 1) // cols
    hi = np.zeros((rows * H * K, cols * W * K, 4), np.uint8)
    for i, ch in enumerate(chars):
        g = meta["glyphs"][ch]
        m = cell_of(ch)
        ys, xs = np.where(m > 0.3)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        c = o[(i // COLS) * CELL:(i // COLS + 1) * CELL, (i % COLS) * CELL:(i % COLS + 1) * CELL]
        yy, xx = np.where(c > 0.5)
        if not len(yy):
            print("empty", ch)
            continue
        crop = c[yy.min():yy.max() + 1, xx.min():xx.max() + 1]
        tw, th = (x1 - x0) * K, (y1 - y0) * K
        glyph = np.asarray(Image.fromarray((crop * 255).astype(np.uint8)).resize((tw, th), Image.LANCZOS)).astype(np.float32) / 255
        cellhi = np.zeros((H * K, g["w"] * K), np.float32)
        cellhi[y0 * K:y0 * K + th, x0 * K:x0 * K + tw] = np.clip((glyph - 0.15) / 0.7, 0, 1)
        hi[g["y"] * K:g["y"] * K + H * K, g["x"] * K:g["x"] * K + g["w"] * K, 0] = (cellhi * 255).astype(np.uint8)
    fillim = Image.fromarray(hi[..., 0])
    line = fillim.filter(ImageFilter.MaxFilter(2 * K - 1)).filter(ImageFilter.GaussianBlur(0.8))
    hi[..., 1] = np.asarray(line)
    hi[..., 3] = 255
    Image.fromarray(hi, "RGBA").save(ROOT + "assets/fonts/gameFont.png", optimize=True)
    print("hi atlas", hi.shape)
