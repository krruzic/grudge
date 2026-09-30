from PIL import Image
import json, glob, os
for sj in sorted(glob.glob("assets/generated/talents/sheet_*.json")):
    meta = json.load(open(sj))
    if meta.get("manual"):
        continue
    im = Image.open(sj.replace(".json", ".png")).convert("RGB")
    W, H = im.size
    cw, ch = W / meta["cols"], H / meta["rows"]
    for k, id_ in enumerate(meta["ids"]):
        c, r = k % meta["cols"], k // meta["cols"]
        cell = im.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        side = max(cell.size)
        sq = Image.new("RGB", (side, side), (255, 0, 255))
        sq.paste(cell, ((side - cell.size[0]) // 2, (side - cell.size[1]) // 2))
        sq.save(f"assets/generated/talents/{id_}_raw.png")
    print(sj, len(meta["ids"]))
