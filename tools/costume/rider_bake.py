"""Bramble & Mead costumes: project the aligned repaints (rider_align.py) onto the body texture with bake2.bake.
Inputs in /tmp/opencode/rider (cos_<id>_body_sq.png) and /tmp/opencode/costume (exp.py render of rider.glb)."""
import sys, os
sys.argv = ["x"]
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "bake2.py")).read().split("if __name__")[0])
from PIL import Image
C = "/tmp/opencode/costume/"
F = "/tmp/opencode/rider/"
G = os.path.join(HERE, "..", "..", "assets", "costumes", "rider") + "/"
# costume id : scratch file tag
for pair in os.environ.get("CIDS", "warhornet:hornet,lavenderfield:lavender,queencourier:royal").split(","):
    cid, tag = pair.split(":")
    os.makedirs(G + cid, exist_ok=True)
    b = Image.open(F + f"cos_{tag}_body_sq.png").convert("RGB").resize((2048, 2048), Image.LANCZOS)
    tl = [b.crop(((i % 2) * 1024, (i // 2) * 1024, (i % 2 + 1) * 1024, (i // 2 + 1) * 1024)) for i in range(4)]
    bake(C + "rider_body_mesh.npz", C + "rider_body_orig.png", tl, F + f"bake_{tag}_body.png")
    Image.open(F + f"bake_{tag}_body.png").convert("RGB").save(G + f"{cid}/rider.jpg", quality=90)
