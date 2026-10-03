"""Bend the Tripo SPOREBLIGHT body into a stoop (upper body forward, head kept level, arms carried with the shoulders).

blender -b --python tools/costume/raider_sporeblight_hunch.py
Reads assets/source/raider_sporeblight_tripo.glb, writes assets/source/raider_sporeblight_hunch.glb (2.0 m tall before the bend,
facing -Y after the builder's yaw) and prints the new height for the hero config.
"""
import math
import os

import bpy
from mathutils import Matrix, Vector

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
SRC = os.path.join(ROOT, "assets", "source", "raider_sporeblight_tripo.glb")
OUT = os.path.join(ROOT, "assets", "source", "raider_sporeblight_hunch.glb")
H = 2.0
BEND = 24.0
Z0, Z1 = 0.85, 1.3
PIVOT_Y = 0.12
NECK = (1.44, 1.56)
HEAD_KEEP = 0.8
SHOULDER = Vector((0.0, 0.1, 1.4))


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def rot_about(p, ang, py, pz):
    c, s = math.cos(ang), math.sin(ang)
    y, z = p.y - py, p.z - pz
    return Vector((p.x, py + y * c - z * s, pz + y * s + z * c))


def arm_verts(me):
    ok = lambda c: abs(c.x) > 0.2 and 0.12 < c.z < 1.45
    adj = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    at = {}
    for v in me.vertices:
        at.setdefault(tuple(round(c, 4) for c in v.co), []).append(v.index)
    for grp in at.values():
        for i in grp:
            adj[i].extend(j for j in grp if j != i)
    seen = {v.index for v in me.vertices if 0.45 < v.co.z < 1.0 and abs(v.co.x) > 0.42}
    todo = list(seen)
    while todo:
        i = todo.pop()
        for j in adj[i]:
            if j not in seen and ok(me.vertices[j].co):
                seen.add(j)
                todo.append(j)
    return seen


def bend(p, arm):
    th = math.radians(BEND)
    if arm:
        return p + (rot_about(SHOULDER, th, PIVOT_Y, Z0) - SHOULDER)
    q = rot_about(p, th * smooth((p.z - Z0) / (Z1 - Z0)), PIVOT_Y, Z0)
    w = smooth((p.z - NECK[0]) / (NECK[1] - NECK[0]))
    if w > 0:
        n = rot_about(Vector((0.0, -0.05, NECK[0])), th, PIVOT_Y, Z0)
        q = rot_about(q, -th * HEAD_KEEP * w, n.y, n.z)
    return q


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
o = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
for x in list(bpy.context.scene.objects):
    if x is not o:
        bpy.data.objects.remove(x, do_unlink=True)
me = o.data
me.transform(o.matrix_world)
o.parent = None
o.matrix_world = Matrix.Identity(4)
me.transform(Matrix.Rotation(math.radians(-90), 4, "Z"))
zs = [v.co.z for v in me.vertices]
s = H / (max(zs) - min(zs))
me.transform(Matrix.Translation((0, 0, -min(zs) * s)) @ Matrix.Scale(s, 4))
arms = arm_verts(me)
print("ARM_VERTS", len(arms), min(me.vertices[i].co.z for i in arms), min(abs(me.vertices[i].co.x) for i in arms))
for v in me.vertices:
    v.co = bend(v.co.copy(), v.index in arms)
zs = [v.co.z for v in me.vertices]
print("HUNCH_HEIGHT", round(max(zs) - min(zs), 4))
me.transform(Matrix.Rotation(math.radians(90), 4, "Z"))
me.update()
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True)
