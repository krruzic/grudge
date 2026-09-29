import bpy
import bmesh
import json
import math
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.geometry import intersect_point_line

ROOT = "/home/krruzic/Projects/grudge/"
HEIGHT = {
    "warlord": 2.36,
    "engineer": 1.68,
    "raider": 1.85,
    "summoner": 2.32,
    "duelist": 2.01,
    "warden": 2.33,
    "herald": 3.07,
    "grunt": 1.33,
    "ranged": 1.54,
    "heavy": 1.73,
}
NAMES = list(HEIGHT)
PREFIX = "mixamorig:"
LEGS = ("UpLeg", "Leg", "Foot", "ToeBase")
PROP_ISLANDS = {
    "grunt": {2: "Right"},
    "summoner": {2: "Right"},
    "herald": {1: "Right", 2: "Right", 3: "Right"},
}


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions, bpy.data.cameras):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def islands(bm):
    bm.verts.ensure_lookup_table()
    seen = set()
    out = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        seen.add(v.index)
        group = []
        while stack:
            x = stack.pop()
            group.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index)
                    stack.append(y)
        out.append(group)
    return out


def near_seg(p, a, b):
    t = intersect_point_line(p, a, b)[1]
    t = max(0.0, min(1.0, t))
    return (p - (a + (b - a) * t)).length


def rigidify(arm, mesh, h, name):
    names = {g.index: g.name for g in mesh.vertex_groups}
    hands = {}
    for side in ("Left", "Right"):
        b = arm.data.bones.get(f"{PREFIX}{side}Hand")
        if b:
            hands[side] = (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local)
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    dl = bm.verts.layers.deform.active
    mw = mesh.matrix_world
    pos = {}
    for v in bm.verts:
        pos[v.index] = mw @ v.co
    key = {}
    for v in bm.verts:
        k = tuple(round(c, 5) for c in v.co)
        key.setdefault(k, []).append(v)
    tmp = bm.copy()
    bmesh.ops.remove_doubles(tmp, verts=tmp.verts, dist=1e-5)
    groups_w = islands(tmp)
    groups_w.sort(key=len, reverse=True)
    groups = []
    for g in groups_w:
        members = []
        for v in g:
            members.extend(key.get(tuple(round(c, 5) for c in v.co), []))
        groups.append(members)
    tmp.free()

    def extent(g):
        ps = [pos[v.index] for v in g]
        lo = Vector((min(p.x for p in ps), min(p.y for p in ps), min(p.z for p in ps)))
        hi = Vector((max(p.x for p in ps), max(p.y for p in ps), max(p.z for p in ps)))
        return lo, hi

    legs = []
    for bone in arm.data.bones:
        if bone.name.replace(PREFIX, "").replace("Left", "").replace("Right", "") in LEGS:
            legs.append((arm.matrix_world @ bone.head_local, arm.matrix_world @ bone.tail_local))

    def is_leg(g):
        near = sum(1 for v in g if min(near_seg(pos[v.index], a, b) for a, b in legs) < h * 0.1)
        return near >= len(g) * 0.8

    props = {}
    for i, g in enumerate(groups[1:], 1):
        lo, hi = extent(g)
        if (hi - lo).length < h * 0.22 or is_leg(g):
            continue
        best = None
        for side, (a, b) in hands.items():
            d = min(near_seg(pos[v.index], a, b) for v in g)
            if d < h * 0.1 and (best is None or d < best[1]):
                best = (side, d)
        if best:
            props[i] = best[0]
    props.update(PROP_ISLANDS.get(name, {}))
    changed = True
    while changed:
        changed = False
        for side in set(props.values()):
            pts = [pos[v.index] for j, sd in props.items() if sd == side for v in groups[j]]
            tree = KDTree(len(pts))
            for k, p in enumerate(pts):
                tree.insert(p, k)
            tree.balance()
            for i, g in enumerate(groups[1:], 1):
                if i in props:
                    continue
                lo, hi = extent(g)
                if (hi - lo).length > h * 0.5 or is_leg(g):
                    continue
                pad = h * 0.05
                inside = any(
                    all(lo[k] >= extent(groups[j])[0][k] - pad and hi[k] <= extent(groups[j])[1][k] + pad for k in range(3))
                    for j, sd in props.items()
                    if sd == side
                )
                if inside or min(tree.find(pos[v.index])[2] for v in g) < h * 0.03:
                    props[i] = side
                    changed = True
    gi_of = {}
    for g in mesh.vertex_groups:
        gi_of[g.name] = g.index
    count = 0
    for i, side in props.items():
        target = gi_of.get(f"{PREFIX}{side}Hand")
        if target is None:
            target = mesh.vertex_groups.new(name=f"{PREFIX}{side}Hand").index
        for v in groups[i]:
            d = v[dl]
            for k in list(d.keys()):
                del d[k]
            d[target] = 1.0
            count += 1
    bm.to_mesh(mesh.data)
    bm.free()
    return {"props": {str(i): s for i, s in props.items()}, "prop_verts": count}


