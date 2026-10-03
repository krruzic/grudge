"""Flying Pip for Wren's STARFALL costume: the Tripo constellation phoenix as assets/props/pip@starfall.glb, with the
same layout and node names as assets/props/pip.glb (root "pip" > wing_L / wing_R pivots at the wing roots > feathers).

blender -b --python tools/costume/marksman_starfall_pip.py
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
import build_tripo_props as tp  # noqa: E402

NAME = "pip@starfall"
SRC = "marksman_starfall_pip_tripo.glb"
SCALE, PITCH, TRIS = 0.95, 22, 3200
ROOT_X, ROOT_Y, ROOT_Z = 0.02, 0.125, 0.05


def separate(src, idx):
    bpy.context.view_layer.objects.active = src
    for ob in bpy.context.view_layer.objects:
        ob.select_set(False)
    src.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for p in src.data.polygons:
        p.select = p.index in idx
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    return [ob for ob in bpy.context.selected_objects if ob is not src][0]


def build():
    th.clear_scene()
    src = th.import_prop("marksman_pip", os.path.join(ROOT, "assets", "source", SRC), tex=512)
    me = src.data
    if len(me.polygons) > TRIS:
        dec = src.modifiers.new("dec", "DECIMATE")
        dec.ratio = TRIS / len(me.polygons)
        dec.delimit = {"UV"}
        bpy.context.view_layer.objects.active = src
        bpy.ops.object.modifier_apply(modifier=dec.name)
    R = Matrix.Rotation(math.radians(PITCH), 4, "X") @ Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Scale(SCALE, 4)
    pre = [(abs(p.center.y) > ROOT_Y and p.center.x > -0.06 and p.center.z > -0.08, p.center.y > 0) for p in me.polygons]
    me.transform(R)
    co = np.array([v.co[:] for v in me.vertices])
    ctr = Vector(((co[:, 0].min() + co[:, 0].max()) / 2, (co[:, 1].min() + co[:, 1].max()) / 2, (co[:, 2].min() + co[:, 2].max()) / 2))
    me.transform(Matrix.Translation(-ctr))
    root = tp.empty("pip", (0, 0, 0), None)
    parts = [root]
    left = {i for i, (w, s) in enumerate(pre) if w and s}
    right = {i for i, (w, s) in enumerate(pre) if w and not s}
    pl = separate(src, left)
    keep = [i for i in range(len(pre)) if i not in left]
    remap = {old: new for new, old in enumerate(keep)}
    pr = separate(src, {remap[i] for i in right})
    for nm, sx, piece in (("wing_L", 1, pl), ("wing_R", -1, pr)):
        piv = R @ Vector((ROOT_X, sx * ROOT_Y, ROOT_Z)) - ctr
        e = tp.empty(nm, tuple(piv), root)
        piece.data.transform(Matrix.Translation(-piv))
        piece.parent = e
        piece.name = "pip_" + nm.replace("wing_", "feathers_")
        parts += [e, piece]
    src.name = "pip_body"
    src.parent = root
    parts.append(src)
    return parts


if __name__ == "__main__":
    objs = build()
    path = os.path.join(ROOT, "assets", "props", NAME + ".glb")
    tris = sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)
    print("RESULT", {"tris": tris, "bytes": tp.export(objs, path)})
