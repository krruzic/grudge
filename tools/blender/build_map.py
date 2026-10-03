"""Build the arena dressing (walls, bridges, props, grass) on top of the heightfield.

The ground itself is generated in game from the same data (src/render/terrainMesh.ts).
This script reads assets/maps/<name>.grid.json (from `npm run bake-map`), builds
every static prop, bakes AO against a temporary ground mesh, and exports
assets/maps/<name>.glb.

Run inside Blender (MCP): exec(open(".../tools/blender/build_map.py").read())

Coordinates: game (x, y, z) -> Blender (x, -z, y); the glTF exporter maps back.
"""
import importlib
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import texgen  # noqa: E402
import charkit  # noqa: E402

importlib.reload(texgen)
importlib.reload(charkit)

MAP_NAME = globals().get("MAP", "crossing")
if "--" in sys.argv:
    _args = sys.argv[sys.argv.index("--") + 1:]
    if _args:
        MAP_NAME = _args[0]

GROUND, WALL, WATER, FORD, BRIDGE, PROP = 0, 1, 2, 3, 4, 5
FLAG_DIRT, FLAG_PAVING, FLAG_GRASS = 1, 2, 4
TEAM = [texgen.hexc("#3a6cff"), texgen.hexc("#ff3a2a"), texgen.hexc("#ffcf1a"), texgen.hexc("#2fc84a")]

MATS = ["grass", "dirt", "cobble", "cliff", "brick", "wood", "leaves", "pine",
        "bark", "tallgrass", "cloth", "gold", "iron", "roof", "thatch", "planks", "ruinstone", "hedge",
        "hedge_b", "hedge_c", "ruin_a", "ruin_b", "ruin_c", "ruin_d", "ruintop", "rubble", "ivy"]
TEX_METERS = {"grass": 7, "dirt": 6, "cobble": 4, "cliff": 5, "brick": 3.5, "wood": 2.5,
              "leaves": 3, "pine": 3, "bark": 2, "tallgrass": 1, "cloth": 1.5, "gold": 2, "iron": 1.5,
              "roof": 2.5, "thatch": 2.0, "planks": 1.25, "ruinstone": 3.0, "hedge": 2.6, "hedge_b": 2.6, "hedge_c": 2.6,
              "ruin_a": 2.6, "ruin_b": 2.6, "ruin_c": 2.6, "ruin_d": 2.6, "ruintop": 2.2, "rubble": 1.6, "ivy": 1.5,
              "flowerbed": 1.1}
HEDGES = ("hedge", "hedge_b", "hedge_c")
RUIN_WALLS = ("ruin_a", "ruin_c", "ruin_d")
FLOWER_COLS = ("#e8e0f0", "#ff8a3a", "#9a5ad8", "#d8384a", "#f2c84a")

TRIPO_TEX = 128
TRIPO = {
    "rock_a": {"size": (2.3, 2.0, 1.4), "faces": 480, "lo": 60},
    "rock_b": {"size": (2.2, 2.0, 1.6), "faces": 520, "lo": 70},
    "rock_c": {"size": (2.0, 2.4, 1.0), "faces": 480},
    "tree_a": {"size": (2.5, 2.9, 3.4), "trunk": True, "mirror": True, "faces": 1100},
    "tree_b": {"size": (2.2, 2.2, 3.7), "trunk": True, "smooth": 3},
    "pine_a": {"size": (2.5, 2.5, 3.9), "trunk": True, "faces": 850},
    "pine_snow": {"size": (2.5, 2.5, 3.9), "trunk": True, "faces": 900},
    "deadtree": {"size": (2.8, 2.8, 3.4), "trunk": True, "faces": 700},
    "pad": {"size": (3.4, 2.95, 0.42), "rot": 90, "faces": 520, "mat": "padstone", "inlay": "padteam"},
    "topi_spiral": {"size": (1.05, 1.05, 3.5), "faces": 440, "lo": 160, "gain": 1.3, "maps": ("gardens",)},
    "topi_ball": {"size": (1.1, 1.1, 3.2), "faces": 600, "lo": 300, "gain": 1.3, "maps": ("gardens",)},
    "flowerbush": {"size": (1.3, 1.3, 0.5), "faces": 120, "lo": 60, "maps": ("gardens",), "planar": "flowerbed"},
}
ROCKS = ("rock_a", "rock_b", "rock_c")


def G(x, y, z):
    return Vector((x, -z, y))


def hsh(*v):
    s = math.sin(sum(a * b for a, b in zip(v, (127.1, 311.7, 74.7, 191.3))) + 0.5) * 43758.5453
    return s - math.floor(s)


def vnoise3(x, y, z):
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    fx, fy, fz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)

    def h(a, b, c):
        return hsh(ix + a, iy + b, iz + c, 5.0)

    def lx(b, c):
        return h(0, b, c) + (h(1, b, c) - h(0, b, c)) * fx

    def ly(c):
        return lx(0, c) + (lx(1, c) - lx(0, c)) * fy

    return ly(0) + (ly(1) - ly(0)) * fz


def newell(pts):
    n = Vector((0, 0, 0))
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


def box_uv(pts, meters):
    n = newell(pts)
    ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
    s = 1.0 / meters
    out = []
    for p in pts:
        if az >= ax and az >= ay:
            out.append((p.x * s, p.y * s))
        elif ax >= ay:
            out.append((p.y * s * (1 if n.x > 0 else -1), p.z * s))
        else:
            out.append((p.x * s * (-1 if n.y > 0 else 1), p.z * s))
    return out


def cyl_uv(pts, center, meters):
    out = []
    for p in pts:
        d = p - center
        out.append((math.atan2(d.y, d.x) / math.tau * 4, p.z / meters))
    return out


class Builder:
    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.uvs, self.cols, self.fmat = [], [], [], [], []
        self.remap = None

    def face(self, pts, mat, col=(1, 1, 1), uvs=None, cols=None):
        if self.remap and mat in self.remap:
            mat = self.remap[mat](pts)
        dedup = []
        for p in pts:
            if not dedup or (p - dedup[-1]).length > 1e-5:
                dedup.append(p)
        if len(dedup) > 1 and (dedup[0] - dedup[-1]).length < 1e-5:
            dedup.pop()
        if len(dedup) < 3:
            return
        if uvs is None or len(uvs) != len(dedup):
            uvs = box_uv(dedup, TEX_METERS[mat])
        if cols is None or len(cols) != len(dedup):
            cols = [col] * len(dedup)
        base = len(self.verts)
        self.verts.extend(dedup)
        self.faces.append(list(range(base, base + len(dedup))))
        self.uvs.extend(uvs)
        self.cols.extend(cols)
        self.fmat.append(MATS.index(mat))

    def add_bm(self, bm, mat, col=(1, 1, 1), matrix=None, uv_fn=None, col_fn=None):
        if matrix is not None:
            bm.transform(matrix)
        for f in bm.faces:
            pts = [l.vert.co.copy() for l in f.loops]
            self.face(pts, mat, col, uv_fn(pts) if uv_fn else None, [col_fn(p) for p in pts] if col_fn else None)
        bm.free()

    def build(self, collection):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        uv = mesh.uv_layers.new(name="UVMap")
        uv.data.foreach_set("uv", [c for u in self.uvs for c in u])
        col = mesh.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        flat = []
        for c in self.cols:
            flat.extend((c[0], c[1], c[2], 1.0))
        col.data.foreach_set("color", flat)
        mesh.color_attributes.active_color = col
        used = sorted(set(self.fmat))
        remap = {m: i for i, m in enumerate(used)}
        mesh.polygons.foreach_set("material_index", [remap[m] for m in self.fmat])
        for m in used:
            mesh.materials.append(bpy.data.materials[MATS[m]])
        if self.name != "TallGrass":
            charkit.smooth_weld(mesh, 50.0)
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        return obj


def make_materials(images):
    for name in MATS:
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = images.get(name) or texgen.load_photo(name, os.path.join(ROOT, "assets", "textures"))
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if name == "tallgrass":
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        bsdf.inputs["Roughness"].default_value = 1.0
        nt.links.new(bsdf.outputs[0], out.inputs["Surface"])


def tripo_image(src, name, gain=1.0):
    mat = src.data.materials[0]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    img = bsdf.inputs["Base Color"].links[0].from_node.image
    tex = img.copy()
    tex.name = name
    tex.scale(TRIPO_TEX, TRIPO_TEX)
    if gain != 1.0:
        px = list(tex.pixels)
        for i in range(0, len(px), 4):
            for k in range(3):
                px[i + k] = min(1.0, px[i + k] * gain)
        tex.pixels.foreach_set(px)
    path = os.path.join(bpy.app.tempdir or "/tmp", name + ".png")
    tex.filepath_raw = path
    tex.file_format = "PNG"
    tex.save()
    out = bpy.data.images.load(path, check_existing=False)
    out.name = name
    out.pack()
    bpy.data.images.remove(tex)
    return out


def image_material(mname, img):
    mat = bpy.data.materials.get(mname) or bpy.data.materials.new(mname)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat


def warm(c):
    mx, mn = max(c[:3]), min(c[:3])
    if mx < 0.12 or mx - mn < 0.12 * mx + 0.04:
        return False
    if mx == c[0]:
        h = ((c[1] - c[2]) / (mx - mn)) % 6
    elif mx == c[1]:
        h = (c[2] - c[0]) / (mx - mn) + 2
    else:
        h = (c[0] - c[1]) / (mx - mn) + 4
    return 0.15 <= h <= 1.25


