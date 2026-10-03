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
    lighten(src, isl)
    img, px = th.tex_lookup(src)
    cols = th.face_colors(src, px)
    flags = []
    for p, c in zip(src.data.polygons, cols):
        h, s, v = colorsys.rgb_to_hsv(*[float(x) for x in c])
        flags.append(0.95 < p.center.z < 1.45 and abs(p.center.x) < 0.25 and p.center.y > 0.05 and 0.12 < h < 0.25 and s > 0.4)
    x0, y0, side = skin_patch(src, flags, px)
    th_, tw = px.shape[:2]

    def patch_uv(a, t):
        u = 1 - abs(2 * (a % 1.0) - 1)
        return ((x0 + 0.5 + u * (side - 1)) / tw, (y0 + 0.5 + t * (side - 1)) / th_)
    me = bpy.data.meshes.new(name + "_stump")
    bm = bmesh.new()
    seg, cx, cy, rx, ry = 16, 0.0, -0.02, 0.22, 0.18
    zs = [1.52, 1.7, 1.86, 1.98, 2.06, 2.11]
    sc = [1.0, 1.0, 0.98, 0.9, 0.72, 0.42]
    rings = []
    param = {}
    for z, k in zip(zs, sc):
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            r = k * (1.0 if i % 2 == 0 else 0.84)
            ring.append(bm.verts.new((cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r, z)))
            param[ring[-1]] = (i / seg, (z - zs[0]) / (2.13 - zs[0]))
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
    for f in faces:
        f.smooth = True
        a0 = param[f.loops[0].vert][0]
        for l in f.loops:
            l[uvl].uv = patch_uv(*param.get(l.vert, (a0, 1.0)))
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
    return arm


def skin_patch(src, flags, px):
    h, w = px.shape[:2]
    rgb = px[:, :, :3]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    green = (rgb[:, :, 1] >= rgb[:, :, 0] * 0.8) & (rgb[:, :, 1] > rgb[:, :, 2] * 1.4) & (sat > 0.4) & (mx > 0.25)
    ok = th.uv_mask(src, flags, h, w) & green
    dp = np.zeros((h + 1, w + 1), dtype=np.int32)
    for y in range(h):
        row, prev, cur = ok[y], dp[y], dp[y + 1]
        for x in np.nonzero(row)[0]:
            cur[x + 1] = 1 + min(prev[x], prev[x + 1], cur[x])
    s = min(PATCH, int(dp.max()))
    lum = rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    I = np.zeros((h + 1, w + 1))
    I2 = np.zeros((h + 1, w + 1))
    I[1:, 1:] = lum.cumsum(0).cumsum(1)
    I2[1:, 1:] = (lum * lum).cumsum(0).cumsum(1)
    ys, xs = np.nonzero(dp[1:, 1:] >= s)
    y0, x0 = ys - s + 1, xs - s + 1

    def box(T):
        return T[ys + 1, xs + 1] - T[y0, xs + 1] - T[ys + 1, x0] + T[y0, x0]
    m = box(I) / (s * s)
    var = box(I2) / (s * s) - m * m
    k = int(np.argmin(var - 0.02 * m))
    return int(x0[k]), int(y0[k]), s


def island_ratio(tris, lo, hi):
    size = max(h - l for h, l in zip(hi, lo))
    if tris <= SPINE_TRIS and size < 0.15 and hi[2] < 2.0:
        return 0.0 if size < SPINE_DROP else SPINE_RATIO
    r = min(1.0, DENSITY * size * size / tris)
    if lo[2] > 1.55 and hi[2] > 2.0 and tris > 200:
        r *= HEAD_RATIO
    return r


def lighten(src, isl):
    import bmesh
    me = src.data
    vi = {}
    for k, part in enumerate(isl):
        for i in part:
            vi[i] = k
    tris = [0] * len(isl)
    for p in me.polygons:
        tris[vi[p.vertices[0]]] += len(p.vertices) - 2
    ratio = []
    for k, part in enumerate(isl):
        cs = [me.vertices[i].co for i in part]
        lo = [min(c[a] for c in cs) for a in range(3)]
        hi = [max(c[a] for c in cs) for a in range(3)]
        ratio.append(round(island_ratio(tris[k], lo, hi) * 20) / 20)
    buckets = {}
    for p in me.polygons:
        r = ratio[vi[p.vertices[0]]]
        if r < 1.0:
            buckets.setdefault(r, set()).add(p.index)
    parts = []
    for r, faces in sorted(buckets.items()):
        if r <= 0:
            continue
        d = src.copy()
        d.data = me.copy()
        d.modifiers.clear()
        bpy.context.scene.collection.objects.link(d)
        bm = bmesh.new()
        bm.from_mesh(d.data)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in faces], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(d.data)
        bm.free()
        dec = d.modifiers.new("dec", "DECIMATE")
        dec.ratio = r
        dec.delimit = {"UV"}
        bpy.context.view_layer.objects.active = d
        bpy.ops.object.modifier_apply(modifier=dec.name)
        parts.append(d)
    gone = set().union(*buckets.values()) if buckets else set()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in gone], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    if parts:
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        for d in parts:
            d.select_set(True)
        src.select_set(True)
        bpy.context.view_layer.objects.active = src
        bpy.ops.object.join()


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
    dec.ratio = SHIELD_TRIS / sum(len(p.vertices) - 2 for p in w.data.polygons)
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


PATCH = 24
SPINE_TRIS = 60
SPINE_DROP = 0.06
SPINE_RATIO = 0.5
DENSITY = 9000
HEAD_RATIO = 0.6
SHIELD_TRIS = 1300
SHIELD_SIZE = 0.8
SHIELD_FLAT = 0.6
SHIELD_AT = 0.55
SHIELD_OUT = 0.2
