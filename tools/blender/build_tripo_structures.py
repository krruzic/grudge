"""AI-generated (Tripo) bodies for the damage / control / support towers, exported to assets/structures/<type>.glb.

Run headless: blender -b --python tools/blender/build_tripo_structures.py -- [damage control support]
Sources live in assets/source/tower_<type>_tripo.glb. Each export keeps the node contract of build_structures.py:
  <type>          Tripo body (materials tower_<type>_skin and team_tower_<type>, blue texels greyed for dyeing)
  spin_<type>     procedural part the game spins / bobs (from build_structures)
  level2_<type>   procedural upgrade trim fitted to the new body
  level3_<spec>   procedural spec tops fitted to the new body; level3_ballista carries the Tripo ballista turret
"""
import math
import os
import shutil
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import build_structures as bs  # noqa: E402
import build_tripo_hero as th  # noqa: E402
import build_tripo_props as tp  # noqa: E402
import charkit  # noqa: E402
import texgen  # noqa: E402

TEAM_HUE = (195, 250)
TOWERS = {
    "damage": {"xy": 3.85, "z": 3.6, "tex": 1024, "pivot": (0, 0, 4.2)},
    "control": {"xy": 3.0, "z": 3.0, "tex": 1024, "pivot": (0, 0, 2.55)},
    "support": {"xy": 3.75, "z": 3.6, "tex": 1024, "pivot": (0, 0, 1.4)},
}
BALLISTA_SPAN = 2.5
TURRET_TRIS = 2500
C = bs.C
X = bs.X


class Body:
    def __init__(self, obj):
        me = obj.data
        self.bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
        self.top = max(v.co.z for v in me.vertices)

    def R(self, z, a=None):
        angs = [a] if a is not None else [k / 16 * math.tau for k in range(16)]
        rs = []
        for t in angs:
            d = Vector((math.cos(t), math.sin(t), 0))
            hit = self.bvh.ray_cast(d * 4 + Vector((0, 0, z)), -d, 4)[0]
            if hit is not None:
                rs.append(Vector((hit.x, hit.y, 0)).length)
        return float(np.percentile(rs, 75)) if rs else 0.0

    def span(self, z, a):
        d = Vector((math.cos(a), math.sin(a), 0))
        o = Vector((0, 0, z))
        hin = self.bvh.ray_cast(o, d, 4)[0]
        hout = self.bvh.ray_cast(o + d * 4, -d, 4)[0]
        return ((hin - o).length if hin else 0.0), ((hout - o).length if hout else 0.0)

    def height(self, r, a):
        hit = self.bvh.ray_cast(Vector((math.cos(a) * r, math.sin(a) * r, self.top + 1)), Vector((0, 0, -1)), 10)[0]
        return hit.z if hit is not None else 0.0

    def peaks(self, r, zmin):
        n = 180
        up = [self.height(r, k / n * math.tau) > zmin for k in range(n)]
        start = up.index(False)
        runs, cur = [], []
        for k in range(n + 1):
            i = (start + k) % n
            if up[i] and k < n:
                cur.append(i)
            elif cur:
                runs.append(cur)
                cur = []
        out = []
        for run in runs:
            ang = (np.array(run) + 0.5) / n * math.tau
            out.append(math.atan2(np.sin(ang).sum(), np.cos(ang).sum()) % math.tau)
        return sorted(out)


def load_body(name, cfg):
    w = th.import_prop("tower_" + name, os.path.join(ROOT, "assets", "source", f"tower_{name}_tripo.glb"), tex=cfg["tex"], team_hue=TEAM_HUE)
    me = w.data
    me.transform(Matrix.Rotation(math.radians(-90), 4, "Z"))
    co = np.array([v.co[:] for v in me.vertices])
    mid = (co.min(0) + co.max(0)) / 2
    me.transform(Matrix.Translation((-mid[0], -mid[1], -co[:, 2].min())))
    me.transform(Matrix.Diagonal((cfg["xy"], cfg["xy"], cfg["z"], 1)))
    w.name = name
    me.name = name
    return w


