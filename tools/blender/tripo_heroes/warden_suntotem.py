"""Thorn costume THE SUN TOTEM: Tripo saguaro-cactus guardian on the warden rig and clips, Tripo stone sun-disc shield on the left forearm."""

_wd = dict(globals())
exec(open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "warden.py")).read(), _wd)

TEAM = (200, 250)

CFG = {
    **_wd["CFG"],
    "name": "warden",
    "src": "warden_suntotem_tripo.glb",
    "out": "warden@suntotem",
    "height": 2.4,
    "warm": None,
    "vivid": None,
    "team_hue": TEAM,
    "joints": {
        "hip": 0.76,
        "chest": 1.25,
        "neck": 1.55,
        "head_top": 2.3,
        "head_y": 0.0,
        "shoulder": (0.42, 1.45),
        "elbow": (0.58, 1.2),
        "wrist": (0.76, 1.0),
        "finger": (1.02, 0.8),
        "leg_x": 0.22,
        "knee": 0.42,
        "ankle": 0.17,
    },
    "rigid": [
        {"bone": "head", "box": ((-0.4, -0.6, 1.58), (0.4, 0.6, 2.5)), "whole": True},
        {"bone": "chest", "box": ((0.3, -0.1, 1.36), (0.95, 0.5, 2.25)), "whole": True},
        {"bone": "chest", "box": ((-0.95, -0.1, 1.36), (-0.3, 0.5, 2.25)), "whole": True},
        {"bone": "hips", "box": ((-0.165, -0.4, 0.3), (0.165, 0.3, 0.78)), "whole": True},
        {"bone": "shin_L", "box": ((0.02, -0.5, -0.05), (0.6, 0.5, 0.4)), "whole": True},
        {"bone": "shin_R", "box": ((-0.6, -0.5, -0.05), (-0.02, 0.5, 0.4)), "whole": True},
    ],
    "attach": [("attach_stump", "warden_suntotem_tripo.glb"), ("attach_sun_shield", "warden_suntotem_shield_tripo.glb")],
}


def attach_stump(name, arm, src_path):
    import bmesh
    import colorsys
    src = bpy.data.objects[name]
    from mathutils import kdtree
    vs = src.data.vertices
    names = {g.index: g.name for g in src.vertex_groups}
    root = src.vertex_groups["root"]
    for v in vs:
        w = next((g.weight for g in v.groups if g.group == root.index), 0.0)
        if w > 0:
            root.remove([v.index])
            src.vertex_groups["shin_L" if v.co.x > 0 else "shin_R"].add([v.index], w, "ADD")
    src.vertex_groups["head"].remove([v.index for v in vs if v.co.z < 1.5])
    src.vertex_groups["chest"].add([v.index for v in vs if sum(g.weight for g in v.groups) < 0.01], 1.0, "REPLACE")
    isl = th.mesh_islands(src.data)
    main = [i for part in isl if len(part) >= 120 for i in part]
    kd = kdtree.KDTree(len(main))
    for i in main:
        kd.insert(vs[i].co, i)
    kd.balance()
    for part in isl:
        if len(part) >= 120:
            continue
        best = min((kd.find(vs[i].co) for i in part), key=lambda r: r[2])
        wts = [(g.group, g.weight) for g in vs[best[1]].groups]
        for gi in names:
            src.vertex_groups[names[gi]].remove(part)
        for gi, wt in wts:
            src.vertex_groups[names[gi]].add(part, wt, "REPLACE")
    img, px = th.tex_lookup(src)
    cols = th.face_colors(src, px)
    uv = src.data.uv_layers.active.data
    pool = []
    for p, c in zip(src.data.polygons, cols):
        h, s, v = colorsys.rgb_to_hsv(*[float(x) for x in c])
        if 0.95 < p.center.z < 1.45 and abs(p.center.x) < 0.25 and p.center.y > 0.05 and 0.12 < h < 0.25 and s > 0.4:
            pool.append((v, (sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total, sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total)))
    pool.sort()
    dark, light = pool[len(pool) * 3 // 10][1], pool[len(pool) * 11 // 20][1]
    me = bpy.data.meshes.new(name + "_stump")
    bm = bmesh.new()
    seg, cx, cy, rx, ry = 16, 0.0, -0.02, 0.22, 0.18
    zs = [1.52, 1.7, 1.86, 1.98, 2.06, 2.11]
    sc = [1.0, 1.0, 0.98, 0.9, 0.72, 0.42]
    rings = []
    for z, k in zip(zs, sc):
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            r = k * (1.0 if i % 2 == 0 else 0.88)
            ring.append(bm.verts.new((cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r, z)))
        rings.append(ring)
    top = bm.verts.new((cx, cy, 2.13))
    faces = []
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(seg):
            faces.append(bm.faces.new((r0[i], r0[(i + 1) % seg], r1[(i + 1) % seg], r1[i])))
    for i in range(seg):
        faces.append(bm.faces.new((rings[-1][i], rings[-1][(i + 1) % seg], top)))
    faces.append(bm.faces.new(list(reversed(rings[0]))))
    bm.normal_update()
    uvl = bm.loops.layers.uv.new(src.data.uv_layers.active.name)
    for k, f in enumerate(faces):
        f.smooth = True
        for l in f.loops:
            l[uvl].uv = dark if k % 2 else light
    bm.to_mesh(me)
    bm.free()
    st = bpy.data.objects.new(name + "_stump", me)
    bpy.context.scene.collection.objects.link(st)
    me.materials.append(src.data.materials[0])
    col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    col.data.foreach_set("color", [1.0] * (len(col.data) * 4))
    st.vertex_groups.new(name="head").add(list(range(len(me.vertices))), 1.0, "REPLACE")
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    st.select_set(True)
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.join()
    return src


def attach_sun_shield(name, arm, src_path):
    bpy.ops.import_scene.gltf(filepath=src_path)
    w = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    for o in list(bpy.context.selected_objects):
        if o is not w:
            bpy.data.objects.remove(o, do_unlink=True)
    w.parent = None
    w.data.transform(w.matrix_world)
    w.matrix_world = Matrix.Identity(4)
    dec = w.modifiers.new("dec", "DECIMATE")
    dec.ratio = 0.5
    dec.delimit = {"UV"}
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=dec.name)
    co = [v.co.copy() for v in w.data.vertices]
    c = Vector([(min(p[k] for p in co) + max(p[k] for p in co)) / 2 for k in range(3)])
    img, px = th.tex_lookup(w)
    th.bake_material(name + "_shield", w, {"tex": 512, "team_hue": TEAM}, img, px, th.face_colors(w, px))
    fb = arm.data.bones["forearm_L"]
    d = (fb.tail_local - fb.head_local).normalized()
    out = Vector((1, 0, 0))
    out = (out - d * out.dot(d)).normalized()
    up = -d
    side = up.cross(out)
    R = Matrix((out, side, up)).transposed().to_4x4()
    S = Matrix.Diagonal((SHIELD_FLAT * SHIELD_SIZE, SHIELD_SIZE, SHIELD_SIZE, 1))
    g = fb.head_local + (fb.tail_local - fb.head_local) * SHIELD_AT + out * SHIELD_OUT
    w.data.transform(Matrix.Translation(g) @ R @ S @ Matrix.Translation(-c))
    vg = w.vertex_groups.new(name="forearm_L")
    vg.add(list(range(len(w.data.vertices))), 1.0, "REPLACE")
    w.parent = arm
    m = w.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    w.name = name + "_shield"
    return w


SHIELD_SIZE = 0.8
SHIELD_FLAT = 0.6
SHIELD_AT = 0.55
SHIELD_OUT = 0.2
