# Gristle (vintner) body costumes: repaint sheets (assets/generated/costumes/vintner_<c>_body_out.png, 2x2 views of the
# rest pose rendered by exp.py into /tmp/opencode/vintner/cos/) baked back onto the body UVs with bake2.bake.
# Usage: python3 tools/costume/vintner_bake.py [costume...]
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
only = sys.argv[1:]
sys.argv = ["x"]
exec(open(os.path.join(HERE, "bake2.py")).read().split("if __name__")[0])
from PIL import Image
C = "/tmp/opencode/vintner/cos/"
for cid in only or ["harvestking", "forgemaster", "icewine"]:
    out = os.path.join(ROOT, "assets/costumes/vintner", cid)
    os.makedirs(out, exist_ok=True)
    b = Image.open(os.path.join(ROOT, f"assets/generated/costumes/vintner_{cid}_body_out.png")).convert("RGB").resize((2048, 2048), Image.LANCZOS)
    tl = [b.crop(((i % 2) * 1024, (i // 2) * 1024, (i % 2 + 1) * 1024, (i // 2 + 1) * 1024)) for i in range(4)]
    bake(C + "body_mesh.npz", C + "body_orig.png", tl, C + f"bake_{cid}.png")
    Image.open(C + f"bake_{cid}.png").convert("RGB").save(os.path.join(out, "vintner.jpg"), quality=90)
