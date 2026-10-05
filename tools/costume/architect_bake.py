"""Professor Hoot's body costumes: project the repainted 2x2 view sheets (cos_<id>_body.png, made from
tools/costume/exp.py renders + architect_<id>_body_prompt.txt) back onto his texture with bake2.bake."""
import os
import sys

sys.argv = ["x"]
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "bake2.py")).read().split("if __name__")[0])
from PIL import Image  # noqa: E402

C = "/tmp/opencode/costume/"
F = "/tmp/opencode/architect/"
G = os.path.join(HERE, "..", "..", "assets", "costumes", "architect")
for cid in ["snowy", "temple", "clockwork"]:
    os.makedirs(os.path.join(G, cid), exist_ok=True)
    b = Image.open(F + f"cos_{cid}_body.png").convert("RGB").resize((2048, 2048), Image.LANCZOS)
    tl = [b.crop(((i % 2) * 1024, (i // 2) * 1024, (i % 2 + 1) * 1024, (i // 2 + 1) * 1024)) for i in range(4)]
    bake(C + "architect_body_mesh.npz", C + "architect_body_orig.png", tl, F + f"bake_{cid}_body.png")
    Image.open(F + f"bake_{cid}_body.png").convert("RGB").save(os.path.join(G, cid, "architect.jpg"), quality=90)
    print("baked", cid)
