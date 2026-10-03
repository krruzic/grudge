"""CALLIOPE STIG prop overrides: thrown wind-up key (wrench@calliope) and carousel calliope tower (tesla@calliope).

Run headless: blender -b --python tools/costume/engineer_calliope_props.py
"""
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import build_tripo_hero as th  # noqa: E402
import build_tripo_props as tp  # noqa: E402

SRC = os.path.join(ROOT, "assets", "source")
KEY_LEN = 1.0
TOWER_H = 2.3


def key_object(name, tex):
    """The Tripo key in its own coordinates: long axis +X (bow at -X, bit at +X), bow plane X-Y, centred."""
    w = th.import_prop(name, os.path.join(SRC, "engineer_calliope_key_tripo.glb"), tex=tex)
    w.data.transform(Matrix(((0, 1, 0, 0), (0, 0, 1, 0), (1, 0, 0, 0), (0, 0, 0, 1))))
    co = np.array([v.co[:] for v in w.data.vertices])
    mid = (co.min(0) + co.max(0)) / 2
    w.data.transform(Matrix.Scale(KEY_LEN / (co[:, 0].max() - co[:, 0].min()), 4) @ Matrix.Translation(Vector(-mid)))
    return w


def build_key():
    th.clear_scene()
    w = key_object("wrench_calliope", 256)
    w.name = "wrench"
    return [w]


def build_tower():
    th.clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, "engineer_calliope_tower_tripo.glb"))
    src = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
    for o in list(bpy.context.scene.objects):
        if o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    src.parent = None
    me = src.data
    me.transform(src.matrix_world)
    src.matrix_world = Matrix.Identity(4)
    isl = th.mesh_islands(me)
    zs = np.array([v.co.z for v in me.vertices])
    base_top = max(max(me.vertices[i].co.z for i in p) for p in isl if max(me.vertices[i].co.z for i in p) < zs.min() + 0.2)
    above = [p for p in isl if min(me.vertices[i].co.z for i in p) > base_top]
    ring_bot = min(min(me.vertices[i].co.z for i in p) for p in above)
    drop = ring_bot - base_top + 0.004
    stray = [p for p in isl if len(p) < 80 and max(abs(me.vertices[i].co.y) for i in p) > 0.28]
    for p in above:
        for i in p:
            me.vertices[i].co.z -= drop
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for p in stray for i in p], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    z0 = min(v.co.z for v in me.vertices)
    z1 = max(v.co.z for v in me.vertices)
    co = np.array([v.co[:] for v in me.vertices])
    mid = (co.min(0) + co.max(0)) / 2
    me.transform(Matrix.Scale(TOWER_H / (z1 - z0), 4) @ Matrix.Translation((-mid[0], -mid[1], -z0)))
    src.name = "tesla"
    me.name = "tesla"
    tp.material("tesla_calliope", src, {"tex": 512})
    co = np.array([v.co[:] for v in me.vertices])
    top = co[:, 2].max()
    ball = co[co[:, 2] > top - 0.35]
    r = (ball[:, 0].max() - ball[:, 0].min()) / 2
    tp.empty("glow", (0, 0, float(top - r)), src)
    print("TOWER drop", drop, "stray", [len(p) for p in stray])
    return [src] + list(src.children)


if __name__ == "__main__":
    out = {}
    for n, f in (("wrench@calliope", build_key), ("tesla@calliope", build_tower)):
        objs = f()
        tris = sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)
        out[n] = {"tris": tris, "bytes": tp.export(objs, os.path.join(ROOT, "assets", "props", n + ".glb"))}
    print("RESULT", out)
