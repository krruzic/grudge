import math

from texgen import SIZE, Canvas, _rng, fbm, hexc, mix, palette_ramp

CLEAR = (0, 0, 0, 0)


def noise_fill(seed, dark, base, light, scale=4, octaves=3, speck=0):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=scale, octaves=octaves)
            cv.set(x, y, palette_ramp([(0.0, hexc(dark)), (0.5, hexc(base)), (1.0, hexc(light))], n * 1.2 - 0.1))
    r = _rng(seed)
    for _ in range(speck):
        cv.blend(r.randrange(s), r.randrange(s), hexc(dark), 0.5)
    return cv


def flesh(seed=31):
    return noise_fill(seed, "#b77a58", "#e0a47c", "#f4c8a0", speck=12)


def ogre(seed=32):
    return noise_fill(seed, "#5e7a4a", "#86a266", "#a8c084", speck=40)


def grey_ogre(seed=33):
    return noise_fill(seed, "#56685a", "#7a8e7c", "#9cb09c", speck=40)


def goblin(seed=34):
    return noise_fill(seed, "#3f7a2a", "#62a63a", "#8ccc58", speck=24)


def plain(seed=35):
    return noise_fill(seed, "#c8c8c8", "#e4e4e4", "#ffffff", scale=3, octaves=2)


def stone(seed=36):
    cv = noise_fill(seed, "#5a5a60", "#8a8a90", "#b0b0b4", scale=5, speck=60)
    r = _rng(seed)
    for _ in range(6):
        x, y = r.randrange(SIZE), r.randrange(SIZE)
        for i in range(r.randint(5, 12)):
            cv.set(x + i, y + int(math.sin(i) * 2), hexc("#3a3a40"))
    return cv


def steel(seed=40):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s, y / s, base=3, octaves=2)
            band = 0.25 if (y // 8) % 4 == 1 else 0.0
            cv.set(x, y, palette_ramp([(0.0, hexc("#7a8290")), (0.5, hexc("#b8c0cc")), (1.0, hexc("#eef2f8"))], n * 0.9 + band))
    for y in range(4, s, 16):
        for x in range(6, s, 16):
            cv.set(x, y, hexc("#ffffff"))
            cv.set(x + 1, y + 1, hexc("#5a6270"))
    return cv


def hair(seed=37):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s * 4, y / s * 0.5, base=4, octaves=2)
            streak = 0.25 if (x * 7 + int(n * 5)) % 5 == 0 else 0.0
            cv.set(x, y, mix(hexc("#e8e8e8"), hexc("#9a9a9a"), n * 0.7 + streak))
    return cv


def moss_bark(seed=38):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            n = fbm(seed, x / s * 3, y / s * 0.6, base=4, octaves=3)
            groove = 0.35 if (x + int(n * 8)) % 8 < 2 else 0.0
            c = mix(hexc("#8a5a34"), hexc("#3c2412"), n * 0.6 + groove)
            m = fbm(seed + 5, x / s, y / s, base=3, octaves=2)
            if m > 0.62:
                c = mix(c, hexc("#6a9a34"), min(1.0, (m - 0.62) * 5))
            cv.set(x, y, c)
    return cv


def feather(seed=39):
    s = SIZE
    cv = Canvas()
    for y in range(s):
        for x in range(s):
            d = abs(x - s / 2) / (s / 2)
            barb = 0.2 if (y + int(d * 10)) % 4 == 0 else 0.0
            c = mix(hexc("#ffffff"), hexc("#c0c0c0"), d * 0.5 + barb)
            if abs(x - s / 2) < 1:
                c = hexc("#e0d0a0")
            cv.set(x, y, c)
    return cv


def fill_ellipse(cv, cx, cy, rx, ry, c, rot=0.0):
    cs, sn = math.cos(rot), math.sin(rot)
    r = int(max(rx, ry)) + 2
    for y in range(int(cy) - r, int(cy) + r + 1):
        for x in range(int(cx) - r, int(cx) + r + 1):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            u = dx * cs + dy * sn
            v = -dx * sn + dy * cs
            if (u / rx) ** 2 + (v / ry) ** 2 <= 1.0 and 0 <= x < SIZE and 0 <= y < SIZE:
                cv.px[y][x] = (*c[:3], 1.0)


