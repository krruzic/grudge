"""Props for the land around each arena (see src/sim/surround.ts for the layout).

Each builder takes the MapBuilder and one feature dict from grid.json["surround"]["features"].
Local frame: x right, y up, z forward (game axes); `place` turns it into Blender space.
"""
import math
import random

import bmesh
from mathutils import Matrix, Vector


def G(x, y, z):
    return Vector((x, -z, y))


def place(f, s=None):
    s = f.get("s", 1.0) if s is None else s
    return Matrix.Translation(G(f["x"], f["y"], f["z"])) @ Matrix.Rotation(f.get("rot", 0.0), 4, "Z") @ Matrix.Scale(s, 4)


def local(x, y, z):
    return Matrix.Translation(Vector((x, -z, y)))


def pt(M, x, y, z):
    return M @ Vector((x, -z, y))


def oface(B, pts, mat, inner, col=(1, 1, 1), cols=None, uvs=None):
    n = Vector((0, 0, 0))
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    c = sum(pts, Vector((0, 0, 0))) / len(pts)
    if n.dot(c - inner) < 0:
        pts = list(reversed(pts))
        cols = list(reversed(cols)) if cols else None
        uvs = list(reversed(uvs)) if uvs else None
    B.face(pts, mat, col=col, cols=cols, uvs=uvs)


def shade(col, lo=0.72):
    return lambda p, c=col: tuple(v * (lo + (1 - lo) * min(1.0, max(0.0, p.z))) for v in c)


def cube(B, M, cx, cy, cz, w, h, d, mat, col=(1, 1, 1), ry=0.0, rx=0.0, rz=0.0, lo=0.75):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    m = M @ local(cx, cy + h / 2, cz) @ Matrix.Rotation(ry, 4, "Z") @ Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(rz, 4, "Y") @ Matrix.Diagonal((w, d, h, 1))
    base = (M @ Vector((0, 0, 0))).z
    B.add_bm(bm, mat, matrix=m, col_fn=lambda p: tuple(c * (lo + (1 - lo) * min(1, max(0, (p.z - base) / max(cy + h, 0.5)))) for c in col))


def cyl(B, M, cx, cy, cz, r0, r1, h, mat, col=(1, 1, 1), seg=8, caps=True, rx=0.0, ry=0.0, uv=None, lo=0.75):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=seg, radius1=r0, radius2=r1, depth=h)
    m = M @ local(cx, cy, cz) @ Matrix.Rotation(ry, 4, "Z") @ Matrix.Rotation(rx, 4, "X") @ Matrix.Translation(Vector((0, 0, h / 2)))
    base = (M @ Vector((0, 0, 0))).z
    B.add_bm(bm, mat, matrix=m, uv_fn=uv, col_fn=lambda p: tuple(c * (lo + (1 - lo) * min(1, max(0, (p.z - base) / max(cy + h, 0.5)))) for c in col))


def blob(B, M, cx, cy, cz, sx, sy, sz, mat, col=(1, 1, 1), seed=0, sub=1, jit=0.12):
    r = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    for v in bm.verts:
        v.co *= 1.0 + r.uniform(-jit, jit)
    m = M @ local(cx, cy, cz) @ Matrix.Diagonal((sx, sz, sy, 1))
    top = (M @ Vector((0, 0, cy + sy))).z
    bot = (M @ Vector((0, 0, cy - sy))).z
    B.add_bm(bm, mat, matrix=m, col_fn=lambda p: tuple(c * (0.62 + 0.38 * min(1, max(0, (p.z - bot) / max(top - bot, 0.1)))) for c in col))


def gable(B, M, cx, cy, cz, w, d, h, mat, col=(1, 1, 1)):
    hw, hd = w / 2, d / 2
    inner = pt(M, cx, cy + h * 0.3, cz)
    for xx in (cx - hw, cx + hw):
        oface(B, [pt(M, xx, cy, cz - hd), pt(M, xx, cy, cz + hd), pt(M, xx, cy + h, cz)], mat, inner, col=col)


PLASTER = (1.4, 1.26, 1.0)
TEAM = [(0.35, 0.5, 1.0), (1.0, 0.42, 0.34), (1.0, 0.86, 0.3), (0.38, 0.95, 0.42)]


def house(mb, f):
    P = mb.props
    M = place(f)
    r = random.Random(f["seed"])
    w, d, h = 4.2 + r.uniform(-0.4, 0.6), 3.4 + r.uniform(-0.2, 0.4), 2.3 + r.uniform(0, 0.5)
    cube(P, M, 0, -0.4, 0, w + 0.2, 0.5, d + 0.2, "brick", (0.85, 0.82, 0.78))
    cube(P, M, 0, 0, 0, w, h, d, "cloth", PLASTER)
    for sx in (-1, 1):
        for sz in (-1, 1):
            cube(P, M, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), 0.24, h, 0.24, "wood", (0.7, 0.6, 0.5))
    cube(P, M, 0, h - 0.18, -d / 2 - 0.03, w, 0.2, 0.12, "wood", (0.7, 0.6, 0.5))
    cube(P, M, 0, 0, -d / 2 - 0.06, 0.9, 1.6, 0.12, "wood", (0.75, 0.65, 0.55))
    for sx in (-1, 1):
        cube(P, M, sx * w * 0.28, h * 0.45, -d / 2 - 0.05, 0.6, 0.6, 0.1, "iron", (0.35, 0.35, 0.42))
    thatch = r.random() < 0.55
    rc = (1, 1, 1) if thatch else (1.05, 1.0, 0.95)
    gable(P, M, 0, h, 0, w, d, 1.6, "cloth", PLASTER)
    prism_roof_x(P, M, 0, h, 0, w, d, 1.7, "thatch" if thatch else "roof", rc)
    if r.random() < 0.7:
        cube(P, M, w * 0.3, h + 0.6, d * 0.15, 0.5, 1.6, 0.5, "brick", (0.8, 0.75, 0.7))