def inlay_faces(img, tris):
    w, h = img.size
    px = list(img.pixels)
    out = []
    for pts, uvs in tris:
        u = sum(t[0] for t in uvs) / len(uvs)
        v = sum(t[1] for t in uvs) / len(uvs)
        i = (min(h - 1, max(0, int(v % 1.0 * h))) * w + min(w - 1, max(0, int(u % 1.0 * w)))) * 4
        out.append(warm(px[i:i + 4]))
    return out


def recolor(img, name, rich):
    w, h = img.size
    px = list(img.pixels)
    for i in range(0, len(px), 4):
        c = px[i:i + 3]
        if warm(c):
            l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
            if rich:
                px[i:i + 3] = [min(1.0, max(0.0, l + (k - l) * 1.6)) for k in c]
            else:
                px[i:i + 3] = [min(1.0, l * 1.45)] * 3
    out = bpy.data.images.new(name + "_tmp", w, h, alpha=True)
    out.pixels.foreach_set(px)
    path = os.path.join(bpy.app.tempdir or "/tmp", name + ".png")
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    res = bpy.data.images.load(path, check_existing=False)
    res.name = name
    res.pack()
    return res


def tripo_tris(obj, depsgraph=None):
    me = obj.evaluated_get(depsgraph).to_mesh() if depsgraph else obj.data
    uv = me.uv_layers.active.data
    tris = []
    for p in me.polygons:
        tris.append(([me.vertices[me.loops[i].vertex_index].co.copy() for i in p.loop_indices],
                     [tuple(uv[i].uv) for i in p.loop_indices]))
    return tris


def mirror_half(me):
    zs = [v.co.z for v in me.vertices]
    z0 = min(zs) + (max(zs) - min(zs)) * 0.06
    base = [v.co.x for v in me.vertices if v.co.z < z0]
    cx = sum(base) / len(base)
    bm = bmesh.new()
    bm.from_mesh(me)
    behind = [f for f in bm.faces if all(v.co.x <= cx for v in f.verts)]
    bmesh.ops.delete(bm, geom=behind, context="FACES")
    for v in bm.verts:
        v.co.x = max(v.co.x, cx)
    dup = bmesh.ops.duplicate(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces))
    for e in dup["geom"]:
        if isinstance(e, bmesh.types.BMVert):
            e.co.x = 2 * cx - e.co.x
    bmesh.ops.reverse_faces(bm, faces=[e for e in dup["geom"] if isinstance(e, bmesh.types.BMFace)])
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bm.to_mesh(me)
    bm.free()


def smooth_canopy(me, iters):
    zs = [v.co.z for v in me.vertices]
    z0 = min(zs) + (max(zs) - min(zs)) * 0.45
    key = [tuple(round(c, 4) for c in v.co) for v in me.vertices]
    ids = {}
    gid = [ids.setdefault(k, len(ids)) for k in key]
    pos = [None] * len(ids)
    for v, g in zip(me.vertices, gid):
        pos[g] = v.co.copy()
    nb = [set() for _ in ids]
    for e in me.edges:
        a, b = gid[e.vertices[0]], gid[e.vertices[1]]
        if a != b:
            nb[a].add(b)
            nb[b].add(a)
    for _ in range(iters):
        new = list(pos)
        for g, p in enumerate(pos):
            if p.z > z0 and nb[g]:
                avg = sum((pos[n] for n in nb[g]), Vector()) / len(nb[g])
                new[g] = p.lerp(avg, 0.5)
        pos = new
    for v, g in zip(me.vertices, gid):
        v.co = pos[g]


def load_tripo(name, cfg):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", f"map_{name}_tripo.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == "MESH")
    me = src.data
    me.transform(src.matrix_world)
    src.matrix_world = Matrix.Identity(4)
    if cfg.get("rot"):
        me.transform(Matrix.Rotation(math.radians(cfg["rot"]), 4, "Z"))
    if cfg.get("mirror"):
        mirror_half(me)
    if cfg.get("smooth"):
        smooth_canopy(me, cfg["smooth"])
    if cfg.get("faces") and len(me.polygons) > cfg["faces"]:
        mod = src.modifiers.new("dec", "DECIMATE")
        mod.ratio = cfg["faces"] / len(me.polygons)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(src.evaluated_get(dg))
        src.modifiers.clear()
        src.data = me
    lo = Vector([min(v.co[k] for v in me.vertices) for k in range(3)])
    hi = Vector([max(v.co[k] for v in me.vertices) for k in range(3)])
    dims = hi - lo
    if cfg.get("trunk"):
        base = [v.co for v in me.vertices if v.co.z < lo.z + dims.z * 0.06]
        cx, cy = sum(c.x for c in base) / len(base), sum(c.y for c in base) / len(base)
    else:
        cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    sx, sy, sz = (cfg["size"][k] / dims[k] for k in range(3))
    me.transform(Matrix.Diagonal((sx, sy, sz, 1.0)) @ Matrix.Translation((-cx, -cy, -lo.z)))
    mname = cfg.get("mat", "mp_" + name)
    img = tripo_image(src, mname, cfg.get("gain", 1.0))
    tpl = {"mat": mname, "hi": tripo_tris(src)}
    if cfg.get("inlay"):
        tpl["inlay"] = cfg["inlay"]
        tpl["gold"] = inlay_faces(img, tpl["hi"])
        rich = recolor(img, mname + "_rich", True)
        bpy.data.images.remove(img)
        img = rich
        image_material(cfg["inlay"], recolor(img, cfg["inlay"], False))
        if cfg["inlay"] not in MATS:
            MATS.append(cfg["inlay"])
    image_material(mname, img)
    if cfg.get("lo"):
        mod = src.modifiers.new("lo", "DECIMATE")
        mod.ratio = cfg["lo"] / len(me.polygons)
        dg = bpy.context.evaluated_depsgraph_get()
        tpl["lo"] = tripo_tris(src, dg)
        src.evaluated_get(dg).to_mesh_clear()
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    if mname not in MATS:
        MATS.append(mname)
    return tpl


def flower_materials():
    import numpy as np
    src = texgen.load_photo("flowerbed", os.path.join(ROOT, "assets", "textures"))
    w, h = src.size
    px = np.array(src.pixels[:], np.float32).reshape(-1, 4)
    mx, mn = px[:, :3].max(1), px[:, :3].min(1)
    petal = np.clip((mn - 0.45) / 0.25, 0, 1) * np.clip(1 - (mx - mn) / 0.35, 0, 1)
    for i, hexs in enumerate(FLOWER_COLS):
        c = np.array(texgen.hexc(hexs)[:3], np.float32)
        out = px.copy()
        lum = px[:, :3].mean(1, keepdims=True)
        out[:, :3] = px[:, :3] * (1 - petal[:, None]) + np.clip(c[None] * (0.35 + lum * 0.9), 0, 1) * petal[:, None]
        name = "flowerbed_%d" % i
        img = bpy.data.images.new(name + "_tmp", w, h, alpha=True)
        img.pixels.foreach_set(out.ravel())
        path = os.path.join(bpy.app.tempdir or "/tmp", name + ".png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        bpy.data.images.remove(img)
        res = bpy.data.images.load(path, check_existing=False)
        res.name = name
        res.pack()
        image_material(name, res)
        if name not in MATS:
            MATS.append(name)
        TEX_METERS[name] = TEX_METERS["flowerbed"]


def solid(B, v8, mat, col=(1, 1, 1), cols=None):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in v8]
    for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (3, 2, 6, 7), (0, 3, 7, 4), (1, 5, 6, 2)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    B.add_bm(bm, mat, col=col, col_fn=cols)


