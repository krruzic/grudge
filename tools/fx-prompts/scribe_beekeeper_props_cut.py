"""Cut the Beekeeper's three new effect sprites (out/scribe_beekeeper_props.png, a 2x2 Nano Banana sheet from
scribe_beekeeper_props_prompt.txt) into her effect sheet, replacing the ink scribe's page, pages and quill:
a wooden hive frame of capped honeycomb (page), a fan of hexagon beeswax foundation sheets (pages) and a honey
dipper (quill; the second dipper in the sheet is a spare). Run from tools/fx-prompts:

    python3 scribe_beekeeper_props_cut.py
"""
import sys

from PIL import Image

sys.argv = sys.argv[:1]
from costume_fx_cut import CELL, fit, keyed  # noqa: E402

SHEET = "../../assets/fx/scribe@beekeeper.png"
a, al = keyed("out/scribe_beekeeper_props.png")
H, W = al.shape
quad = lambda cx, cy: (cx * W // 2, cy * H // 2, (cx + 1) * W // 2, (cy + 1) * H // 2)  # noqa: E731
sheet = Image.open(SHEET).convert("RGBA")
for cell, q in ((8, (0, 0)), (9, (1, 0)), (10, (0, 1))):
    sprite = fit(a, al, quad(*q))
    if sheet.width // 4 != CELL:
        sprite = sprite.resize((sheet.width // 4, sheet.width // 4), Image.LANCZOS)
    x, y = (cell % 4) * (sheet.width // 4), (cell // 4) * (sheet.width // 4)
    sheet.paste(Image.new("RGBA", sprite.size, (0, 0, 0, 0)), (x, y))
    sheet.paste(sprite, (x, y))
sheet.save(SHEET)
print("cut page / pages / quill into", SHEET)
