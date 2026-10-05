"""Bake Mother Kelp's costume sheets (2x2: front, her left, back, her right) back onto her body texture.
Inputs in <dir> (from wreckwitch_views.py + Nano Banana): wreckwitch_body_mesh.npz, wreckwitch_body_orig.png,
<cid>_out.png. Writes assets/costumes/wreckwitch/<cid>/wreckwitch.jpg.
python3 tools/costume/wreckwitch_bake.py <dir> <repo> siren bogqueen frostwreck"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
D, ROOT, *CIDS = sys.argv[1:]
sys.argv = ["x"]
exec(open(os.path.join(HERE, "bake2.py")).read().split("if __name__")[0])
from PIL import Image

for cid in CIDS:
    G = os.path.join(ROOT, "assets/costumes/wreckwitch", cid)
    os.makedirs(G, exist_ok=True)
    b = Image.open(os.path.join(D, f"{cid}_out.png")).convert("RGB").resize((2048, 2048), Image.LANCZOS)
    tl = [b.crop(((i % 2) * 1024, (i // 2) * 1024, (i % 2 + 1) * 1024, (i // 2 + 1) * 1024)) for i in range(4)]
    out = os.path.join(D, f"bake_{cid}.png")
    bake(os.path.join(D, "wreckwitch_body_mesh.npz"), os.path.join(D, "wreckwitch_body_orig.png"), tl, out)
    Image.open(out).convert("RGB").save(os.path.join(G, "wreckwitch.jpg"), quality=90)
