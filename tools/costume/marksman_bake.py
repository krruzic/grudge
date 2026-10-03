import sys, os, numpy as np
sys.argv = ["x"]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "bake2.py")).read().split("if __name__")[0])
from PIL import Image
G = "/home/krruzic/Projects/grudge/assets/costumes/marksman/"
for cid in os.environ.get("CIDS", "winter,raven,sunfire").split(","):
    os.makedirs(G + cid, exist_ok=True)
    b = Image.open(f"marksman_{cid}_body_out.png").convert("RGB").resize((2048, 2048), Image.LANCZOS)
    tl = [b.crop(((i % 2) * 1024, (i // 2) * 1024, (i % 2 + 1) * 1024, (i // 2 + 1) * 1024)) for i in range(4)]
    bake("marksman_body_mesh.npz", "marksman_body_orig.png", tl, f"{cid}_body_bake.png")
    Image.open(f"{cid}_body_bake.png").convert("RGB").save(G + f"{cid}/marksman.jpg", quality=90)
    p = Image.open(f"marksman_{cid}_props_out.png").convert("RGB").resize((2048, 1536), Image.LANCZOS)
    rows = {}
    for r, w in enumerate(["marksman_bow", "marksman_pip", "pipfly"]):
        tl = [p.crop((i * 512, r * 512, (i + 1) * 512, (r + 1) * 512)) for i in range(4)]
        bake(f"{w}_mesh.npz", f"{w}_orig.png", tl, f"{cid}_{w}_bake.png")
        rows[w] = np.asarray(Image.open(f"{cid}_{w}_bake.png").convert("RGB"))
    Image.fromarray(rows["marksman_bow"]).save(G + f"{cid}/marksman_bow.jpg", quality=90)
    pip = rows["marksman_pip"].copy()
    W = pip.shape[1] // 2
    pip[:, W:] = rows["pipfly"][:, W:]
    Image.fromarray(pip).save(G + f"{cid}/marksman_pip.jpg", quality=90)
