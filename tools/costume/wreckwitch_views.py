"""Mother Kelp costume prep: rest-pose body mesh (triangles, normals, UVs, team flags) for bake2.bake, the body
texture, and a 2x2 sheet of the body from 4 sides (front, her left, back, her right) on light grey for Nano Banana.
blender -b --python tools/costume/wreckwitch_views.py -- <repo> <outdir>"""
import bpy, math, os, sys
import numpy as np
from mathutils import Vector

root, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(root, "assets/heroes/wreckwitch.glb"))
arm = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"][0]
if arm.animation_data:
    arm.animation_data.action = None
    for t in arm.animation_data.nla_tracks:
        t.mute = True
for pb in arm.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.rotation_euler = (0, 0, 0)
    pb.location = (0, 0, 0)
bpy.context.scene.frame_set(0)
body = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name == "wreckwitch"]
for o in bpy.context.scene.objects:
    if o.type == "MESH" and o not in body:
        o.hide_render = True
mat = body[0].data.materials[0]
img = next(n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE")
img.filepath_raw = os.path.join(out, "wreckwitch_body_orig.png")
img.file_format = "PNG"
img.save()
dg = bpy.context.evaluated_depsgraph_get()
P, N, UV, MAT = [], [], [], []
for o in body:
    e = o.evaluated_get(dg)
    me = e.to_mesh()
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    M = o.matrix_world
    names = [m.name if m else "" for m in o.data.materials]
    for t in me.loop_triangles:
        P.append([list(M @ me.vertices[v].co) for v in t.vertices])
        N.append([list((M.to_3x3() @ me.vertices[v].normal).normalized()) for v in t.vertices])
        UV.append([list(uvl[l].uv) for l in t.loops])
        MAT.append(1 if t.material_index < len(names) and names[t.material_index].startswith("team") else 0)
    e.to_mesh_clear()
P, N, UV, MAT = map(np.array, (P, N, UV, MAT))
lo, hi = P.reshape(-1, 3).min(0), P.reshape(-1, 3).max(0)
S = float(max(hi - lo) * 1.08)
ctr = (lo + hi) / 2
np.savez(os.path.join(out, "wreckwitch_body_mesh.npz"), P=P, N=N, UV=UV, MAT=MAT, C=ctr, S=S, R=1024)
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "FLAT"
sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.render.film_transparent = True
cd = bpy.data.cameras.new("c")
cd.type = "ORTHO"
cd.ortho_scale = S
cam = bpy.data.objects.new("c", cd)
sc.collection.objects.link(cam)
sc.camera = cam
for i, a in enumerate((0, 90, 180, 270)):
    r = math.radians(a)
    d = Vector((math.sin(r), -math.cos(r), 0))
    cam.location = Vector(ctr) + d * 6
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(out, f"wreckwitch_body_v{i}.png")
    bpy.ops.render.render(write_still=True)
print("BB", lo, hi, len(P))