def ballista_turret():
    cfg = tp.PROPS["ballista"]
    w = th.import_prop("tower_ballista", os.path.join(ROOT, "assets", "source", "ballista_tripo.glb"), tex=cfg["tex"], team_hue=cfg["team_hue"])
    me = w.data
    z0 = min(v.co.z for v in me.vertices)
    split = (cfg["split"] - z0) * cfg["scale"]
    me.transform(Matrix.Scale(cfg["scale"], 4) @ Matrix.Translation((0, 0, -z0)))
    top = tp.split_mesh(w, split)
    bpy.data.objects.remove(w, do_unlink=True)
    co = np.array([v.co[:] for v in top.data.vertices])
    s = BALLISTA_SPAN / (co[:, 0].max() - co[:, 0].min())
    top.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation((0, 0, -split)))
    co = np.array([v.co[:] for v in top.data.vertices])
    tips = [co[np.argsort(-sd * co[:, 0])[:12]].mean(0) for sd in (-1, 1)]
    rail = co[(np.abs(co[:, 0]) < 0.06 * s * 2) & (co[:, 1] > -0.4 * s) & (co[:, 1] < 0.2 * s)]
    ny = (tips[0][1] + tips[1][1]) / 2 + 0.75 * s
    nut = np.array([0.0, ny, rail[:, 2].max() + 0.01])
    dec = top.modifiers.new("dec", "DECIMATE")
    dec.ratio = min(1.0, TURRET_TRIS / max(1, sum(len(p.vertices) - 2 for p in top.data.polygons)))
    bpy.context.view_layer.objects.active = top
    bpy.ops.object.modifier_apply(modifier=dec.name)
    top.name = "tower_ballista"
    top.data.name = "tower_ballista"
    return top, tips, nut


def ring(c, ri, ro, h, z, mat, segs=16, **kw):
    bm = bmesh.new()
    prof = [(ri, h / 2), (ro, h / 2), (ro, -h / 2), (ri, -h / 2)]
    rings = [[bm.verts.new((math.cos(i / segs * math.tau) * r, math.sin(i / segs * math.tau) * r, pz)) for i in range(segs)] for r, pz in prof]
    for k in range(4):
        a, b = rings[k], rings[(k + 1) % 4]
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    kw.setdefault("uv_mode", "cyl")
    c.add_bm(bm, mat, "root", c.xform((0, 0, z)), **kw)


def band(c, b, z, mat="iron", h=0.1, out=0.03, segs=14, **kw):
    r = b.R(z) + out
    c.cone(r, r, h, (0, 0, z), mat, "root", segs=segs, **kw)


def wall_banner(c, b, ang, z, h, w=0.42):
    r = max(b.R(z + h * k / 4, ang) for k in range(5)) + 0.05
    x, y = math.cos(ang) * r, math.sin(ang) * r
    c.box((w, 0.04, h), (x, y, z + h * 0.5), C, "root", rot=(0, 0, ang + math.pi / 2))
    c.limb((math.cos(ang) * (r - 0.05), math.sin(ang) * (r - 0.05), z + h + 0.05), (math.cos(ang) * (r + 0.04), math.sin(ang) * (r + 0.04), z + h + 0.05), 0.03, 0.03, "wood", "root", segs=4)
    c.limb((x - math.sin(ang) * (w * 0.6), y + math.cos(ang) * (w * 0.6), z + h + 0.02), (x + math.sin(ang) * (w * 0.6), y - math.cos(ang) * (w * 0.6), z + h + 0.02), 0.025, 0.025, "wood", "root", segs=4)
    c.cone(0.05, 0.0, 0.16, (x, y, z - 0.06), "gold", "root", segs=4, rot=(math.pi, 0, 0))


def l2_damage(c, b):
    for z in (1.25, 2.35):
        band(c, b, z)
    for a in b.peaks(0.86, b.top - 0.12):
        c.cone(0.09, 0.0, 0.32, (math.cos(a) * 0.86, math.sin(a) * 0.86, b.top + 0.14), "gold", "root", segs=4)
    for a in (math.radians(205), math.radians(335)):
        wall_banner(c, b, a, 1.5, 1.0)


