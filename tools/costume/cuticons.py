import numpy as np, os, sys
from PIL import Image, ImageDraw, ImageFilter
def cut(sheet, names, cols, rows, out):
    im=Image.open(sheet).convert("RGB"); a=np.asarray(im).astype(np.float32)
    H,W=a.shape[:2]
    bg=np.median(np.concatenate([a[:20].reshape(-1,3),a[-20:].reshape(-1,3)]),0)
    fg=(np.sqrt(((a-bg)**2).sum(-1))>28)
    m=Image.fromarray((fg*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    cw,ch=W/cols,H/rows
    os.makedirs(out,exist_ok=True)
    for i,n in enumerate(names):
        if not n: continue
        x0,y0=int((i%cols)*cw),int((i//cols)*ch)
        cell=m.crop((x0,y0,int(x0+cw),int(y0+ch))).convert("L")
        pad=Image.new("L",(cell.width+2,cell.height+2),0); pad.paste(cell,(1,1))
        ImageDraw.floodfill(pad,(0,0),128)
        f=np.asarray(pad)[1:-1,1:-1]
        mask=(f!=128).astype(np.float32)
        ys,xs=np.where(mask>0)
        by0,by1,bx0,bx1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
        soft=np.asarray(Image.fromarray((mask*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32)
        side=max(by1-by0,bx1-bx0)+16
        sq=np.zeros((side,side,4),np.float32)
        oy=(side-(by1-by0))//2; ox=(side-(bx1-bx0))//2
        sq[oy:oy+by1-by0,ox:ox+bx1-bx0,:3]=a[y0+by0:y0+by1,x0+bx0:x0+bx1]
        sq[oy:oy+by1-by0,ox:ox+bx1-bx0,3]=soft[by0:by1,bx0:bx1]
        Image.fromarray(np.clip(sq,0,255).astype(np.uint8),"RGBA").resize((96,96),Image.LANCZOS).save(f"{out}/{n}.png")
if __name__=="__main__":
    names=["warlord_classic","warlord_bloodmoon","engineer_classic","engineer_frost","engineer_ember","raider_classic","raider_frostbite","summoner_classic","summoner_lich","duelist_classic","duelist_blackrose","warden_classic","warden_winterbark","herald_classic","herald_blackknight"]
    cut("icons_out.png",names,5,3,"/home/krruzic/Projects/grudge/assets/ui/costume_icons")