class MapBuilder:
    def __init__(self, g):
        self.g = g
        self.W = g["width"]
        self.D = g["depth"]
        self.rim = g["rimHeight"]
        self.props = Builder("Props")
        self.grass = Builder("TallGrass")
        self.tufts = Builder("Tufts")
        self.fx = []
        self.sur = g.get("surround")
        self.alpine = bool(self.sur) and self.sur.get("style") == "alpine"
        self.ruined = MAP_NAME == "ruins"
        self.tpl = None
        if self.ruined:
            sect = lambda pts: self.ruin_sect(sum(p.x for p in pts) / len(pts), -sum(p.y for p in pts) / len(pts))
            self.props.remap = {"brick": sect, "ruinstone": sect}

    def idx(self, x, z):
        return z * self.W + x if 0 <= x < self.W and 0 <= z < self.D else -1

    def kind(self, x, z):
        i = self.idx(x, z)
        return WALL if i < 0 else self.g["kinds"][i]

    def style(self, x, z):
        i = self.idx(x, z)
        return "" if i < 0 else self.g["styles"][i]

    def flag(self, x, z, f):
        i = self.idx(x, z)
        return i >= 0 and (self.g["flags"][i] & f) != 0

    def vh(self, vx, vz):
        vx = min(self.W, max(0, vx))
        vz = min(self.D, max(0, vz))
        return self.g["heights"][vz * (self.W + 1) + vx]

    def corners(self, x, z):
        return [self.vh(x, z), self.vh(x + 1, z), self.vh(x + 1, z + 1), self.vh(x, z + 1)]

    def outer_h(self, x, z):
        s = self.sur
        if not s:
            return self.rim
        fx = min(s["nx"] - 1e-3, max(0.0, (x - s["x0"]) / s["step"]))
        fz = min(s["nz"] - 1e-3, max(0.0, (z - s["z0"]) / s["step"]))
        i, j = int(fx), int(fz)
        u, v = fx - i, fz - j
        H = s["heights"]
        w = s["nx"] + 1
        a, b = H[j * w + i], H[j * w + i + 1]
        c, d = H[(j + 1) * w + i], H[(j + 1) * w + i + 1]
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v

    def ground_h(self, x, z):
        if x < 0 or z < 0 or x > self.W or z > self.D:
            return self.outer_h(x, z)
        cx = min(self.W - 1, max(0, int(math.floor(x))))
        cz = min(self.D - 1, max(0, int(math.floor(z))))
        fx, fz = x - cx, z - cz
        h00, h10 = self.vh(cx, cz), self.vh(cx + 1, cz)
        h01, h11 = self.vh(cx, cz + 1), self.vh(cx + 1, cz + 1)
        if fx + fz <= 1:
            return h00 + (h10 - h00) * fx + (h01 - h00) * fz
        return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz)

    def deck(self, x, z):
        return self.g["deck"][self.idx(x, z)]

    def box(self, B, cx, y0, cz, w, h, d, mat, col=(1, 1, 1), rot=0.0):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        m = Matrix.Translation(G(cx, y0 + h / 2, cz)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Diagonal((w, d, h, 1))
        B.add_bm(bm, mat, col=col, matrix=m,
                 col_fn=lambda p: tuple(c * (0.72 + 0.28 * min(1, max(0, (p.z - y0) / max(h, 0.01)))) for c in col))

    def walls(self):
        P = self.props
        for z in range(self.D):
            for x in range(self.W):
                if self.kind(x, z) != WALL:
                    continue
                st = self.style(x, z)
                if st == "rim":
                    continue
                if st == "pit":
                    self.pit(x, z)
                    continue
                c = self.corners(x, z)
                base = min(c) - 0.4
                if self.ruined and st in ("castle", "ruin"):
                    self.ruin_cell(x, z, c, st)
                    continue
                if st == "hedge":
                    self.hedge(x, z, c)
                    continue
                if st == "castle":
                    top = max(c) + 2.1
                    tops = [top] * 4
                else:
                    top = max(c) + 0.6 + hsh(x, z) * 1.2
                    tops = [top + (hsh(px, pz, 9) - 0.5) * 0.5 for (px, pz) in ((x, z), (x + 1, z), (x + 1, z + 1), (x, z + 1))]
                pts = [(x, z), (x + 1, z), (x + 1, z + 1), (x, z + 1)]
                v8 = [G(px, base, pz) for (px, pz) in pts] + [G(px, t, pz) for (px, pz), t in zip(pts, tops)]
                tint = (1, 1, 1) if st == "castle" else (0.95, 0.97, 0.92)
                solid(P, v8, "brick" if st == "castle" else "ruinstone", cols=lambda p, b=base, t=top, tint=tint: tuple(
                    c * (0.7 + 0.3 * min(1, max(0, (p.z - b) / max(0.1, t - b)))) for c in tint))
                if st == "castle":
                    P.face([G(x, top + 0.01, z), G(x, top + 0.01, z + 1), G(x + 1, top + 0.01, z + 1), G(x + 1, top + 0.01, z)],
                           "cobble", col=(0.9, 0.9, 0.9))
                    if (x + z) % 2 == 0:
                        self.box(P, x + 0.5, top, z + 0.5, 0.55, 0.5, 0.55, "brick")
                elif hsh(x, z, 4) < 0.5:
                    self.rock(x + 0.5 + (hsh(x, z, 6) - 0.5), z + 1.3, 0.3, seed=x * 7 + z)

    def is_ruinwall(self, x, z):
        return 0 <= x < self.W and 0 <= z < self.D and self.kind(x, z) == WALL and self.style(x, z) in ("castle", "ruin")

    def ruin_sect(self, px, pz):
        n = vnoise3(px * 0.21 + 1.3, 4.2, pz * 0.21 + 2.9)
        return RUIN_WALLS[0 if n < 0.43 else 1 if n < 0.57 else 2]

    def ruin_tint(self, px, pz):
        n = vnoise3(px * 0.17 + 9.1, 2.2, pz * 0.17 - 4.0)
        cool, warm, green = (0.9, 0.95, 1.0), (1.0, 0.95, 0.84), (0.88, 0.97, 0.84)
        if n < 0.5:
            t = n * 2
            return tuple(a + (b - a) * t for a, b in zip(cool, green))
        t = (n - 0.5) * 2
        return tuple(a + (b - a) * t for a, b in zip(green, warm))

    def ruin_collapse(self, px, pz):
        n = vnoise3(px * 0.33 + 17, 0.5, pz * 0.33 + 5)
        return min(1.0, max(0.0, (n - 0.6) / 0.22))

    def ruin_h(self, gx, gz, st):
        px, pz = gx / 3, gz / 3
        g = self.ground_h(px, pz)
        if st == "castle":
            h = 2.1 - self.ruin_collapse(px, pz) * 1.0 - (hsh(gx, gz, 13) ** 2) * 0.45
        else:
            h = 1.15 + vnoise3(px * 0.7, 1.0, pz * 0.7) * 0.75 - self.ruin_collapse(px, pz) * 0.25 - hsh(gx, gz, 14) * 0.35
        return g + max(1.0, h)

    def ruin_moss(self, gx, gz, top):
        px, pz = gx / 3, gz / 3
        g = self.ground_h(px, pz)
        m = g + 0.25 + vnoise3(px * 1.1, 2.0, pz * 1.1) * 0.75 + hsh(gx, gz, 15) * 0.2
        return min(m, top - 0.18)

    def ruin_cell(self, x, z, c, st):
        P = self.props
        base = min(c) - 0.4
        lat = {}

        def L(i, j):
            if (i, j) not in lat:
                lat[(i, j)] = self.ruin_h(x * 3 + i, z * 3 + j, st)
            return lat[(i, j)]

        def V(i, j, h):
            return G(x + i / 3, h, z + j / 3)

        def shade(p, gy, top, streak):
            t = min(1.0, max(0.0, (p.z - base) / max(0.1, top - base)))
            tint = self.ruin_tint(p.x, -p.y)
            k = 0.68 + 0.32 * t
            if streak:
                k *= 1.0 - streak * min(1.0, max(0.0, (p.z - gy) / max(0.1, top - gy))) * 0.45
            return tuple(min(1.0, a * k) for a in tint)

        for i in range(3):
            for j in range(3):
                q = [V(i, j, L(i, j)), V(i, j + 1, L(i, j + 1)), V(i + 1, j + 1, L(i + 1, j + 1)), V(i + 1, j, L(i + 1, j))]
                if newell(q).z < 0:
                    q.reverse()
                P.face(q, "ruintop", cols=[tuple(min(1.0, a * 0.95) for a in self.ruin_tint(p.x, -p.y)) for p in q])
        sides = (((0, -1), lambda k: (k, 0)), ((1, 0), lambda k: (3, k)), ((0, 1), lambda k: (3 - k, 3)), ((-1, 0), lambda k: (0, 3 - k)))
        for (dx, dz), at in sides:
            if self.is_ruinwall(x + dx, z + dz):
                continue
            nk = self.kind(x + dx, z + dz)
            walk = nk in (GROUND, PROP) and 0 <= x + dx < self.W and 0 <= z + dz < self.D
            ivy = walk and hsh(x * 2 + dx, z * 2 + dz, 71) < 0.2
            outv = G(dx, 0, dz) * 0.035
            for k in range(3):
                a, b = at(k), at(k + 1)
                ga, gb = (x * 3 + a[0], z * 3 + a[1]), (x * 3 + b[0], z * 3 + b[1])
                ta, tb = L(*a), L(*b)
                ma, mb = self.ruin_moss(*ga, ta), self.ruin_moss(*gb, tb)
                gya = self.ground_h(ga[0] / 3, ga[1] / 3)
                gyb = self.ground_h(gb[0] / 3, gb[1] / 3)
                mat = self.ruin_sect(x + (a[0] + b[0]) / 6, z + (a[1] + b[1]) / 6)
                streak = 1.0 if hsh(*ga, 31 + dx * 2 + dz) < 0.28 else 0.0
                pa, pb = V(*a, 0), V(*b, 0)
                lower = [Vector((pa.x, pa.y, base)), Vector((pb.x, pb.y, base)), Vector((pb.x, pb.y, mb)), Vector((pa.x, pa.y, ma))]
                upper = [Vector((pa.x, pa.y, ma)), Vector((pb.x, pb.y, mb)), Vector((pb.x, pb.y, tb)), Vector((pa.x, pa.y, ta))]
                nrm = G(dx, 0, dz)
                along = (pb - pa).normalized()
                m = TEX_METERS["ruin_b"]
                for q, mt in ((lower, "ruin_b"), (upper, mat)):
                    cols = [shade(p, gya if p.xy == pa.xy else gyb, ta if p.xy == pa.xy else tb, streak) for p in q]
                    if mt == "ruin_b":
                        uvs = [(p.dot(along) / m, (p.z - (gya + gyb) / 2 + 0.05) / m) for p in q]
                        cols = [tuple(cc * gg for cc, gg in zip(cl, (0.95, 1.0, 0.9))) for cl in cols]
                    else:
                        uvs = [(p.dot(along) / m, p.z / m) for p in q]
                    if newell(q).dot(nrm) < 0:
                        q, uvs, cols = list(reversed(q)), list(reversed(uvs)), list(reversed(cols))
                    P.face(q, mt, uvs=uvs, cols=cols)
                if ivy:
                    la = ta - (0.5 + hsh(*ga, 72) * 1.1)
                    lb = tb - (0.5 + hsh(*gb, 72) * 1.1)
                    q = [Vector((pa.x, pa.y, max(la, ma - 0.2))) + outv, Vector((pb.x, pb.y, max(lb, mb - 0.2))) + outv,
                         Vector((pb.x, pb.y, tb + 0.03)) + outv, Vector((pa.x, pa.y, ta + 0.03)) + outv]
                    cols = [(0.55, 0.6, 0.55), (0.55, 0.6, 0.55), (0.85, 0.88, 0.82), (0.85, 0.88, 0.82)]
                    uvs = [(p.dot(along) / TEX_METERS["ivy"], p.z / TEX_METERS["ivy"]) for p in q]
                    if newell(q).dot(nrm) < 0:
                        q, uvs, cols = list(reversed(q)), list(reversed(uvs)), list(reversed(cols))
                    P.face(q, "ivy", uvs=uvs, cols=cols)
                    inn = G(-dx, 0, -dz) * 0.28
                    lip = [Vector((pa.x, pa.y, ta + 0.03)) + outv, Vector((pb.x, pb.y, tb + 0.03)) + outv,
                           Vector((pb.x, pb.y, tb + 0.03)) + inn, Vector((pa.x, pa.y, ta + 0.03)) + inn]
                    for p in lip[2:]:
                        p.z = max(p.z, self.ruin_top_at(p.x, -p.y, st) + 0.03)
                    if newell(lip).z < 0:
                        lip.reverse()
                    P.face(lip, "ivy", cols=[(0.85, 0.88, 0.82)] * 4)
            if walk:
                self.ruin_rubble(x, z, dx, dz, st)
        if st == "castle" and (x + z) % 2 == 0 and hsh(x, z, 61) > 0.3 and self.ruin_collapse(x + 0.5, z + 0.5) < 0.4:
            r = random.Random(x * 917 + z)
            h = min(L(1, 1), L(2, 1), L(1, 2), L(2, 2)) - 0.05
            hh = r.uniform(0.25, 0.55)
            self.box(P, x + 0.5 + r.uniform(-0.1, 0.1), h, z + 0.5 + r.uniform(-0.1, 0.1), 0.55 * r.uniform(0.75, 1.0), hh,
                     0.55 * r.uniform(0.75, 1.0), self.ruin_sect(x, z), col=self.ruin_tint(x, z), rot=r.uniform(-0.2, 0.2))

    def ruin_top_at(self, px, pz, st):
        return self.ruin_h(round(px * 3), round(pz * 3), st)

    def ruin_rubble(self, x, z, dx, dz, st):
        r = random.Random(x * 7919 + z * 31 + dx * 3 + dz)
        col = self.ruin_collapse(x + 0.5, z + 0.5)
        if r.random() > 0.3 + col * 0.6:
            return
        t = r.uniform(0.25, 0.75)
        if dx:
            ex, ez = (x + 1 if dx > 0 else x), z + t
        else:
            ex, ez = x + t, (z + 1 if dz > 0 else z)
        cx, cz = ex + dx * 0.22, ez + dz * 0.22
        y = self.ground_h(cx, cz)
        big = 1.0 + col * 0.8
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        for v in bm.verts:
            v.co *= 1.0 + r.uniform(-0.25, 0.25)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.co.z < -0.15 for v in f.verts)], context="FACES")
        sx = (0.32 if dx else 0.6) * big
        sz = (0.6 if dx else 0.32) * big
        m = Matrix.Translation(G(cx, y - 0.06, cz)) @ Matrix.Diagonal((sx, sz, 0.26 * big, 1))
        tint = self.ruin_tint(cx, cz)
        self.props.add_bm(bm, "rubble", matrix=m, col_fn=lambda p: tuple(a * (0.62 + 0.38 * min(1.0, max(0.0, (p.z - y) / (0.26 * big)))) for a in tint))
        for k in range(1 + int(col * 2 + r.random() * 1.4)):
            px = cx + r.uniform(-0.35, 0.35) * (0.5 if dx else 1.0) + dx * r.uniform(0.05, 0.35)
            pz = cz + r.uniform(-0.35, 0.35) * (1.0 if dx else 0.5) + dz * r.uniform(0.05, 0.35)
            s = r.uniform(0.14, 0.26) * (1 + col * 0.5)
            name = ROCKS[r.randrange(2)]
            self.place_tripo(name, px, self.ground_h(px, pz) - TRIPO[name]["size"][2] * s * 0.2, pz, s, r, lo=True)
        if st == "castle" and r.random() < 0.35:
            px, pz = cx + dx * 0.55 + r.uniform(-0.2, 0.2), cz + dz * 0.55 + r.uniform(-0.2, 0.2)
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            m = (Matrix.Translation(G(px, self.ground_h(px, pz) + 0.12, pz)) @ Matrix.Rotation(r.uniform(0, 3.1), 4, "Z")
                 @ Matrix.Rotation(r.uniform(-0.35, 0.35), 4, "X") @ Matrix.Diagonal((0.5, 0.4, 0.34, 1)))
            self.props.add_bm(bm, self.ruin_sect(px, pz), matrix=m, col_fn=lambda p: tuple(a * 0.85 for a in tint))

    def is_hedge(self, x, z):
        return 0 <= x < self.W and 0 <= z < self.D and self.kind(x, z) == WALL and self.style(x, z) == "hedge"

    def hedge_edge(self, px, pz):
        best, vec = 9.0, Vector((0, 0))
        for cz in range(int(math.floor(pz)) - 1, int(math.floor(pz)) + 2):
            for cx in range(int(math.floor(px)) - 1, int(math.floor(px)) + 2):
                if self.is_hedge(cx, cz):
                    continue
                dx = max(cx - px, 0.0, px - cx - 1)
                dz = max(cz - pz, 0.0, pz - cz - 1)
                d = math.hypot(dx, dz)
                vx = (1 if cx + 0.5 > px else -1) if (px <= cx + 1e-6 or px >= cx + 1 - 1e-6) else 0
                vz = (1 if cz + 0.5 > pz else -1) if (pz <= cz + 1e-6 or pz >= cz + 1 - 1e-6) else 0
                if d < best - 1e-6:
                    best, vec = d, Vector((vx, vz))
                elif d < best + 1e-6:
                    vec += Vector((vx, vz))
        if vec.length > 0:
            vec.normalize()
        return best, vec

    def hedge_pt(self, px, py, pz, top):
        d, out = self.hedge_edge(px, pz)
        r = 0.42
        e = min(d, r)
        drop = r - math.sqrt(max(0.0, r * r - (r - e) ** 2))
        n1 = vnoise3(px * 2.3, py * 2.3, pz * 2.3)
        n2 = vnoise3(px * 0.7 + 7, py * 0.7, pz * 0.7 + 3)
        lump = (n1 - 0.5) * 0.2 + (n2 - 0.5) * 0.16
        y = min(py, top - drop)
        k = 1.0 - min(1.0, d / r)
        push = (lump - 0.07) * k
        return Vector((px + out.x * push, -(pz + out.y * push), y + (lump * 0.8 if py >= top - drop - 1e-6 else 0.0)))

    def hedge_mat(self, x, z):
        n = vnoise3(x * 0.16 + 3.7, 1.3, z * 0.16 + 8.1) * 0.8 + hsh(x // 3, z // 3, 41) * 0.2
        return HEDGES[0 if n < 0.44 else 1 if n < 0.56 else 2]

    def hedge_col(self, p, base, top):
        t = min(1.0, max(0.0, (p.z - base) / (top - base)))
        n1 = vnoise3(p.x * 0.22, 3.1, p.y * 0.22)
        n2 = vnoise3(p.x * 0.9 + 5, 1.7, p.y * 0.9 - 2)
        k = (0.8 + 0.16 * n1 + 0.08 * n2) * (0.62 + 0.38 * t)
        warm = vnoise3(p.x * 0.13 + 11, 7.0, p.y * 0.13) - 0.5
        return (min(1.0, k * (1.0 + warm * 0.35)), min(1.0, k * (1.0 + warm * 0.06)), min(1.0, k * (0.92 - warm * 0.3)))

    def hedge_uv(self, pts, top):
        m = TEX_METERS["hedge"]
        if top:
            ca, sa = math.cos(0.65), math.sin(0.65)
            return [((p.x * ca - p.y * sa) / m, (p.x * sa + p.y * ca) / m) for p in pts]
        n = newell(pts)
        if abs(n.x) >= abs(n.y):
            return [((p.y * (1 if n.x > 0 else -1) + p.x * 0.37) / m, p.z / m) for p in pts]
        return [((p.x * (-1 if n.y > 0 else 1) + p.y * 0.37) / m, p.z / m) for p in pts]

    def hedge(self, x, z, c):
        P = self.props
        base = min(c) - 0.3
        top = max(c) + 1.75
        steps = (0.0, 0.25, 0.75, 1.0)
        tops = {}
        mat = self.hedge_mat(x, z)

        def tp(u, v):
            key = (u, v)
            if key not in tops:
                tops[key] = self.hedge_pt(x + u, 99.0, z + v, top)
            return tops[key]

        def col(p):
            return self.hedge_col(p, base, top)

        n = len(steps) - 1
        for i in range(n):
            for j in range(n):
                q = [tp(steps[i], steps[j]), tp(steps[i], steps[j + 1]), tp(steps[i + 1], steps[j + 1]), tp(steps[i + 1], steps[j])]
                if newell(q).z < 0:
                    q.reverse()
                P.face(q, mat, uvs=self.hedge_uv(q, True), cols=[col(p) for p in q])
        sides = (((0, -1), lambda t: (t, 0.0)), ((1, 0), lambda t: (1.0, t)), ((0, 1), lambda t: (1 - t, 1.0)), ((-1, 0), lambda t: (0.0, 1 - t)))
        hs = (0.0, 0.6)
        for (dx, dz), at in sides:
            if self.is_hedge(x + dx, z + dz):
                continue
            for i in range(n):
                a, b = at(steps[i]), at(steps[i + 1])
                ta, tb = tp(*a), tp(*b)
                col_a = [self.hedge_pt(x + a[0], base + (ta.z - base) * f, z + a[1], top) for f in hs] + [ta]
                col_b = [self.hedge_pt(x + b[0], base + (tb.z - base) * f, z + b[1], top) for f in hs] + [tb]
                for k in range(len(hs)):
                    q = [col_a[k], col_b[k], col_b[k + 1], col_a[k + 1]]
                    if newell(q).dot(Vector((dx, -dz, 0))) < 0:
                        q.reverse()
                    P.face(q, mat, uvs=self.hedge_uv(q, False), cols=[col(p) for p in q])

    def is_pit(self, x, z):
        return 0 <= x < self.W and 0 <= z < self.D and self.kind(x, z) == WALL and self.style(x, z) == "pit"

    def pit(self, x, z):
        P = self.props
        depth = 3.5
        c = self.corners(x, z)
        hv = {(x, z): c[0], (x + 1, z): c[1], (x + 1, z + 1): c[2], (x, z + 1): c[3]}
        top_c, bot_c = (0.42, 0.4, 0.38), (0.02, 0.02, 0.03)
        edges = (((x, z), (x + 1, z), (0, -1)), ((x + 1, z), (x + 1, z + 1), (1, 0)),
                 ((x + 1, z + 1), (x, z + 1), (0, 1)), ((x, z + 1), (x, z), (-1, 0)))
        for a, b, (dx, dz) in edges:
            if self.is_pit(x + dx, z + dz):
                continue
            ha, hb = hv[a], hv[b]
            quad = [G(a[0], ha, a[1]), G(b[0], hb, b[1]), G(b[0], hb - depth, b[1]), G(a[0], ha - depth, a[1])]
            cols = [top_c, top_c, bot_c, bot_c]
            uvs = [(0, 1), (1, 1), (1, 0), (0, 0)]
            if newell(quad).dot(G(-dx, 0, -dz)) < 0:
                quad, uvs, cols = list(reversed(quad)), list(reversed(uvs)), list(reversed(cols))
            P.face(quad, "cliff", uvs=uvs, cols=cols)
            if hsh(x, z, dx * 3 + dz + 11) < 0.55:
                t = 0.25 + hsh(x, z, dx + 5) * 0.5
                px = a[0] + (b[0] - a[0]) * t - dx * 0.15
                pz = a[1] + (b[1] - a[1]) * t - dz * 0.15
                self.rock(px, pz, 0.14 + hsh(x, z, 21) * 0.12, seed=x * 13 + z * 7 + dx, y=self.ground_h(px, pz) - 0.05)
        yb = min(c) - depth
        floor = [G(x, yb, z), G(x, yb, z + 1), G(x + 1, yb, z + 1), G(x + 1, yb, z)]
        if newell(floor).dot(G(0, 1, 0)) < 0:
            floor = list(reversed(floor))
        P.face(floor, "cliff", col=bot_c)

    def bridge_axes(self):
        seen, axes = set(), {}
        for z0 in range(self.D):
            for x0 in range(self.W):
                if self.kind(x0, z0) != BRIDGE or (x0, z0) in seen:
                    continue
                st = self.style(x0, z0)
                comp, todo = [], [(x0, z0)]
                seen.add((x0, z0))
                while todo:
                    c = todo.pop()
                    comp.append(c)
                    for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        n = (c[0] + dx, c[1] + dz)
                        if n not in seen and self.kind(*n) == BRIDGE and self.style(*n) == st:
                            seen.add(n)
                            todo.append(n)
                cells = set(comp)
                land = {"x": 0, "z": 0}
                for (cx, cz) in comp:
                    for dx, dz, ax in ((1, 0, "x"), (-1, 0, "x"), (0, 1, "z"), (0, -1, "z")):
                        n = (cx + dx, cz + dz)
                        if n not in cells and self.kind(*n) in (GROUND, PROP, FORD):
                            land[ax] += 1
                xs, zs = [c[0] for c in comp], [c[1] for c in comp]
                if land["x"] == land["z"]:
                    walk = "x" if max(xs) - min(xs) >= max(zs) - min(zs) else "z"
                else:
                    walk = "x" if land["x"] > land["z"] else "z"
                for c in comp:
                    axes[c] = walk
        return axes

    def plank_uv(self, along):
        m = TEX_METERS["planks"]

        def fn(pts):
            n = newell(pts).normalized()
            u = n.cross(along)
            if u.length < 0.3:
                u = n.cross(Vector((0, 0, 1)))
                v = n.cross(u)
            else:
                v = along
            u.normalize()
            return [(p.dot(u) / m, p.dot(v) / m) for p in pts]
        return fn

    def plank_box(self, B, cx, y0, cz, w, h, d, along, col=(1, 1, 1)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        m = Matrix.Translation(G(cx, y0 + h / 2, cz)) @ Matrix.Diagonal((w, d, h, 1))
        B.add_bm(bm, "planks", col=col, matrix=m, uv_fn=self.plank_uv(along),
                 col_fn=lambda p: tuple(c * (0.72 + 0.28 * min(1, max(0, (p.z - y0) / max(h, 0.01)))) for c in col))

    def bridges(self):
        P = self.props
        axes = self.bridge_axes()
        for z in range(self.D):
            for x in range(self.W):
                if self.kind(x, z) != BRIDGE:
                    continue
                stone = self.style(x, z) == "stone"
                y = self.deck(x, z)
                thick = 0.6 if stone else 0.25
                top_mat = "cobble" if stone else "planks"
                side_mat = "brick" if stone else "planks"
                across = G(0, 0, 1) if axes[(x, z)] == "x" else G(1, 0, 0)
                puv = None if stone else self.plank_uv(across)
                top = [G(x, y, z), G(x, y, z + 1), G(x + 1, y, z + 1), G(x + 1, y, z)]
                bot = [G(x, y - thick, z), G(x + 1, y - thick, z), G(x + 1, y - thick, z + 1), G(x, y - thick, z + 1)]
                P.face(top, top_mat, uvs=puv(top) if puv else None)
                P.face(bot, side_mat, col=(0.5, 0.5, 0.5), uvs=puv(bot) if puv else None)
                edges = (
                    (x, z - 1, (x + 1, z), (x, z)),
                    (x, z + 1, (x, z + 1), (x + 1, z + 1)),
                    (x - 1, z, (x, z), (x, z + 1)),
                    (x + 1, z, (x + 1, z + 1), (x + 1, z)),
                )
                for (nx, nz, a, b) in edges:
                    if self.kind(nx, nz) == BRIDGE:
                        continue
                    side = [G(a[0], y, a[1]), G(a[0], y - thick, a[1]), G(b[0], y - thick, b[1]), G(b[0], y, b[1])]
                    P.face(side, side_mat, cols=[(1, 1, 1), (0.65, 0.65, 0.65), (0.65, 0.65, 0.65), (1, 1, 1)],
                           uvs=puv(side) if puv else None)
                    nk = self.kind(nx, nz)
                    ng = self.ground_h(nx + 0.5, nz + 0.5)
                    bank = nk in (GROUND, PROP, FORD) and abs(ng - y) < 0.6
                    if bank:
                        continue
                    mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                    ix, iz = (x + 0.5 - mx) * 0.3, (z + 0.5 - mz) * 0.3
                    along_x = a[1] == b[1]
                    if stone:
                        self.box(P, mx + ix, y, mz + iz, 1.0 if along_x else 0.3, 0.55, 0.3 if along_x else 1.0, "brick")
                    else:
                        up = G(0, 1, 0)
                        self.plank_box(P, mx + ix * 0.5, y, mz + iz * 0.5, 0.12, 0.85, 0.12, up)
                        self.plank_box(P, mx + ix * 0.5, y + 0.75, mz + iz * 0.5, 1.0 if along_x else 0.1, 0.1,
                                       0.1 if along_x else 1.0, G(1, 0, 0) if along_x else G(0, 0, 1))
                gy = self.ground_h(x + 0.5, z + 0.5)
                if gy < y - thick - 0.3:
                    if stone and (x + z) % 3 == 0:
                        self.box(P, x + 0.5, gy - 0.3, z + 0.5, 0.9, y - thick - gy + 0.3, 0.9, "brick", col=(0.8, 0.8, 0.8))
                    if not stone and (x + z) % 2 == 0:
                        self.plank_box(P, x + 0.5, gy - 0.3, z + 0.5, 0.18, y - thick - 0.02 - gy + 0.3, 0.18, G(0, 1, 0), col=(0.7, 0.7, 0.7))

    def inside(self, x, z):
        return self.tpl is not None and 0 <= x <= self.W and 0 <= z <= self.D

    def place_tripo(self, name, x, y, z, s, r, lo=False, clip=None, below=None):
        tpl = self.tpl[name]
        tint = r.uniform(0.9, 1.04)
        m = Matrix.Translation(G(x, y, z)) @ Matrix.Rotation(r.uniform(0, math.tau), 4, "Z") @ Matrix.Scale(s, 4)
        for pts, uvs in tpl["lo" if lo and "lo" in tpl else "hi"]:
            if below is not None and max(p.z for p in pts) > below:
                continue
            q = [m @ p for p in pts]
            if clip is not None and all(p.z < clip for p in q):
                continue
            self.props.face(q, tpl["mat"], col=(tint, tint, tint), uvs=uvs)

    def tripo_rock(self, x, z, s, seed, y=None):
        r = random.Random(seed * 7 + 3)
        pool = ROCKS if s >= 0.6 else ROCKS[:2]
        name = pool[int(hsh(x, z, 17) * len(pool)) % len(pool)]
        s *= r.uniform(0.92, 1.08)
        w = max(TRIPO[name]["size"][:2]) * s * 0.35
        gs = [self.ground_h(x + dx, z + dz) for dx, dz in ((0, 0), (w, 0), (-w, 0), (0, w), (0, -w))]
        base = (gs[0] + min(gs)) / 2 if y is None else min(y, (gs[0] + min(gs)) / 2)
        self.place_tripo(name, x, base - TRIPO[name]["size"][2] * s * 0.18, z, s, r, lo=s < 0.6)

    def tripo_tree(self, name, x, z, s, seed):
        r = random.Random(seed * 3 + 1)
        gs = [self.ground_h(x + dx, z + dz) for dx, dz in ((0, 0), (0.3, 0), (-0.3, 0), (0, 0.3), (0, -0.3))]
        self.place_tripo(name, x, min(gs) - 0.12 * s, z, s * r.uniform(0.94, 1.06), r)

    def rock(self, x, z, s, seed=0, y=None):
        if self.inside(x, z):
            self.tripo_rock(x, z, s, seed, y)
            return
        r = random.Random(seed)
        y = self.ground_h(x, z) if y is None else y
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        for v in bm.verts:
            v.co *= 1.0 + r.uniform(-0.22, 0.22)
        m = (Matrix.Translation(G(x, y + s * 0.3, z)) @ Matrix.Rotation(r.uniform(0, 6.3), 4, "Z")
             @ Matrix.Diagonal((s * 1.2, s, s * 0.8, 1)))
        self.props.add_bm(bm, "cliff", col=(0.9, 0.88, 0.85), matrix=m)

    def cliff_rubble(self):
        r = random.Random(5)
        for z in range(self.D):
            for x in range(self.W):
                if self.kind(x, z) not in (GROUND, WATER):
                    continue
                c = self.corners(x, z)
                if max(c) - min(c) > 1.3 and r.random() < 0.22:
                    lo = min(range(4), key=lambda i: c[i])
                    px, pz = ((x, z), (x + 1, z), (x + 1, z + 1), (x, z + 1))[lo]
                    self.rock(px + r.uniform(-0.3, 0.3), pz + r.uniform(-0.3, 0.3), r.uniform(0.25, 0.55), seed=x * 31 + z)

    def tree(self, x, y, z, s=1.0, seed=0):
        r = random.Random(seed)
        P = self.props
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=6, radius1=0.24 * s, radius2=0.14 * s, depth=1.8 * s)
        P.add_bm(bm, "bark", matrix=Matrix.Translation(G(x, y + 0.8 * s, z)), uv_fn=lambda pts: cyl_uv(pts, G(x, 0, z), 1.0))
        for (ox, oy, oz, rad) in ((0, 2.1, 0, 1.1), (0.5, 1.7, 0.3, 0.8), (-0.45, 1.8, -0.25, 0.75), (0.1, 2.75, 0.1, 0.7)):
            bm = bmesh.new()
            bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rad * s)
            for v in bm.verts:
                v.co *= 1.0 + r.uniform(-0.1, 0.1)
            cy = y + oy * s
            P.add_bm(bm, "leaves", matrix=Matrix.Translation(G(x + ox * s, cy, z + oz * s)) @ Matrix.Diagonal((1, 1, 0.85, 1)),
                     col_fn=lambda p, cy=cy, rad=rad: (lambda t: (0.68 + 0.32 * t, 0.72 + 0.28 * t, 0.68 + 0.32 * t))(
                         min(1, max(0, (p.z - cy) / (rad * s) * 0.5 + 0.5))))

    def pine(self, x, y, z, s=1.0, seed=0):
        P = self.props
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=5, radius1=0.2 * s, radius2=0.12 * s, depth=1.2 * s)
        P.add_bm(bm, "bark", matrix=Matrix.Translation(G(x, y + 0.5 * s, z)))
        for (oy, rad, dep) in ((0.7, 1.2, 1.6), (1.7, 0.95, 1.4), (2.6, 0.62, 1.2)):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=rad * s, radius2=0.0, depth=dep * s)
            base = y + oy * s
            P.add_bm(bm, "pine", matrix=Matrix.Translation(G(x, base + dep * s / 2, z)) @ Matrix.Rotation(seed + oy, 4, "Z"),
                     col_fn=lambda p, base=base, dep=dep: (lambda t: (0.62 + 0.38 * t,) * 3)(
                         min(1, max(0, (p.z - base) / (dep * s)))))

    def arch(self, x, z, rot, ruined=False):
        P = self.props
        r180 = rot % 180
        axis_x = r180 < 45 or r180 > 135
        half_span, pillar_h, rad_o, rad_i, depth = 1.5, 1.8, 1.95, 1.35, 0.7
        bases = []
        for i, sgn in enumerate((-1, 1)):
            px = x + (sgn * (half_span + 0.3) if axis_x else 0)
            pz = z + (0 if axis_x else sgn * (half_span + 0.3))
            by = self.ground_h(px, pz) - 0.3
            bases.append(by)
            h = pillar_h + 0.3 if not (ruined and i == 1) else (pillar_h + 0.3) * 0.5
            self.box(P, px, by, pz, 0.6 if axis_x else depth, h, depth if axis_x else 0.6, "brick")
        cy = max(bases) + 0.3 + pillar_h
        segs = 9
        for s in range(4 if ruined else segs):
            a0, a1 = math.pi * s / segs, math.pi * (s + 1) / segs

            def pt(a, r, off):
                u, v = math.cos(a) * r, math.sin(a) * r
                return G(x - u, cy + v, z + off) if axis_x else G(x + off, cy + v, z - u)

            f, b = -depth / 2, depth / 2
            solid(P, [pt(a0, rad_o, f), pt(a1, rad_o, f), pt(a1, rad_i, f), pt(a0, rad_i, f),
                      pt(a0, rad_o, b), pt(a1, rad_o, b), pt(a1, rad_i, b), pt(a0, rad_i, b)], "brick")
        if not ruined:
            self.box(P, x, cy + rad_o - 0.3, z, 0.45, 0.5, depth + 0.1, "gold")

    def tower(self, x, z, side):
        P = self.props
        cx, cz = int(x), int(z)
        y = min(self.corners(cx, cz)) - 0.3
        H = 4.2
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=1.3, radius2=1.12, depth=H)
        P.add_bm(bm, "brick", matrix=Matrix.Translation(G(x, y + H / 2, z)), uv_fn=lambda pts: cyl_uv(pts, G(x, 0, z), 2.0),
                 col_fn=lambda p: (0.72 + 0.28 * min(1, (p.z - y) / H),) * 3)
        for i in range(8):
            a = i / 8 * math.tau + math.pi / 8
            self.box(P, x + math.cos(a) * 1.05, y + H, z + math.sin(a) * 1.05, 0.45, 0.45, 0.45, "brick", rot=-a)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=1.5, radius2=0.0, depth=2.2)
        tc = TEAM[side]
        P.add_bm(bm, "roof", matrix=Matrix.Translation(G(x, y + H + 0.45 + 1.1, z)),
                 uv_fn=lambda pts: cyl_uv(pts, G(x, 0, z), 1.5), col_fn=lambda p: tuple(c * 0.95 for c in tc))
        self.box(P, x, y + H + 2.5, z, 0.05, 0.9, 0.05, "iron")
        pts = [G(x, y + H + 3.3, z), G(x, y + H + 2.9, z), G(x + 0.6, y + H + 2.95, z), G(x + 0.6, y + H + 3.3, z)]
        uvs = [(0.2, 0.8), (0.2, 0.2), (0.8, 0.2), (0.8, 0.8)]
        P.face(pts, "cloth", uvs=uvs, cols=[tc] * 4)
        P.face(list(reversed(pts)), "cloth", uvs=list(reversed(uvs)), cols=[tc] * 4)

    def banner(self, x, z, side):
        P = self.props
        y = self.ground_h(x, z)
        self.box(P, x, y - 0.2, z, 0.14, 3.4, 0.14, "iron")
        self.box(P, x, y + 3.05, z, 1.3, 0.1, 0.1, "gold")
        tc = TEAM[side]
        top, bot = y + 3.0, y + 1.1
        pts = [G(x - 0.55, top, z + 0.1), G(x - 0.55, bot + 0.25, z + 0.1), G(x, bot, z + 0.1),
               G(x + 0.55, bot + 0.25, z + 0.1), G(x + 0.55, top, z + 0.1)]
        uvs = [(0, 1), (0, 0.1), (0.5, 0), (1, 0.1), (1, 1)]
        P.face(pts, "cloth", uvs=uvs, cols=[tc] * 5)
        P.face(list(reversed(pts)), "cloth", uvs=list(reversed(uvs)), cols=[tc] * 5)

    def torch(self, x, z):
        P = self.props
        y = self.ground_h(x, z)
        self.box(P, x, y - 0.2, z, 0.16, 1.9, 0.16, "iron")
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.12, radius2=0.32, depth=0.3)
        P.add_bm(bm, "gold", matrix=Matrix.Translation(G(x, y + 1.85, z)))
        self.fx.append(("fx_torch", (x, y + 2.1, z)))

    def crate(self, x, z):
        y = self.ground_h(x, z) - 0.1
        r = hsh(x, z) * 0.6
        self.box(self.props, x, y, z, 0.9, 0.9, 0.9, "wood", rot=r)
        self.box(self.props, x + 0.1, y + 0.9, z - 0.05, 0.55, 0.55, 0.55, "wood", rot=r + 0.4)

    def statue(self, x, z):
        P = self.props
        y = self.ground_h(x, z) - 0.2
        self.box(P, x, y, z, 1.3, 0.45, 1.3, "cobble")
        self.box(P, x, y + 0.45, z, 1.0, 0.3, 1.0, "brick")
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.5, radius2=0.28, depth=2.6)
        P.add_bm(bm, "brick", matrix=Matrix.Translation(G(x, y + 0.75 + 1.3, z)) @ Matrix.Rotation(math.pi / 4, 4, "Z"))
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.3, radius2=0.0, depth=0.5)
        P.add_bm(bm, "gold", matrix=Matrix.Translation(G(x, y + 3.35 + 0.25, z)) @ Matrix.Rotation(math.pi / 4, 4, "Z"))
        self.fx.append(("fx_glow", (x, y + 3.8, z)))

    def pad(self, x, z, zone, side):
        y = max(self.ground_h(x + dx, z + dz) for dx in (-1.4, 0, 1.4) for dz in (-1.4, 0, 1.4))
        base = min(self.ground_h(x + dx, z + dz) for dx in (-1.4, 0, 1.4) for dz in (-1.4, 0, 1.4))
        tpl = self.tpl["pad"]
        H = TRIPO["pad"]["size"][2]
        top = y + 0.33
        sink = top - H - (base - 0.08)
        team = zone != "neutral"
        tc = TEAM[side]
        stone = tuple(0.5 + c * 0.5 for c in tc) if team else (1, 1, 1)
        inlay = tuple(0.12 + c * 0.88 for c in tc) if team else (1, 1, 1)
        for (pts, uvs), gold in zip(tpl["hi"], tpl["gold"]):
            out = []
            for p in pts:
                zz = p.z
                if zz < H * 0.6 and sink > 0:
                    zz -= sink * (1 - zz / (H * 0.6))
                out.append(Vector((x + p.x, -z + p.y, top - H + zz)))
            mat = tpl["inlay"] if gold and team else tpl["mat"]
            self.props.face(out, mat, col=inlay if gold else stone, uvs=uvs)
        self.fx.append(("pad_" + zone, (x, y + 0.35, z)))

    def clump(self, B, x, z, w, h, a, cards=2, variant=0):
        y = self.ground_h(x, z) - 0.06
        u0, u1 = variant / 3 + 0.004, (variant + 1) / 3 - 0.004
        for i in range(cards):
            da = a + i * math.pi / cards
            dx, dz = math.cos(da) * w / 2, math.sin(da) * w / 2
            pts = [G(x - dx, y, z - dz), G(x + dx, y, z + dz), G(x + dx, y + h, z + dz), G(x - dx, y + h, z - dz)]
            B.face(pts, "tallgrass", uvs=[(u0, 0), (u1, 0), (u1, 1), (u0, 1)],
                   cols=[(0.86, 0.9, 0.82), (0.86, 0.9, 0.82), (1, 1, 1), (1, 1, 1)])

    def vegetation(self):
        r = random.Random(11)
        wl = self.g["waterLevel"]
        for z in range(self.D):
            for x in range(self.W):
                if self.kind(x, z) not in (GROUND, PROP):
                    continue
                c = self.corners(x, z)
                if min(c) < wl + 0.1:
                    continue
                if self.flag(x, z, FLAG_GRASS) and r.random() < 0.7:
                    for k in range(2):
                        self.clump(self.grass, x + 0.5 + (k - 0.5) * 0.45 + r.uniform(-0.15, 0.15), z + r.uniform(0.25, 0.75),
                                   r.uniform(1.1, 1.3), r.uniform(1.2, 1.45), r.uniform(0, 3.14), variant=r.randrange(3))

    def rim_forest(self):
        r = random.Random(3)
        W, D = self.W, self.D
        for _ in range(int(200 * (W + D) / 144)):
            side = r.randrange(4)
            if side == 0:
                px, pz = r.uniform(-16, W + 16), r.uniform(-16, -1.5)
            elif side == 1:
                px, pz = r.uniform(-16, W + 16), r.uniform(D + 1.5, D + 16)
            elif side == 2:
                px, pz = r.uniform(-16, -1.5), r.uniform(0, D)
            else:
                px, pz = r.uniform(W + 1.5, W + 16), r.uniform(0, D)
            y = self.rim - 0.4
            if r.random() < 0.65:
                self.pine(px, y, pz, r.uniform(1.1, 1.8), seed=r.randrange(9999))
            else:
                self.tree(px, y, pz, r.uniform(1.0, 1.5), seed=r.randrange(9999))

    def place_props(self):
        for p in self.g["props"]:
            t, x, z = p["type"], p["x"], p["z"]
            side = p.get("side", 0)
            y = self.ground_h(x, z) - 0.1
            seed = int(x * 100 + z * 7)
            s = (0.9 + hsh(x, z, 8) * 0.4) * p.get("scale", 1.0)
            if t in ("tree", "pine", "deadtree") and self.inside(x, z):
                if t == "tree":
                    name = "tree_a" if hsh(x, z, 23) < 0.55 else "tree_b"
                elif t == "pine":
                    name = "pine_snow" if self.alpine else "pine_a"
                else:
                    name, s = "deadtree", p.get("scale", 1.0)
                self.tripo_tree(name, x, z, s, seed)
            elif t == "tree":
                self.tree(x, y, z, s, seed)
            elif t == "pine":
                self.pine(x, y, z, s, seed)
            elif t == "rock":
                self.rock(x, z, 0.75 * s, seed)
            elif t == "arch":
                self.arch(x, z, p.get("rot", 0), p.get("ruined", False))
            elif t == "tower":
                self.tower(x, z, side)
            elif t == "banner":
                self.banner(x, z, side)
            elif t == "torch":
                self.torch(x, z)
            elif t == "crate":
                self.crate(x, z)
            elif t == "statue":
                self.statue(x, z)
            elif t in ("topiary", "flowers", "urn") and self.tpl and "flowerbush" in self.tpl:
                f = {"x": x, "y": self.ground_h(x, z) - 0.05, "z": z, "s": p.get("scale", 1.0), "seed": seed, "color": p.get("color")}
                (self.topiary if t == "topiary" else self.flowerbed if t == "flowers" else self.urn_flowers)(f)
            else:
                import surround_kit
                fn = surround_kit.BUILDERS.get(t)
                if fn:
                    fn(self, {"x": x, "y": self.ground_h(x, z) - 0.05, "z": z, "rot": math.radians(p.get("rot", 0)), "s": p.get("scale", 1.0), "seed": seed, "side": side, **({"color": p["color"]} if "color" in p else {})})
                else:
                    print("prop: no builder for", t)
        for p in self.g["pads"]:
            self.pad(p["x"], p["z"], p.get("zone", "home"), p.get("side", 0))
        for c in self.g["cores"]:
            self.fx.append(("core_%d" % c.get("team", 0), (c["x"], self.ground_h(c["x"], c["z"]), c["z"])))

    def topiary(self, f, lo=False):
        r = random.Random(f["seed"])
        name = "topi_spiral" if hsh(f["x"], f["z"], 83) < 0.5 else "topi_ball"
        s = f.get("s", 1.0) * r.uniform(0.92, 1.06)
        clip = None
        if self.is_hedge(int(math.floor(f["x"])), int(math.floor(f["z"]))):
            clip = max(self.corners(int(math.floor(f["x"])), int(math.floor(f["z"])))) + 1.2
        if name == "topi_spiral":
            self.place_tripo(name, f["x"], f["y"] - 0.06, f["z"], s, r, lo=lo, clip=clip)
            return
        H = TRIPO[name]["size"][2]
        if clip is None:
            self.place_tripo(name, f["x"], f["y"] - 0.06, f["z"], s, r, lo=True, below=H * 0.3)
        y0 = f["y"] - 0.06
        mat = self.hedge_mat(int(f["x"]) + 7, int(f["z"]) + 3)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=5, radius1=0.07 * s, radius2=0.05 * s, depth=H * 0.7 * s)
        self.props.add_bm(bm, "bark", matrix=Matrix.Translation(G(f["x"], y0 + H * 0.55 * s, f["z"])))
        for cy, rad in ((0.64, 0.5), (0.93, 0.32)):
            self.topi_ball(f["x"], y0 + H * cy * s, f["z"], rad * s, mat, clip, r)

    def topi_ball(self, x, y, z, rad, mat, clip, r):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        ox, oz = r.uniform(0, 50), r.uniform(0, 50)
        for v in bm.verts:
            v.co *= 1.0 + (vnoise3(v.co.x * 2.2 + ox, v.co.y * 2.2, v.co.z * 2.2 + oz) - 0.5) * 0.16
        m = Matrix.Translation(G(x, y, z)) @ Matrix.Diagonal((rad, rad, rad * 0.95, 1))
        bm.transform(m)
        top = y + rad
        for f in bm.faces:
            q = [l.vert.co.copy() for l in f.loops]
            if clip is not None and all(p.z < clip for p in q):
                continue
            cols = []
            for p in q:
                t = min(1.0, max(0.0, (p.z - (y - rad)) / (2 * rad)))
                k = 0.55 + 0.45 * t
                cols.append((min(1.0, k * 1.04), min(1.0, k * 1.04), k * 0.9))
            uvs = [(u * 2.0 + ox, v * 2.0 + oz) for u, v in box_uv(q, TEX_METERS["hedge"])]
            self.props.face(q, mat, uvs=uvs, cols=cols)
        bm.free()

    def flowerbed(self, f, lo=False):
        r = random.Random(f["seed"] + 5)
        c = f.get("color")
        idx = FLOWER_COLS.index(c) if c in FLOWER_COLS else f["seed"] % len(FLOWER_COLS)
        tpl = self.tpl["flowerbush"]
        s = f.get("s", 1.0) * r.uniform(0.85, 1.1)
        m = (Matrix.Translation(G(f["x"], f["y"] - 0.07, f["z"])) @ Matrix.Rotation(r.uniform(0, math.tau), 4, "Z")
             @ Matrix.Diagonal((s * r.uniform(0.9, 1.15), s * r.uniform(0.9, 1.15), s * r.uniform(0.85, 1.2), 1)))
        tint = r.uniform(0.92, 1.04)
        mt = "flowerbed_%d" % idx
        ox, oy = r.random(), r.random()
        hgt = TRIPO["flowerbush"]["size"][2] * s
        for pts, _ in tpl["lo" if lo and "lo" in tpl else "hi"]:
            q = [m @ p for p in pts]
            uvs = [(u + ox, v + oy) for u, v in box_uv(q, TEX_METERS["flowerbed"])]
            cols = [(lambda k: (k, k, k))(min(1.0, tint * (0.78 + 0.3 * min(1.0, max(0.0, (p.z - f["y"]) / hgt))))) for p in q]
            self.props.face(q, mt, uvs=uvs, cols=cols)

    def urn_flowers(self, f):
        import surround_kit as sk
        M = sk.place(f)
        sk.cube(self.props, M, 0, -0.2, 0, 0.8, 0.7, 0.8, "brick", sk.STONE)
        sk.cyl(self.props, M, 0, 0.5, 0, 0.18, 0.42, 0.55, "brick", sk.STONE, seg=8)
        sk.cyl(self.props, M, 0, 1.05, 0, 0.42, 0.48, 0.15, "brick", sk.STONE, seg=8)
        cols = ("#d8384a", "#f2c84a", "#9a5ad8")
        self.flowerbed({"x": f["x"], "y": f["y"] + 1.18, "z": f["z"], "s": 0.62, "seed": f["seed"], "color": FLOWER_COLS[(3, 4, 2)[f["seed"] % 3]]})

    def ao_ground(self, coll):
        m = 88 if self.sur else 20
        st = 1
        verts, faces = [], []
        xs = list(range(-m, self.W + m + 1, st))
        zs = list(range(-m, self.D + m + 1, st))
        for z in zs:
            for x in xs:
                inside = 0 <= x <= self.W and 0 <= z <= self.D
                verts.append(tuple(G(x, self.vh(x, z) if inside else self.outer_h(x, z), z)))
        n = len(xs)
        for j in range(len(zs) - 1):
            for i in range(n - 1):
                a = j * n + i
                faces.append((a, a + n, a + 1))
                faces.append((a + 1, a + n, a + n + 1))
        mesh = bpy.data.meshes.new("AO_Ground")
        mesh.from_pydata(verts, [], faces)
        obj = bpy.data.objects.new("AO_Ground", mesh)
        coll.objects.link(obj)
        return obj


