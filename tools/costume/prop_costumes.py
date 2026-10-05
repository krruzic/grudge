#!/usr/bin/env python3
"""Per-costume textures for every hero prop / weapon (tools/costume/prop_costumes.json).
  sheets: build one input sheet per hero (4 views per prop per row, from exp.py renders in /tmp/opencode/costume/)
  bake:   project each repainted sheet (/tmp/opencode/propcos/out_<hero>_<costume>.png, from prop_costumes.mjs)
          back onto each prop's texture with bake2.bake -> assets/costumes/<hero>/<costume>/<key>.jpg"""
import json, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys_argv = sys.argv[:]
sys.argv = ["x"]
exec(open(os.path.join(HERE, "bake2.py")).read().split("if __name__")[0])
C = "/tmp/opencode/costume/"
O = "/tmp/opencode/propcos/"
G = os.path.join(HERE, "..", "..", "assets", "costumes")
CFG = json.load(open(os.path.join(HERE, "prop_costumes.json")))
cmd = sys_argv[1]
only = sys_argv[2:] 
for hero, cfg in CFG.items():
    if only and hero not in only and not any(o.startswith(hero + "/") for o in only):
        continue
    if cmd == "sheets":
        sheet = Image.new("RGB", (2048, 2048), (128, 128, 128))
        for r, (tag, _, _) in enumerate(cfg["rows"]):
            for i in range(4):
                v = Image.open(C + f"{tag}_v{i}.png").convert("RGBA")
                sheet.paste(v, (i * 512, r * 512), v)
        sheet.save(O + f"in_{hero}.png")
        print(O + f"in_{hero}.png")
    elif cmd == "bake":
        for cid in cfg["costumes"]:
            if only and f"{hero}/{cid}" not in only and hero not in only:
                continue
            src = O + f"out_{hero}_{cid}.png"
            if not os.path.exists(src):
                continue
            p = Image.open(src).convert("RGB").resize((2048, 2048), Image.LANCZOS)
            os.makedirs(os.path.join(G, hero, cid), exist_ok=True)
            for r, (tag, keys, _) in enumerate(cfg["rows"]):
                tl = [p.crop((i * 512, r * 512, (i + 1) * 512, (r + 1) * 512)) for i in range(4)]
                tmp = O + f"bake_{hero}_{cid}_{tag}.png"
                bake(C + f"{tag}_mesh.npz", C + f"{tag}_orig.png", tl, tmp)
                for k in keys:
                    Image.open(tmp).convert("RGB").save(os.path.join(G, hero, cid, f"{k}.jpg"), quality=90)
