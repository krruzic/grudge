"""The Herald: Tripo knight body, Tripo war banner strapped to his back (chest) and Tripo arming sword in hand_R."""

CFG = {
    "yaw": -90,
    "height": 1.92,
    "weight": 1.0,
    "tex": 1024,
    "joints": {
        "hip": 0.9,
        "chest": 1.19,
        "neck": 1.45,
        "head_top": 1.75,
        "head_y": -0.05,
        "shoulder": (0.25, 1.32),
        "elbow": (0.345, 1.065),
        "wrist": (0.335, 0.85),
        "finger": (0.33, 0.69),
        "leg_x": 0.135,
        "knee": 0.48,
        "ankle": 0.13,
    },
    "rigid": [
        {"bone": "shin_L", "box": ((0.175, -0.14, 0.43), (0.27, 0.05, 0.6))},
        {"bone": "shin_R", "box": ((-0.32, -0.3, -0.01), (-0.04, 0.15, 0.07))},
        {"bone": "shin_L", "box": ((0.04, -0.3, -0.01), (0.32, 0.15, 0.07))},
    ],
    "team_hue": (195, 250),
    "team_box": ((-0.4, -0.4, 0.55), (0.4, 0.4, 1.45)),
    "attach": [("attach_sword", "herald_sword_tripo.glb"), ("attach_banner", "herald_banner_tripo.glb")],
}


def herald_decimate(w, ratio, keep=None):
    dec = w.modifiers.new("dec", "DECIMATE")
    dec.ratio = ratio
    if keep:
        vg = w.vertex_groups.new(name="keep")
        vg.add(keep, 1.0, "REPLACE")
        dec.vertex_group = vg.name
        dec.invert_vertex_group = True
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=dec.name)


def herald_frame(w, a, b, side):
    a, b, side = Vector(a), Vector(b), Vector(side)
    d = (b - a).normalized()
    s = (side - d * side.dot(d)).normalized()
    R = Matrix((-d, -s, d.cross(s))).to_4x4()
    w.data.transform(Matrix.Scale(1.0 / (b - a).length, 4) @ R @ Matrix.Translation(-a))


