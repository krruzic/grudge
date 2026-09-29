import json
import numpy as np
from PIL import Image, ImageFilter

BK = np.asarray(Image.open("assets/fonts/src/banjo.png").convert("RGBA")).astype(np.float32)
MG = np.asarray(Image.open("assets/fonts/src/mariogolf.png").convert("RGBA")).astype(np.float32)
CAP = 10
PAD = 2
DESC = 3
CELL_H = PAD * 2 + CAP + DESC
BASE = PAD + CAP


def runs(mask):
    c = mask.any(0)
    out, s = [], None
    for x, v in enumerate(list(c) + [False]):
        if v and s is None:
            s = x
        if not v and s is not None:
            out.append((s, x))
            s = None
    return out


def bk_row(y0, y1, base, chars, merge=()):
    a = BK[y0:y1, :, 3] / 255
    r = runs(a > 0)
    for i in sorted(merge, reverse=True):
        r[i] = (r[i][0], r[i + 1][1])
        del r[i + 1]
    assert len(r) == len(chars), (len(r), chars)
    return {ch: (a[:, s:e], base - y0) for ch, (s, e) in zip(chars, r)}


glyphs = {}
glyphs.update(bk_row(0, 13, 11, "!.,:;'\"-()?", merge=(2,)))
glyphs.update(bk_row(14, 26, 24, "0123456789"))
glyphs.update(bk_row(26, 39, 37, "ABCDEFGHIJKLMNOPQRSTUVWXYZ"))

white = (MG[..., 3] > 0) & (MG[..., :3].sum(-1) > 500)
mg_band = white[0:9, :250].astype(np.float32)
mg_runs = runs(mg_band > 0)
MG_CHARS = ["!", '"a', '"b', "±", "$", "%", "▼", "'", "(", ")", "×", "+", ",", "-", ".", "/"] + list("0123456789") + [":", "<", "=", ">"]
assert len(mg_runs) == len(MG_CHARS), len(mg_runs)
mg_base = max(np.where(mg_band[:, s:e].any(1))[0].max() for (s, e), ch in zip(mg_runs, MG_CHARS) if ch.isdigit()) + 1
scale = CAP / (mg_base - min(np.where(mg_band[:, s:e].any(1))[0].min() for (s, e), ch in zip(mg_runs, MG_CHARS) if ch.isdigit()))
for (s, e), ch in zip(mg_runs, MG_CHARS):
    if ch not in "%/+×<=>$":
        continue
    g = Image.fromarray((mg_band[:, s:e] * 255).astype(np.uint8))
    g = g.resize((max(1, round(g.width * scale)), max(1, round(g.height * scale))), Image.BILINEAR)
    glyphs[ch] = (np.asarray(g).astype(np.float32) / 255, mg_base * scale)

dot, dbase = glyphs["."]
glyphs["·"] = (dot, dbase + 4)
dash, dsb = glyphs["-"]
glyphs["—"] = (np.concatenate([dash, dash[:, 1:]], 1), dsb)
rows_on = np.where(dash.any(1))[0]
bar = dash[rows_on.min():rows_on.max() + 1]
glyphs["_"] = (np.concatenate([bar, bar[:, 1:]], 1), bar.shape[0] - 1)

cells = []
for ch, (m, base_in) in glyphs.items():
    h, w = m.shape
    cell = np.zeros((CELL_H, w + PAD * 2), np.float32)
    top = int(round(BASE - base_in))
    y0, y1 = max(0, top), min(CELL_H, top + h)
    cell[y0:y1, PAD:PAD + w] = m[y0 - top:y1 - top]
    cells.append((ch, cell, w))
cells.append((" ", np.zeros((CELL_H, 4), np.float32), 3))

cols = 16
cw = max(c[1].shape[1] for c in cells)
rows = (len(cells) + cols - 1) // cols
atlas = np.zeros((rows * CELL_H, cols * cw, 4), np.uint8)
meta = {}
q = lambda v: (np.round(np.clip(v, 0, 1) * 15) * 17).astype(np.uint8)
for i, (ch, cell, w) in enumerate(cells):
    x, y = (i % cols) * cw, (i // cols) * CELL_H
    o = np.asarray(Image.fromarray((cell * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))).astype(np.float32) / 255
    h, cwid = cell.shape
    atlas[y:y + h, x:x + cwid, 0] = q(cell)
    atlas[y:y + h, x:x + cwid, 1] = q(o)
    atlas[y:y + h, x:x + cwid, 3] = 255
    meta[ch] = {"x": x, "y": y, "w": cwid, "adv": w + 1, "ox": PAD}
Image.fromarray(atlas, "RGBA").save("assets/fonts/n64font.png", optimize=True)
json.dump({"px": 14.5, "h": CELL_H, "base": BASE, "glyphs": meta}, open("assets/fonts/n64font.json", "w"))
print("glyphs", len(meta), "atlas", atlas.shape)
