import numpy as np
from PIL import Image
a=np.asarray(Image.open("glyphs.png").convert("L")).astype(np.float32)
bright=(a>200)
col=bright.mean(0); row=bright.mean(1)
def runs(v,th,minlen):
    out=[];s=None
    for i,x in enumerate(v):
        if x<th and s is None: s=i
        if x>=th and s is not None: out.append((s,i)); s=None
    if s is not None: out.append((s,len(v)))
    return [r for r in out if r[1]-r[0]>minlen]
cx=runs(col,0.5,100); cy=runs(row,0.5,100)
while len(cx)>7:
    gaps=[cx[i+1][0]-cx[i][1] for i in range(len(cx)-1)]
    j=gaps.index(min(gaps)); cx[j]=(cx[j][0],cx[j+1][1]); del cx[j+1]
print(cx,cy)
C=96
sheet=Image.new("L",(C*7,C*4),0)
for ri,(y0,y1) in enumerate(cy):
    for ci,(x0,x1) in enumerate(cx):
        m=np.clip((a[y0+8:y1-8,x0+8:x1-8]-60)/140,0,1)
        ys,xs=np.where(m>0.3)
        by0,by1,bx0,bx1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
        side=max(by1-by0,bx1-bx0); pad=int(side*0.06)
        sq=np.zeros((side+2*pad,side+2*pad),np.float32)
        oy=(side-(by1-by0))//2+pad; ox=(side-(bx1-bx0))//2+pad
        sq[oy:oy+by1-by0,ox:ox+bx1-bx0]=m[by0:by1,bx0:bx1]
        sheet.paste(Image.fromarray((sq*255).astype(np.uint8),"L").resize((C,C),Image.LANCZOS),(ci*C,ri*C))
out=Image.merge("RGBA",[Image.new("L",sheet.size,255)]*3+[sheet])
out.save("/home/krruzic/Projects/grudge/assets/ui/abilities.png",optimize=True)
bg=Image.new("RGBA",out.size,(60,40,20,255)); bg.alpha_composite(out); bg.convert("RGB").save("check.png")