def prism_roof_x(B, M, cx, cy, cz, w, d, h, mat, col=(1, 1, 1), over=0.35):
    hw, hd = w / 2 + over, d / 2 + over
    a = [pt(M, cx - hw, cy - 0.05, cz - hd), pt(M, cx + hw, cy - 0.05, cz - hd), pt(M, cx + hw, cy - 0.05, cz + hd), pt(M, cx - hw, cy - 0.05, cz + hd)]
    r0, r1 = pt(M, cx - hw, cy + h, cz), pt(M, cx + hw, cy + h, cz)
    inner = pt(M, cx, cy - 1.0, cz)
    dark = tuple(c * 0.72 for c in col)
    oface(B, [a[0], a[1], r1, r0], mat, inner, cols=[dark, dark, col, col], uvs=[(0, 0), (w / 2, 0), (w / 2, h / 2), (0, h / 2)])
    oface(B, [a[2], a[3], r0, r1], mat, inner, cols=[dark, dark, col, col], uvs=[(0, 0), (w / 2, 0), (w / 2, h / 2), (0, h / 2)])
    oface(B, [a[0], r0, a[3]], mat, inner, cols=[dark, col, dark])
    oface(B, [a[1], a[2], r1], mat, inner, cols=[dark, dark, col])


def barn(mb, f):
    P = mb.props
    M = place(f)
    w, d, h = 6.5, 4.6, 3.0
    cube(P, M, 0, -0.3, 0, w, h + 0.3, d, "wood", (0.9, 0.62, 0.5))
    cube(P, M, 0, 0, -d / 2 - 0.05, 2.2, 2.4, 0.12, "wood", (0.6, 0.45, 0.35))
    gable(P, M, 0, h, 0, w, d, 2.0, "wood", (0.85, 0.6, 0.48))
    prism_roof_x(P, M, 0, h, 0, w, d, 2.0, "thatch", (0.95, 0.95, 0.95))


def gatehouse(mb, f):
    P = mb.props
    M = place(f)
    side = f.get("side", 0)
    for sx in (-1, 1):
        cyl(P, M, sx * 3.0, -0.6, 0, 1.5, 1.35, 6.2, "brick", (0.95, 0.93, 0.9), seg=8)
        cyl(P, M, sx * 3.0, 5.6, 0, 1.75, 0.0, 2.4, "cloth", TEAM[side], seg=8)
    cube(P, M, 0, 2.8, 0, 4.6, 2.4, 2.2, "brick", (0.95, 0.93, 0.9))
    for i in range(4):
        cube(P, M, -1.8 + i * 1.2, 5.2, -1.0, 0.5, 0.5, 0.5, "brick")
    cube(P, M, 0, -0.4, -1.0, 2.6, 3.4, 0.25, "wood", (0.6, 0.48, 0.38))
    cube(P, M, 0, 1.0, -1.15, 2.4, 0.15, 0.1, "iron", (0.4, 0.4, 0.45))
    cube(P, M, 0, 2.2, -1.15, 2.4, 0.15, 0.1, "iron", (0.4, 0.4, 0.45))
    tc = TEAM[side]
    for sx in (-1, 1):
        a = pt(M, sx * 1.6 - 0.5, 5.0, -1.25)
        b = pt(M, sx * 1.6 + 0.5, 5.0, -1.25)
        c = pt(M, sx * 1.6 + 0.5, 2.6, -1.25)
        d = pt(M, sx * 1.6 - 0.5, 2.6, -1.25)
        P.face([a, b, c, d], "cloth", uvs=[(0, 1), (1, 1), (1, 0), (0, 0)], cols=[tc] * 4)
        P.face([d, c, b, a], "cloth", uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], cols=[tc] * 4)


def bridge(mb, f):
    P = mb.props
    M = place(f, 1.0)
    L = f.get("w", 8)
    wl = mb.g["waterLevel"]
    rise = 1.2
    seg = 8
    for i in range(seg):
        z0 = -L / 2 + L * i / seg
        z1 = -L / 2 + L * (i + 1) / seg
        y0 = rise * math.sin(math.pi * i / seg)
        y1 = rise * math.sin(math.pi * (i + 1) / seg)
        ym = (y0 + y1) / 2
        cube(P, M, 0, ym - 0.25 + 0.2, (z0 + z1) / 2, 2.8, 0.5, (z1 - z0) + 0.02, "cobble", (0.9, 0.9, 0.88))
        for sx in (-1, 1):
            cube(P, M, sx * 1.35, ym + 0.2, (z0 + z1) / 2, 0.3, 0.55, (z1 - z0) + 0.02, "brick")
    for sz in (-1, 1):
        cube(P, M, 0, wl - f["y"] - 0.5, sz * (L / 2 - 0.6), 3.0, f["y"] - wl + 0.7, 1.2, "brick", (0.8, 0.8, 0.78))


def well(mb, f):
    P = mb.props
    M = place(f)
    cyl(P, M, 0, -0.2, 0, 0.9, 0.9, 0.9, "brick", seg=10)
    cyl(P, M, 0, 0.6, 0, 0.7, 0.7, 0.05, "iron", (0.15, 0.2, 0.3), seg=10)
    for sx in (-1, 1):
        cube(P, M, sx * 0.75, 0.6, 0, 0.14, 1.5, 0.14, "wood")
    prism_roof_x(P, M, 0, 2.1, 0, 1.8, 1.2, 0.7, "thatch", over=0.15)