def l2_control(c, b):
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        x, y = math.cos(a), math.sin(a)
        c.limb((x * 1.3, y * 1.3, 0.4), (x * 1.25, y * 1.25, 2.2), 0.09, 0.07, "iron", "root", segs=5)
        c.ico(0.2, (x * 1.25, y * 1.25, 2.3), X, "root", sub=0)
        c.limb((x * 1.25, y * 1.25, 2.2), (x * 0.5, y * 0.5, 2.92), 0.05, 0.04, "iron", "root", segs=4)
    top = b.top
    ring(c, 0.45, 0.62, 0.12, top + 0.02, "gold")
    for i in range(5):
        a = i / 5 * math.tau
        c.cone(0.08, 0.0, 0.42, (math.cos(a) * 0.5, math.sin(a) * 0.5, top + 0.26), "gold", "root", segs=4)
    ring(c, 1.1, 1.22, 0.1, 1.47, "gold")
    for sx in (-1, 1):
        bs.banner(c, 1.05 * sx, -1.05, 0.45, 1.5)


def l2_support(c, b):
    c.cone(0.34, 0.0, 0.62, (0, 0, 3.33), "gold", "root", segs=4, rot=(0, 0, math.pi / 4))
    for i in range(4):
        a = i / 4 * math.tau
        x, y = math.cos(a) * 0.88, math.sin(a) * 0.88
        c.limb((x, y, 2.15), (x, y, 1.9), 0.02, 0.02, "iron", "root", segs=3)
        c.cone(0.12, 0.09, 0.22, (x, y, 1.8), "gold", "root", segs=6)
        c.ico(0.07, (x, y, 1.66), X, "root", sub=0)
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        lo, hi = b.span(1.15, a)
        m = (lo + hi) / 2
        w = (hi - lo) / 2 / math.sqrt(2) + 0.05
        c.box((w * 2, w * 2, 0.1), (math.cos(a) * m, math.sin(a) * m, 1.15), "gold", "root")


def l3_ballista(c, b, turret):
    floor = 3.2
    c.cone(0.6, 0.66, 0.34, (0, 0, floor + 0.17), "wood", "root", segs=10)
    c.cone(0.66, 0.66, 0.08, (0, 0, floor + 0.36), "iron", "root", segs=10)
    obj, tips, nut = turret
    lift = floor + 0.4
    for t in tips:
        c.limb((t[0], t[1], t[2] + lift), (nut[0], nut[1], nut[2] + lift), 0.018, 0.018, "leather", "root", segs=3)
    return lift


def l3_firepot(c, b):
    c.cone(0.62, 0.38, 0.45, (0, 0, 3.78), "iron", "root", segs=10)
    for i in range(3):
        a = i / 3 * math.tau + math.pi / 2
        c.limb((math.cos(a) * 0.62, math.sin(a) * 0.62, 3.2), (math.cos(a) * 0.4, math.sin(a) * 0.4, 3.62), 0.05, 0.04, "iron", "root", segs=4)
    c.cone(0.66, 0.66, 0.08, (0, 0, 4.0), "gold", "root", segs=10)
    for i in range(5):
        a = i / 5 * math.tau
        c.ico(0.17, (math.cos(a) * 0.3, math.sin(a) * 0.3, 4.05), "brick", "root", sub=1, shade=(1.0, 0.55, 0.2))
    c.ico(0.2, (0, 0, 4.1), "brick", "root", sub=1, shade=(1.0, 0.75, 0.3))
    c.limb((-0.75, 0.45, 3.6), (0.25, -0.75, 4.55), 0.05, 0.045, "wood", "root", segs=5)
    c.cone(0.17, 0.2, 0.14, (0.25, -0.75, 4.6), "iron", "root", segs=6)
    c.ico(0.14, (0.25, -0.75, 4.75), "brick", "root", sub=1, shade=(0.75, 0.38, 0.2))
    for i in range(4):
        a = i / 4 * math.tau + 0.4
        x, y = math.cos(a) * 1.25, math.sin(a) * 1.25
        c.ico(0.16, (x, y, 0.6), "brick", "root", sub=1, scale=(1, 1, 0.9), shade=(0.7, 0.36, 0.2))
        c.cone(0.06, 0.08, 0.1, (x, y, 0.78), "brick", "root", segs=6, shade=(0.7, 0.36, 0.2))
    for z in (1.9, 2.6):
        band(c, b, z, h=0.07, shade=(0.35, 0.3, 0.28))


