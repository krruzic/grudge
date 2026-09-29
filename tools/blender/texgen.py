"""Procedural low-res textures for Grudge (N64 / Majora's Mask style).

Pure Python so it runs inside Blender without extra packages. Every
generator returns a flat RGBA float list (row 0 = bottom, Blender order)
and is tileable.
"""
import math
import os
import random

SIZE = 64


def _rng(seed):
    return random.Random(seed)


def hexc(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(lerp(a, b, t) for a, b in zip(c1, c2))


def clamp01(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


class Noise:
    """Tileable value noise with fbm."""

    def __init__(self, seed, period=8):
        r = _rng(seed)
        self.p = period
        self.v = [[r.random() for _ in range(period)] for _ in range(period)]

    def at(self, x, y):
        p = self.p
        x0 = math.floor(x)
        y0 = math.floor(y)
        fx = x - x0
        fy = y - y0
        fx = fx * fx * (3 - 2 * fx)
        fy = fy * fy * (3 - 2 * fy)
        a = self.v[y0 % p][x0 % p]
        b = self.v[y0 % p][(x0 + 1) % p]
        c = self.v[(y0 + 1) % p][x0 % p]
        d = self.v[(y0 + 1) % p][(x0 + 1) % p]
        return lerp(lerp(a, b, fx), lerp(c, d, fx), fy)


def fbm(seed, u, v, base=4, octaves=3):
    total = 0.0
    amp = 0.5
    norm = 0.0
    for o in range(octaves):
        per = base * (2 ** o)
        n = _noise_cache(seed + o, per)
        total += n.at(u * per, v * per) * amp
        norm += amp
        amp *= 0.5
    return total / norm


_cache = {}


def _noise_cache(seed, per):
    key = (seed, per)
    if key not in _cache:
        _cache[key] = Noise(seed, per)
    return _cache[key]


class Canvas:
    def __init__(self, size=SIZE, bg=(0, 0, 0), alpha=1.0):
        self.s = size
        self.px = [[(bg[0], bg[1], bg[2], alpha) for _ in range(size)] for _ in range(size)]

    def set(self, x, y, c, a=1.0):
        s = self.s
        x %= s
        y %= s
        if len(c) == 4:
            a = c[3]
        self.px[y][x] = (c[0], c[1], c[2], a)

    def get(self, x, y):
        return self.px[y % self.s][x % self.s]

    def blend(self, x, y, c, t):
        o = self.get(x, y)
        self.set(x, y, mix(o[:3], c, t), o[3])

    def flat(self):
        out = []
        for row in reversed(self.px):
            for p in row:
                out.extend(p)
        return out


def palette_ramp(stops, t):
    t = clamp01(t)
    for i in range(len(stops) - 1):
        t0, c0 = stops[i]
        t1, c1 = stops[i + 1]
        if t <= t1:
            return mix(c0, c1, (t - t0) / max(1e-6, t1 - t0))
    return stops[-1][1]


def grass(seed=1):
    s = SIZE
    cv = Canvas()
    stops = [(0.0, hexc("#2f6a1c")), (0.45, hexc("#4f9a26")), (0.75, hexc("#79bd34")), (1.0, hexc("#a8d84a"))]
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=4, octaves=3)
            cv.set(x, y, palette_ramp(stops, n * 1.15 - 0.05))
    r = _rng(seed)
    for _ in range(420):
        x = r.randrange(s)
        y = r.randrange(s)
        h = r.randint(2, 4)
        dark = r.random() < 0.55
        col = hexc("#24541a") if dark else hexc("#b4e45c")
        lean = r.choice((-1, 0, 1))
        for i in range(h):
            cv.blend(x + (lean if i == h - 1 else 0), y - i, col, 0.75 - i * 0.12)
    for _ in range(10):
        x = r.randrange(s)
        y = r.randrange(s)
        col = hexc(r.choice(["#fff4a0", "#ffffff", "#ffb0d0"]))
        cv.set(x, y, col)
        cv.blend(x + 1, y, col, 0.5)
    return cv


def dirt(seed=2):
    s = SIZE
    cv = Canvas()
    stops = [(0.0, hexc("#5e3f22")), (0.5, hexc("#8e6538")), (1.0, hexc("#b88c56"))]
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=4, octaves=3)
            cv.set(x, y, palette_ramp(stops, n))
    r = _rng(seed)
    for _ in range(46):
        x = r.randrange(s)
        y = r.randrange(s)
        w = r.randint(1, 3)
        light = mix(hexc("#c9ae84"), hexc("#a89078"), r.random())
        for dx in range(w):
            cv.set(x + dx, y, light)
            cv.blend(x + dx, y + 1, hexc("#3c2814"), 0.6)
    for _ in range(160):
        cv.blend(r.randrange(s), r.randrange(s), hexc("#4a3018"), 0.5)
    return cv


