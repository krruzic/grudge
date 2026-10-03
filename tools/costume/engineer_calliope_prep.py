import os
import sys

import bpy
from mathutils import Matrix

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import build_tripo_hero as th  # noqa: E402

SHIFT = 0.07
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", "engineer_calliope_tripo_raw.glb"))
o = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
for x in list(bpy.context.scene.objects):
    if x is not o:
        bpy.data.objects.remove(x, do_unlink=True)
me = o.data
me.transform(o.matrix_world)
o.parent = None
o.matrix_world = Matrix.Identity(4)
zs = [v.co.z for v in me.vertices]
s = 1.9 / (max(zs) - min(zs))
moved = 0
for part in th.mesh_islands(me):
    if min(-me.vertices[i].co.x * s for i in part) > 0.17:
        for i in part:
            me.vertices[i].co.x += SHIFT / s
        moved += len(part)
print("RESULT moved", moved)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", "engineer_calliope_tripo.glb"), export_format="GLB", use_selection=False)
