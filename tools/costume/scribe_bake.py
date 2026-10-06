"""Granny Hollin genre costumes: project the repainted 2x2 body sheets (/tmp/opencode/hollin/cos_<id>_body.png,
prompts tools/costume/scribe_<id>_body_prompt.txt) onto her body texture with bake2.bake (exp.py render
scribe_body). The quill's repaints come from prop_costumes.json."""
import sys, os
sys.argv = ["x"]
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "bake2.py")).read().split("if __name__")[0])
from PIL import Image
C = "/tmp/opencode/costume/"
F = "/tmp/opencode/hollin/"
G = os.path.join(HERE, "..", "..", "assets", "costumes", "scribe") + "/"
for cid in os.environ.get("CIDS", "childrens,mystery,scifi").split(","):
    os.makedirs(G + cid, exist_ok=True)
    b = Image.open(F + f"cos_{cid}_body.png").convert("RGB").resize((2048, 2048), Image.LANCZOS)
    tl = [b.crop(((i % 2) * 1024, (i // 2) * 1024, (i % 2 + 1) * 1024, (i // 2 + 1) * 1024)) for i in range(4)]
    bake(C + "scribe_body_mesh.npz", C + "scribe_body_orig.png", tl, F + f"bake_{cid}_body.png")
    Image.open(F + f"bake_{cid}_body.png").convert("RGB").save(G + f"{cid}/scribe.jpg", quality=90)
