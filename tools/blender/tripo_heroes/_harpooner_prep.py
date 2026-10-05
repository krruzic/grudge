"""Clean the raw Tripo body: drop the thin tail Tripo grew down the back of the coat.
blender -b --python tools/blender/tripo_heroes/_harpooner_prep.py  (raw -> assets/source/harpooner_tripo.glb)"""
import bpy, bmesh, math, os
from mathutils import Matrix
ROOT = os.environ.get("GRUDGE_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", "harpooner_tripo_raw.glb"))
o = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
M = Matrix.Rotation(math.radians(-90), 4, "Z") @ o.matrix_world
zs = [(M @ v.co).z for v in o.data.vertices]
z0, s = min(zs), 1.7 / (max(zs) - min(zs))
bm = bmesh.new()
bm.from_mesh(o.data)
def bad(v):
    p = M @ v.co
    z = (p.z - z0) * s
    x, y = p.x * s, p.y * s
    if 0.6 <= z < 0.97 and abs(x) < 0.08 and y > 0.172:
        return True
    return z < 0.88 and abs(x) < 0.17 and y > 0.205 + max(0.0, z - 0.55) * 0.25
kill = [f for f in bm.faces if all(bad(v) for v in f.verts)]
print("tail faces", len(kill))
bmesh.ops.delete(bm, geom=kill, context="FACES")
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context="VERTS")
bm.to_mesh(o.data)
bm.free()
for x in bpy.context.scene.objects:
    x.select_set(x is o)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", "harpooner_tripo.glb"), use_selection=True, export_format="GLB")