def _voronoi_points(seed, n):
    r = _rng(seed)
    return [(r.random(), r.random(), r.random()) for _ in range(n)]


def cobble(seed=3):
    s = SIZE
    cv = Canvas()
    pts = _voronoi_points(seed, 14)
    for y in range(s):
        for x in range(s):
            u = x / s
            v = y / s
            d1 = d2 = 9.0
            best = None
            for (px, py, pv) in pts:
                for ox in (-1, 0, 1):
                    for oy in (-1, 0, 1):
                        dx = u - (px + ox)
                        dy = v - (py + oy)
                        d = dx * dx + dy * dy
                        if d < d1:
                            d2 = d1
                            d1 = d
                            best = (px + ox, py + oy, pv)
                        elif d < d2:
                            d2 = d
            edge = math.sqrt(d2) - math.sqrt(d1)
            base = mix(hexc("#8d8577"), hexc("#b5ab96"), best[2])
            n = fbm(seed + 9, u, v, base=8, octaves=2)
            col = mix(base, hexc("#6d6558"), n * 0.35)
            hl = (u - best[0]) * -0.6 + (v - best[1]) * -0.6
            col = mix(col, hexc("#d8d0bc"), clamp01(hl) * 0.8)
            if edge < 0.035:
                col = hexc("#3f3a30")
            elif edge < 0.06:
                col = mix(col, hexc("#50493c"), 0.55)
            cv.set(x, y, col)
    return cv


def cliff(seed=4):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            u = x / s
            v = y / s
            band = fbm(seed, u * 0.5, v * 2.0, base=2, octaves=2)
            strata = math.sin((v * 5 + band * 1.6) * math.pi * 2) * 0.5 + 0.5
            n = fbm(seed + 5, u, v, base=8, octaves=3)
            col = mix(hexc("#6e604c"), hexc("#a19078"), strata * 0.6 + n * 0.4)
            if strata < 0.12:
                col = mix(col, hexc("#3a3024"), 0.7)
            elif strata > 0.9:
                col = mix(col, hexc("#c9b99c"), 0.5)
            cv.set(x, y, col)
    r = _rng(seed)
    for _ in range(6):
        x = r.randrange(s)
        y = r.randrange(s)
        for i in range(r.randint(5, 12)):
            cv.set(x, y + i, hexc("#2e261c"))
            if r.random() < 0.3:
                x += r.choice((-1, 1))
    for _ in range(80):
        x = r.randrange(s)
        y = r.randrange(s)
        cv.blend(x, y, hexc("#5c8a2c"), 0.35)
    return cv


