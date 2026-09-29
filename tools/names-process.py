from PIL import Image
import numpy as np, glob, os
for p in sorted(glob.glob("assets/generated/names/*_raw.png")):
    n=os.path.basename(p)[:-8]
    a=np.asarray(Image.open(p).convert("RGB")).astype(np.int32)
    r,g,b=a[...,0],a[...,1],a[...,2]
    c=np.concatenate([a[:8,:8].reshape(-1,3),a[:8,-8:].reshape(-1,3),a[-8:,:8].reshape(-1,3),a[-8:,-8:].reshape(-1,3)])
    bg=np.median(c,0)
    d=np.sqrt(((a-bg)**2).sum(-1))
    k=np.minimum(r-g,b-g)
    alpha=np.clip((d-40)/50,0,1)*np.clip((70-k)/40,0,1)
    m=alpha>0.5
    rows=np.where(m.sum(1)>=6)[0]; cols=np.where(m.sum(0)>=6)[0]
    pad=4
    y0,y1=max(0,rows.min()-pad),min(a.shape[0],rows.max()+1+pad)
    x0,x1=max(0,cols.min()-pad),min(a.shape[1],cols.max()+1+pad)
    rgb=a.copy(); rgb[~m]=[40,24,16]
    img=Image.fromarray(np.dstack([rgb,alpha*255]).astype(np.uint8)[y0:y1,x0:x1],"RGBA")
    H=40; W=round(img.width*H/img.height)
    img=img.resize((W,H),Image.LANCZOS)
    q=np.asarray(img.convert("RGB").quantize(32,method=Image.Quantize.MEDIANCUT).convert("RGB"))
    al=np.where(np.asarray(img)[...,3]>100,255,0).astype(np.uint8)
    Image.fromarray(np.dstack([q,al]),"RGBA").save(f"assets/textures/names/{n}.png")
    print(n,W,H)