def herald_team_fix(name):
    src = bpy.data.objects[name]
    me = src.data
    old = next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    w, h = old.size
    px = np.array(old.pixels[:], dtype=np.float32).reshape(h, w, 4)
    uv = me.uv_layers.active.data
    (x0, y0, z0), (x1, y1, z1) = CFG["team_box"]
    bary = [((i + 0.3) / 7, (j + 0.3) / 7, 1 - (i + j + 0.6) / 7) for i in range(7) for j in range(7 - i)]
    flags = []
    for p in me.polygons:
        c = p.center
        if p.material_index == 1 or not (x0 <= c.x <= x1 and y0 <= c.y <= y1 and z0 <= c.z <= z1):
            flags.append(False)
            continue
        t = [uv[i].uv for i in p.loop_indices[:3]]
        n = 0
        for a, b, d in bary:
            u = (t[0].x * a + t[1].x * b + t[2].x * d) % 1.0
            v = (t[0].y * a + t[1].y * b + t[2].y * d) % 1.0
            n += th.hue_in(px[min(h - 1, int(v * h)), min(w - 1, int(u * w)), :3], CFG["team_hue"], 0.25)
        flags.append(n >= 2)
    for p, f in zip(me.polygons, flags):
        if f:
            p.material_index = 1
    rgb = px[:, :, :3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    d = np.maximum(mx - mn, 1e-5)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    lo, hi = CFG["team_hue"]
    mask = (hue >= lo - 15) & (hue <= hi + 15) & (sat > 0.15) & (mx > 0.05) & th.uv_mask(src, flags, h, w)
    grey = np.clip((0.3 * r + 0.59 * g + 0.11 * b) * 1.9 + 0.12, 0, 1)
    for k in range(3):
        px[:, :, k] = np.where(mask, grey, px[:, :, k])
    tex = bpy.data.images.new(name + "_tex2", w, h, alpha=False)
    tex.pixels.foreach_set(px.ravel())
    tex.file_format = "JPEG"
    path = os.path.join("/tmp", name + "_tex2.jpg")
    tex.filepath_raw = path
    tex.save()
    tex = bpy.data.images.load(path, check_existing=False)
    tex.pack()
    for m in me.materials:
        for nd in m.node_tree.nodes:
            if nd.type == "TEX_IMAGE":
                nd.image = tex


def attach_sword(name, arm, src_path):
    herald_team_fix(name)
    w = th.import_prop(name + "_sword", src_path, tex=256)
    herald_decimate(w, 0.35)
    co = np.array([v.co[:] for v in w.data.vertices])
    mean = co.mean(axis=0)
    _, _, vt = np.linalg.svd(co - mean, full_matrices=False)
    ax = vt[0] if vt[0][2] > 0 else -vt[0]
    t = (co - mean) @ ax
    a = mean + ax * t.min()
    b = mean + ax * t.max()
    herald_frame(w, a, b, (1, 0, 0))
    th.place_on_bone(w, arm, "hand_R", (-0.11, 0.0, 0.0), (0.0, -0.6, -0.8), 0.95, at=0.35, side=(1, 0, 0))
    w.name = name + "_sword"
    return w


def attach_banner(name, arm, src_path):
    bpy.ops.import_scene.gltf(filepath=src_path)
    w = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    for o in list(bpy.context.selected_objects):
        if o is not w:
            bpy.data.objects.remove(o, do_unlink=True)
    w.parent = None
    w.data.transform(w.matrix_world)
    w.matrix_world = Matrix.Identity(4)
    img, px = th.tex_lookup(w)
    cols = th.face_colors(w, px)
    sheet = [abs(p.center.x + 0.0166) < 0.001 and p.normal.x > 0.95 for p in w.data.polygons]
    cols = [np.array((0.2, 0.3, 0.6)) if s else c for s, c in zip(sheet, cols)]
    th.bake_material(name + "_banner", w, {"tex": 512, "team_hue": (195, 250)}, img, px, cols)
    flag = sorted({v for p, s in zip(w.data.polygons, sheet) if s for v in p.vertices})
    herald_decimate(w, 0.3, flag)
    w.vertex_groups.remove(w.vertex_groups["keep"])
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(w.data)
    sheet = [f for f in bm.faces if abs(f.calc_center_median().x + 0.0166) < 0.001 and f.normal.x > 0.95]
    dup = bmesh.ops.duplicate(bm, geom=sheet)
    bmesh.ops.reverse_faces(bm, faces=[g for g in dup["geom"] if isinstance(g, bmesh.types.BMFace)])
    bm.to_mesh(w.data)
    bm.free()
    co = np.array([v.co[:] for v in w.data.vertices])
    z0, z1 = co[:, 2].min(), co[:, 2].max()
    foot = co[co[:, 2] < z0 + 0.03]
    px, py = foot[:, 0].mean(), foot[:, 1].mean()
    herald_frame(w, (px, py, z0), (px, py, z1), (0, 1, 0))
    L = 2.15
    D = Vector((-0.2, 0.24, 1.05))
    hb = arm.data.bones["chest"]
    g = hb.head_local + (hb.tail_local - hb.head_local) * 0.5
    up = Vector((0.04, 0.06, 1.0)).normalized()
    side = Vector((1.0, 0.35, 0.0))
    s = (side - up * side.dot(up)).normalized()
    R = Matrix((-up, -s, up.cross(s))).transposed()
    grip = -(R.transposed() @ (D - g)) / L
    th.place_on_bone(w, arm, "chest", tuple(grip), tuple(up), L, at=0.5, side=tuple(side))
    w.name = name + "_banner"
    return w
