import bpy, math, sys, json, numpy as np
from mathutils import Vector
args=sys.argv[sys.argv.index("--")+1:]
glb,names,tag,res=args[0],args[1].split(","),args[2],int(args[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
for a in [o for o in bpy.context.scene.objects if o.type=="ARMATURE"]:
    if a.animation_data:
        a.animation_data.action=None
        for t in a.animation_data.nla_tracks: t.mute=True
    for pb in a.pose.bones: pb.rotation_quaternion=(1,0,0,0); pb.rotation_euler=(0,0,0); pb.location=(0,0,0)
bpy.context.scene.frame_set(0)
objs=[o for o in bpy.context.scene.objects if o.type=="MESH" and o.name in names]
for o in bpy.context.scene.objects:
    if o.type=="MESH" and o not in objs: o.hide_render=True
dg=bpy.context.evaluated_depsgraph_get()
P=[];N=[];UV=[];MAT=[];img=None
for o in objs:
    e=o.evaluated_get(dg); me=e.to_mesh(); me.calc_loop_triangles()
    uvl=me.uv_layers.active.data; M=o.matrix_world
    mats=[m for m in o.data.materials]
    for m in mats:
        for n in (m.node_tree.nodes if m and m.use_nodes else []):
            if n.type=="TEX_IMAGE" and n.image: img=n.image
    for t in me.loop_triangles:
        P.append([list(M@me.vertices[v].co) for v in t.vertices])
        N.append([list((M.to_3x3()@me.vertices[v].normal).normalized()) for v in t.vertices])
        UV.append([list(uvl[l].uv) for l in t.loops])
        mn=mats[t.material_index].name if t.material_index<len(mats) and mats[t.material_index] else ""
        MAT.append(1 if mn.startswith("team") else 0)
    e.to_mesh_clear()
P=np.array(P)
lo=P.reshape(-1,3).min(0);hi=P.reshape(-1,3).max(0)
img.filepath_raw=f"/tmp/opencode/costume/{tag}_orig.png"; img.file_format="PNG"; img.save()
sc=bpy.context.scene
sc.render.engine="BLENDER_WORKBENCH"
sc.display.shading.light="FLAT"; sc.display.shading.color_type="TEXTURE"
sc.render.resolution_x=sc.render.resolution_y=res
sc.render.film_transparent=True
ctr=(lo+hi)/2
S=float(max(np.linalg.norm((hi-lo)[:2]),hi[2]-lo[2])*1.06)
cd=bpy.data.cameras.new("c"); cd.type="ORTHO"; cd.ortho_scale=S
cam=bpy.data.objects.new("c",cd); sc.collection.objects.link(cam); sc.camera=cam
for i,a in enumerate((0,90,180,270)):
    r=math.radians(a); d=Vector((math.sin(r),-math.cos(r),0))
    cam.location=Vector(ctr)+d*20; cam.rotation_euler=(-d).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=f"/tmp/opencode/costume/{tag}_v{i}.png"; bpy.ops.render.render(write_still=True)
np.savez(f"/tmp/opencode/costume/{tag}_mesh.npz",P=P,N=np.array(N),UV=np.array(UV),MAT=np.array(MAT),C=ctr,S=S,R=res)
print("DONE",tag,img.name,img.size[:],len(P),S)
