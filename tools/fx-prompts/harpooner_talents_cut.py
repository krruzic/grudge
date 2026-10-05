"""Cut Brindle's evolution icons from the 4x2 Nano Banana sheet (688x768 tiles; the model wrote a name label along
each tile's bottom, so take the square above it). The 8th tile (a spare) is unused.
python3 tools/fx-prompts/harpooner_talents_cut.py assets/generated/harpooner_talents_raw.png"""
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
IDS = ["springlegs", "oilskin", "winch", "undertow", "barbed", "quickline", "maelstrom"]
im = Image.open(sys.argv[1]).convert("RGB")
TW, TH = im.size[0] // 4, im.size[1] // 2
S = int(TH * 0.78)
for k, tid in enumerate(IDS):
    x0 = (k % 4) * TW + (TW - S) // 2
    y0 = (k // 4) * TH + int(TH * 0.02)
    im.crop((x0, y0, x0 + S, y0 + S)).resize((96, 96), Image.LANCZOS).save(os.path.join(ROOT, "assets", "ui", "talents", f"{tid}.png"))