def brick(seed=5, tint="#a49680"):
    s = SIZE
    cv = Canvas()
    r = _rng(seed)
    rows = 8
    rh = s // rows
    bw = 16
    base = hexc(tint)
    for row in range(rows):
        off = 0 if row % 2 == 0 else bw // 2
        for bx in range(-1, s // bw + 1):
            shade = 0.82 + r.random() * 0.3
            hue = mix(base, hexc("#8a7c64"), r.random() * 0.5)
            col_b = tuple(clamp01(c * shade) for c in hue)
            for yy in range(rh):
                for xx in range(bw):
                    x = bx * bw + off + xx
                    y = row * rh + yy
                    if yy == 0 or xx == 0:
                        cv.set(x, y, hexc("#3a342a"))
                        continue
                    n = fbm(seed + 3, x / s, y / s, base=8, octaves=2)
                    c = mix(col_b, hexc("#5e5444"), n * 0.4)
                    if yy == rh - 1:
                        c = mix(c, hexc("#e0d4b8"), 0.35)
                    if xx == bw - 1:
                        c = mix(c, hexc("#4a4234"), 0.3)
                    cv.set(x, y, c)
    for _ in range(40):
        cv.blend(r.randrange(s), r.randrange(s), hexc("#5a7a2a"), 0.4)
    return cv


def wood(seed=6):
    s = SIZE
    cv = Canvas()
    r = _rng(seed)
    plank = 16
    for px in range(s // plank):
        tone = mix(hexc("#7a4a24"), hexc("#a8703c"), r.random())
        for y in range(s):
            for xx in range(plank):
                x = px * plank + xx
                grain = math.sin((xx * 0.9 + fbm(seed + px, x / s, y / s, base=2, octaves=2) * 8)) * 0.5 + 0.5
                c = mix(tone, hexc("#5a3418"), grain * 0.35)
                if xx == 0:
                    c = hexc("#2c1a0c")
                elif xx == 1:
                    c = mix(c, hexc("#c8905a"), 0.4)
                cv.set(x, y, c)
        for ny in (4, s - 5):
            cv.set(px * plank + 3, ny, hexc("#302820"))
            cv.set(px * plank + plank - 4, ny, hexc("#302820"))
    return cv


def water(seed=7):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=3, octaves=2)
            m = fbm(seed + 5, x / s, y / s, base=5, octaves=2)
            ripple = 0.5 + 0.5 * math.sin((n * 3.0 + m * 1.5) * math.pi * 2)
            c = palette_ramp([(0.0, hexc("#1f5aa8")), (0.55, hexc("#3a82c8")), (1.0, hexc("#7cb8e8"))], 0.25 + ripple * 0.5 + (m - 0.5) * 0.3)
            cv.set(x, y, c)
    return cv


def leaves(seed=8, dark="#1f4f1c", mid="#3f7f26", light="#8cc043"):
    s = SIZE
    cv = Canvas(bg=hexc(dark))
    r = _rng(seed)
    for _ in range(90):
        cx = r.randrange(s)
        cy = r.randrange(s)
        rad = r.randint(2, 5)
        for dy in range(-rad, rad + 1):
            for dx in range(-rad, rad + 1):
                d = math.sqrt(dx * dx + dy * dy)
                if d <= rad:
                    t = clamp01((-dx - dy) / (rad * 1.6) + 0.4)
                    cv.set(cx + dx, cy + dy, mix(hexc(mid), hexc(light), t * 0.8))
                elif d <= rad + 1:
                    cv.blend(cx + dx, cy + dy, hexc(dark), 0.6)
    return cv


def bark(seed=9):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s * 3, y / s * 0.5, base=4, octaves=2)
            ridge = abs(math.sin((x / s * 6 + n * 2) * math.pi))
            c = mix(hexc("#3c2616"), hexc("#7a5434"), ridge)
            cv.set(x, y, c)
    return cv


def tallgrass(seed=10):
    s = SIZE
    cv = Canvas(bg=(0.25, 0.45, 0.12), alpha=0.0)
    r = _rng(seed)
    blades = []
    for i in range(9):
        cx = 4 + i * (s - 8) / 8 + r.uniform(-2, 2)
        h = r.uniform(0.55, 0.95) * s
        w = r.uniform(5, 8)
        lean = r.uniform(-6, 6)
        blades.append((cx, h, w, lean))
    for y in range(s):
        for x in range(s):
            best = None
            for cx, h, w, lean in blades:
                t = y / h
                if t > 1:
                    continue
                half = w * (1 - t) ** 0.8
                c0 = cx + lean * t * t
                if abs(x - c0) <= half:
                    best = t if best is None else min(best, t)
            if best is not None:
                n = fbm(seed, x / s, y / s, base=4, octaves=2)
                c = mix(hexc("#2e6a1c"), hexc("#8cc848"), min(1, best * 0.9 + n * 0.3))
                cv.set(x, s - 1 - y, c, 1.0)
    return cv