def l3_volley(c, b):
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        x, y = math.cos(a) * 1.12, math.sin(a) * 1.12
        c.cone(0.12, 0.3, 0.4, (x, y, 2.7), "brick", "root", segs=6)
        c.cone(0.3, 0.32, 0.6, (x, y, 3.2), "brick", "root", segs=6, meters=1.0)
        c.cone(0.42, 0.0, 0.55, (x, y, 3.77), "roof", "root", segs=6)
        c.cone(0.04, 0.0, 0.25, (x, y, 4.15), "gold", "root", segs=4)
        c.box((0.1, 0.04, 0.24), (x * 1.26, y * 1.26, 3.2), "iron", "root", rot=(0, 0, a + math.pi / 2))
    for sx in (-1, 1):
        c.box((0.24, 0.24, 0.45), (0.42 * sx, 0.3, 3.45), "leather", "root")
        for k in range(4):
            c.limb((0.36 * sx + k * 0.04, 0.3, 3.6), (0.37 * sx + k * 0.04, 0.32, 4.0), 0.012, 0.012, "wood", "root", segs=3)
            c.box((0.06, 0.01, 0.08), (0.37 * sx + k * 0.04, 0.32, 4.0), "feather", "root")


def l3_frost(c, b):
    top = b.top
    for i in range(7):
        a = i / 7 * math.tau
        r = 0.42 + 0.08 * (i % 2)
        h = 0.9 + 0.4 * ((i * 3) % 3) / 2
        c.cone(0.22, 0.0, h * 1.5, (math.cos(a) * r * 1.3, math.sin(a) * r * 1.3, top - 0.1 + h * 0.75), "plain", "root", segs=5, rot=(math.sin(a) * 0.45, -math.cos(a) * 0.45, 0), shade=(0.55, 0.8, 1.0))
    c.cone(0.3, 0.0, 2.3, (0, 0, top + 1.0), "plain", "root", segs=5, shade=(0.7, 0.9, 1.0))
    for i in range(9):
        a = i / 9 * math.tau + 0.2
        r = 1.35 + 0.1 * (i % 3)
        h = 0.45 + 0.25 * (i % 3)
        c.cone(0.18, 0.0, h * 1.6, (math.cos(a) * r, math.sin(a) * r, 0.4 + h * 0.8), "plain", "root", segs=5, rot=(math.sin(a) * 0.3, -math.cos(a) * 0.3, 0), shade=(0.55, 0.8, 1.0))
    c.cone(1.24, 1.1, 0.12, (0, 0, 1.52), "plain", "root", segs=12, shade=(0.82, 0.94, 1.0))
    for i in range(10):
        a = i / 10 * math.tau
        c.cone(0.06, 0.0, 0.3, (math.cos(a) * 1.15, math.sin(a) * 1.15, 1.33), "plain", "root", segs=4, rot=(math.pi, 0, 0), shade=(0.8, 0.94, 1.0))


def l3_storm(c, b):
    top = b.top
    for sx in (-1, 1):
        c.limb((0.48 * sx, 0.0, top - 0.05), (0.4 * sx, 0.0, 4.0), 0.06, 0.05, "iron", "root", segs=5)
    c.limb((-0.45, 0, 3.95), (0.45, 0, 3.95), 0.06, 0.06, "iron", "root", segs=5)
    c.lathe([(0.02, 0.0), (0.22, -0.05), (0.32, -0.3), (0.42, -0.65), (0.5, -0.78), (0.0, -0.78)], (0, 0, 3.92), "gold", "root", segs=10)
    c.ico(0.08, (0, 0, 3.08), "iron", "root", sub=0)
    c.limb((0, 0, 4.0), (0, 0, 5.0), 0.035, 0.015, "iron", "root", segs=4)
    for k in range(5):
        c.cone(0.08, 0.08, 0.04, (0, 0, 4.15 + k * 0.15), "gold", "root", segs=6, shade=(1.0, 0.6, 0.35))
    c.ico(0.09, (0, 0, 5.05), X, "root", sub=0)
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        x, y = math.cos(a) * 1.3, math.sin(a) * 1.3
        c.limb((x, y, 0.4), (x, y, 2.3), 0.05, 0.03, "iron", "root", segs=4)
        c.cone(0.07, 0.0, 0.3, (x, y, 2.45), "gold", "root", segs=4)
        c.limb((x, y, 2.2), (0.42 * x / 1.3, 0.42 * y / 1.3, top - 0.1), 0.012, 0.012, "gold", "root", segs=3, shade=(1.0, 0.6, 0.35))