def windmill(mb, f):
    P = mb.props
    M = place(f)
    cyl(P, M, 0, -0.4, 0, 2.3, 1.5, 7.5, "cloth", PLASTER, seg=8)
    cyl(P, M, 0, 7.1, 0, 1.9, 0.0, 2.2, "thatch", seg=8)
    cube(P, M, 0, 0, -1.9, 1.0, 1.8, 0.4, "wood", (0.7, 0.55, 0.45))
    hub = Vector((0, 6.4, -2.0))
    a0 = f["seed"] * 0.7
    for i in range(4):
        a = a0 + i * math.pi / 2
        R = M @ local(hub.x, hub.y, hub.z) @ Matrix.Rotation(a, 4, "Y")
        cube(P, R, 0, 0, 0, 0.18, 4.6, 0.12, "wood", (0.6, 0.48, 0.38))
        for k in range(2):
            pts = [pt(R, 0.12, 1.0 + k * 1.8, 0.0), pt(R, 1.05, 1.0 + k * 1.8, 0.0), pt(R, 1.05, 2.7 + k * 1.8, 0.0), pt(R, 0.12, 2.7 + k * 1.8, 0.0)]
            P.face(pts, "cloth", uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], col=(0.95, 0.92, 0.85))
            P.face(list(reversed(pts)), "cloth", uvs=[(0, 1), (1, 1), (1, 0), (0, 0)], col=(0.85, 0.82, 0.75))


def hedge(mb, f):
    M = place(f)
    blob(mb.props, M, 0, 0.55, 0, 0.75, 0.62, 1.25, "leaves", (0.72, 0.85, 0.66), seed=f["seed"], sub=1)


def fence(mb, f):
    P = mb.props
    M = place(f)
    cube(P, M, 0, -0.1, -1.1, 0.14, 1.2, 0.14, "wood", (0.75, 0.65, 0.55))
    for y in (0.45, 0.85):
        cube(P, M, 0, y, 0, 0.08, 0.12, 2.3, "wood", (0.8, 0.7, 0.6))


def wheat(mb, f):
    x, z, y = f["x"], f["z"], f["y"] - 0.05
    r = random.Random(f["seed"])
    for i in range(3):
        a = f.get("rot", 0) + i * math.pi / 3 + r.uniform(-0.2, 0.2)
        dx, dz = math.cos(a) * 0.8, math.sin(a) * 0.8
        hgt = 0.85 + r.uniform(0, 0.25)
        pts = [G(x - dx, y, z - dz), G(x + dx, y, z + dz), G(x + dx, y + hgt, z + dz), G(x - dx, y + hgt, z - dz)]
        mb.grass.face(pts, "tallgrass", uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], cols=[(0.8, 0.62, 0.3), (0.8, 0.62, 0.3), (1.25, 1.05, 0.5), (1.25, 1.05, 0.5)])


def haystack(mb, f):
    M = place(f)
    cyl(mb.props, M, 0, -0.1, 0, 1.0, 1.0, 0.9, "thatch", seg=8)
    cyl(mb.props, M, 0, 0.8, 0, 1.05, 0.0, 1.1, "thatch", seg=8)


def bush(mb, f):
    M = place(f)
    blob(mb.props, M, 0, 0.4, 0, 0.8, 0.6, 0.8, "leaves", (0.7, 0.85, 0.6), seed=f["seed"], sub=1)


def tree_like(mb, f):
    d = box_dist(mb, f["x"], f["z"])
    s = f.get("s", 1.0)
    y = f["y"] - 0.3
    if f["t"] == "pine":
        if d > 40:
            pine_lo(mb, f["x"], y, f["z"], s, f["seed"])
        else:
            mb.pine(f["x"], y, f["z"], s, f["seed"])
    else:
        if d > 40:
            tree_lo(mb, f["x"], y, f["z"], s, f["seed"])
        else:
            mb.tree(f["x"], y, f["z"], s, f["seed"])


def box_dist(mb, x, z):
    dx = max(0 - x, 0, x - mb.W)
    dz = max(0 - z, 0, z - mb.D)
    return math.hypot(dx, dz)


def pine_lo(mb, x, y, z, s, seed):
    M = Matrix.Translation(G(x, y, z)) @ Matrix.Rotation(seed, 4, "Z") @ Matrix.Scale(s, 4)
    cyl(mb.props, M, 0, 0, 0, 0.2, 0.14, 0.9, "bark", seg=4, caps=False)
    cyl(mb.props, M, 0, 0.6, 0, 1.15, 0.35, 1.6, "pine", (0.75, 0.75, 0.75), seg=6, caps=False)
    cyl(mb.props, M, 0, 1.9, 0, 0.8, 0.0, 1.7, "pine", seg=6, caps=False)


def tree_lo(mb, x, y, z, s, seed):
    M = Matrix.Translation(G(x, y, z)) @ Matrix.Rotation(seed, 4, "Z") @ Matrix.Scale(s, 4)
    cyl(mb.props, M, 0, 0, 0, 0.24, 0.16, 1.6, "bark", seg=5, caps=False)
    blob(mb.props, M, 0, 2.2, 0, 1.25, 1.05, 1.2, "leaves", seed=seed, sub=1)


def rock(mb, f):
    mb.rock(f["x"], f["z"], 0.6 * f.get("s", 1.0), seed=f["seed"], y=f["y"])


def banner(mb, f):
    mb.banner(f["x"], f["z"], f.get("side", 0))


def rubble(mb, f):
    M = place(f)
    r = random.Random(f["seed"])
    for i in range(4):
        cube(mb.props, M, r.uniform(-1, 1), -0.15, r.uniform(-1, 1), r.uniform(0.4, 0.8), r.uniform(0.25, 0.5), r.uniform(0.4, 0.8), "brick", (0.85, 0.82, 0.78), ry=r.uniform(0, 3), rx=r.uniform(-0.3, 0.3))
    mb.rock(f["x"] + r.uniform(-0.8, 0.8), f["z"] + r.uniform(-0.8, 0.8), 0.35, seed=f["seed"], y=f["y"])