def cloth(seed=11):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=4, octaves=2)
            weave = 0.04 if (x + y) % 2 == 0 else 0.0
            c = mix(hexc("#e8e8e8"), hexc("#b8b8b8"), n * 0.6 + weave)
            cv.set(x, y, c)
    cx = s // 2
    cy = s // 2 + 4
    for y in range(s):
        for x in range(s):
            dx = x - cx
            dy = y - cy
            if abs(dx) + abs(dy) < 14 and abs(dx) + abs(dy) > 10:
                cv.set(x, y, hexc("#f4d060"))
            if abs(dx) < 2 and -8 < dy < 8:
                cv.set(x, y, hexc("#f4d060"))
            if abs(dy) < 2 and -6 < dx < 6:
                cv.set(x, y, hexc("#f4d060"))
    for x in range(s):
        cv.set(x, 0, hexc("#d8b040"))
        cv.set(x, s - 1, hexc("#d8b040"))
    return cv


def gold(seed=12):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=3, octaves=3)
            band = 0.5 + 0.5 * math.sin((y / s + n * 0.4) * math.pi * 4)
            c = palette_ramp([(0.0, hexc("#8a5a10")), (0.5, hexc("#e0a830")), (1.0, hexc("#fff0a0"))], n * 0.7 + band * 0.35)
            cv.set(x, y, c)
    return cv


def iron(seed=13):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=4, octaves=3)
            c = mix(hexc("#34343c"), hexc("#6a6a78"), n)
            cv.set(x, y, c)
    for y in range(4, s, 16):
        for x in range(4, s, 16):
            cv.set(x, y, hexc("#b8b8c8"))
            cv.set(x + 1, y, hexc("#8a8a98"))
            cv.set(x, y - 1, hexc("#1c1c24"))
    return cv


def roof(seed=14):
    s = SIZE
    cv = Canvas()
    r = _rng(seed)
    rows = 8
    rh = s // rows
    for row in range(rows):
        off = 0 if row % 2 == 0 else 4
        for bx in range(-1, s // 8 + 1):
            shade = 0.8 + r.random() * 0.25
            for yy in range(rh):
                for xx in range(8):
                    x = bx * 8 + off + xx
                    y = row * rh + yy
                    t = yy / rh
                    c = tuple(clamp01(v * shade * (0.75 + 0.35 * t)) for v in hexc("#f0ece4"))
                    if xx == 0 or yy == rh - 1:
                        c = hexc("#6a6258")
                    cv.set(x, y, c)
    return cv


def skin(seed=15, base="#6f9a3e", dark="#4a6e28", light="#9cc45a"):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=4, octaves=3)
            c = palette_ramp([(0.0, hexc(dark)), (0.5, hexc(base)), (1.0, hexc(light))], n * 1.2 - 0.1)
            cv.set(x, y, c)
    r = _rng(seed)
    for _ in range(30):
        x = r.randrange(s)
        y = r.randrange(s)
        cv.blend(x, y, hexc(dark), 0.6)
        cv.blend(x + 1, y, hexc(dark), 0.4)
    for _ in range(4):
        x = r.randrange(s)
        y = r.randrange(s)
        for i in range(r.randint(4, 8)):
            cv.set(x + i, y + (i // 3), hexc("#c07a6a"))
    return cv


def leather(seed=16):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=6, octaves=3)
            cv.set(x, y, mix(hexc("#4a2c16"), hexc("#86542c"), n))
    for y in (6, s - 7):
        for x in range(0, s, 4):
            cv.set(x, y, hexc("#d8b890"))
            cv.set(x + 1, y, hexc("#d8b890"))
    return cv


def bone(seed=17):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=4, octaves=2)
            band = (math.sin(y / s * math.pi * 8) * 0.5 + 0.5) * 0.15
            cv.set(x, y, mix(hexc("#e8dcb8"), hexc("#b0a07a"), n * 0.6 + band))
    return cv


def paint(seed=19):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=4, octaves=3)
            cv.set(x, y, mix(hexc("#ffffff"), hexc("#b4b4b4"), n * 0.7))
    r = _rng(seed)
    for _ in range(25):
        x = r.randrange(s)
        y = r.randrange(s)
        cv.blend(x, y, hexc("#606060"), 0.5)
    for y in (0, 1, s - 2, s - 1):
        for x in range(s):
            cv.set(x, y, hexc("#e8c860"))
    return cv


