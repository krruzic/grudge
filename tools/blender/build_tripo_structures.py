"""AI-generated (Tripo) bodies for the damage / control / support towers, exported to assets/structures/<type>.glb.

Run headless: blender -b --python tools/blender/build_tripo_structures.py -- [damage control support]
Sources live in assets/source/tower_<type>_tripo.glb. Each export keeps the node contract of build_structures.py:
  <type>          Tripo body (materials tower_<type>_skin and team_tower_<type>, blue texels greyed for dyeing)
  spin_<type>     procedural part the game spins / bobs (from build_structures)
  level2_<type>   group of Tripo upgrade props (assets/source/addon_<name>_tripo.glb) placed on the body
  level3_<spec>   group of Tripo spec props; level3_ballista is the Tripo ballista turntable + turret
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
PLATE_DEPTH = 0.24
PLATE_R = 0.66
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
    plate = turntable(w, split)
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
    return top, tips, nut, plate


def turntable(base, split):
    bm = bmesh.new()
    bm.from_mesh(base.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z < split - PLATE_DEPTH], context="FACES")
    bm.to_mesh(base.data)
    bm.free()
    me = base.data
    co = np.array([v.co[:] for v in me.vertices])
    r = np.hypot(co[:, 0], co[:, 1]).max()
    me.transform(Matrix.Scale(PLATE_R / r, 4) @ Matrix.Translation((0, 0, -co[:, 2].min())))
    base.name = "tower_ballista_plate"
    me.name = "tower_ballista_plate"
    return base


ADDONS = {
    "banner": {"height": 1.25, "tris": 1500, "team": True},
    "pylon": {"height": 1.45, "tris": 1100, "team": True},
    "spire": {"height": 1.6, "tris": 1800, "team": True},
    "brazier": {"height": 0.9, "tris": 2200},
    "bartizan": {"height": 1.5, "tris": 1000},
    "frost": {"height": 1.7, "tris": 900},
    "rod": {"height": 2.35, "tris": 2000},
    "orb": {"height": 1.05, "tris": 2400},
}
FLOOR = 3.23
IMAGES = [None]


def addon(key, cfg=None):
    cfg = cfg or ADDONS[key]
    w = th.import_prop("addon_" + key, os.path.join(ROOT, "assets", "source", f"addon_{key}_tripo.glb"), tex=256, team_hue=TEAM_HUE if cfg.get("team") else None)
    me = w.data
    me.transform(Matrix.Rotation(math.radians(-90 + cfg.get("yaw", 0)), 4, "Z"))
    co = np.array([v.co[:] for v in me.vertices])
    lo, hi = co.min(0), co.max(0)
    me.transform(Matrix.Scale(cfg["height"] / (hi[2] - lo[2]), 4) @ Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])))
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris > cfg["tris"]:
        dec = w.modifiers.new("dec", "DECIMATE")
        dec.ratio = cfg["tris"] / tris
        bpy.context.view_layer.objects.active = w
        bpy.ops.object.modifier_apply(modifier=dec.name)
    w.name = "addon_" + key
    me.name = "addon_" + key
    return w


def group(name):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    return e


def place(src, parent, loc, yaw=0.0, scale=1.0, tag=""):
    if src.get("placed"):
        o = bpy.data.objects.new(src.name + tag, src.data)
        bpy.context.scene.collection.objects.link(o)
    else:
        o = src
        o["placed"] = 1
    o.parent = parent
    o.location = loc
    o.rotation_euler = (0, 0, yaw)
    o.scale = (scale, scale, scale)
    return o


def on_wall(b, src, parent, ang, z, tag):
    h = src.dimensions.z
    d = src.dimensions.y
    r = max(b.R(z + h * k / 4, ang) for k in range(5)) + d * 0.35
    return place(src, parent, (math.cos(ang) * r, math.sin(ang) * r, z), ang + math.pi / 2, tag=tag)


def l2_damage(g, b):
    ban = addon("banner")
    for k, a in enumerate((math.radians(226), math.radians(350))):
        on_wall(b, ban, g, a, 1.35, f"_{k}")


def l2_control(g, b):
    py = addon("pylon")
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        place(py, g, (math.cos(a) * 1.42, math.sin(a) * 1.42, 0.3), a + math.pi / 2, tag=f"_{i}")


def l2_support(g, b):
    sp = addon("spire")
    place(sp, g, (0, 0, 2.7), math.pi / 4)


def l3_ballista(g, b, turret):
    obj, tips, nut, plate = turret
    place(plate, g, (0, 0, FLOOR - 0.02))
    lift = FLOOR - 0.02 + plate.dimensions.z
    c = charkit.Char("level3_ballista_strings", IMAGES[0])
    for t in tips:
        c.limb((t[0], t[1], t[2] + lift), (nut[0], nut[1], nut[2] + lift), 0.018, 0.018, "leather", "root", segs=3)
    so, _ = c.build(None, bpy.context.scene.collection)
    so.parent = g
    return lift


def l3_firepot(g, b):
    place(addon("brazier"), g, (0, 0, FLOOR - 0.04))


def l3_volley(g, b):
    bt = addon("bartizan")
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        place(bt, g, (math.cos(a) * 1.13, math.sin(a) * 1.13, 2.62), a + math.pi / 2, tag=f"_{i}")


def l3_frost(g, b):
    fr = addon("frost")
    place(fr, g, (0, 0, 2.62))
    for i in range(4):
        a = i / 4 * math.tau
        place(fr, g, (math.cos(a) * 1.45, math.sin(a) * 1.45, 0.25), a * 1.7 + 0.5, 0.42, tag=f"_{i}")


def l3_storm(g, b):
    place(addon("rod"), g, (0, 0, 2.68))


def l3_well(g, b):
    place(addon("orb"), g, (0, 0, 2.6))


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
    IMAGES[0] = images
    cfg = TOWERS[name]
    coll = bpy.context.scene.collection
    turret = ballista_turret() if "ballista" in LEVEL3.get(name, {}) else None
    body = load_body(name, cfg)
    b = Body(body)
    _, (spin, _) = bs.BUILDERS[name](images)
    so, _ = spin.build(None, coll)
    so.location = cfg["pivot"]
    g2 = group("level2_" + name)
    LEVEL2[name](g2, b)
    groups = [g2]
    for spec, fn in LEVEL3.get(name, {}).items():
        g3 = group("level3_" + spec)
        if spec == "ballista":
            lift = fn(g3, b, turret)
            turret[0].parent = g3
            turret[0].location = (0, 0, lift)
        else:
            fn(g3, b)
        groups.append(g3)
    parts = [o for g in groups for o in g.children_recursive]
    strings = [o for o in parts if o.name.endswith("_strings")]
    if strings:
        charkit.bake_ao(strings, samples=16)
    objs = [body, so, *groups, *parts]
    meshes = [o for o in objs if o.type == "MESH"]
    tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    size = charkit.export(objs, os.path.join(ROOT, "assets", "structures", name + ".glb"))
    return {"tris": tris, "body_tris": sum(len(p.vertices) - 2 for p in body.data.polygons), "bytes": size}


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {n: build_one(n) for n in (argv or list(TOWERS))}
    print("RESULT", out)
