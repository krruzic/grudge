import sys, os
sys.argv = ["x"]
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "bake2.py")).read().split("if __name__")[0])
from PIL import Image
C = "/tmp/opencode/costume/"
F = "/tmp/opencode/friar/"
G = "/home/krruzic/Projects/grudge/assets/costumes/friar/"
ROWS = [("friar_tankard", ["friar_tankard"]), ("friar_keg", ["keg"]), ("friar_powderkeg", ["powderkeg"]), ("friar_bigkeg", ["bigkeg"])]
for cid in (sys.argv_c if hasattr(sys, "argv_c") else ["abbot", "hopmaster", "grog"]):
    os.makedirs(G + cid, exist_ok=True)
    b = Image.open(F + f"cos_{cid}_body.png").convert("RGB").resize((2048, 2048), Image.LANCZOS)
    tl = [b.crop(((i % 2) * 1024, (i // 2) * 1024, (i % 2 + 1) * 1024, (i // 2 + 1) * 1024)) for i in range(4)]
    bake(C + "friar_body_mesh.npz", C + "friar_body_orig.png", tl, F + f"bake_{cid}_body.png")
    Image.open(F + f"bake_{cid}_body.png").convert("RGB").save(G + f"{cid}/friar.jpg", quality=90)
    p = Image.open(F + f"cos_{cid}_props.png").convert("RGB").resize((2048, 2048), Image.LANCZOS)
    for r, (w, dst) in enumerate(ROWS):
        tl = [p.crop((i * 512, r * 512, (i + 1) * 512, (r + 1) * 512)) for i in range(4)]
        bake(C + f"{w}_mesh.npz", C + f"{w}_orig.png", tl, F + f"bake_{cid}_{w}.png")
        for d in dst:
            Image.open(F + f"bake_{cid}_{w}.png").convert("RGB").save(G + f"{cid}/{d}.jpg", quality=90)
