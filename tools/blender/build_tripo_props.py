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
}


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
        dec.delimit = {"UV"}
        bpy.context.view_layer.objects.active = src
        bpy.ops.object.modifier_apply(modifier=dec.name)
    material(name, src, cfg)
    return [src]


def export(objs, path):
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=False, export_vertex_color="ACTIVE", export_animations=False)
    return os.path.getsize(path)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {}
    for n in argv or list(PROPS):
        objs = (build_static if PROPS[n].get("static") else globals()["build_" + n])(n, PROPS[n])
        os.makedirs(os.path.join(ROOT, "assets", "props"), exist_ok=True)
        tris = sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)
        out[n] = {"tris": tris, "bytes": export(objs, os.path.join(ROOT, "assets", "props", n + ".glb"))}
    print("RESULT", out)
