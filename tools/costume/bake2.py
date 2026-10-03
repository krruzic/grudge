import numpy as np, math, sys
from PIL import Image
def raster_tri(x,y,R,W,H,e=0.0):
    x0,x1=int(max(0,np.floor(x.min())-1)),int(min(W-1,np.ceil(x.max())+1))
    y0,y1=int(max(0,np.floor(y.min())-1)),int(min(H-1,np.ceil(y.max())+1))
    if x1<x0 or y1<y0: return None
    gx,gy=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
    den=(y[1]-y[2])*(x[0]-x[2])+(x[2]-x[1])*(y[0]-y[2])
    if abs(den)<1e-12: return None
    l1=((y[1]-y[2])*(gx-x[2])+(x[2]-x[1])*(gy-y[2]))/den
    l2=((y[2]-y[0])*(gx-x[2])+(x[0]-x[2])*(gy-y[2]))/den
    l3=1-l1-l2
    ins=(l1>=e)&(l2>=e)&(l3>=e)
    return x0,y0,ins,l1,l2,l3
def bake(meshf,origf,tiles,outf):
    d=np.load(meshf); P,N,UV,MAT=d["P"],d["N"],d["UV"],d["MAT"]; C=d["C"]; S=float(d["S"]); R=int(d["R"])
    orig=np.asarray(Image.open(origf).convert("RGB")).astype(np.float32); T=orig.shape[0]
    views=[]
    for i,a in enumerate((0,90,180,270)):
        r=math.radians(a); f=-np.array([math.sin(r),-math.cos(r),0.0]); right=np.cross(f,[0,0,1.0]); up=np.array([0,0,1.0])
        views.append((f,right,up,np.asarray(tiles[i].convert("RGB").resize((R,R),Image.LANCZOS)).astype(np.float32)))
    def proj(p,v):
        f,right,up,_=v; q=p-C
        return (0.5+q@right/S)*R,(0.5-q@up/S)*R,q@f
    zb=[]
    for v in views:
        z=np.full((R,R),np.inf,np.float32)
        for t in range(len(P)):
            x,y,dz=proj(P[t],v)
            r=raster_tri(x,y,R,R,R)
            if not r: continue
            x0,y0,ins,l1,l2,l3=r
            zz=l1*dz[0]+l2*dz[1]+l3*dz[2]
            sub=z[y0:y0+ins.shape[0],x0:x0+ins.shape[1]]
            np.minimum(sub,np.where(ins,zz,np.inf),out=sub)
        zb.append(z)
    acc=np.zeros((T,T,3),np.float32); wsum=np.zeros((T,T),np.float32); team=np.zeros((T,T),bool); used=np.zeros((T,T),bool)
    for t in range(len(P)):
        u=UV[t][:,0]*T; vv=(1-UV[t][:,1])*T
        r=raster_tri(u,vv,T,T,T,-0.08)
        if not r: continue
        x0,y0,ins,l1,l2,l3=r
        if not ins.any(): continue
        yy,xx=np.where(ins); yy=yy+y0; xx=xx+x0
        if MAT[t]: team[yy,xx]=True; continue
        used[yy,xx]=True
        b=np.stack([l1,l2,l3],-1)[ins]
        pos=b@P[t]; nrm=b@N[t]; nrm/=np.linalg.norm(nrm,axis=1,keepdims=True)+1e-9
        for k,v in enumerate(views):
            f,right,up,img=v
            w=np.clip(-(nrm@f),0,1)**3
            if not (w>0.01).any(): continue
            px,py,pz=proj(pos,v)
            ix=np.clip(px.astype(int),0,R-1); iy=np.clip(py.astype(int),0,R-1)
            w=w*(pz<=zb[k][iy,ix]+S*0.012)
            np.add.at(acc,(yy,xx),img[iy,ix]*w[:,None]); np.add.at(wsum,(yy,xx),w)
    good=(wsum>0.25)&~team
    q=(orig//16).astype(int); key=q[...,0]*256+q[...,1]*16+q[...,2]
    newc=acc/np.maximum(wsum,1e-6)[...,None]
    sums=np.zeros((4096,3)); cnt=np.zeros(4096)
    np.add.at(sums,key[good],newc[good]); np.add.at(cnt,key[good],1)
    q2=(orig//32).astype(int); key2=q2[...,0]*64+q2[...,1]*8+q2[...,2]
    s2=np.zeros((512,3)); c2=np.zeros(512)
    np.add.at(s2,key2[good],newc[good]); np.add.at(c2,key2[good],1)
    gmean=newc[good].mean(0)/np.maximum(orig[good].mean(0),1)
    fill=np.where((cnt[key]>3)[...,None],sums[key]/np.maximum(cnt[key],1)[...,None],np.where((c2[key2]>3)[...,None],s2[key2]/np.maximum(c2[key2],1)[...,None],orig*gmean))
    k=0.35
    out=(acc+fill*k)/(wsum+k)[...,None]
    out[team]=orig[team]
    Image.fromarray(np.clip(out,0,255).astype(np.uint8)).save(outf)
    print(outf,"covered",round(good[used].mean(),3) if used.any() else 0)
if __name__=="__main__":
    body=Image.open("sheet_out.png").convert("RGB").resize((2048,2048),Image.LANCZOS)
    bt=[body.crop(((i%2)*1024,(i//2)*1024,(i%2+1)*1024,(i//2+1)*1024)) for i in range(4)]
    import shutil
    d=np.load("mesh.npz"); cx,cy,cz,S=map(float,open("cam.txt").read().split())
    np.savez("body_mesh.npz",P=d["P"],N=d["N"],UV=d["UV"],MAT=d["MAT"],C=np.array([cx,cy,cz]),S=S,R=1024)
    bake("body_mesh.npz","engineer_tex.png",bt,"frost_body.png")
    ps=Image.open("props_out.png").convert("RGB").resize((2048,1536),Image.LANCZOS)
    for r,t in enumerate(["wrench","tesla","ballista"]):
        tl=[ps.crop((i*512,r*512,(i+1)*512,(r+1)*512)) for i in range(4)]
        bake(f"{t}_mesh.npz",f"{t}_orig.png",tl,f"frost_{t}.png")