def l3_well(c, b):
    c.ico(0.62, (0, 0, 3.7), "iron", "root", sub=1, shade=(0.22, 0.12, 0.32))
    c.cone(1.05, 1.05, 0.07, (0, 0, 3.7), X, "root", segs=14, rot=(0.35, 0, 0))
    c.cone(0.85, 0.85, 0.06, (0, 0, 3.7), X, "root", segs=14, rot=(-0.3, 0.4, 0))
    for i in range(7):
        a = i / 7 * math.tau
        r = 1.1 + 0.15 * (i % 2)
        z = 2.4 + 0.6 * ((i * 2) % 3) / 2
        c.ico(0.3 + 0.07 * (i % 3), (math.cos(a) * r * 1.15, math.sin(a) * r * 1.15, z + 0.3), "cliff", "root", sub=0, rot=(i, i * 2, 0), shade=(0.45, 0.35, 0.55))
    for i in range(6):
        a = i / 6 * math.tau + 0.3
        x, y = math.cos(a) * 1.35, math.sin(a) * 1.35
        c.box((0.3, 0.22, 0.5), (x, y, 0.55), "cliff", "root", rot=(0.2, 0.1, a), shade=(0.4, 0.32, 0.5))
        c.ico(0.06, (x, y, 0.87), X, "root", sub=0)
    c.cone(1.24, 1.12, 0.08, (0, 0, 1.52), "iron", "root", segs=12, shade=(0.3, 0.2, 0.4))


LEVEL2 = {"damage": l2_damage, "control": l2_control, "support": l2_support}
LEVEL3 = {"damage": {"ballista": l3_ballista, "firepot": l3_firepot, "volley": l3_volley}, "control": {"frost": l3_frost, "storm": l3_storm, "well": l3_well}}


def textures():
    src = os.path.join(ROOT, "assets", "textures")
    tmp = tempfile.mkdtemp(prefix="grudge_tex_")
    for f in os.listdir(src):
        if f.endswith((".png", ".json")):
            shutil.copy(os.path.join(src, f), tmp)
    images = texgen.build_all(tmp)
    shutil.rmtree(tmp, ignore_errors=True)
    return images


def build_one(name):
    th.clear_scene()
    images = textures()
    cfg = TOWERS[name]
    coll = bpy.context.scene.collection
    turret = ballista_turret() if "ballista" in LEVEL3.get(name, {}) else None
    body = load_body(name, cfg)
    b = Body(body)
    _, (spin, _) = bs.BUILDERS[name](images)
    trim = charkit.Char("level2_" + name, images)
    LEVEL2[name](trim, b)
    tops = []
    lift = 0.0
    for spec, fn in LEVEL3.get(name, {}).items():
        t3 = charkit.Char("level3_" + spec, images)
        if spec == "ballista":
            lift = fn(t3, b, turret)
        else:
            fn(t3, b)
        tops.append(t3)
    so, _ = spin.build(None, coll)
    so.location = cfg["pivot"]
    to, _ = trim.build(None, coll)
    t3o = [t.build(None, coll)[0] for t in tops]
    charkit.bake_ao([to, *t3o], samples=32)
    objs = [body, so, to, *t3o]
    if turret:
        tobj = turret[0]
        tobj.parent = next(o for o in t3o if o.name == "level3_ballista")
        tobj.location = (0, 0, lift)
        objs.append(tobj)
    tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
    size = charkit.export(objs, os.path.join(ROOT, "assets", "structures", name + ".glb"))
    return {"tris": tris, "body_tris": sum(len(p.vertices) - 2 for p in body.data.polygons), "bytes": size}


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {n: build_one(n) for n in (argv or list(TOWERS))}
    print("RESULT", out)
