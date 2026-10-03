import bpy, math, numpy as np
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="/home/krruzic/Projects/grudge/assets/heroes/engineer.glb")
arm=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"][0]
if arm.animation_data: arm.animation_data.action=None
for t in (arm.animation_data.nla_tracks if arm.animation_data else []): t.mute=True
for pb in arm.pose.bones: pb.rotation_quaternion=(1,0,0,0); pb.rotation_euler=(0,0,0); pb.location=(0,0,0)
bpy.context.scene.frame_set(0)
body=[o for o in bpy.context.scene.objects if o.type=="MESH" and o.name=="engineer"]
for o in bpy.context.scene.objects:
    if o.type=="MESH" and o not in body: o.hide_render=True
print("BODY",[o.name for o in body])
dg=bpy.context.evaluated_depsgraph_get()
P=[];N=[];UV=[];MAT=[]
for o in body:
    e=o.evaluated_get(dg); me=e.to_mesh()
    me.calc_loop_triangles()
    uvl=me.uv_layers.active.data
    M=o.matrix_world
    names=[m.name if m else "" for m in o.data.materials]
    for t in me.loop_triangles:
        P.append([list(M@me.vertices[v].co) for v in t.vertices])
        N.append([list((M.to_3x3()@me.vertices[v].normal).normalized()) for v in t.vertices])
        UV.append([list(uvl[l].uv) for l in t.loops])
        MAT.append(1 if t.material_index < len(names) and names[t.material_index].startswith("team") else 0)
    e.to_mesh_clear()
P=np.array(P);N=np.array(N);UV=np.array(UV);MAT=np.array(MAT)
lo=P.reshape(-1,3).min(0);hi=P.reshape(-1,3).max(0)
print("BB",lo,hi,len(P))
np.savez("/tmp/opencode/costume/mesh.npz",P=P,N=N,UV=UV,MAT=MAT,lo=lo,hi=hi)
sc=bpy.context.scene
sc.render.engine="BLENDER_WORKBENCH"
sc.display.shading.light="FLAT"; sc.display.shading.color_type="TEXTURE"
sc.render.resolution_x=sc.render.resolution_y=1024
sc.render.film_transparent=True
cd=bpy.data.cameras.new("c"); cd.type="ORTHO"; S=max(hi-lo)*1.08; cd.ortho_scale=S
cam=bpy.data.objects.new("c",cd); sc.collection.objects.link(cam); sc.camera=cam
ctr=(lo+hi)/2
for i,a in enumerate((0,90,180,270)):
    r=math.radians(a); d=Vector((math.sin(r),-math.cos(r),0))
    cam.location=Vector(ctr)+d*6; cam.rotation_euler=(-d).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=f"/tmp/opencode/costume/v{i}.png"; bpy.ops.render.render(write_still=True)
open("/tmp/opencode/costume/cam.txt","w").write(f"{ctr[0]} {ctr[1]} {ctr[2]} {S}")