def palette(seed=18):
    s = SIZE
    cv = Canvas()
    cols = ["#ffe060", "#ff4020", "#ffffff", "#101010", "#40ff80", "#80c0ff", "#ff80ff", "#c08040"]
    for y in range(s):
        for x in range(s):
            cv.set(x, y, hexc(cols[(x // 8) % 8]))
    return cv


GENERATORS = {
    "roof": roof,
    "skin": skin,
    "leather": leather,
    "bone": bone,
    "palette": palette,
    "paint": paint,
    "grass": grass,
    "dirt": dirt,
    "cobble": cobble,
    "cliff": cliff,
    "brick": brick,
    "wood": wood,
    "water": water,
    "leaves": leaves,
    "pine": lambda: leaves(21, "#123a24", "#1f5a34", "#4f8f4a"),
    "bark": bark,
    "tallgrass": tallgrass,
    "cloth": cloth,
    "gold": gold,
    "iron": iron,
}


N64_SIZE = 64
N64_COLORS = 16
N64_SKIP = {"palette"}
N64_CRISP = {"tallgrass", "eye"}


def _kmeans16(px, k, iters=12):
    import numpy as np

    lum = px @ np.array([0.3, 0.59, 0.11])
    order = np.argsort(lum)
    centers = px[order[np.linspace(0, len(px) - 1, k).astype(int)]].copy()
    for _ in range(iters):
        d = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for i in range(k):
            m = lab == i
            if m.any():
                centers[i] = px[m].mean(0)
    d = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
    return centers, d.argmin(1)


def n64ify(name, flat, size):
    """N64 CI4 look: 64x64 max, 16-colour palette per texture, RGBA5551 colours, 1-bit alpha. No blur:
    the softness comes from bilinear filtering at render time, like the real hardware."""
    import numpy as np

    a = np.asarray(flat, dtype=np.float32).reshape(size, size, 4)
    if name in N64_SKIP:
        return a, size
    f = max(1, size // N64_SIZE)
    n = size // f
    a = a.reshape(n, f, n, f, 4).mean((1, 3))
    if not name.startswith("face") and name not in N64_CRISP:
        rgb0 = a[..., :3]
        acc = np.zeros_like(rgb0)
        for dy, dx, w in ((0, 0, 0.36), (1, 0, 0.12), (-1, 0, 0.12), (0, 1, 0.12), (0, -1, 0.12), (1, 1, 0.04), (-1, -1, 0.04), (1, -1, 0.04), (-1, 1, 0.04)):
            acc += np.roll(np.roll(rgb0, dy, 0), dx, 1) * w
        m = acc.reshape(-1, 3).mean(0)
        a[..., :3] = m + (acc - m) * 0.85
    rgb = a[..., :3].reshape(-1, 3)
    alpha = (a[..., 3:] > 0.5).astype(np.float32)
    opaque = alpha.reshape(-1) > 0.5
    src = rgb[opaque] if opaque.any() else rgb
    centers, _ = _kmeans16(src, min(N64_COLORS, len(src)))
    centers = np.round(np.clip(centers, 0, 1) * 31) / 31
    d = ((rgb[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
    rgb = centers[d.argmin(1)].reshape(n, n, 3)
    return np.concatenate([rgb, alpha], -1), n


def to_blender_image(name, canvas, out_dir=None):
    import bpy

    px, size = n64ify(name, canvas.flat(), canvas.s)
    img = bpy.data.images.get(name)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=True)
    img.pixels.foreach_set(px.ravel().tolist())
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        img.filepath_raw = os.path.join(out_dir, name + ".png")
        img.file_format = "PNG"
        img.save()
    img.pack()
    return img


def build_all(out_dir=None, names=None):
    import importlib
    import chartex

    importlib.reload(chartex)
    GENERATORS.update(chartex.GENERATORS)
    images = {}
    photo = {}
    if out_dir and os.path.exists(os.path.join(out_dir, "photo.json")):
        import json

        photo = json.load(open(os.path.join(out_dir, "photo.json")))
    for name, gen in GENERATORS.items():
        if names and name not in names:
            continue
        if name in photo:
            images[name] = load_photo(name, out_dir)
            continue
        images[name] = to_blender_image(name, gen(), out_dir)
    return images


def load_photo(name, out_dir):
    import bpy

    img = bpy.data.images.get(name)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.load(os.path.join(out_dir, name + ".png"))
    img.name = name
    img.pack()
    return img
