import numpy as np
from PIL import Image
from collections import deque
from PIL import ImageFilter


def label(mask):
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    n = 0
    boxes = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n += 1
        q = deque([(y0, x0)])
        lab[y0, x0] = n
        ys0 = ys1 = y0
        xs0 = xs1 = x0
        cnt = 0
        while q:
            y, x = q.popleft()
            cnt += 1
            ys0, ys1, xs0, xs1 = min(ys0, y), max(ys1, y), min(xs0, x), max(xs1, x)
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
        boxes.append((slice(ys0, ys1 + 1), slice(xs0, xs1 + 1), cnt))
    return lab, boxes

H = "/tmp/opencode/uniqfx/hd/hq/"
FX = "/home/krruzic/Projects/grudge/assets/fx/hq/"
MAG = np.array([255, 0, 255], np.float32)
GRN = np.array([0, 255, 0], np.float32)


def quad(path, q):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    x0, y0 = (q % 2) * 1024, (q // 2) * 1024
    return a[y0:y0 + 1024, x0:x0 + 1024].copy()


def key(a, bg):
    if bg[1] > 200:
        k = a[..., 1] - np.maximum(a[..., 0], a[..., 2])
        kb = 255.0
    else:
        k = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
        kb = 255.0
    alpha = np.clip(1 - (k - 20) / (kb * 0.6), 0, 1)
    al = alpha[..., None]
    rgb = np.where(al > 0.02, (a - bg * (1 - al)) / np.maximum(al, 0.05), 0)
    rgb = np.clip(rgb, 0, 255)
    if bg[1] > 200:
        rgb[..., 1] = np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2]) + 20)
    else:
        sp = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1] - 25, 0, None)
        rgb[..., 0] -= sp
        rgb[..., 2] -= sp
    return np.concatenate([np.clip(rgb, 0, 255), alpha[..., None] * 255], -1)


