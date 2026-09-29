import bpy
import bmesh
import json
import math
import os
from mathutils import Vector

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
PROPS = {}
FACING = {}
DEFAULT_FACING = 0.0


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
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


def prep(name):
    clear()
    src = f"{ROOT}assets/generated/{name}_ai/model.glb"
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    o = meshes[0]
    o.parent = None
    o.name = name
    o.data.name = name
    bpy.context.view_layer.objects.active = o
    for x in bpy.data.objects:
        x.select_set(x == o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    v0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    welded = v0 - len(bm.verts)

    h = max(v.co.z for v in bm.verts) - min(v.co.z for v in bm.verts)
    groups = islands(bm)
    groups.sort(key=len, reverse=True)
    removed = []
    for g in groups[1:]:
        lo = Vector((min(v.co.x for v in g), min(v.co.y for v in g), min(v.co.z for v in g)))
        hi = Vector((max(v.co.x for v in g), max(v.co.y for v in g), max(v.co.z for v in g)))
        if len(g) < 4 or (hi - lo).length < h * 0.005:
            removed.append(len(g))
            bmesh.ops.delete(bm, geom=g, context="VERTS")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    parts = len(islands(bm))

    zmin = min(v.co.z for v in bm.verts)
    zmax = max(v.co.z for v in bm.verts)
    foot = [v.co for v in bm.verts if v.co.z < zmin + (zmax - zmin) * 0.08]
    cx = sum(c.x for c in foot) / len(foot)
    cy = sum(c.y for c in foot) / len(foot)
    s = HEIGHT[name] / (zmax - zmin)
    for v in bm.verts:
        v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - zmin) * s))
    rot = FACING.get(name, DEFAULT_FACING)
    if rot:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=__import__("mathutils").Matrix.Rotation(rot, 3, "Z"))
    nm = sum(1 for e in bm.edges if not e.is_manifold)
    bm.to_mesh(me)
    bm.free()
    me.update()
    for p in me.polygons:
        p.use_smooth = False

    for img in bpy.data.images:
        if img.size[0] > 1024:
            img.scale(1024, 1024)

    props = split_props(o, name)

    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    dst = f"{ROOT}assets/generated/{name}_ai/prepped.glb"
    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_image_format="JPEG",
        export_jpeg_quality=90,
    )
    if props:
        for x in bpy.data.objects:
            x.select_set(x == props)
        bpy.ops.export_scene.gltf(
            filepath=f"{ROOT}assets/generated/{name}_ai/props.glb",
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_image_format="JPEG",
            export_jpeg_quality=90,
        )
        props.hide_render = True
    render(o, f"{ROOT}assets/generated/{name}_ai/prepped_views.png")
    return {
        "welded": welded,
        "removed_islands": removed,
        "parts": parts,
        "nonmanifold": nm,
        "verts": len(me.vertices),
        "tris": sum(len(p.vertices) - 2 for p in me.polygons),
        "dims": [round(max(xs) - min(xs), 2), round(max(ys) - min(ys), 2), HEIGHT[name]],
        "bytes": os.path.getsize(dst),
        "props_verts": len(props.data.vertices) if props else 0,
    }


def split_props(o, name):
    test = PROPS.get(name)
    if not test:
        return None
    bm = bmesh.new()
    bm.from_mesh(o.data)
    groups = islands(bm)
    groups.sort(key=len, reverse=True)
    idx = set()
    for g in groups[1:]:
        lo = Vector((min(v.co.x for v in g), min(v.co.y for v in g), min(v.co.z for v in g)))
        hi = Vector((max(v.co.x for v in g), max(v.co.y for v in g), max(v.co.z for v in g)))
        if test(lo, hi):
            idx.update(v.index for v in g)
    bm.free()
    if not idx:
        return None
    for x in bpy.data.objects:
        x.select_set(x == o)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in o.data.vertices:
        v.select = v.index in idx
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    props = next(x for x in bpy.data.objects if x.type == "MESH" and x != o)
    props.name = f"{name}_props"
    for x in bpy.data.objects:
        x.select_set(x == o)
    return props


def render(o, path):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.display.shading.show_object_outline = True
    sc.render.resolution_x = 360
    sc.render.resolution_y = 480
    sc.render.film_transparent = False
    sc.world = sc.world or bpy.data.worlds.new("w")
    h = o.dimensions.z
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = h * 1.15
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    tiles = []
    for i, ang in enumerate((0, 90, 180, 270)):
        a = math.radians(ang)
        cam.location = (math.sin(a) * 10, -math.cos(a) * 10, h * 0.5)
        cam.rotation_euler = (math.pi / 2, 0, a)
        f = f"/tmp/opencode/prep_{i}.png"
        sc.render.filepath = f
        bpy.ops.render.render(write_still=True)
        tiles.append(f)
    bpy.data.objects.remove(cam, do_unlink=True)
    imgs = [bpy.data.images.load(t) for t in tiles]
    w, hh = imgs[0].size
    out = bpy.data.images.new("views", w * 4, hh)
    px = [0.0] * (w * 4 * hh * 4)
    for k, im in enumerate(imgs):
        src = list(im.pixels)
        for y in range(hh):
            row = src[y * w * 4 : (y + 1) * w * 4]
            start = (y * w * 4 + k * w) * 4
            px[start : start + w * 4] = row
    out.pixels = px
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    for im in imgs + [out]:
        bpy.data.images.remove(im)


if __name__ == "__main__":
    only = globals().get("ONLY")
    res = {}
    for n in only or NAMES:
        res[n] = prep(n)
    RESULT = json.dumps(res)
