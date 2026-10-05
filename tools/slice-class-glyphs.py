#!/usr/bin/env python3
"""Cut the class glyph sheets (tools/gen-class-glyphs.mjs) into assets/ui/glyphs/class_<id>.png: white glyph on
transparent, 96 px square, like the other UI glyphs (tinted at draw time by uiGlyph in src/ui/screens/selectArt.ts).
Each panel: drop the separator lines, keep the icon above the label (the label is the last block of ink rows)."""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
SHEETS = [("class_glyphs_0_raw.png", ["bruiser", "tank", "assassin", "marksman"]),
          ("class_glyphs_1_raw.png", ["caster", "support", "builder"])]
# Or any sheet: `slice-class-glyphs.py <raw.png> <out_id> ...` (e.g. glyphs_sit_raw.png sit take) -> <out_id>.png.
if len(sys.argv) > 2:
    SHEETS = [(sys.argv[1], sys.argv[2:])]
SIZE = 96

for name, ids in SHEETS:
    im = Image.open(os.path.join(ROOT, "assets/generated", name)).convert("L")
    a = 255 - np.asarray(im, dtype=np.float32)
    h, w = a.shape
    # Panel edges: the drawn divider lines when there are the right number of them, else equal widths.
    lines = np.where((a > 128).mean(0) > 0.6)[0]
    groups = [g for g in np.split(lines, np.where(np.diff(lines) > 1)[0] + 1) if len(g)]
    mids = [int(g.mean()) for g in groups if 5 < g.mean() < w - 5]
    edges = [0, *mids, w] if len(mids) == len(ids) - 1 else [round(k * w / len(ids)) for k in range(len(ids) + 1)]
    for i, id in enumerate(ids):
        pw = edges[i + 1] - edges[i]
        x0, x1 = int(edges[i] + pw * 0.03), int(edges[i + 1] - pw * 0.03)
        p = a[int(h * 0.02):int(h * 0.98), x0:x1].copy()
        # Panel divider lines (uneven panel widths put them inside the crop): drop full-height ink columns.
        p[:, (p > 128).mean(0) > 0.6] = 0
        # ...and any leftover thin vertical sliver of one (a few px wide, tall, at the crop's sides).
        cols = (p > 128).sum(0)
        for side in (range(0, int(p.shape[1] * 0.12)), range(int(p.shape[1] * 0.88), p.shape[1])):
            for c in side:
                if cols[c] > p.shape[0] * 0.25:
                    p[:, max(0, c - 3):c + 4] = 0
        rows = (p > 128).sum(1) > 0
        # Last ink block (from the bottom) is the label; the icon is everything above the gap before it.
        ys = np.where(rows)[0]
        y = ys[-1]
        while y > 0 and rows[y]:
            y -= 1
        while y > 0 and not rows[y]:
            y -= 1
        icon = p[:y + 1]
        mask = icon > 40
        yy, xx = np.where(mask)
        icon = icon[yy.min():yy.max() + 1, xx.min():xx.max() + 1]
        s = int(max(icon.shape) * 1.04)
        sq = np.zeros((s, s), np.float32)
        oy, ox = (s - icon.shape[0]) // 2, (s - icon.shape[1]) // 2
        sq[oy:oy + icon.shape[0], ox:ox + icon.shape[1]] = icon
        al = Image.fromarray(np.clip(sq, 0, 255).astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)
        out = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
        out.putalpha(al)
        path = os.path.join(ROOT, "assets/ui/glyphs", f"{id}.png" if len(sys.argv) > 2 else f"class_{id}.png")
        out.save(path)
        print(path)