def fix(name):
    clear()
    bpy.ops.import_scene.gltf(filepath=f"{ROOT}assets/generated/{name}_ai/rigged.glb")
    for o in list(bpy.data.objects):
        if o.type == "MESH" and not o.find_armature() and o.parent is None:
            bpy.data.objects.remove(o, do_unlink=True)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    mesh = next(o for o in bpy.data.objects if o.type == "MESH")
    arm.name = f"{name}_rig"
    mesh.name = name
    arm.data.name = f"{name}_rig"
    bpy.context.view_layer.update()
    zs = [(mesh.matrix_world @ v.co).z for v in mesh.data.vertices]
    s = HEIGHT[name] / (max(zs) - min(zs))
    arm.matrix_world = Matrix.Rotation(-math.pi / 2, 4, "Z") @ Matrix.Scale(s, 4) @ arm.matrix_world
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        o.select_set(o in (arm, mesh))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.view_layer.update()
    ws = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
    zmin = min(w.z for w in ws)
    foot = [w for w in ws if w.z < zmin + HEIGHT[name] * 0.08]
    off = Vector((-sum(w.x for w in foot) / len(foot), -sum(w.y for w in foot) / len(foot), -zmin))
    arm.location += off
    bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bpy.context.view_layer.update()
    info = rigidify(arm, mesh, HEIGHT[name], name)
    for img in bpy.data.images:
        if img.size[0] > 1024:
            img.scale(1024, 1024)
    for o in bpy.data.objects:
        o.select_set(o in (arm, mesh))
    bpy.ops.export_scene.gltf(
        filepath=f"{ROOT}assets/generated/{name}_ai/rig_fixed.glb",
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_animations=False,
        export_image_format="JPEG",
        export_jpeg_quality=90,
    )
    ws = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
    info["dims"] = [round(max(w[k] for w in ws) - min(w[k] for w in ws), 2) for k in range(3)]
    info["bones"] = len(arm.data.bones)
    pose_test(arm, mesh, f"{ROOT}assets/generated/{name}_ai/pose_test.png")
    return info


def pose_test(arm, mesh, path):
    pb = arm.pose.bones
    for b in pb:
        b.rotation_mode = "XYZ"
        b.rotation_euler = (0, 0, 0)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x = 360
    sc.render.resolution_y = 480
    h = mesh.dimensions.z
    cd = bpy.data.cameras.new("cam")
    cd.type = "ORTHO"
    cd.ortho_scale = h * 1.5
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.location = (6, -10, h * 0.55)
    cam.rotation_euler = (math.pi / 2, 0, math.atan2(6, 10))
    tiles = []
    poses = [
        {},
        {"RightArm": (-80, 0, 0), "RightForeArm": (-50, 0, 0), "LeftArm": (40, 0, 0), "LeftUpLeg": (-40, 0, 0), "LeftLeg": (50, 0, 0), "Spine1": (0, 20, 0)},
        {"RightArm": (0, 0, 60), "LeftArm": (0, 0, -60), "RightUpLeg": (-60, 0, 0), "RightLeg": (70, 0, 0), "Head": (0, 30, 0)},
    ]
    for i, pose in enumerate(poses):
        for b in pb:
            b.rotation_euler = (0, 0, 0)
        for k, r in pose.items():
            b = pb.get(PREFIX + k)
            if b:
                b.rotation_euler = tuple(math.radians(x) for x in r)
        bpy.context.view_layer.update()
        f = f"/tmp/opencode/pose_{i}.png"
        sc.render.filepath = f
        bpy.ops.render.render(write_still=True)
        tiles.append(f)
    for b in pb:
        b.rotation_euler = (0, 0, 0)
    bpy.data.objects.remove(cam, do_unlink=True)
    imgs = [bpy.data.images.load(t) for t in tiles]
    w, hh = imgs[0].size
    out = bpy.data.images.new("poses", w * len(imgs), hh)
    px = [0.0] * (w * len(imgs) * hh * 4)
    for k, im in enumerate(imgs):
        src = list(im.pixels)
        for y in range(hh):
            start = (y * w * len(imgs) + k * w) * 4
            px[start : start + w * 4] = src[y * w * 4 : (y + 1) * w * 4]
    out.pixels = px
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    for im in imgs + [out]:
        bpy.data.images.remove(im)


if __name__ == "__main__":
    only = globals().get("ONLY")
    RESULT = json.dumps({n: fix(n) for n in (only or NAMES)})
