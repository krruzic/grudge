import numpy as np
from PIL import Image

OUT = "/tmp/opencode/hdpass/hq/"


def keyed(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    bg = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3)]), 0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 26) / 80, 0, 1)
    al = alpha[..., None]
    a = np.where(al > 0, (a - bg * (1 - al)) / np.maximum(al, 0.05), a)
    if bg[1] < 80:
        spill = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1] - 30, 0, None) * (1 - alpha) ** 0.5
        a[..., 0] -= spill
        a[..., 2] -= spill
    else:
        spill = np.clip(a[..., 1] - np.maximum(a[..., 0], a[..., 2]) - 10, 0, None)
        a[..., 1] -= spill
    return np.clip(a, 0, 255), alpha


def premul_resize(rgba, size):
    pre = rgba.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    sm = np.asarray(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)).astype(np.float32)
    al = sm[..., 3:4]
    sm[..., :3] = np.where(al > 0, sm[..., :3] * 255 / np.maximum(al, 1), 0)
    return np.clip(sm, 0, 255)


def quad(a, al, q, m=4):
    x0, y0 = (q % 2) * 1024, (q // 2) * 1024
    sub = al[y0:y0 + 1024, x0:x0 + 1024]
    ys, xs = np.where(sub > 0.3)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    half = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + m
    side = int(np.ceil(half * 2))
    sq = np.zeros((side, side, 4), np.float32)
    bx0, by0 = int(round(cx - half)), int(round(cy - half))
    for yy in range(side):
        sy = by0 + yy
        if 0 <= sy < 1024:
            lo, hi = max(0, -bx0), min(side, 1024 - bx0)
            sq[yy, lo:hi, :3] = a[y0 + sy, x0 + bx0 + lo:x0 + bx0 + hi]
            sq[yy, lo:hi, 3] = sub[sy, bx0 + lo:bx0 + hi] * 255
    return sq


def save(rgba, size, name):
    im = Image.fromarray(premul_resize(rgba, size).astype(np.uint8), "RGBA")
    im.save(OUT + name + ".png", optimize=True)
    return im


def bilinear(img, x, y):
    h, w = img.shape[:2]
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    return img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy


def ring_remap(src, r0, r1, name, fill=(200, 228, 236), reps=3, R0=446, R1=506, S=2048):
    pre = src.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    c = src.shape[0] / 2
    k = S / 1024
    ys, xs = np.mgrid[0:S, 0:S].astype(np.float32)
    dx, dy = (xs + 0.5) / k - 512, (ys + 0.5) / k - 512
    r = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)
    ri = r0 + (r - R0) / (R1 - R0) * (r1 - r0)
    ti = np.mod(th * reps, 2 * np.pi)
    band = bilinear(pre, c + np.cos(ti) * ri, c + np.sin(ti) * ri)
    band[(r < R0) | (r > R1)] = 0
    fa = np.where(r < 350, 40, np.clip(40 - (r - 350) / 100 * 30, 0, 40)) * (r < R0 + 6)
    out = np.zeros((S, S, 4), np.float32)
    out[..., :3] = np.array(fill, np.float32) * (fa / 255)[..., None]
    out[..., 3] = fa
    ba = band[..., 3:4] / 255
    out[..., :3] = band[..., :3] + out[..., :3] * (1 - ba)
    out[..., 3] = band[..., 3] + out[..., 3] * (1 - ba[..., 0])
    sm = np.asarray(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA").resize((1024, 1024), Image.LANCZOS)).astype(np.float32)
    al = sm[..., 3:4]
    sm[..., :3] = np.where(al > 0, sm[..., :3] * 255 / np.maximum(al, 1), 0)
    Image.fromarray(np.clip(sm, 0, 255).astype(np.uint8), "RGBA").save(OUT + name + ".png", optimize=True)


def radial_profile(sq):
    c = sq.shape[0] / 2
    ys, xs = np.mgrid[0:sq.shape[0], 0:sq.shape[1]]
    r = np.hypot(xs + 0.5 - c, ys + 0.5 - c)
    return [(R, float(sq[..., 3][(r >= R) & (r < R + 10)].mean())) for R in range(0, int(c), 10)]


if __name__ == "__main__":
    import os, sys
    os.makedirs(OUT, exist_ok=True)
    jobs = {
        "A": [("warden.rune", 1024), ("summoner.circle", 512), ("summoner.hex", 512), ("wren.arrowRing", 512)],
        "B": [("warden.rune@suntotem", 1024), ("summoner.circle@shadowplay", 512), ("summoner.hex@shadowplay", 512), ("wren.arrowRing@starfall", 512)],
        "C": [("friar.puddle", 512), ("friar.puddle@celadon", 512), (None, 0), ("raider.vortex", 512)],
    }
    for s, items in jobs.items():
        a, al = keyed(f"/tmp/opencode/hdpass/out{s}.png")
        for q, (name, size) in enumerate(items):
            sq = quad(a, al, q)
            if name:
                save(sq, size, name)
            else:
                np.save("/tmp/opencode/hdpass/porcelain.npy", sq)
                prof = radial_profile(sq)
                print("porcelain side", sq.shape[0], " ".join(f"{R}:{v:.0f}" for R, v in prof))
import numpy as np
from PIL import Image
def despill(name, dark=None):
    p = "hq/" + name + ".png"
    a = np.asarray(Image.open(p).convert("RGBA")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (r > 0.75 * b) & (np.minimum(r, b) - g > 25)
    if dark is not None:
        lum = (0.3 * r + 0.59 * g + 0.11 * b)[m]
        for i in range(3): a[..., i][m] = dark[i] * (0.6 + lum / 255)
        a[..., 3][m] *= 0.75
    else:
        a[..., 0][m] = g[m] + (b[m] - g[m]) * 0.45
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA").save(p, optimize=True)
    print(name, int(m.sum()))
despill("summoner.circle", dark=(24, 52, 34))
despill("raider.vortex")
import numpy as np
from PIL import Image
D="/home/krruzic/Projects/grudge/assets/fx/hq/"
def go(name, f):
    p=D+name+".png"; a=np.asarray(Image.open(p).convert("RGBA")).astype(np.float32)
    lum=0.3*a[...,0]+0.59*a[...,1]+0.11*a[...,2]
    a[...,3]*=f(lum, a)
    Image.fromarray(np.clip(a,0,255).astype(np.uint8),"RGBA").save(p,optimize=True)
    print(name, a[...,3].mean().round(1))
go("summoner.hex", lambda l,a: 0.42+0.58*np.clip((l-55)/50,0,1))
go("summoner.circle", lambda l,a: 0.3+0.7*np.clip((l-60)/50,0,1))
go("summoner.hex@shadowplay", lambda l,a: 1-0.85*np.clip((l-45)/30,0,1))
