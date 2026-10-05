"""Bake Hollin's costume body sheets (2x2: front, left, back, right) onto her texture.
Needs /tmp/opencode/costume/scribe_body_{mesh.npz,orig.png} from exp.py and the Nano Banana repaints
/tmp/opencode/scribe/cos_<costume>_body.png (prompts tools/costume/scribe_<costume>_body_prompt.txt)."""
import sys, os
sys.argv = ["x"]
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "bake2.py")).read().split("if __name__")[0])
from PIL import Image
C = "/tmp/opencode/costume/"
F = "/tmp/opencode/scribe/"
G = os.path.join(HERE, "..", "..", "assets", "costumes", "scribe") + "/"
for cid in os.environ.get("CIDS", "queenbee,vigil,redink").split(","):
    os.makedirs(G + cid, exist_ok=True)
    b = Image.open(F + f"cos_{cid}_body.png").convert("RGB").resize((2048, 2048), Image.LANCZOS)
    tl = [b.crop(((i % 2) * 1024, (i // 2) * 1024, (i % 2 + 1) * 1024, (i // 2 + 1) * 1024)) for i in range(4)]
    bake(C + "scribe_body_mesh.npz", C + "scribe_body_orig.png", tl, F + f"bake_{cid}_body.png")
    Image.open(F + f"bake_{cid}_body.png").convert("RGB").save(G + f"{cid}/scribe.jpg", quality=90)
