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
TEAM = [texgen.hexc("#3a6cff"), texgen.hexc("#ff3a2a")]

MATS = ["grass", "dirt", "cobble", "cliff", "brick", "wood", "leaves", "pine",
        "bark", "tallgrass", "cloth", "gold", "iron", "roof"]
TEX_METERS = {"grass": 7, "dirt": 6, "cobble": 4, "cliff": 5, "brick": 3.5, "wood": 2.5,
              "leaves": 3, "pine": 3, "bark": 2, "tallgrass": 1, "cloth": 1.5, "gold": 2, "iron": 1.5,
              "roof": 2.5}


def G(x, y, z):
    return Vector((x, -z, y))


def hsh(*v):
    s = math.sin(sum(a * b for a, b in zip(v, (127.1, 311.7, 74.7, 191.3))) + 0.5) * 43758.5453
    return s - math.floor(s)


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

    def face(self, pts, mat, col=(1, 1, 1), uvs=None, cols=None):
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
        tex.image = images[name]
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if name == "tallgrass":
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        bsdf.inputs["Roughness"].default_value = 1.0
        nt.links.new(bsdf.outputs[0], out.inputs["Surface"])


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

    def ground_h(self, x, z):
        if x < 0 or z < 0 or x > self.W or z > self.D:
            return self.rim
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
                if st == "castle":
                    top = max(c) + 2.1
                    tops = [top] * 4
                else:
                    top = max(c) + 0.6 + hsh(x, z) * 1.2
                    tops = [top + (hsh(px, pz, 9) - 0.5) * 0.5 for (px, pz) in ((x, z), (x + 1, z), (x + 1, z + 1), (x, z + 1))]
                pts = [(x, z), (x + 1, z), (x + 1, z + 1), (x, z + 1)]
                v8 = [G(px, base, pz) for (px, pz) in pts] + [G(px, t, pz) for (px, pz), t in zip(pts, tops)]
                tint = (1, 1, 1) if st == "castle" else (0.85, 0.95, 0.78)
                solid(P, v8, "brick", cols=lambda p, b=base, t=top, tint=tint: tuple(
                    c * (0.7 + 0.3 * min(1, max(0, (p.z - b) / max(0.1, t - b)))) for c in tint))
                if st == "castle":
                    P.face([G(x, top + 0.01, z), G(x, top + 0.01, z + 1), G(x + 1, top + 0.01, z + 1), G(x + 1, top + 0.01, z)],
                           "cobble", col=(0.9, 0.9, 0.9))
                    if (x + z) % 2 == 0:
                        self.box(P, x + 0.5, top, z + 0.5, 0.55, 0.5, 0.55, "brick")
                elif hsh(x, z, 4) < 0.5:
                    self.rock(x + 0.5 + (hsh(x, z, 6) - 0.5), z + 1.3, 0.3, seed=x * 7 + z)

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

    def bridges(self):
        P = self.props
        for z in range(self.D):
            for x in range(self.W):
                if self.kind(x, z) != BRIDGE:
                    continue
                stone = self.style(x, z) == "stone"
                y = self.deck(x, z)
                thick = 0.6 if stone else 0.25
                top_mat = "cobble" if stone else "wood"
                side_mat = "brick" if stone else "wood"
                P.face([G(x, y, z), G(x, y, z + 1), G(x + 1, y, z + 1), G(x + 1, y, z)], top_mat)
                P.face([G(x, y - thick, z), G(x + 1, y - thick, z), G(x + 1, y - thick, z + 1), G(x, y - thick, z + 1)],
                       side_mat, col=(0.5, 0.5, 0.5))
                edges = (
                    (x, z - 1, (x + 1, z), (x, z)),
                    (x, z + 1, (x, z + 1), (x + 1, z + 1)),
                    (x - 1, z, (x, z), (x, z + 1)),
                    (x + 1, z, (x + 1, z + 1), (x + 1, z)),
                )
                for (nx, nz, a, b) in edges:
                    if self.kind(nx, nz) == BRIDGE:
                        continue
                    P.face([G(a[0], y, a[1]), G(a[0], y - thick, a[1]), G(b[0], y - thick, b[1]), G(b[0], y, b[1])],
                           side_mat, cols=[(1, 1, 1), (0.65, 0.65, 0.65), (0.65, 0.65, 0.65), (1, 1, 1)])
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
                        self.box(P, mx + ix * 0.5, y, mz + iz * 0.5, 0.12, 0.85, 0.12, "wood")
                        self.box(P, mx + ix * 0.5, y + 0.75, mz + iz * 0.5, 1.0 if along_x else 0.1, 0.1,
                                 0.1 if along_x else 1.0, "wood")
                gy = self.ground_h(x + 0.5, z + 0.5)
                if gy < y - thick - 0.3:
                    if stone and (x + z) % 3 == 0:
                        self.box(P, x + 0.5, gy - 0.3, z + 0.5, 0.9, y - thick - gy + 0.3, 0.9, "brick", col=(0.8, 0.8, 0.8))
                    if not stone and (x + z) % 2 == 0:
                        self.box(P, x + 0.5, gy - 0.3, z + 0.5, 0.18, y - gy + 0.3, 0.18, "wood", col=(0.7, 0.7, 0.7))

    def rock(self, x, z, s, seed=0, y=None):
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
        axis_x = abs(rot) < 45
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
        P = self.props
        y = max(self.ground_h(x + dx, z + dz) for dx in (-1.4, 0, 1.4) for dz in (-1.4, 0, 1.4))
        base = min(self.ground_h(x + dx, z + dz) for dx in (-1.4, 0, 1.4) for dz in (-1.4, 0, 1.4))
        h = y - base + 0.25
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=1.7, radius2=1.55, depth=h)
        rim = (1, 1, 1) if zone == "neutral" else tuple(0.55 + c * 0.45 for c in TEAM[side])
        P.add_bm(bm, "cobble", matrix=Matrix.Translation(G(x, base + h / 2, z)), col=rim)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=1.25, radius2=1.2, depth=0.1)
        inlay = (1, 1, 1) if zone == "neutral" else tuple(0.6 + c * 0.4 for c in TEAM[side])
        P.add_bm(bm, "gold", matrix=Matrix.Translation(G(x, y + 0.3, z)), col=inlay)
        self.fx.append(("pad_" + zone, (x, y + 0.35, z)))

    def clump(self, B, x, z, w, h, a, cards=3):
        y = self.ground_h(x, z) - 0.05
        for i in range(cards):
            da = a + i * math.pi / cards
            dx, dz = math.cos(da) * w / 2, math.sin(da) * w / 2
            pts = [G(x - dx, y, z - dz), G(x + dx, y, z + dz), G(x + dx, y + h, z + dz), G(x - dx, y + h, z - dz)]
            B.face(pts, "tallgrass", uvs=[(0, 0), (1, 0), (1, 1), (0, 1)],
                   cols=[(0.55, 0.6, 0.5), (0.55, 0.6, 0.5), (1, 1, 1), (1, 1, 1)])

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
                if self.flag(x, z, FLAG_GRASS) and r.random() < 0.6:
                    self.clump(self.grass, x + r.uniform(0.25, 0.75), z + r.uniform(0.25, 0.75),
                               r.uniform(1.3, 1.6), r.uniform(0.9, 1.15), r.uniform(0, 3.14))

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
            if t == "tree":
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
        for p in self.g["pads"]:
            self.pad(p["x"], p["z"], p.get("zone", "home"), p.get("side", 0))
        for c in self.g["cores"]:
            self.fx.append(("core_%d" % c.get("team", 0), (c["x"], self.ground_h(c["x"], c["z"]), c["z"])))

    def ao_ground(self, coll):
        m = 20
        verts, faces = [], []
        xs = list(range(-m, self.W + m + 1))
        zs = list(range(-m, self.D + m + 1))
        for z in zs:
            for x in xs:
                inside = 0 <= x <= self.W and 0 <= z <= self.D
                verts.append(tuple(G(x, self.vh(x, z) if inside else self.rim, z)))
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
    mb.walls()
    mb.bridges()
    mb.place_props()
    mb.cliff_rubble()
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