def line(cv, x0, y0, x1, y1, c, w=1):
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        for ox in range(-(w // 2), w - w // 2):
            for oy in range(-(w // 2), w - w // 2):
                xi, yi = int(x + ox), int(y + oy)
                if 0 <= xi < SIZE and 0 <= yi < SIZE:
                    cv.px[yi][xi] = (*c[:3], 1.0)


def eye(cv, cx, cy, rx, ry, pupil, look=(0, 0), white="#ffffff", pr=None, slit=False):
    fill_ellipse(cv, cx, cy, rx + 1, ry + 1, hexc("#1a0e08"))
    fill_ellipse(cv, cx, cy, rx, ry, hexc(white))
    pr = pr or (rx * 0.55, ry * 0.7)
    if slit:
        fill_ellipse(cv, cx + look[0], cy + look[1], pr[0] * 0.45, pr[1] * 1.2, hexc(pupil))
    else:
        fill_ellipse(cv, cx + look[0], cy + look[1], pr[0], pr[1], hexc(pupil))
        cv.px[int(cy + look[1] - pr[1] * 0.4)][int(cx + look[0] - pr[0] * 0.3)] = (1, 1, 1, 1.0)


def face_ogre(seed=0):
    cv = Canvas(bg=(0, 0, 0), alpha=0.0)
    for sx in (-1, 1):
        cx = 32 + sx * 12
        eye(cv, cx, 24, 5, 4, "#201008", look=(-sx, 0))
        line(cv, cx - sx * 10, 15, cx + sx * 7, 20, hexc("#2a1a0e"), 3)
    fill_ellipse(cv, 32, 45, 15, 3, hexc("#3a140c"))
    line(cv, 18, 44, 46, 44, hexc("#1a0806"), 1)
    for sx in (-1, 1):
        fill_ellipse(cv, 32 + sx * 11, 40, 2.5, 5, hexc("#f4ecd0"))
    return cv


def face_dwarf(seed=0):
    cv = Canvas(bg=(0, 0, 0), alpha=0.0)
    for sx in (-1, 1):
        cx = 32 + sx * 11
        eye(cv, cx, 30, 5, 5, "#3a5a9a", look=(0, 1))
        line(cv, cx - 7, 21 - (sx * 1), cx + 7, 22 + sx, hexc("#d8d8d8"), 4)
        fill_ellipse(cv, cx + sx * 4, 41, 4, 3, hexc("#e88a7a"))
    return cv


def face_goblin(seed=0):
    cv = Canvas(bg=(0, 0, 0), alpha=0.0)
    for sx in (-1, 1):
        cx = 32 + sx * 12
        eye(cv, cx, 24, 7, 6, "#1a1004", look=(-sx, 1), white="#ffe040", slit=True)
        line(cv, cx - sx * 11, 13, cx + sx * 8, 18, hexc("#1e3a10"), 3)
    fill_ellipse(cv, 32, 45, 14, 5, hexc("#2a0a06"))
    for i in range(-3, 4):
        x = 32 + i * 4
        line(cv, x - 1, 41, x + 1, 44, hexc("#f8f0d0"), 2)
    return cv


def face_human(seed=0):
    cv = Canvas(bg=(0, 0, 0), alpha=0.0)
    for sx in (-1, 1):
        cx = 32 + sx * 11
        eye(cv, cx, 27, 5, 4, "#3a5a8a", look=(0, 0))
        line(cv, cx - 6 * sx, 18, cx, 16, hexc("#2a1a10"), 2)
        line(cv, cx, 16, cx + 6 * sx, 19, hexc("#2a1a10"), 2)
    line(cv, 27, 47, 34, 47, hexc("#8a3a2a"), 2)
    line(cv, 34, 47, 38, 45, hexc("#8a3a2a"), 2)
    return cv


def face_elder(seed=0):
    cv = Canvas(bg=(0, 0, 0), alpha=0.0)
    for sx in (-1, 1):
        cx = 32 + sx * 11
        eye(cv, cx, 28, 5, 4, "#304a8a", look=(0, 0))
        line(cv, cx - 7, 20, cx + 7, 19, hexc("#5a3a1a"), 3)
    line(cv, 26, 48, 38, 48, hexc("#6a2a1a"), 2)
    return cv


GENERATORS = {
    "flesh": flesh,
    "ogre": ogre,
    "grey_ogre": grey_ogre,
    "goblin": goblin,
    "plain": plain,
    "stone": stone,
    "hair": hair,
    "steel": steel,
    "moss_bark": moss_bark,
    "feather": feather,
    "face_ogre": face_ogre,
    "face_dwarf": face_dwarf,
    "face_goblin": face_goblin,
    "face_human": face_human,
    "face_elder": face_elder,
}