def fit(rgba, S=1024, fill=1.0):
    ys, xs = np.where(rgba[..., 3] > 60)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    half = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 2
    P = 256
    rgba = np.pad(rgba, ((P, P), (P, P), (0, 0)))
    cx, cy = cx + P, cy + P
    im = premul(rgba)
    box = (cx - half, cy - half, cx + half, cy + half)
    big = im.resize((int(S * fill), int(S * fill)), Image.LANCZOS, box=box)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(big, ((S - big.size[0]) // 2, (S - big.size[1]) // 2))
    return unpremul(out)


def premul(rgba):
    p = rgba.copy()
    p[..., :3] *= p[..., 3:4] / 255
    return Image.fromarray(np.clip(p, 0, 255).astype(np.uint8), "RGBA")


def unpremul(im):
    a = np.asarray(im).astype(np.float32)
    al = a[..., 3:4]
    a[..., :3] = np.where(al > 0, a[..., :3] * 255 / np.maximum(al, 1), 0)
    return np.clip(a, 0, 255)


def rad(S):
    ys, xs = np.mgrid[0:S, 0:S]
    return np.hypot(xs + 0.5 - S / 2, ys + 0.5 - S / 2) / (S / 2)


def grad(S, stops):
    r = rad(S)
    out = np.zeros((S, S, 4), np.float32)
    for c in range(4):
        out[..., c] = np.interp(r, [s[0] for s in stops], [s[1][c] for s in stops])
    out[..., 3] *= 255
    return out


def over(top, bot):
    ta, ba = top[..., 3:4] / 255, bot[..., 3:4] / 255
    oa = ta + ba * (1 - ta)
    rgb = (top[..., :3] * ta + bot[..., :3] * ba * (1 - ta)) / np.maximum(oa, 1e-4)
    return np.concatenate([rgb, oa * 255], -1)


def fade(a, r0=0.86, r1=0.995, mul=1.0):
    r = rad(a.shape[0])
    a = a.copy()
    a[..., 3] *= np.clip((r1 - r) / (r1 - r0), 0, 1) * mul
    return a


def save(a, name, size=1024):
    im = premul(a)
    if size != a.shape[0]:
        im = im.resize((size, size), Image.LANCZOS)
    out = Image.fromarray(unpremul(im).astype(np.uint8), "RGBA")
    out.save(H + name + ".png", optimize=True)
    return out


def load_hq(name, S=1024):
    im = Image.open(FX + name + ".png").convert("RGBA")
    return unpremul(premul(np.asarray(im).astype(np.float32)).resize((S, S), Image.LANCZOS))


def pieces(rgba, minpx=200):
    lab, boxes = label(rgba[..., 3] > 90)
    out = []
    for i, (ys, xs, cnt) in enumerate(boxes):
        h, w = ys.stop - ys.start, xs.stop - xs.start
        if cnt < minpx or max(h, w) > 260:
            continue
        pad = 4
        y0, y1 = max(0, ys.start - pad), min(1024, ys.stop + pad)
        x0, x1 = max(0, xs.start - pad), min(1024, xs.stop + pad)
        p = rgba[y0:y1, x0:x1].copy()
        m = Image.fromarray(((lab[y0:y1, x0:x1] == i + 1) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
        p[..., 3] *= np.asarray(m) / 255
        out.append(p)
    return out


def ring_of(pcs, S=1024, n=280, rin=0.77, rout=0.985, size=(0.3, 0.46), seed=3):
    rng = np.random.default_rng(seed)
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    for k in range(n):
        p = pcs[rng.integers(len(pcs))]
        im = premul(p)
        s = rng.uniform(*size)
        im = im.resize((max(2, int(im.size[0] * s)), max(2, int(im.size[1] * s))), Image.LANCZOS).rotate(rng.uniform(0, 360), Image.BICUBIC, expand=True)
        th = (k / n) * 2 * np.pi + rng.uniform(-0.03, 0.03)
        rr = rng.uniform(rin, rout - 0.02) * S / 2 - im.size[0] / 2 * 0
        x = S / 2 + np.cos(th) * rr - im.size[0] / 2
        y = S / 2 + np.sin(th) * rr - im.size[1] / 2
        layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        layer.paste(im, (int(x), int(y)))
        canvas = Image.alpha_composite(canvas, layer)
    return unpremul(canvas)


if __name__ == "__main__":
    import os
    os.makedirs(H, exist_ok=True)
    O = "/tmp/opencode/uniqfx/hd/"
    A, B, C, D = (O + f"out{s}.png" for s in "ABCD")

    sink = fit(key(quad(A, 0), MAG), fill=0.99)
    save(over(sink, grad(1024, [(0, (6, 4, 2, 1)), (0.06, (6, 4, 2, 1)), (0.5, (40, 28, 18, 0.85)), (1, (60, 44, 30, 0))])), "zone.sinkhole")
    lava = fade(fit(key(quad(A, 1), MAG), fill=1.02), 0.8, 0.99, 0.95)
    save(lava, "zone.lava")
    save(fit(key(quad(A, 2), MAG), fill=0.99), "zone.crater")
    save(fit(key(quad(A, 3), MAG), fill=0.99), "zone.tesla")

    sinkc = fit(key(quad(B, 0), GRN), fill=0.99)
    save(over(sinkc, grad(1024, [(0, (8, 2, 6, 1)), (0.06, (8, 2, 6, 1)), (0.5, (34, 22, 30, 0.85)), (1, (50, 40, 48, 0))])), "zone.sinkhole@colossus")
    save(fade(fit(key(quad(B, 1), GRN), fill=1.02), 0.8, 0.99, 0.95), "zone.lava@colossus")
    save(fade(fit(key(quad(B, 2), GRN), fill=1.02), 0.8, 0.99, 0.85), "zone.tesla@calliope")

    for q, name in [(0, "zone.bramble"), (1, "zone.bramble@suntotem")]:
        a = key(quad(C, q), MAG)
        a[..., 3] = 255
        save(fade(a, 0.7, 0.99, 0.95), name)
    save(fit(key(quad(C, 2), MAG), fill=0.99), "zone.crater@sporeblight")
    save(fit(key(quad(C, 3), MAG), fill=0.99), "raider.smokeRing@sporeblight", 512)

    save(fit(key(quad(D, 0), GRN), fill=0.99), "wren.spiral", 512)
    save(fit(key(quad(D, 1), GRN), fill=0.99), "wren.spiral@starfall", 512)
    save(fit(key(quad(D, 2), GRN), fill=0.99), "engineer.gear@calliope", 512)

    pcs = pieces(key(quad(B, 3), GRN)) + pieces(key(quad(D, 3), GRN))
    print("pieces", len(pcs))
    ring = ring_of(pcs)
    soot = grad(1024, [(0, (30, 24, 28, 0.0)), (0.6, (30, 24, 28, 0.0)), (0.88, (36, 28, 34, 0.45)), (0.99, (36, 28, 34, 0))])
    save(over(ring, soot), "warlord.crackRing@colossus")

    for base, name, stops, mul in [
        ("summoner.hex", "zone.bones", [(0, (30, 14, 40, 0.85)), (0.08, (30, 14, 40, 0.85)), (1, (30, 14, 40, 0))], 1.0),
        ("summoner.hex@shadowplay", "zone.bones@shadowplay", [(0, (30, 14, 40, 0.85)), (0.08, (30, 14, 40, 0.85)), (1, (30, 14, 40, 0))], 1.0),
        ("warden.rune", "zone.grove", [(0, (120, 200, 80, 0.45)), (0.08, (120, 200, 80, 0.45)), (0.85, (90, 160, 60, 0.35)), (1, (90, 160, 60, 0))], 0.8),
        ("warden.rune@suntotem", "zone.grove@suntotem", [(0, (120, 200, 80, 0.45)), (0.08, (120, 200, 80, 0.45)), (0.85, (90, 160, 60, 0.35)), (1, (90, 160, 60, 0))], 0.8),
    ]:
        top = load_hq(base)
        top[..., 3] *= mul
        save(fade(over(top, grad(1024, stops)), 0.985, 1.0), name)