def ruinwall(mb, f):
    M = place(f, 1.0)
    h = f.get("h", 2.0)
    r = random.Random(f["seed"])
    cube(mb.props, M, 0, -0.5, 0, 1.0, h * 0.7 + 0.5, 2.1, "brick", (0.92, 0.9, 0.86))
    cube(mb.props, M, 0, h * 0.7 - 0.5, -0.5 + r.uniform(-0.2, 0.2), 1.0, h * 0.3 + 0.5, 1.0, "brick", (0.92, 0.9, 0.86))
    if r.random() < 0.4:
        cube(mb.props, M, 0, h * 0.7, 0.55, 0.9, 0.45, 0.9, "brick", (0.9, 0.9, 0.86))


def ruintower(mb, f):
    M = place(f)
    r = random.Random(f["seed"])
    seg = 10
    for i in range(seg):
        a = i / seg * math.tau
        hh = 3.0 + r.uniform(0, 4.5) * (0.4 + 0.6 * abs(math.sin(a * 1.5 + f["seed"])))
        R = M @ local(math.cos(a) * 2.1, 0, math.sin(a) * 2.1) @ Matrix.Rotation(-a, 4, "Z")
        cube(mb.props, R, 0, -0.6, 0, 0.9, hh, 1.4, "brick", (0.9, 0.88, 0.84))


def column(mb, f):
    M = place(f)
    if f.get("h", 0.5) > 0.45:
        hh = 1.2 + f.get("h", 0.5) * 2.6
        cube(mb.props, M, 0, -0.2, 0, 1.0, 0.4, 1.0, "cobble")
        cyl(mb.props, M, 0, 0.2, 0, 0.36, 0.33, hh, "cobble", (0.95, 0.93, 0.88), seg=8)
    else:
        cyl(mb.props, M, 0, 0.3, -1.4, 0.36, 0.36, 2.8, "cobble", (0.95, 0.93, 0.88), seg=8, rx=math.pi / 2)
        cube(mb.props, M, 0, -0.1, 1.6, 0.9, 0.5, 0.9, "cobble")


def grave(mb, f):
    M = place(f)
    cube(mb.props, M, 0, -0.1, 0.4, 1.0, 0.25, 1.8, "dirt", (0.8, 0.75, 0.7))
    cube(mb.props, M, 0, -0.1, -0.5, 0.75, 1.05, 0.18, "cliff", (0.95, 0.95, 1.0), rx=0.1 * (f["seed"] % 3 - 1))


def deadtree(mb, f):
    M = place(f)
    r = random.Random(f["seed"])
    cyl(mb.props, M, 0, -0.2, 0, 0.26, 0.12, 3.2, "bark", (0.75, 0.72, 0.7), seg=5, caps=False)
    for i in range(3 + r.randrange(2)):
        a = r.uniform(0, math.tau)
        y = 1.4 + r.uniform(0, 1.4)
        R = M @ local(0, y, 0) @ Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(r.uniform(0.6, 1.0), 4, "X")
        cyl(mb.props, R, 0, 0, 0, 0.1, 0.03, r.uniform(1.0, 1.7), "bark", (0.75, 0.72, 0.7), seg=4, caps=False)


def ruinhouse(mb, f):
    M = place(f)
    r = random.Random(f["seed"])
    w, d = 4.5, 3.6
    cube(mb.props, M, 0, -0.3, -d / 2, w, 0.8 + r.uniform(1, 2.2), 0.4, "brick")
    cube(mb.props, M, -w / 2, -0.3, 0, 0.4, 0.8 + r.uniform(0.6, 2.4), d, "brick")
    cube(mb.props, M, w / 2, -0.3, 0.6, 0.4, 0.8 + r.uniform(0.2, 1.2), d - 1.2, "brick")
    for i in range(2):
        cube(mb.props, M, r.uniform(-1, 1), 1.0 + i * 0.4, r.uniform(-1, 1), 0.15, 0.15, 3.5, "wood", (0.55, 0.5, 0.45), ry=r.uniform(0, 3), rx=r.uniform(0.2, 0.6))


def chapel(mb, f):
    P = mb.props
    M = place(f)
    r = random.Random(f["seed"])
    w, d = 5.0, 9.0
    for sx in (-1, 1):
        for k in range(4):
            z = -d / 2 + 1.1 + k * 2.3
            hh = 3.6 - (k * 0.7 if sx > 0 else r.uniform(0, 1.5))
            cube(P, M, sx * w / 2, -0.3, z, 0.6, hh, 2.3, "brick", (0.95, 0.93, 0.9))
            if k < 3:
                cube(P, M, sx * w / 2, hh - 0.3 - 1.4, z + 1.15, 0.65, 1.4, 0.6, "brick", (0.95, 0.93, 0.9))
    cube(P, M, 0, -0.3, -d / 2, w + 0.6, 5.4, 0.7, "brick", (0.95, 0.93, 0.9))
    cube(P, M, 0, 5.1, -d / 2, 0.7, 1.6, 0.7, "brick", (0.95, 0.93, 0.9))
    cube(P, M, 0, 0.4, -d / 2 - 0.4, 1.2, 2.4, 0.15, "iron", (0.12, 0.12, 0.14))
    cube(P, M, 0, -0.3, d / 2, w + 0.6, 1.4 + r.uniform(0, 1.4), 0.7, "brick", (0.95, 0.93, 0.9))
    for i in range(3):
        cube(P, M, r.uniform(-1.5, 1.5), 0.3 + i * 0.5, r.uniform(-2, 2), 0.18, 0.18, 4.5, "wood", (0.55, 0.5, 0.45), ry=r.uniform(-0.5, 0.5), rx=r.uniform(0.15, 0.5))
    for i in range(3):
        cube(P, M, r.uniform(-1.8, 1.8), -0.2, r.uniform(-3, 3), 0.7, 0.4, 0.7, "brick", ry=r.uniform(0, 3))


