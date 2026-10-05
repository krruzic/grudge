from PIL import Image; import numpy as np, sys
from scipy import ndimage
src=sys.argv[1]; pre=sys.argv[2]
im=Image.open(src).convert('RGB'); a=np.asarray(im).astype(np.float32)
k=a.shape[1]/2000
bg=a[5:30,900:1000].reshape(-1,3).mean(0)
mx=a.max(-1); mn=a.min(-1); sat=(mx-mn)/np.maximum(mx,1)
sm=(sat<0.1)&(mx>110)
top=np.zeros(mx.shape,bool); top[:int(230*k)]=True
a[sm&top]=bg
boxes={'tankard':(0,40,780,1090),'keg':(740,20,1420,530),'powderkeg':(720,560,1300,1010),'bigkeg':(1280,380,1995,1090)}
for n,(x0,y0,x1,y1) in boxes.items():
  c=a[int(y0*k):int(y1*k),int(x0*k):int(x1*k)].copy()
  d=np.sqrt(((c-bg)**2).sum(-1))>22
  d=ndimage.binary_closing(d,iterations=3)
  lab,nl=ndimage.label(d); sz=ndimage.sum(d,lab,range(1,nl+1)); big=np.argmax(sz)+1
  keep=ndimage.binary_fill_holes(lab==big); keep=ndimage.binary_dilation(keep,iterations=2)
  c[~keep]=bg
  ys=np.where(keep.sum(1)>0)[0]; xs=np.where(keep.sum(0)>0)[0]
  print(n,xs.min(),xs.max(),ys.min(),ys.max(),c.shape)
  c=c[ys.min():ys.max()+1,xs.min():xs.max()+1]
  h,w=c.shape[:2]; S=int(max(h,w)*1.15)
  o=np.ones((S,S,3))*bg; o[(S-h)//2:(S-h)//2+h,(S-w)//2:(S-w)//2+w]=c
  Image.fromarray(o.astype(np.uint8)).save(f'{pre}{n}.png')
