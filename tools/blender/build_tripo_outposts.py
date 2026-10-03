"""AI-generated (Tripo) bodies for the production outposts and the keep, exported to assets/structures/<type>.glb.

Run headless: blender -b --python tools/blender/build_tripo_outposts.py -- [barracks range foundry outpost core]
Sources live in assets/source/outpost_<type>_tripo.glb and keep_core_tripo.glb. Node contract:
  <type>           Tripo body (materials <type>_skin and team_<type>, blue texels greyed for dyeing)
  <type>_mast      procedural flag pole (barracks / range / outpost)
  spin_<type>      procedural flag or gear the game swings / spins (from build_structures)
  level2_<type>    procedural upgrade parts fitted to the new body
  core: core       Tripo altar, crystal = Tripo crystal split off, pivot at its centre (game spins it)
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import build_structures as bs  # noqa: E402
import build_tripo_hero as th  # noqa: E402
import build_tripo_structures as ts  # noqa: E402
import charkit  # noqa: E402

TEAM_HUE = (195, 250)
C = bs.C
T = bs.T
X = bs.X
OUTPOSTS = {
    "barracks": {"yaw": -90, "xy": 3.1, "z": 3.5, "mast": (1.12, -0.98, 2.45), "flag": 2.2},
    "range": {"yaw": 0, "xy": 3.1, "z": 3.1, "align": 0.55, "mast": (0.95, -1.0, 2.75), "flag": 2.5, "spike": 1.45, "float": 1.1},
    "foundry": {"yaw": -90, "xy": 3.1, "z": 3.6, "gear": (0.8, 1.15)},
    "outpost": {"yaw": 0, "xy": 3.1, "z": 3.5, "mast": (-1.1, -0.95, 2.5), "flag": 2.25, "floor": 0.17},
}
KEEP = {"xy": 3.4, "z": 3.3, "crystal_min": 1.1, "crystal_r": 0.85, "crystal": (0.6, 1.25, 0.8), "top": 3.3}


class Ground:
    def __init__(self, obj):
        me = obj.data
        self.bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
        co = np.array([v.co[:] for v in me.vertices])
        self.top = float(co[:, 2].max())

    def h(self, x, y):
        hit = self.bvh.ray_cast(Vector((x, y, self.top + 1)), Vector((0, 0, -1)), 20)[0]
        return hit.z if hit is not None else 0.0

    def wall(self, x, y, z, dx, dy):
        d = Vector((dx, dy, 0)).normalized()
        o = Vector((x, y, z)) - d * 3
        hit = self.bvh.ray_cast(o, d, 6)[0]
        return hit

    def dump(self):
        rows = []
        for y in np.arange(1.6, -1.61, -0.2):
            rows.append(f"{y:5.1f} " + " ".join(f"{self.h(x, y):3.1f}" for x in np.arange(-1.6, 1.61, 0.2)))
        print("HEIGHTS\n" + "\n".join(rows))


def islands(bm):
    seen = set()
    out = []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack = [f]
        seen.add(f.index)
        comp = []
        while stack:
            g = stack.pop()
            comp.append(g)
            for v in g.verts:
                for h in v.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        out.append(comp)
    return out


def clean(obj, spike=None, float_r=None):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    kill = set()
    if spike:
        for f in bm.faces:
            if any(v.co.z > 0.5 and Vector((v.co.x, v.co.y)).length > spike for v in f.verts):
                kill.add(f)
    if float_r:
        weld = bm.copy()
        bmesh.ops.remove_doubles(weld, verts=weld.verts, dist=0.003)
        weld.faces.ensure_lookup_table()
        for comp in islands(weld):
            pts = np.array([v.co[:] for g in comp for v in g.verts])
            c = pts.mean(0)
            if pts[:, 2].min() > 0.6 and np.ptp(pts, 0).max() < 0.5 and math.hypot(c[0], c[1]) > float_r:
                for g in comp:
                    for f in bm.faces:
                        if (f.calc_center_median() - g.calc_center_median()).length < 1e-5:
                            kill.add(f)
        weld.free()
    bmesh.ops.delete(bm, geom=list(kill), context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    return len(kill)


def align_angle(co, frac):
    hi = co[co[:, 2] > co[:, 2].max() * frac][:, :2]
    best, ba = 1e9, 0.0
    for deg in np.arange(-45, 45, 0.5):
        a = math.radians(deg)
        r = hi @ np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
        area = np.ptp(r[:, 0]) * np.ptp(r[:, 1])
        if area < best:
            best, ba = area, a
    return ba


def load_body(src, name, cfg):
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", src))
    w = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    for o in list(bpy.context.selected_objects):
        if o is not w:
            bpy.data.objects.remove(o, do_unlink=True)
    w.parent = None
    w.data.transform(w.matrix_world)
    w.matrix_world = Matrix.Identity(4)
    img, px = th.tex_lookup(w)
    cols = th.face_colors(w, px)
    th.bake_material(name, w, {"tex": cfg.get("tex", 1024), "team_hue": TEAM_HUE}, img, px, cols)
    me = w.data
    me.attributes.new("src_col", "FLOAT_COLOR", "FACE").data.foreach_set("color", [c for rgb in cols for c in (*rgb, 1.0)])
    load_body.px = px
    me.transform(Matrix.Rotation(math.radians(cfg.get("yaw", 0)), 4, "Z"))
    if cfg.get("align"):
        co = np.array([v.co[:] for v in me.vertices])
        me.transform(Matrix.Rotation(-align_angle(co, cfg["align"]), 4, "Z"))
    co = np.array([v.co[:] for v in me.vertices])
    mid = (co.min(0) + co.max(0)) / 2
    me.transform(Matrix.Translation((-mid[0], -mid[1], -co[:, 2].min())))
    me.transform(Matrix.Diagonal((cfg["xy"], cfg["xy"], cfg["z"], 1)))
    if cfg.get("spike") or cfg.get("float"):
        print("CUT", name, clean(w, cfg.get("spike"), cfg.get("float")))
    w.name = name
    me.name = name
    return w


def floor_disc(c, z, r=1.47):
    c.cone(r, r, 0.04, (0, 0, z - 0.02), "cobble", "root", segs=24, meters=0.7, shade=(0.5, 0.47, 0.44))


def banner_on(c, g, x, y, z, h, nx, ny, w=0.4):
    hit = g.wall(x, y, z + h * 0.5, -nx, -ny)
    px, py = (hit.x, hit.y) if hit is not None else (x, y)
    ang = math.atan2(ny, nx)
    bx, by = px + nx * 0.03, py + ny * 0.03
    c.box((w, 0.035, h), (bx, by, z + h * 0.5), C, "root", rot=(0, 0, ang + math.pi / 2))
    c.limb((bx - ny * w * 0.62, by + nx * w * 0.62, z + h + 0.02), (bx + ny * w * 0.62, by - nx * w * 0.62, z + h + 0.02), 0.025, 0.025, "wood", "root", segs=4)
    c.cone(0.05, 0.0, 0.14, (bx, by, z - 0.05), "gold", "root", segs=4, rot=(math.pi, 0, 0))


def weapon_rack(c, x, y, rot, n=4):
    ca, sa = math.cos(rot), math.sin(rot)
    c.box((0.66, 0.1, 0.1), (x, y, 0.62), "wood", "root", rot=(0, 0, rot))
    c.box((0.66, 0.1, 0.08), (x, y, 0.32), "wood", "root", rot=(0, 0, rot))
    for k in range(n):
        t = (k - (n - 1) / 2) * 0.15
        px, py = x + ca * t, y + sa * t
        c.limb((px, py, 0.2), (px, py, 1.08), 0.018, 0.018, "wood", "root", segs=3)
        c.cone(0.045, 0.0, 0.16, (px, py, 1.15), "iron", "root", segs=4)


def l2_barracks(c, g):
    for sx in (-1, 1):
        banner_on(c, g, 0.62 * sx, -1.2, 0.75, 0.85, 0, -1, w=0.32)
    ridge = [(0.0, y) for y in (-1.02, 1.18)]
    for x, y in ridge:
        z = g.h(x, y)
        c.cone(0.09, 0.0, 0.36, (x, y, z + 0.16), "gold", "root", segs=4)
        c.ico(0.06, (x, y, z + 0.02), "gold", "root", sub=0)
    weapon_rack(c, -1.2, -0.05, math.pi / 2)
    ex = g.wall(-0.9, -0.2, 1.62, 1, 0)
    x0 = ex.x - 0.02 if ex is not None else -1.0
    c.box((0.07, 2.2, 0.08), (x0, 0.07, 1.6), "gold", "root")
    ex = g.wall(0.9, -0.2, 1.62, -1, 0)
    x1 = ex.x + 0.02 if ex is not None else 0.95
    c.box((0.07, 2.2, 0.08), (x1, 0.07, 1.6), "gold", "root")


def l2_range(c, g):
    fx, fy = -0.15, -1.18
    for sx in (-1, 1):
        c.limb((fx + 0.55 * sx, fy, 0.18), (fx + 0.55 * sx, fy, 1.45), 0.04, 0.04, "wood", "root", segs=4)
    c.box((1.35, 0.7, 0.05), (fx, fy + 0.3, 1.48), T, "root", rot=(-0.35, 0, 0))
    c.box((1.4, 0.06, 0.06), (fx, fy - 0.02, 1.38), "gold", "root")
    apex = max(((x, y) for x in np.linspace(-0.4, 0.2, 7) for y in np.linspace(-0.2, 0.4, 7)), key=lambda p: g.h(*p))
    z = g.h(*apex)
    c.cone(0.07, 0.07, 0.12, (apex[0], apex[1], z + 0.02), "gold", "root", segs=6)
    c.cone(0.1, 0.0, 0.4, (apex[0], apex[1], z + 0.28), "gold", "root", segs=4)
    c.box((0.26, 0.26, 0.5), (1.15, -0.55, 0.43), "leather", "root", rot=(0, 0, 0.3))
    for k in range(4):
        c.limb((1.09 + k * 0.04, -0.57, 0.6), (1.1 + k * 0.04, -0.55, 0.98), 0.012, 0.012, "wood", "root", segs=3)
        c.box((0.06, 0.01, 0.08), (1.1 + k * 0.04, -0.55, 0.98), "feather", "root")


def l2_foundry(c, g):
    cx, cy = -0.02, 1.0
    z = g.h(cx, cy)
    c.cone(0.24, 0.2, 1.1, (cx, cy, z + 0.5), "brick", "root", segs=6, meters=1.0)
    c.cone(0.29, 0.29, 0.14, (cx, cy, z + 1.07), "iron", "root", segs=6)
    for k in range(3):
        c.ico(0.07, (cx + 0.29 * math.cos(k * 2.1), cy + 0.29 * math.sin(k * 2.1), z + 1.07), "gold", "root", sub=0)
    px, py = -0.35, 1.25
    c.limb((px, py, 0.15), (px, py, 2.4), 0.06, 0.06, "wood", "root", segs=4)
    c.limb((px, py, 2.35), (-0.95, 0.35, 2.5), 0.05, 0.05, "wood", "root", segs=4)
    c.limb((-0.95, 0.35, 2.5), (-0.95, 0.35, 1.45), 0.012, 0.012, "iron", "root", segs=3)
    c.box((0.24, 0.24, 0.2), (-0.95, 0.35, 1.35), "iron", "root")
    c.box((0.42, 0.3, 0.28), (0.95, -1.05, 0.32), "iron", "root", rot=(0, 0, 0.2))
    c.box((0.3, 0.26, 0.06), (0.95, -1.05, 0.49), "gold", "root", rot=(0, 0, 0.2))


def l2_outpost(c, g):
    for i in range(9):
        t = i / 8
        x = -1.15 + t * 2.3
        y = 1.3 - 0.15 * abs(t - 0.5) * 2
        c.limb((x, y, 0.15), (x, y, 0.85 + 0.12 * (i % 2)), 0.055, 0.04, "wood", "root", segs=4)
        c.cone(0.055, 0.0, 0.16, (x, y, 0.93 + 0.12 * (i % 2)), "wood", "root", segs=4)
    c.box((2.3, 0.05, 0.1), (0, 1.22, 0.6), "wood", "root")
    tx, ty = 1.0, -0.85
    for sx in (-1, 1):
        for sy in (-1, 1):
            c.limb((tx + 0.24 * sx, ty + 0.24 * sy, 0.15), (tx + 0.2 * sx, ty + 0.2 * sy, 2.55), 0.035, 0.035, "wood", "root", segs=4)
    c.box((0.62, 0.62, 0.08), (tx, ty, 2.2), "wood", "root")
    for sx in (-1, 1):
        c.box((0.62, 0.04, 0.24), (tx, ty + 0.3 * sx, 2.36), "wood", "root")
        c.box((0.04, 0.62, 0.24), (tx + 0.3 * sx, ty, 2.36), "wood", "root")
    c.cone(0.5, 0.0, 0.42, (tx, ty, 2.76), "roof", "root", segs=4, rot=(0, 0, math.pi / 4))
    c.box((0.3, 0.035, 0.42), (tx, ty - 0.32, 1.95), C, "root")
    banner_on(c, g, 0.42, -1.2, 0.95, 0.75, 0, -1, w=0.3)


LEVEL2 = {"barracks": l2_barracks, "range": l2_range, "foundry": l2_foundry, "outpost": l2_outpost}


def mast(name, cfg, images):
    m = charkit.Char(name + "_mast", images)
    x, y, top = cfg["mast"]
    m.limb((x, y, 0.12), (x, y, top), 0.04, 0.035, "wood", "root", segs=5)
    m.cone(0.06, 0.0, 0.14, (x, y, top + 0.07), "gold", "root", segs=4)
    m.cone(0.07, 0.07, 0.08, (x, y, 0.16), "iron", "root", segs=6)
    return m


def build_outpost(name):
    th.clear_scene()
    images = ts.textures()
    cfg = OUTPOSTS[name]
    coll = bpy.context.scene.collection
    body = load_body(f"outpost_{name}_tripo.glb", name, cfg)
    g = Ground(body)
    if os.environ.get("DUMP"):
        g.dump()
    _, (spin, pivot) = bs.BUILDERS[name](images)
    parts = []
    if cfg.get("floor"):
        fl = charkit.Char(name + "_floor", images)
        floor_disc(fl, cfg["floor"])
        parts.append(fl)
    if cfg.get("mast"):
        parts.append(mast(name, cfg, images))
        x, y, _ = cfg["mast"]
        pivot = (x, y, cfg["flag"])
    if cfg.get("gear"):
        gx, gz = cfg["gear"]
        hit = g.wall(gx, -1.0, gz, 0, 1)
        pivot = (gx, (hit.y if hit is not None else -0.6) - 0.1, gz)
    trim = charkit.Char("level2_" + name, images)
    LEVEL2[name](trim, g)
    objs = [p.build(None, coll)[0] for p in parts]
    so, _ = spin.build(None, coll)
    so.location = pivot
    to, _ = trim.build(None, coll)
    charkit.bake_ao([*objs, to], samples=32)
    out = [body, *objs, so, to]
    tris = sum(len(p.vertices) - 2 for o in out for p in o.data.polygons)
    size = charkit.export(out, os.path.join(ROOT, "assets", "structures", name + ".glb"))
    return {"tris": tris, "body_tris": sum(len(p.vertices) - 2 for p in body.data.polygons), "bytes": size}


def drop_crystal(body, zmin, rmax):
    me = body.data
    cols = np.zeros(len(me.polygons) * 4, dtype=np.float32)
    me.attributes["src_col"].data.foreach_get("color", cols)
    cols = cols.reshape(-1, 4)[:, :3]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    def hit(f, c):
        m = f.calc_center_median()
        r = Vector(m.xy).length
        inside = (m.z > zmin and r < rmax) or (m.z > zmin + 0.35 and r < rmax + 0.15)
        return inside and (th.hue_in(c, (170, 270), 0.08) or f.material_index == 1)

    kill = [f for f, c in zip(bm.faces, cols) if hit(f, c)]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(me)
    bm.free()
    top = max((p.center.z for p in me.polygons if Vector(p.center.xy).length < 0.25), default=zmin)
    return len(kill), top


def build_core():
    th.clear_scene()
    images = ts.textures()
    cfg = KEEP
    coll = bpy.context.scene.collection
    body = load_body("keep_core_tripo.glb", "core", cfg)
    n, post = drop_crystal(body, cfg["crystal_min"], cfg["crystal_r"])
    r, up, down = cfg["crystal"]
    cz = cfg["top"] - up
    cr = charkit.Char("core_cradle", images)
    cr.cone(0.34, 0.2, 0.14, (0, 0, post + 0.07), "gold", "root", segs=8)
    cr.cone(0.2, 0.06, cz - down - post - 0.1, (0, 0, (cz - down + post) / 2 + 0.02), "gold", "root", segs=8)
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        cr.ico(0.05, (math.cos(a) * 0.27, math.sin(a) * 0.27, post + 0.14), "gold", "root", sub=0)
    cro, _ = cr.build(None, coll)
    charkit.bake_ao([cro], samples=16)
    c = charkit.Char("crystal", images)
    c.cone(r, 0.0, up, (0, 0, up / 2), X, "root", segs=6)
    c.cone(r, 0.0, down, (0, 0, -down / 2), X, "root", segs=6, rot=(math.pi, 0, 0))
    cry, _ = c.build(None, coll)
    cry.location = (0, 0, cz)
    out = [body, cro, cry]
    tris = sum(len(p.vertices) - 2 for o in out for p in o.data.polygons)
    print("CRYSTAL dropped", n, "post", round(post, 2), "centre", round(cz, 2))
    size = charkit.export(out, os.path.join(ROOT, "assets", "structures", "core.glb"))
    return {"tris": tris, "bytes": size}


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    names = argv or [*OUTPOSTS, "core"]
    out = {n: (build_core() if n == "core" else build_outpost(n)) for n in names}
    print("RESULT", out)
