"""AI-generated (Tripo) props for heroes: Stig's ballista and tesla coil, exported to assets/props/<name>.glb.

Run headless: blender -b --python tools/blender/build_tripo_props.py -- [ballista tesla]
Sources live in assets/source/<name>_tripo.glb. The ballista is split at its turntable into a fixed base and a
"yaw" > "tilt" turret with tip_L / tip_R / nut empties the game strings at runtime.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import build_tripo_hero as th  # noqa: E402

PROPS = {
    "ballista": {"scale": 2.75, "split": 0.0, "tex": 512, "team_hue": (195, 250)},
    "tesla": {"scale": 2.5, "tex": 512},
    "wrench": {},
    "pip": {"scale": 0.95, "tris": 3200, "pitch": 22},
    "spike": {"static": True, "size": (1.05, 1.05, 1.6), "center": True, "tex": 256},
    "hexidol": {"static": True, "height": 2.1, "tex": 256},
    "wallstone": {"static": True, "size": (1.0, 0.95, 2.5), "tex": 256},
    "palisade": {"static": True, "size": (1.05, 0.5, 2.5), "tex": 256},
    "tomb": {"static": True, "height": 1.05, "tex": 256},
    "iceshard": {"static": True, "height": 4.0, "tex": 256, "tris": 500},
    "icechunk": {"static": True, "height": 1.5, "tex": 256, "tris": 500},
    "iceshard_lo": {"static": True, "src": "iceshard", "height": 4.0, "tex": 128, "tris": 180},
    "icechunk_lo": {"static": True, "src": "icechunk", "height": 1.5, "tex": 128, "tris": 180},
    "event_lantern": {"static": True, "height": 1.6, "tex": 256},
    "event_horn": {"static": True, "height": 3.0, "tex": 256},
    "event_boulder": {"static": True, "height": 1.0, "tex": 256},
    "event_drift": {"static": True, "height": 1.0, "tex": 256},
    "event_heap": {"static": True, "height": 1.0, "tex": 256},
    "serpent": {"static": True, "height": 5.2, "tex": 1024, "tris": 2500},
    "keg": {"static": True, "height": 0.5, "tex": 256, "lathe": {"axis": 0, "mirror": (1, 1), "segs": 20}},
    "powderkeg": {"static": True, "height": 0.62, "tex": 256, "lathe": {"axis": 1, "extra_tris": 140, "extra_up": True, "extra_t": (0.6, 1.2), "extra_r": 1.04, "extra_lat": 0.25, "mirror": (0, 1), "segs": 20}},
    "bigkeg": {"static": True, "height": 2.3, "tex": 512, "tris": 2000, "barrel": {"axis": 0, "push": (1,), "zmin": -0.25}},
    "keg@celadon": {"static": True, "src": "keg_celadon", "height": 0.55, "tex": 512},
    "powderkeg@celadon": {"static": True, "src": "powderkeg_celadon", "height": 0.62, "tex": 512},
    "bigkeg@celadon": {"static": True, "src": "bigkeg_celadon", "height": 2.3, "tex": 1024},
    "ballista@calliope": {"build": "cannon", "src": "ballista_calliope", "length": 2.3, "tex": 512},
    "spike@colossus": {"static": True, "src": "spike_colossus", "size": (1.05, 1.05, 1.6), "center": True, "tex": 512, "tris": 1500},
    "hexidol@shadowplay": {"static": True, "src": "hexidol_shadowplay", "height": 2.1, "tex": 512, "tris": 2400},
    "tomb@shadowplay": {"static": True, "src": "tomb_shadowplay", "height": 1.3, "tex": 512, "tris": 1500},
    "wallstone@suntotem": {"static": True, "src": "wallstone_suntotem", "size": (1.0, 0.95, 2.5), "tex": 512, "tris": 1700},
    "cactus@suntotem": {"static": True, "src": "desert_suntotem", "keep": (1, -1), "height": 1.7, "tex": 512, "tris": 1800},
    "thorns@suntotem": {"static": True, "src": "desert_suntotem", "keep": (1, 1), "height": 0.9, "tex": 512, "tris": 2400},
}


def keep_side(src, axis, sign):
    import bmesh
    t = np.array([v.co[axis] for v in src.data.vertices])
    hist, edges = np.histogram(t, 200)
    best, run, at = 0, 0, 0.0
    for i in range(40, 160):
        run = run + 1 if hist[i] == 0 else 0
        if run > best:
            best, at = run, (edges[i - run + 1] + edges[i + 1]) / 2
    print("KEEP gap", best, "at", round(float(at), 3))
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f.calc_center_median()[axis] - at) * sign <= 0], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(src.data)
    bm.free()
    isl = th.mesh_islands(src.data)
    big = max(len(i) for i in isl)
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for p in isl if len(p) < big * 0.01 for i in p], context="VERTS")
    bm.to_mesh(src.data)
    bm.free()


def barrel_fit(co, axis, zmin):
    oth = [i for i in range(3) if i != axis]
    sel = co[co[:, 2] > zmin]
    lo, hi = sel[:, axis].min(), sel[:, axis].max()
    mid = sel[np.abs(sel[:, axis] - (lo + hi) / 2) < (hi - lo) * 0.25][:, oth]
    A = np.c_[2 * mid, np.ones(len(mid))]
    b = (mid ** 2).sum(1)
    x = np.linalg.lstsq(A, b, rcond=None)[0]
    c = x[:2]
    R = float(np.sqrt(x[2] + (c ** 2).sum()))
    return oth, c, R


def barrel_cap(src, bvh, ax, oth, c, R, sgn, at):
    """Close an open barrel end with a disc that borrows the texture of the opposite head."""
    import bmesh
    from mathutils.interpolate import poly_3d_calc
    me = src.data
    uvd = me.uv_layers.active.data
    rings, segs = 4, 24
    pts = [(0.0, 0.0)] + [(R * 0.98 * (i + 1) / rings * math.cos(k / segs * 2 * math.pi), R * 0.98 * (i + 1) / rings * math.sin(k / segs * 2 * math.pi)) for i in range(rings) for k in range(segs)]

    def uv_at(p2):
        o = [0.0, 0.0, 0.0]
        o[ax] = -sgn * 5.0
        o[oth[0]] = c[0] + p2[0] * 0.9
        o[oth[1]] = c[1] + p2[1] * 0.9
        d = [0.0, 0.0, 0.0]
        d[ax] = sgn
        loc, nrm, idx, dist = bvh.ray_cast(Vector(o), Vector(d))
        if loc is None:
            return (0.5, 0.5)
        poly = me.polygons[idx]
        ws = poly_3d_calc([me.vertices[v].co for v in poly.vertices], loc)
        u = sum(w * uvd[li].uv.x for w, li in zip(ws, poly.loop_indices))
        v = sum(w * uvd[li].uv.y for w, li in zip(ws, poly.loop_indices))
        return (u, v)

    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    vs = []
    for p2 in pts:
        q = [0.0, 0.0, 0.0]
        q[ax] = sgn * at
        q[oth[0]] = c[0] + p2[0]
        q[oth[1]] = c[1] + p2[1]
        vs.append(bm.verts.new(q))
    uvs = [uv_at(p2) for p2 in pts]
    tris = [(0, 1 + k, 1 + (k + 1) % segs) for k in range(segs)]
    for i in range(rings - 1):
        for k in range(segs):
            a, b = 1 + i * segs + k, 1 + i * segs + (k + 1) % segs
            tris += [(a, a + segs, b + segs), (a, b + segs, b)]
    for t in tris:
        f = bm.faces.new([vs[i] for i in t])
        f.normal_update()
        n = [0.0, 0.0, 0.0]
        n[ax] = sgn
        if f.normal.dot(Vector(n)) < 0:
            f.normal_flip()
        for l in f.loops:
            l[uvl].uv = uvs[vs.index(l.vert)]
    bm.to_mesh(me)
    bm.free()


def barrel_fix(src, cfg):
    """Tripo barrels come with deeply recessed (hollow-looking) heads and dangling rope: push each recessed head out to
    just inside its rim, and drop geometry hanging outside the staves."""
    import bmesh
    from mathutils.bvhtree import BVHTree
    me = src.data
    ax = cfg["axis"]
    co = np.array([v.co[:] for v in me.vertices])
    oth, c, R = barrel_fit(co, ax, cfg.get("zmin", -9))
    r = np.sqrt(((co[:, oth] - c) ** 2).sum(1))
    if cfg.get("trim"):
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        up = oth.index(2) if 2 in oth else None
        kill = []
        for f in bm.faces:
            ids = [v.index for v in f.verts]
            if all(r[i] > R * cfg["trim"] for i in ids):
                top = up is not None and all(co[i, 2] - c[up] > R * 0.75 and abs(co[i, oth[1 - up]] - c[1 - up]) < R * 0.4 for i in ids)
                if not top:
                    kill.append(f)
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.to_mesh(me)
        bm.free()
        co = np.array([v.co[:] for v in me.vertices])
        r = np.sqrt(((co[:, oth] - c) ** 2).sum(1))
    bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [list(p.vertices) for p in me.polygons])
    caps = []
    for sgn in cfg.get("push", ()):
        t = co[:, ax] * sgn
        rim = np.percentile(t[r > R * 0.8], 99.5)
        hits = []
        for k in range(16):
            a = k / 16 * 2 * math.pi
            for rr in (0.35, 0.55):
                o = [0.0, 0.0, 0.0]
                o[ax] = sgn * (rim + 1.0)
                o[oth[0]] = c[0] + math.cos(a) * R * rr
                o[oth[1]] = c[1] + math.sin(a) * R * rr
                d = [0.0, 0.0, 0.0]
                d[ax] = -sgn
                loc, nrm, idx, dist = bvh.ray_cast(Vector(o), Vector(d))
                if loc is not None:
                    hits.append(loc[ax] * sgn)
        head = float(np.median(hits))
        span = co[:, ax].max() - co[:, ax].min()
        delta = rim - head - span * 0.025
        print("BARREL", sgn, "R", round(R, 3), "rim", round(rim, 3), "head", round(head, 3), "delta", round(delta, 3))
        if delta < span * 0.02:
            continue
        if delta > span * 0.5:
            caps.append((sgn, rim - span * 0.025))
            continue
        rin = np.percentile(r[(t > rim - span * 0.03) & (r > R * 0.5)], 2)
        m = (r < rin * 0.97) & (t > head - span * 0.01)
        co[m, ax] += sgn * delta
    me.vertices.foreach_set("co", co.ravel())
    me.update()
    for sgn, at in caps:
        barrel_cap(src, bvh, ax, oth, c, R, sgn, at)


def load(name, cfg):
    th.clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", f"{name}_tripo.glb"))
    src = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
    for o in list(bpy.context.scene.objects):
        if o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    src.parent = None
    me = src.data
    me.transform(src.matrix_world)
    src.matrix_world = Matrix.Identity(4)
    split = cfg.get("split")
    z0 = min(v.co.z for v in me.vertices)
    me.transform(Matrix.Translation((0, 0, -z0)))
    me.transform(Matrix.Scale(cfg["scale"], 4))
    src.name = name
    me.name = name
    return src, (None if split is None else (split - z0) * cfg["scale"])


def material(name, src, cfg):
    img, px = th.tex_lookup(src)
    cols = th.face_colors(src, px)
    th.bake_material(name, src, {"tex": cfg["tex"], "team_hue": cfg.get("team_hue")}, img, px, cols)


def empty(name, loc, parent):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.parent = parent
    e.location = loc
    return e


def split_mesh(src, z):
    bpy.context.view_layer.objects.active = src
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    src.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for p in src.data.polygons:
        p.select = p.center.z > z
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    top = [o for o in bpy.context.selected_objects if o is not src][0]
    return top


def build_ballista(name, cfg):
    src, z = load(name, cfg)
    material(name, src, cfg)
    top = split_mesh(src, z)
    src.name = name + "_base"
    top.name = name + "_turret"
    root = empty(name, (0, 0, 0), None)
    src.parent = root
    yaw = empty("yaw", (0, 0, z), root)
    tilt = empty("tilt", (0, 0, 0), yaw)
    top.data.transform(Matrix.Translation((0, 0, -z)))
    top.parent = tilt
    co = np.array([v.co[:] for v in top.data.vertices])
    tips = []
    for s, nm in ((-1, "tip_R"), (1, "tip_L")):
        far = co[np.argsort(-s * co[:, 0])[:12]].mean(0)
        tips.append(far)
        empty(nm, tuple(far), tilt)
    rail = co[(np.abs(co[:, 0]) < 0.06) & (co[:, 1] > -0.4) & (co[:, 1] < 0.2)]
    ny = (tips[0][1] + tips[1][1]) / 2 + 0.75
    empty("nut", (0.0, float(ny), float(rail[:, 2].max()) + 0.01), tilt)
    return [root, src, yaw, tilt, top] + list(tilt.children)


def build_cannon(name, cfg):
    """A ballista replacement that turns as one piece: the whole mesh sits under yaw > tilt, muzzle toward -Y."""
    th.clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", f"{cfg['src']}_tripo.glb"))
    src = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
    for o in list(bpy.context.scene.objects):
        if o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    src.parent = None
    me = src.data
    me.transform(src.matrix_world)
    src.matrix_world = Matrix.Identity(4)
    co = np.array([v.co[:] for v in me.vertices])
    mid = (co.min(0) + co.max(0)) / 2
    muzzle = co[co[:, 2] > np.percentile(co[:, 2], 92)].mean(0) - mid
    ang = math.atan2(muzzle[1], muzzle[0])
    me.transform(Matrix.Rotation(-math.pi / 2 - ang, 4, "Z") @ Matrix.Translation(Vector(-mid)))
    co = np.array([v.co[:] for v in me.vertices])
    lo, hi = co.min(0), co.max(0)
    s = cfg["length"] / (hi[1] - lo[1])
    me.transform(Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))))
    src.name = name + "_turret"
    me.name = name
    material(name.replace("@", "_"), src, cfg)
    root = empty("ballista", (0, 0, 0), None)
    yaw = empty("yaw", (0, 0, 0), root)
    tilt = empty("tilt", (0, 0, 0), yaw)
    src.parent = tilt
    print("CANNON", name, "yaw", round(math.degrees(ang), 1), "dims", tuple(round(float(v), 3) for v in src.dimensions))
    return [root, yaw, tilt, src]


def build_tesla(name, cfg):
    src, _ = load(name, cfg)
    material(name, src, cfg)
    co = np.array([v.co[:] for v in src.data.vertices])
    top = co[:, 2].max()
    ball = co[co[:, 2] > top - 0.35]
    r = (ball[:, 0].max() - ball[:, 0].min()) / 2
    empty("glow", (0, 0, float(top - r)), src)
    return [src] + list(src.children)


def build_wrench(name, cfg):
    th.clear_scene()
    w = th.load_wrench(name, os.path.join(ROOT, "assets", "source", "wrench_tripo.glb"), tex=256)
    co = np.array([v.co[:] for v in w.data.vertices])
    mid = (co.min(0) + co.max(0)) / 2
    w.data.transform(Matrix.Scale(th.WRENCH_LEN, 4) @ Matrix.Translation(Vector((0.12, -mid[1], -mid[2]))))
    w.name = name
    return [w]


def build_pip(name, cfg):
    """Wren's hawk in flight: shares Wren's shoulder-Pip material (marksman_pip_skin, right half of its atlas) so costumes
    recolour both. wing_L / wing_R are empties at the wing roots; rotate them about their local forward axis to flap."""
    th.clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", "marksman_pip_tripo.glb"))
    src = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
    for o in list(bpy.context.scene.objects):
        if o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    src.parent = None
    me = src.data
    me.transform(src.matrix_world)
    src.matrix_world = Matrix.Identity(4)
    if len(me.polygons) > cfg["tris"]:
        dec = src.modifiers.new("dec", "DECIMATE")
        dec.ratio = cfg["tris"] / len(me.polygons)
        dec.delimit = {"UV"}
        bpy.context.view_layer.objects.active = src
        bpy.ops.object.modifier_apply(modifier=dec.name)
    root_y, root_x, root_z = 0.125, 0.05, 0.05
    wing = [abs(p.center.y) > root_y and p.center.x > -0.06 and p.center.z > -0.08 for p in me.polygons]
    side = [p.center.y > 0 for p in me.polygons]
    for l in me.uv_layers.active.data:
        l.uv = (0.5 + 0.5 * l.uv.x, l.uv.y)
    tex = bpy.data.images.load(os.path.join(ROOT, "assets", "source", "marksman_pip_tex.jpg"), check_existing=False)
    tex.pack()
    m = bpy.data.materials.new("marksman_pip_skin")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bs.inputs["Roughness"].default_value = 1.0
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = tex
    nt.links.new(t.outputs["Color"], bs.inputs["Base Color"])
    nt.links.new(bs.outputs[0], o.inputs["Surface"])
    me.materials.clear()
    me.materials.append(m)
    for layer in list(me.color_attributes):
        me.color_attributes.remove(layer)
    col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    col.data.foreach_set("color", [1.0] * (len(col.data) * 4))
    me.color_attributes.active_color = col
    for p in me.polygons:
        p.use_smooth = True
    R = Matrix.Rotation(math.radians(cfg.get("pitch", 0)), 4, "X") @ Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Scale(cfg["scale"], 4)
    me.transform(R)
    co = np.array([v.co[:] for v in me.vertices])
    ctr = Vector(((co[:, 0].min() + co[:, 0].max()) / 2, (co[:, 1].min() + co[:, 1].max()) / 2, (co[:, 2].min() + co[:, 2].max()) / 2))
    me.transform(Matrix.Translation(-ctr))
    root = empty(name, (0, 0, 0), None)
    parts = [root]
    pieces = {}
    for nm, sel in (("wing_L", lambda i: wing[i] and side[i]), ("wing_R", lambda i: wing[i] and not side[i])):
        bpy.context.view_layer.objects.active = src
        for ob in bpy.context.view_layer.objects:
            ob.select_set(False)
        src.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.object.mode_set(mode="OBJECT")
        for p in src.data.polygons:
            p.select = False
        idx = [i for i in range(len(wing)) if sel(i)]
        for i in idx:
            src.data.polygons[i].select = True
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.separate(type="SELECTED")
        bpy.ops.object.mode_set(mode="OBJECT")
        piece = [ob for ob in bpy.context.selected_objects if ob is not src][0]
        keep = [i for i in range(len(wing)) if not sel(i)]
        wing = [wing[i] for i in keep]
        side = [side[i] for i in keep]
        pieces[nm] = piece
    for nm, sx in (("wing_L", 1), ("wing_R", -1)):
        piv = R @ Vector((root_x, sx * root_y, root_z)) - ctr
        e = empty(nm, tuple(piv), root)
        piece = pieces[nm]
        piece.data.transform(Matrix.Translation(-piv))
        piece.parent = e
        piece.name = "pip_" + nm.replace("wing_", "feathers_")
        parts += [e, piece]
    src.name = name + "_body"
    src.parent = root
    parts.append(src)
    return parts


def build_static(name, cfg):
    th.clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", f"{cfg.get('src', name)}_tripo.glb"))
    src = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
    for o in list(bpy.context.scene.objects):
        if o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    src.parent = None
    me = src.data
    me.transform(src.matrix_world)
    src.matrix_world = Matrix.Identity(4)
    if cfg.get("keep"):
        keep_side(src, *cfg["keep"])
    if cfg.get("barrel"):
        barrel_fix(src, cfg["barrel"])
    if cfg.get("lathe"):
        src = lathe_barrel(src, cfg["lathe"])
        me = src.data
    me.transform(Matrix.Rotation(math.radians(-90), 4, "Z"))
    co = np.array([v.co[:] for v in me.vertices])
    lo, hi = co.min(0), co.max(0)
    dims = hi - lo
    if "size" in cfg:
        sc = [cfg["size"][k] / dims[k] for k in range(3)]
    else:
        sc = [cfg["height"] / dims[2]] * 3
    ctr = (lo + hi) / 2
    me.transform(Matrix.Translation((-ctr[0], -ctr[1], -lo[2])))
    me.transform(Matrix.Diagonal((sc[0], sc[1], sc[2], 1.0)))
    if cfg.get("center"):
        me.transform(Matrix.Translation((0, 0, -cfg["size"][2] / 2)))
    src.name = name
    me.name = name
    if cfg.get("tris") and len(me.polygons) > cfg["tris"]:
        dec = src.modifiers.new("dec", "DECIMATE")
        dec.ratio = cfg["tris"] / len(me.polygons)
        dec.delimit = set(cfg.get("delimit", {"UV"}))
        bpy.context.view_layer.objects.active = src
        bpy.ops.object.modifier_apply(modifier=dec.name)
    material(name, src, cfg)
    return [src]


def surface_bake(dst, src, T=512, mirror=None):
    """Bake src's painted texture onto dst (fresh smart-project UVs): each texel casts a ray inward along dst's normal
    from just outside, so it picks the visible outer surface of src, falling back to the nearest point."""
    from mathutils.bvhtree import BVHTree
    from mathutils.interpolate import poly_3d_calc
    me = src.data
    img, px = th.tex_lookup(src)
    H, W = px.shape[:2]
    uvd = me.uv_layers.active.data
    verts = [v.co.copy() for v in me.vertices]
    polys = [list(p.vertices) for p in me.polygons]
    loops = [list(p.loop_indices) for p in me.polygons]
    luv = np.array([uvd[i].uv[:] for i in range(len(uvd))])
    bvh = BVHTree.FromPolygons(verts, polys)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = dst
    dst.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")
    nm = dst.data
    span = max(dst.dimensions)
    out = np.zeros((T, T, 3), np.float32)
    got = np.zeros((T, T), bool)
    nuv = nm.uv_layers.active.data
    nm.calc_loop_triangles()
    for lt in nm.loop_triangles:
        P = [nm.vertices[v].co for v in lt.vertices]
        N = [nm.vertices[v].normal for v in lt.vertices]
        U = np.array([nuv[i].uv[:] for i in lt.loops]) * T
        x0, x1 = int(max(0, U[:, 0].min() - 1)), int(min(T - 1, U[:, 0].max() + 1))
        y0, y1 = int(max(0, U[:, 1].min() - 1)), int(min(T - 1, U[:, 1].max() + 1))
        a, b, c = U
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-9:
            continue
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                gx, gy = x + 0.5, y + 0.5
                l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
                l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
                l3 = 1 - l1 - l2
                if min(l1, l2, l3) < -0.03:
                    continue
                q = P[0] * l1 + P[1] * l2 + P[2] * l3
                n = (N[0] * l1 + N[1] * l2 + N[2] * l3).normalized()
                if mirror and (q[mirror[0]] - mirror[1]) * mirror[2] < 0:
                    q = q.copy()
                    n = n.copy()
                    q[mirror[0]] = 2 * mirror[1] - q[mirror[0]]
                    n[mirror[0]] = -n[mirror[0]]
                loc, nrm, idx, dist = bvh.ray_cast(q + n * span * 0.08, -n, span * 0.4)
                if loc is None:
                    loc, nrm, idx, dist = bvh.find_nearest(q)
                if loc is None:
                    continue
                ws = poly_3d_calc([verts[v] for v in polys[idx]], loc)
                uv = sum(w * luv[li] for w, li in zip(ws, loops[idx]))
                out[y, x] = px[min(H - 1, int((uv[1] % 1.0) * H)), min(W - 1, int((uv[0] % 1.0) * W)), :3]
                got[y, x] = True
    for _ in range(8):
        acc = np.zeros_like(out)
        n = np.zeros((T, T))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(out * got[..., None], dy, 0), dx, 1)
            n += np.roll(np.roll(got, dy, 0), dx, 1)
        fill = (~got) & (n > 0)
        out[fill] = acc[fill] / n[fill][:, None]
        got |= fill
    tex = bpy.data.images.new(dst.name + "_rebake", T, T, alpha=False)
    tex.pixels.foreach_set(np.concatenate([out, np.ones((T, T, 1), np.float32)], -1).ravel())
    nm.materials.clear()
    for m in me.materials:
        nm.materials.append(m)
    m = me.materials[0].copy()
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].links[0].from_node.image = tex
    nm.materials.clear()
    nm.materials.append(m)


def lathe_barrel(src, cfg):
    """Replace a Tripo barrel (loose stave shells that tear when decimated) with a clean lathe body following its outer
    profile, with a raised rim and recessed heads, plus the parts sticking out of it (bung, fuse), then bake its paint."""
    import bmesh
    me = src.data
    ax = cfg["axis"]
    co = np.array([v.co[:] for v in me.vertices])
    oth, c, R = barrel_fit(co, ax, cfg.get("zmin", -9))
    r = np.sqrt(((co[:, oth] - c) ** 2).sum(1))
    body = r < R * 1.12
    t0, t1 = np.percentile(co[body, ax], 0.3), np.percentile(co[body, ax], 99.7)
    rings = cfg.get("rings", 9)
    segs = cfg.get("segs", 18)
    ts = np.linspace(t0, t1, rings)
    prof = []
    for t in ts:
        m = body & (np.abs(co[:, ax] - t) < (t1 - t0) / rings * 0.6) & (r > R * 0.6)
        prof.append(float(np.percentile(r[m], 85)) if m.sum() > 5 else R)
    prof = np.minimum(np.array(prof), max(prof[rings // 3:rings - rings // 3]))
    prof = np.maximum(prof, prof[::-1])
    span = t1 - t0
    bm = bmesh.new()

    def ring(t, rad):
        out = []
        for k in range(segs):
            a = k / segs * 2 * math.pi
            q = [0.0, 0.0, 0.0]
            q[ax] = t
            q[oth[0]] = c[0] + math.cos(a) * rad
            q[oth[1]] = c[1] + math.sin(a) * rad
            out.append(bm.verts.new(q))
        return out

    head = cfg.get("head", 0.035)
    cols = [ring(t0 + span * head, prof[0] * 0.86)] + [ring(t, rr) for t, rr in zip(ts, prof)] + [ring(t1 - span * head, prof[-1] * 0.86)]
    for A, B in zip(cols, cols[1:]):
        for k in range(segs):
            bm.faces.new((A[k], A[(k + 1) % segs], B[(k + 1) % segs], B[k]))
    bm.faces.new(list(reversed(cols[0])))
    bm.faces.new(cols[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    lathe_me = bpy.data.meshes.new(src.name + "_lathe")
    bm.to_mesh(lathe_me)
    bm.free()
    obj = bpy.data.objects.new(src.name + "_lathe", lathe_me)
    bpy.context.scene.collection.objects.link(obj)
    ext = cfg.get("extra_tris", 0)
    if ext:
        ex = src.copy()
        ex.data = me.copy()
        bpy.context.scene.collection.objects.link(ex)
        tt = (co[:, ax] - t0) / span
        pr = np.interp(np.clip(tt, 0, 1), np.linspace(0, 1, rings), prof)
        keep = r > pr * cfg.get("extra_r", 1.1)
        if cfg.get("extra_t"):
            keep &= (tt > cfg["extra_t"][0]) & (tt < cfg["extra_t"][1])
        if cfg.get("extra_up"):
            up = oth.index(2)
            keep &= (co[:, 2] - c[up]) > R * 0.5
        if cfg.get("extra_lat"):
            lat = oth[1 - oth.index(2)]
            keep &= np.abs(co[:, lat] - c[1 - oth.index(2)]) < R * cfg["extra_lat"]
        bm = bmesh.new()
        bm.from_mesh(ex.data)
        bm.verts.ensure_lookup_table()
        kill = [f for f in bm.faces if not all(keep[v.index] for v in f.verts)]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(ex.data)
        bm.free()
        n = len(ex.data.polygons)
        if n > ext:
            dec = ex.modifiers.new("dec", "DECIMATE")
            dec.ratio = ext / n
            bpy.context.view_layer.objects.active = ex
            bpy.ops.object.modifier_apply(modifier=dec.name)
        ex.data.materials.clear()
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        ex.select_set(True)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.join()
    mir = cfg.get("mirror")
    surface_bake(obj, src, cfg.get("bake", 512), (mir[0], float(c[oth.index(mir[0])]), mir[1]) if mir else None)
    name = src.name
    bpy.data.objects.remove(src, do_unlink=True)
    obj.name = name
    obj.data.name = name
    return obj


def export(objs, path):
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=False, export_vertex_color="ACTIVE", export_animations=False)
    return os.path.getsize(path)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {}
    for n in argv or list(PROPS):
        objs = (build_static if PROPS[n].get("static") else globals()["build_" + PROPS[n].get("build", n)])(n, PROPS[n])
        os.makedirs(os.path.join(ROOT, "assets", "props"), exist_ok=True)
        tris = sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)
        out[n] = {"tris": tris, "bytes": export(objs, os.path.join(ROOT, "assets", "props", n + ".glb"))}
    print("RESULT", out)
