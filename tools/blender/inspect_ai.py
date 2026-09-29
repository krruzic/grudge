import bpy
import bmesh
import json
import os
from mathutils import Vector

ROOT = "/home/krruzic/Projects/grudge/"
NAMES = ["warlord", "engineer", "raider", "summoner", "duelist", "warden", "herald", "grunt", "ranged", "heavy"]


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def islands(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    seen = set()
    sizes = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        seen.add(v.index)
        n = 0
        while stack:
            x = stack.pop()
            n += 1
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index)
                    stack.append(y)
        sizes.append(n)
    nm = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    return sorted(sizes, reverse=True), nm


report = {}
for n in NAMES:
    kind = "units" if n in ("grunt", "ranged", "heavy") else "heroes"
    clear()
    objs = load(f"{ROOT}assets/{kind}/{n}.glb")
    lo, hi = bounds(objs)
    old = [round(v, 2) for v in (hi - lo)]
    clear()
    objs = load(f"{ROOT}assets/generated/{n}_ai/model.glb")
    meshes = [o for o in objs if o.type == "MESH"]
    lo, hi = bounds(objs)
    isl, nm = islands(meshes[0])
    report[n] = {
        "old_dims": old,
        "ai_dims": [round(v, 2) for v in (hi - lo)],
        "ai_min": [round(v, 2) for v in lo],
        "objs": [(o.name, o.type) for o in objs],
        "verts": len(meshes[0].data.vertices),
        "tris": sum(len(p.vertices) - 2 for p in meshes[0].data.polygons),
        "islands": isl[:8],
        "n_islands": len(isl),
        "nonmanifold_edges": nm,
        "mats": [s.material.name if s.material else None for s in meshes[0].material_slots],
        "rot": [round(v, 2) for v in objs[0].rotation_euler],
    }
RESULT = json.dumps(report)
