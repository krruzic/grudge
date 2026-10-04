# Renders the Grudge relic (assets/structures/grudge.glb) for the HUD icon assets/ui/hud/grudge.png
# (then cropped, colour-lifted and inked to 128 px like the other HUD icons).
import bpy, mathutils
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="assets/structures/grudge.glb")
objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
keep=[o for o in objs if o.name=='relic']
for o in objs:
    if o not in keep: o.hide_render=True
pts=[o.matrix_world@mathutils.Vector(c) for o in keep for c in o.bound_box]
mn=mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx=mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
c=(mn+mx)/2; s=max(mx-mn)
cam=bpy.data.objects.new("c",bpy.data.cameras.new("c")); bpy.context.scene.collection.objects.link(cam)
cam.data.type='ORTHO'; cam.data.ortho_scale=s*1.12
cam.location=c+mathutils.Vector((s*0.3,-s*2.4,s*0.25))
cam.rotation_euler=(c-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.context.scene.camera=cam
def light(e,rot,col=(1,1,1)):
    l=bpy.data.objects.new("l",bpy.data.lights.new("l","SUN")); l.data.energy=e; l.data.color=col; l.rotation_euler=rot; bpy.context.scene.collection.objects.link(l)
light(5.5,(0.9,0.3,0.6),(1,0.92,0.8)); light(4.0,(1.2,0,3.6),(1.0,0.75,0.5)); light(2.0,(-0.5,0,0))
w=bpy.data.worlds.new("w"); bpy.context.scene.world=w; w.color=(0.35,0.33,0.3)
sc=bpy.context.scene
try: sc.render.engine='BLENDER_EEVEE_NEXT'
except TypeError: sc.render.engine='BLENDER_EEVEE'
sc.view_settings.view_transform='Standard'; sc.view_settings.look='None'
sc.render.resolution_x=sc.render.resolution_y=1024; sc.render.film_transparent=True
sc.render.filepath="/tmp/opencode/grudgeicon/relic2.png"; bpy.ops.render.render(write_still=True)