def quay(mb, f):
    M = place(f, 1.0)
    L = f.get("w", 30)
    wl = mb.g["waterLevel"]
    top = max(f["y"], wl + 1.6)
    cube(mb.props, M, 0, wl - f["y"] - 2.0, 0, 4.0, top - wl + 2.0, L, "brick", (0.85, 0.82, 0.78))
    cube(mb.props, M, 0, top - f["y"], 0, 4.1, 0.15, L, "cobble")
    for i in range(int(L // 4)):
        cube(mb.props, M, -1.6, top - f["y"] + 0.15, -L / 2 + 2 + i * 4, 0.35, 0.5, 0.35, "iron", (0.4, 0.4, 0.42))


def pier(mb, f):
    M = place(f, 1.0)
    L = f.get("w", 16)
    wl = mb.g["waterLevel"]
    deck = wl + 1.4 - f["y"]
    cube(mb.props, M, 0, deck, L / 2, 2.4, 0.18, L, "wood", (0.85, 0.75, 0.65))
    for i in range(int(L // 3) + 1):
        for sx in (-1, 1):
            cube(mb.props, M, sx * 1.1, wl - f["y"] - 2.5, i * 3, 0.24, deck + 2.6 - (wl - f["y"]), 0.24, "wood", (0.6, 0.5, 0.42))


def boat(mb, f):
    wl = mb.g["waterLevel"]
    M = Matrix.Translation(G(f["x"], wl, f["z"])) @ Matrix.Rotation(f.get("rot", 0), 4, "Z") @ Matrix.Scale(f.get("s", 1.0), 4)
    P = mb.props
    rings = [(-2.6, 0.2, 0.3), (-1.6, 0.9, 0.5), (0, 1.15, 0.55), (1.6, 0.95, 0.5), (2.8, 0.15, 0.8)]
    prev = None
    for z, hw, hy in rings:
        cur = [pt(M, -hw, hy, z), pt(M, hw, hy, z), pt(M, hw * 0.6, -0.5, z), pt(M, -hw * 0.6, -0.5, z)]
        if prev:
            mid = pt(M, 0, 0.1, (z + pz) / 2)
            for k in range(1, 4):
                a, b = prev[k], prev[(k + 1) % 4]
                c, d = cur[(k + 1) % 4], cur[k]
                oface(P, [a, b, c, d], "wood", mid, col=(0.95, 0.78, 0.6) if k != 2 else (0.6, 0.48, 0.38))
            oface(P, [prev[0], prev[1], cur[1], cur[0]], "wood", pt(M, 0, -1.0, (z + pz) / 2), col=(0.7, 0.58, 0.45))
        prev = cur
        pz = z
    cube(P, M, 0, 0.0, 0, 0.12, 4.2, 0.12, "wood", (0.6, 0.5, 0.4))
    tc = TEAM[f.get("side", 0)]
    sail = [pt(M, 0.05, 1.0, -1.3), pt(M, 0.05, 1.0, 1.4), pt(M, 0.05, 4.0, 0.2)]
    P.face(sail, "cloth", uvs=[(0, 0), (1, 0), (0.5, 1)], cols=[tuple(c * 0.85 for c in tc), tuple(c * 0.85 for c in tc), tc])
    P.face(list(reversed(sail)), "cloth", uvs=[(0.5, 1), (1, 0), (0, 0)], cols=[tc, tuple(c * 0.85 for c in tc), tuple(c * 0.85 for c in tc)])


def lighthouse(mb, f):
    M = place(f)
    P = mb.props
    blob(P, M, 0, -1.0, 0, 5.0, 2.6, 4.5, "cliff", (0.85, 0.85, 0.85), seed=f["seed"], sub=1, jit=0.25)
    bands = 5
    for i in range(bands):
        r0 = 1.9 - i * 0.22
        r1 = 1.9 - (i + 1) * 0.22
        col = (1.1, 1.08, 1.0) if i % 2 == 0 else (1.0, 0.35, 0.3)
        cyl(P, M, 0, 1.0 + i * 2.0, 0, r0, r1, 2.0, "cloth", col, seg=10, caps=False)
    top = 1.0 + bands * 2.0
    cyl(P, M, 0, top, 0, 1.6, 1.6, 0.25, "iron", (0.4, 0.4, 0.45), seg=10)
    cyl(P, M, 0, top + 0.25, 0, 0.95, 0.95, 1.3, "gold", (1.4, 1.3, 0.8), seg=8)
    cyl(P, M, 0, top + 1.55, 0, 1.3, 0.0, 1.3, "roof", (0.7, 0.3, 0.25), seg=8)
    mb.fx.append(("fx_glow", (f["x"], f["y"] + (top + 0.9) * f.get("s", 1.0), f["z"])))


def wreck(mb, f):
    M = place(f)
    P = mb.props
    R = M @ Matrix.Rotation(0.5, 4, "Y") @ Matrix.Rotation(0.15, 4, "X")
    for i in range(7):
        z = -3 + i
        for sx in (-1, 1):
            cyl(P, R, sx * 0.2, -0.3, z, 0.1, 0.07, 1.9 - abs(z) * 0.15, "wood", (0.55, 0.45, 0.38), seg=4, caps=False, rx=0, ry=0)
            cube(P, R, sx * 0.9, 0.3, z, 0.12, 1.4 - abs(z) * 0.12, 0.15, "wood", (0.55, 0.45, 0.38), rz=sx * 0.3)
    cube(P, R, 0, -0.5, 0, 0.5, 0.35, 7.2, "wood", (0.5, 0.42, 0.35))
    cube(P, R, -0.8, -0.2, -1.0, 0.1, 1.0, 3.0, "wood", (0.6, 0.5, 0.42), rz=-0.35)
    cyl(P, R, 0, 0, 0.5, 0.12, 0.1, 3.2, "wood", (0.5, 0.42, 0.35), seg=5, rx=0.7)


def hut(mb, f):
    P = mb.props
    M = place(f)
    cube(P, M, 0, -0.2, 0, 3.0, 2.0, 2.4, "wood", (0.95, 0.82, 0.7))
    gable(P, M, 0, 1.8, 0, 3.0, 2.4, 1.2, "wood", (0.9, 0.78, 0.66))
    prism_roof_x(P, M, 0, 1.8, 0, 3.0, 2.4, 1.2, "thatch", over=0.3)
    cube(P, M, 0, -0.1, -1.22, 0.7, 1.3, 0.08, "wood", (0.5, 0.42, 0.35))
    for i in range(3):
        cube(P, M, 1.9, -0.1, -0.8 + i * 0.6, 0.5, 0.45, 0.5, "wood", (0.7, 0.6, 0.5), ry=i)


def shells(mb, f):
    M = place(f)
    r = random.Random(f["seed"])
    for i in range(4):
        blob(mb.props, M, r.uniform(-0.8, 0.8), -0.05, r.uniform(-0.8, 0.8), 0.18, 0.08, 0.14, "cloth", (1.2, 1.1, 1.0), seed=f["seed"] + i, sub=0)


def stilthut(mb, f):
    M = place(f)
    P = mb.props
    wl = mb.g["waterLevel"]
    floor = max(0.0, wl + 1.8 - f["y"])
    for sx in (-1, 1):
        for sz in (-1, 1):
            cube(P, M, sx * 1.3, -1.0, sz * 1.1, 0.22, floor + 1.1, 0.22, "wood", (0.6, 0.5, 0.42))
    cube(P, M, 0, floor, 0, 3.2, 0.18, 2.8, "wood", (0.8, 0.7, 0.6))
    cube(P, M, 0, floor + 0.18, 0, 2.6, 1.7, 2.2, "wood", (0.9, 0.78, 0.66))
    gable(P, M, 0, floor + 1.88, 0, 2.6, 2.2, 1.2, "wood", (0.85, 0.72, 0.6))
    prism_roof_x(P, M, 0, floor + 1.88, 0, 2.6, 2.2, 1.2, "thatch", over=0.3)
    cube(P, M, 0, floor + 0.2, -1.12, 0.7, 1.2, 0.08, "wood", (0.5, 0.42, 0.35))


def seastack(mb, f):
    M = place(f)
    r = random.Random(f["seed"])
    wl = mb.g["waterLevel"]
    base = wl - f["y"] - 1.0
    hh = 2.5 + r.uniform(0, 2.5)
    blob(mb.props, M, 0, base + 0.5, 0, 3.4, 1.6, 2.8, "cliff", (1.1, 1.08, 1.04), seed=f["seed"], sub=1, jit=0.28)
    blob(mb.props, M, r.uniform(-0.6, 0.6), base + 1.6 + hh * 0.5, r.uniform(-0.6, 0.6), 2.0, hh * 0.65, 1.8, "cliff", (1.15, 1.12, 1.08), seed=f["seed"] + 1, sub=1, jit=0.25)
    blob(mb.props, M, 0.3, base + 1.6 + hh * 1.05, 0.2, 1.3, 0.4, 1.15, "grass", (0.8, 0.95, 0.7), seed=f["seed"] + 2, sub=1)


def buoy(mb, f):
    wl = mb.g["waterLevel"]
    M = Matrix.Translation(G(f["x"], wl, f["z"])) @ Matrix.Scale(0.8, 4)
    cyl(mb.props, M, 0, -0.4, 0, 0.5, 0.42, 0.8, "cloth", (1.1, 0.3, 0.25), seg=6)
    cyl(mb.props, M, 0, 0.4, 0, 0.42, 0.0, 0.9, "cloth", (1.1, 1.08, 1.0), seg=6)


def posts(mb, f):
    M = place(f)
    r = random.Random(f["seed"])
    for i in range(2 + r.randrange(3)):
        cube(mb.props, M, r.uniform(-1, 1), -0.6, r.uniform(-1, 1), 0.22, 1.2 + r.uniform(0, 1.2), 0.22, "wood", (0.55, 0.47, 0.4), rx=r.uniform(-0.2, 0.2))


def kelp(mb, f):
    x, z, y = f["x"], f["z"], f["y"] - 0.1
    r = random.Random(f["seed"])
    for i in range(3):
        a = r.uniform(0, 3.14)
        dx, dz = math.cos(a) * 0.6, math.sin(a) * 0.6
        pts = [G(x - dx, y, z - dz), G(x + dx, y, z + dz), G(x + dx, y + 0.8, z + dz), G(x - dx, y + 0.8, z - dz)]
        mb.grass.face(pts, "tallgrass", uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], cols=[(0.3, 0.4, 0.2), (0.3, 0.4, 0.2), (0.55, 0.7, 0.35), (0.55, 0.7, 0.35)])


SNOW = (1.35, 1.4, 1.5)


def cabin(mb, f):
    P = mb.props
    M = place(f)
    r = random.Random(f["seed"])
    w, d, h = 4.4, 3.4, 2.2
    cube(P, M, 0, -0.5, 0, w + 0.3, 0.6, d + 0.3, "cliff", (0.85, 0.85, 0.88))
    for i in range(6):
        y = 0.05 + i * h / 6
        cube(P, M, 0, y, -d / 2, w + 0.3, h / 6, 0.3, "bark", (0.85, 0.72, 0.62), lo=0.9)
        cube(P, M, 0, y, d / 2, w + 0.3, h / 6, 0.3, "bark", (0.85, 0.72, 0.62), lo=0.9)
        cube(P, M, -w / 2, y, 0, 0.3, h / 6, d + 0.3, "bark", (0.8, 0.68, 0.58), lo=0.9)
        cube(P, M, w / 2, y, 0, 0.3, h / 6, d + 0.3, "bark", (0.8, 0.68, 0.58), lo=0.9)
    cube(P, M, 0, 0, 0, w - 0.2, h, d - 0.2, "wood", (0.6, 0.5, 0.42))
    cube(P, M, 0, 0, -d / 2 - 0.16, 0.9, 1.6, 0.1, "wood", (0.55, 0.45, 0.36))
    cube(P, M, w * 0.25, h * 0.45, -d / 2 - 0.16, 0.6, 0.55, 0.08, "gold", (1.3, 1.0, 0.5))
    gable(P, M, 0, h, 0, w, d, 1.6, "wood", (0.7, 0.58, 0.48))
    prism_roof_x(P, M, 0, h, 0, w, d, 1.6, "wood", (0.55, 0.45, 0.38), over=0.45)
    prism_roof_x(P, M, 0, h + 0.14, 0, w, d, 1.6, "cloth", SNOW, over=0.4)
    cube(P, M, -w * 0.28, h + 0.5, d * 0.1, 0.55, 1.7, 0.55, "cliff", (0.8, 0.8, 0.82))
    for i in range(r.randrange(1, 3)):
        cube(P, M, w / 2 + 0.6, -0.1, -0.8 + i * 0.7, 0.6, 0.45 + i * 0.3, 0.5, "bark", (0.8, 0.7, 0.6), ry=0.2)


def lantern(mb, f):
    M = place(f)
    cube(mb.props, M, 0, -0.2, 0, 0.16, 2.2, 0.16, "wood", (0.6, 0.5, 0.4))
    cube(mb.props, M, 0, 1.9, -0.25, 0.1, 0.1, 0.6, "wood", (0.6, 0.5, 0.4))
    cube(mb.props, M, 0, 1.45, -0.5, 0.32, 0.42, 0.32, "gold", (1.5, 1.2, 0.6))
    p = pt(M, 0, 1.7, -0.5)
    mb.fx.append(("fx_torch", (p.x, p.z, -p.y)))


def cairn(mb, f):
    M = place(f)
    r = random.Random(f["seed"])
    y = -0.1
    for i in range(4):
        rad = 0.55 - i * 0.1
        blob(mb.props, M, r.uniform(-0.08, 0.08), y + rad * 0.55, r.uniform(-0.08, 0.08), rad, rad * 0.55, rad * 0.9, "cliff", (0.95, 0.95, 0.98), seed=f["seed"] + i, sub=1, jit=0.2)
        y += rad * 1.0
    blob(mb.props, M, 0, -0.05, 0, 0.9, 0.2, 0.9, "cloth", SNOW, seed=f["seed"], sub=1)


def shrine(mb, f):
    P = mb.props
    M = place(f)
    cube(P, M, 0, -0.6, 0, 6.0, 0.8, 5.0, "cliff", (0.9, 0.9, 0.92))
    for sx in (-1, 1):
        for sz in (-1, 1):
            cyl(P, M, sx * 2.2, 0.2, sz * 1.7, 0.28, 0.26, 3.2, "brick", (0.95, 0.93, 0.9), seg=8)
    cube(P, M, 0, 3.4, 0, 5.4, 0.35, 4.4, "brick", (0.95, 0.93, 0.9))
    gable(P, M, 0, 3.75, 0, 5.4, 4.4, 1.4, "brick", (0.95, 0.93, 0.9))
    prism_roof_x(P, M, 0, 3.75, 0, 5.4, 4.4, 1.4, "roof", (0.9, 0.85, 0.8), over=0.4)
    prism_roof_x(P, M, 0, 3.9, 0, 5.4, 4.4, 1.4, "cloth", SNOW, over=0.35)
    cube(P, M, 0, 0.2, 0, 1.2, 1.0, 0.8, "cliff", (1.0, 1.0, 1.0))
    cube(P, M, 0, 1.2, 0, 0.5, 0.5, 0.5, "gold", (1.4, 1.2, 0.6))
    mb.fx.append(("fx_glow", (f["x"], f["y"] + 1.6, f["z"])))


LEAF = (0.62, 0.9, 0.55)
STONE = (1.0, 0.97, 0.9)


def hexcol(h, k=1.25):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 * k for i in (0, 2, 4))


def topiary(mb, f):
    M = place(f)
    r = random.Random(f["seed"])
    cube(mb.props, M, 0, -0.2, 0, 0.9, 0.7, 0.9, "brick", STONE)
    cyl(mb.props, M, 0, 0.5, 0, 0.1, 0.1, 0.6, "bark", (0.8, 0.7, 0.6), seg=5)
    if r.random() < 0.5:
        blob(mb.props, M, 0, 1.6, 0, 0.75, 0.75, 0.75, "leaves", LEAF, seed=f["seed"], sub=1, jit=0.05)
    else:
        cyl(mb.props, M, 0, 0.9, 0, 0.75, 0.0, 2.2, "leaves", LEAF, seg=8)
    blob(mb.props, M, 0, 0.55, 0, 0.42, 0.28, 0.42, "leaves", LEAF, seed=f["seed"] + 1, sub=1)


def urn(mb, f):
    M = place(f)
    cube(mb.props, M, 0, -0.2, 0, 0.8, 0.7, 0.8, "brick", STONE)
    cyl(mb.props, M, 0, 0.5, 0, 0.18, 0.42, 0.55, "brick", STONE, seg=8)
    cyl(mb.props, M, 0, 1.05, 0, 0.42, 0.48, 0.15, "brick", STONE, seg=8)
    blob(mb.props, M, 0, 1.25, 0, 0.42, 0.28, 0.42, "leaves", LEAF, seed=f["seed"], sub=1)
    col = hexcol(["#d8384a", "#f2c84a", "#9a5ad8"][f["seed"] % 3])
    for i in range(5):
        a = i * 1.26
        blob(mb.props, M, math.cos(a) * 0.25, 1.45, math.sin(a) * 0.25, 0.12, 0.1, 0.12, "cloth", col, seed=f["seed"] + i, sub=0)


def flowers(mb, f):
    M = place(f)
    r = random.Random(f["seed"])
    c = f.get("color")
    col = hexcol(c if isinstance(c, str) else ["#d8384a", "#f2c84a", "#e8e0f0", "#9a5ad8", "#ff8a3a"][f["seed"] % 5])
    blob(mb.props, M, 0, 0.12, 0, 0.6, 0.22, 0.6, "leaves", (0.5, 0.78, 0.45), seed=f["seed"], sub=0, jit=0.2)
    for i in range(5):
        x, z = r.uniform(-0.4, 0.4), r.uniform(-0.4, 0.4)
        blob(mb.props, M, x, 0.32, z, 0.13, 0.09, 0.13, "cloth", col, seed=f["seed"] + i + 50, sub=0)


def fountain(mb, f):
    P = mb.props
    M = place(f)
    for i in range(20):
        a0 = i * math.tau / 20
        a1 = (i + 1) * math.tau / 20
        am = (a0 + a1) / 2
        rr = 4.75
        cube(P, M, math.cos(am) * rr, -0.4, math.sin(am) * rr, 0.55, 0.85, rr * (a1 - a0) + 0.08, "brick", STONE, ry=-am)
        cube(P, M, math.cos(am) * rr, 0.45, math.sin(am) * rr, 0.75, 0.14, rr * (a1 - a0) + 0.1, "cobble", (0.95, 0.93, 0.88), ry=-am)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        x, z = math.cos(a) * 4.75, math.sin(a) * 4.75
        cube(P, M, x, -0.3, z, 0.9, 1.3, 0.9, "brick", STONE, ry=a)
        cyl(P, M, x, 1.0, z, 0.3, 0.4, 0.5, "brick", STONE, seg=8)
        blob(P, M, x, 1.65, z, 0.32, 0.26, 0.32, "gold", (1.2, 1.05, 0.7), seed=i, sub=1)
        mb.fx.append(("fx_glow", (f["x"] + x, f["y"] + 1.8, f["z"] + z)))


def gazebo(mb, f):
    P = mb.props
    M = place(f)
    cyl(P, M, 0, -0.4, 0, 3.0, 3.0, 0.7, "cobble", STONE, seg=8)
    for i in range(8):
        a = i * math.pi / 4
        cyl(P, M, math.cos(a) * 2.6, 0.3, math.sin(a) * 2.6, 0.14, 0.14, 2.6, "brick", STONE, seg=6)
    cyl(P, M, 0, 2.9, 0, 3.2, 3.2, 0.3, "brick", STONE, seg=8)
    cyl(P, M, 0, 3.2, 0, 3.3, 0.2, 1.8, "roof", (0.6, 0.8, 0.75), seg=8)
    blob(P, M, 0, 5.1, 0, 0.25, 0.25, 0.25, "gold", (1.3, 1.1, 0.6), seed=1, sub=1)


def manor(mb, f):
    P = mb.props
    M = place(f)
    w, d, h = 16.0, 8.0, 6.0
    cube(P, M, 0, -0.8, 0, w + 1, 1.2, d + 1, "cobble", STONE)
    cube(P, M, 0, 0, 0, w, h, d, "brick", STONE)
    for wx in (-1, 1):
        cube(P, M, wx * (w / 2 + 2.5), 0, 1.5, 5, h + 1.5, d + 3, "brick", (0.98, 0.94, 0.88))
        prism_roof_x(P, M, wx * (w / 2 + 2.5), h + 1.5, 1.5, 5, d + 3, 2.6, "roof", (0.55, 0.62, 0.75), over=0.3)
    prism_roof_x(P, M, 0, h, 0, w, d, 3.2, "roof", (0.55, 0.62, 0.75), over=0.4)
    for i in range(6):
        x = -w / 2 + 1.6 + i * (w - 3.2) / 5
        for y in (1.2, 3.8):
            cube(P, M, x, y, -d / 2 - 0.05, 0.9, 1.4, 0.1, "gold", (1.25, 1.05, 0.6))
    cube(P, M, 0, 0, -d / 2 - 0.08, 1.6, 2.6, 0.12, "wood", (0.6, 0.45, 0.35))
    for sx in (-1, 1):
        cube(P, M, sx * w * 0.3, h + 1.2, 0.5, 0.7, 2.6, 0.7, "brick", (0.9, 0.85, 0.8))
    side = f.get("side", 0)
    if side is not None and 0 <= side < len(TEAM):
        cyl(P, M, 0, h + 3.2, 0, 0.06, 0.06, 3.0, "iron", (0.6, 0.6, 0.6), seg=4)
        cube(P, M, 0.55, h + 5.4, 0, 1.0, 0.7, 0.05, "cloth", TEAM[side])


def hedgerow(mb, f):
    M = place(f)
    ln = f.get("len", 6.0)
    cube(mb.props, M, 0, -0.3, 0, ln, 1.9, 1.1, "leaves", LEAF, lo=0.6)


BUILDERS = {
    "house": house, "barn": barn, "gatehouse": gatehouse, "bridge": bridge, "well": well, "windmill": windmill,
    "hedge": hedge, "fence": fence, "wheat": wheat, "haystack": haystack, "bush": bush, "pine": tree_like, "tree": tree_like,
    "rock": rock, "banner": banner, "rubble": rubble, "ruinwall": ruinwall, "ruintower": ruintower, "column": column,
    "grave": grave, "deadtree": deadtree, "ruinhouse": ruinhouse, "chapel": chapel,
    "quay": quay, "pier": pier, "boat": boat, "lighthouse": lighthouse, "wreck": wreck, "stilthut": stilthut,
    "seastack": seastack, "buoy": buoy, "posts": posts, "kelp": kelp, "hut": hut, "shells": shells, "cabin": cabin, "topiary": topiary, "urn": urn, "flowers": flowers, "fountain": fountain, "gazebo": gazebo, "manor": manor, "hedgerow": hedgerow, "lantern": lantern, "cairn": cairn, "shrine": shrine,
}


def build(mb, features):
    missing = {}
    for f in features:
        fn = BUILDERS.get(f["t"])
        if fn is None:
            missing[f["t"]] = missing.get(f["t"], 0) + 1
            continue
        fn(mb, f)
    return missing
