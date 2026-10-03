import sys, os, json, glob
sys.argv=["x"]
exec(open("bake2.py").read().split('if __name__')[0])
from PIL import Image
G="/home/krruzic/Projects/grudge/assets/costumes/"
MAT={"warlord_club":["warlord_club"],"raider_knives":["raider_knife"],"summoner_staff":["summoner_staff"],"duelist_rapier":["duelist_rapier"],"duelist_baguette":["duelist_baguette"],"warden_shield":["warden_shield"],"herald_sword":["herald_sword"],"herald_banner":["herald_banner"]}
for h in ["warlord","raider","summoner","duelist","warden","herald"]:
    meta=json.load(open(f"{h}_props2.json"))
    cids=[]
    for c,w in meta["rows"]:
        if c[0] not in cids: cids.append(c[0])
    for cid in cids:
        os.makedirs(G+f"{h}/{cid}",exist_ok=True)
        b=Image.open(f"{h}_{cid}_body_out.png").convert("RGB").resize((2048,2048),Image.LANCZOS)
        tl=[b.crop(((i%2)*1024,(i//2)*1024,(i%2+1)*1024,(i//2+1)*1024)) for i in range(4)]
        bake(f"{h}_body_mesh.npz",f"{h}_body_orig.png",tl,f"{h}_{cid}_bake.png")
        Image.open(f"{h}_{cid}_bake.png").convert("RGB").save(G+f"{h}/{cid}/{h}.jpg",quality=90)
    p=Image.open(f"{h}_props2_out.png").convert("RGB").resize((2048,meta["H"]),Image.LANCZOS)
    for r,(c,w) in enumerate(meta["rows"]):
        tl=[p.crop((i*512,meta["off"]+r*512,(i+1)*512,meta["off"]+(r+1)*512)) for i in range(4)]
        bake(f"{w}_mesh.npz",f"{w}_orig.png",tl,f"{h}_{c[0]}_{w}_bake.png")
        for mn in MAT[w]: Image.open(f"{h}_{c[0]}_{w}_bake.png").convert("RGB").save(G+f"{h}/{c[0]}/{mn}.jpg",quality=90)
C="/tmp/opencode/costume/"
os.makedirs(G+"engineer/clock",exist_ok=True)
b=Image.open("engineer_clock_body_out.png").convert("RGB").resize((2048,2048),Image.LANCZOS)
tl=[b.crop(((i%2)*1024,(i//2)*1024,(i%2+1)*1024,(i//2+1)*1024)) for i in range(4)]
bake(C+"body_mesh.npz",C+"engineer_tex.png",tl,"eng_clock_body.png")
Image.open("eng_clock_body.png").convert("RGB").save(G+"engineer/clock/engineer.jpg",quality=90)
ps=Image.open("engineer_clock_props_out.png").convert("RGB").resize((2048,1536),Image.LANCZOS)
for r,(t,dst) in enumerate([("wrench",["engineer_wrench","wrench"]),("tesla",["tesla"]),("ballista",["ballista"])]):
    tl=[ps.crop((i*512,r*512,(i+1)*512,(r+1)*512)) for i in range(4)]
    bake(C+f"{t}_mesh.npz",C+f"{t}_orig.png",tl,f"eng_clock_{t}.png")
    for d in dst: Image.open(f"eng_clock_{t}.png").convert("RGB").save(G+f"engineer/clock/{d}.jpg",quality=90)