def smooth_corners(mesh, c):
    mp = {i for i, m in enumerate(mesh.materials) if m.name.startswith("mp_")}
    flat = {i for i, m in enumerate(mesh.materials) if m.name in ("planks",) + HEDGES}
    if not mp and not flat:
        return
    sums, cnt, loops = {}, {}, []
    for p in mesh.polygons:
        if p.material_index in mp:
            tag = None
        elif p.material_index in flat:
            tag = (p.material_index, tuple(round(k * 2) for k in p.normal))
        else:
            continue
        for li in p.loop_indices:
            v = (mesh.loops[li].vertex_index, tag)
            s = sums.setdefault(v, [0.0, 0.0, 0.0])
            for k in range(3):
                s[k] += c[li * 4 + k]
            cnt[v] = cnt.get(v, 0) + 1
            loops.append((li, v))
    for li, v in loops:
        for k in range(3):
            c[li * 4 + k] = sums[v][k] / cnt[v]


def bake_ao(objs, occluders):
    scene = bpy.context.scene
    keep = set(objs) | set(occluders)
    hidden = [o for o in scene.objects if o not in keep and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    prev = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.world = scene.world or bpy.data.worlds.new("World")
    for o in objs:
        ao = o.data.color_attributes.get("AO") or o.data.color_attributes.new("AO", "BYTE_COLOR", "CORNER")
        o.data.color_attributes.active_color = ao
    for o in scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    for o in objs:
        mesh = o.data
        ao = mesh.color_attributes["AO"]
        col = mesh.color_attributes["Col"]
        n = len(col.data)
        a, c = [0.0] * (n * 4), [0.0] * (n * 4)
        ao.data.foreach_get("color", a)
        col.data.foreach_get("color", c)
        for i in range(n):
            f = 0.35 + 0.65 * a[i * 4]
            for k in range(3):
                c[i * 4 + k] *= f
        smooth_corners(mesh, c)
        col.data.foreach_set("color", c)
        mesh.color_attributes.remove(ao)
        mesh.color_attributes.active_color = mesh.color_attributes["Col"]
    for o in hidden:
        o.hide_render = False
    try:
        scene.render.engine = prev
    except TypeError:
        pass


def main():
    with open(os.path.join(ROOT, "assets", "maps", MAP_NAME + ".grid.json")) as f:
        grid = json.load(f)
    coll_name = "Map_" + MAP_NAME
    coll = bpy.data.collections.get(coll_name)
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new(coll_name)
        bpy.context.scene.collection.children.link(coll)
    for d in list(bpy.data.meshes):
        if d.users == 0:
            bpy.data.meshes.remove(d)

    images = texgen.build_all(os.path.join(ROOT, "assets", "textures"))
    make_materials(images)

    mb = MapBuilder(grid)
    mb.tpl = {n: load_tripo(n, c) for n, c in TRIPO.items() if MAP_NAME in c.get("maps", (MAP_NAME,))}
    if "flowerbush" in mb.tpl:
        flower_materials()
    mb.walls()
    mb.bridges()
    mb.place_props()
    mb.cliff_rubble()
    if mb.sur:
        import surround_kit
        importlib.reload(surround_kit)
        if "flowerbush" in mb.tpl:
            surround_kit.BUILDERS["topiary"] = lambda m, f: m.topiary(f, lo=True)
            surround_kit.BUILDERS["flowers"] = lambda m, f: m.flowerbed(f, lo=True)
            surround_kit.BUILDERS["urn"] = lambda m, f: m.urn_flowers(f)
        missing = surround_kit.build(mb, mb.sur["features"])
        if missing:
            print("surround: no builder for", missing)
    else:
        mb.rim_forest()
    mb.vegetation()

    objs = {b.name: b.build(coll) for b in (mb.props, mb.grass, mb.tufts) if b.faces}
    for (name, pos) in mb.fx:
        e = bpy.data.objects.new(name, None)
        e.location = G(*pos)
        e.empty_display_size = 0.3
        coll.objects.link(e)

    ground = mb.ao_ground(coll)
    bake_ao([objs["Props"]], [ground] + list(objs.values()))
    bpy.data.objects.remove(ground, do_unlink=True)

    tris = {k: sum(len(p.vertices) - 2 for p in o.data.polygons) for k, o in objs.items()}
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in coll.objects:
        o.select_set(True)
    out = os.path.join(ROOT, "assets", "maps", MAP_NAME + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_yup=True,
                              export_apply=True, export_vertex_color="ACTIVE", export_animations=False)
    return {"tris": tris, "bytes": os.path.getsize(out)}


RESULT = main()
