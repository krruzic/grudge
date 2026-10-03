"""Grim costume SPOREBLIGHT: hunched, long-armed toadstool goblin on the raider rig and clips, bracket-fungus knives in both hands."""

_rd = dict(globals())
exec(open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "raider.py")).read(), _rd)
_raider_clips = _rd["raider_clips"]


def _under_cap(keys, lift, spread):
    out = []
    for f, (x, y, z) in keys:
        if x < lift:
            x, z = lift, (spread if z >= 0 else -spread)
        out.append((f, (x, y, z)))
    return out


def raider_clips(clips):
    clips = _raider_clips(clips)
    for side, s in (("R", 1), ("L", -1)):
        b = clips["death"]["bones"]
        b[f"arm_{side}"] = [(f, v if k == 0 else (-70, 0, 35 * s)) for k, (f, v) in enumerate(b[f"arm_{side}"])]
    for c in ("slam", "cast"):
        b = clips[c]["bones"]
        for side in ("R", "L"):
            b[f"arm_{side}"] = _under_cap(b[f"arm_{side}"], -100, 80)
    for side in ("R", "L"):
        b = clips["block"]["bones"]
        b[f"arm_{side}"] = [(f, (-55, y, z * 0.8)) for f, (x, y, z) in b[f"arm_{side}"]]
        b[f"forearm_{side}"] = [(f, (-45, y, z)) for f, (x, y, z) in b[f"forearm_{side}"]]
    d = clips["death"]["bones"]["head"]
    clips["death"]["bones"]["head"] = [(f, (x - 80 * min(1, k / 2), y, z)) for k, (f, (x, y, z)) in enumerate(d)]
    return clips


CFG = {
    **_rd["CFG"],
    "name": "raider",
    "src": "raider_sporeblight_hunch.glb",
    "out": "raider@sporeblight",
    "height": 1.8822,
    "joints": {
        "hip": 0.82,
        "chest": 1.15,
        "neck": 1.42,
        "head_top": 1.88,
        "head_y": -0.2,
        "shoulder": (0.24, 1.34),
        "elbow": (0.44, 0.88),
        "wrist": (0.53, 0.5),
        "finger": (0.5, 0.27),
        "leg_x": 0.19,
        "knee": 0.42,
        "ankle": 0.13,
    },
    "rigid": [
        {"bone": "head", "box": ((-0.7, -0.9, 1.505), (0.7, 0.5, 2.1))},
        {"bone": "head", "box": ((-0.7, -0.9, 1.5), (0.7, 0.5, 2.1)), "whole": True},
        {"bone": "chest", "box": ((-0.25, -0.35, 0.95), (0.25, 0.3, 1.55)), "whole": True},
        {"bone": "hips", "box": ((-0.36, -0.2, 0.38), (0.36, 0.45, 0.98)), "whole": True},
    ],
    "attach": [("attach_shards", "raider_sporeblight_knife_tripo.glb")],
}

SHARD_LEN = 0.62
SHARD_GRIP = (0.3, 0.0, 0.0)
SHARD_AXIS = (0.0, -1.0, -0.35)
SHARD_SIDE = (1.0, 0.0, 0.0)
SHARD_DECIMATE = 0.5


SKIN_TINT = {"hue": (12, 64), "to": 66, "pull": 0.6, "sat": 0.95, "val": 0.88, "min_sat": 0.33}
CAP_TINT = {"hue": (325, 360), "to": 354, "pull": 0.5, "sat": 1.2, "val": 1.25, "min_sat": 0.3}
SHELVES = [
    (0.0, 1.34, 0.15, 0.1, 8),
    (-0.1, 1.26, 0.12, 0.085, -6),
    (0.1, 1.2, 0.13, 0.09, 5),
    (-0.03, 1.12, 0.13, 0.09, -4),
    (0.09, 1.04, 0.1, 0.07, 7),
    (-0.08, 0.98, 0.09, 0.065, -8),
]


def _hsv(c):
    import colorsys
    return colorsys.rgb_to_hsv(*[float(x) for x in c])


def _uv_of(me, p):
    uv = me.uv_layers.active.data
    return (sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total, sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total)


def _pick(src, cols, test):
    best = None
    for p, c in zip(src.data.polygons, cols):
        h, s, v = _hsv(c)
        k = test(p.center, h * 360, s, v)
        if k is not None and (best is None or k > best[0]):
            best = (k, _uv_of(src.data, p))
    return best[1]


def add_shelves(src):
    import bmesh
    me = src.data
    img, px = th.tex_lookup(src)
    cols = th.face_colors(src, px)
    r = lambda c: (c.x ** 2 + c.y ** 2) ** 0.5
    crimson = _pick(src, cols, lambda c, h, s, v: -abs(v - 0.55) if c.z > 1.85 and (h > 335 or h < 5) and s > 0.5 else None)
    dark = _pick(src, cols, lambda c, h, s, v: -abs(v - 0.32) if c.z > 1.75 and (h > 330 or h < 8) and s > 0.45 else None)
    rust = _pick(src, cols, lambda c, h, s, v: -abs(h - 18) - abs(v - 0.45) if 8 < h < 30 and s > 0.45 and c.z < 1.0 else None)
    cream = _pick(src, cols, lambda c, h, s, v: v - s if 1.62 < c.z < 1.82 and r(c) > 0.3 and s < 0.35 else None)
    co = np.array([v.co[:] for v in me.vertices])
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new(me.uv_layers.active.name)
    seg, rings = 20, 6
    for sx, sz, rw, rd, tilt in SHELVES:
        m = (np.abs(co[:, 0] - sx) < 0.05) & (np.abs(co[:, 2] - sz) < 0.04)
        back = float(co[m, 1].max()) if m.any() else 0.3
        cen = Vector((sx, back - rd * 0.35, sz))
        R = Matrix.Rotation(math.radians(-14), 4, "X") @ Matrix.Rotation(math.radians(tilt), 4, "Y")
        top, bot = [], []
        for j in range(1, rings + 1):
            t = j / rings
            rt, rb = [], []
            for i in range(seg):
                a = 2 * math.pi * i / seg
                x, y = rw * t * math.cos(a), rd * 1.4 * t * math.sin(a)
                rt.append(bm.verts.new(cen + R @ Vector((x, y, 0.06 * (1 - t * t) + 0.008))))
                rb.append(rt[-1] if j == rings else bm.verts.new(cen + R @ Vector((x, y, -0.03 * (1 - t * t)))))
            top.append(rt)
            bot.append(rb)
        ct = bm.verts.new(cen + R @ Vector((0, 0, 0.068)))
        cb = bm.verts.new(cen + R @ Vector((0, 0, -0.03)))
        band = [dark, crimson, rust, crimson, dark, cream]
        faces = []
        for i in range(seg):
            i2 = (i + 1) % seg
            faces.append((bm.faces.new((ct, top[0][i], top[0][i2])), band[0]))
            faces.append((bm.faces.new((cb, bot[0][i2], bot[0][i])), cream))
            for j in range(rings - 1):
                faces.append((bm.faces.new((top[j][i], top[j + 1][i], top[j + 1][i2], top[j][i2])), band[j + 1]))
                if j < rings - 2:
                    faces.append((bm.faces.new((bot[j][i2], bot[j + 1][i2], bot[j + 1][i], bot[j][i])), cream))
                else:
                    faces.append((bm.faces.new((bot[j][i2], top[j + 1][i2], top[j + 1][i], bot[j][i])), cream))
        for f, uvp in faces:
            f.smooth = True
            for k, l in enumerate(f.loops):
                l[uvl].uv = (uvp[0] + 0.001 * (k % 2), uvp[1] + 0.001 * (k // 2 % 2))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    sm = bpy.data.meshes.new("shelves")
    bm.to_mesh(sm)
    bm.free()
    sm.materials.append(me.materials[0])
    so = bpy.data.objects.new("shelves", sm)
    bpy.context.scene.collection.objects.link(so)
    gc, gs = so.vertex_groups.new(name="chest"), so.vertex_groups.new(name="spine")
    for v in sm.vertices:
        (gc if v.co.z >= 1.15 else gs).add([v.index], 1.0, "REPLACE")
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    so.select_set(True)
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.join()
    col = me.color_attributes.get("Col")
    if col:
        col.data.foreach_set("color", [1.0] * (len(col.data) * 4))


def retint(src):
    me = src.data
    img, px = th.tex_lookup(src)
    h, w = px.shape[:2]
    main = set(max(th.mesh_islands(me), key=len))
    body = [p.vertices[0] in main for p in me.polygons]
    skin = [b and p.center.z < 1.76 for p, b in zip(me.polygons, body)]
    cap = [b and p.center.z > 1.45 for p, b in zip(me.polygons, body)]
    out = px.copy()
    rgb = out[:, :, :3]
    for flags, tint in ((skin, SKIN_TINT), (cap, CAP_TINT)):
        m = th.uv_mask(src, flags, h, w)[:, :, None]
        rgb = np.where(m, th.vivid(rgb, tint), rgb)
    out[:, :, :3] = rgb
    name = img.name
    img.name = name + "_old"
    tex = bpy.data.images.new(name, w, h, alpha=False)
    tex.pixels.foreach_set(out.ravel())
    tex.file_format = "JPEG"
    path = os.path.join("/tmp", name + "_spore.jpg")
    tex.filepath_raw = path
    tex.save()
    bpy.data.images.remove(tex)
    tex = bpy.data.images.load(path, check_existing=False)
    tex.name = name
    tex.pack()
    for mat in me.materials:
        for n in mat.node_tree.nodes:
            if n.type == "TEX_IMAGE":
                n.image = tex


def attach_shards(name, arm, src_path):
    src = bpy.data.objects[name]
    add_shelves(src)
    retint(src)
    w = th.import_prop(f"{name}_knife", src_path, tex=512)
    w.data.transform(Matrix.Rotation(math.radians(-90), 4, "Z"))
    dec = w.modifiers.new("dec", "DECIMATE")
    dec.ratio = SHARD_DECIMATE
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=dec.name)
    w2 = bpy.data.objects.new(f"{name}_knife_L", w.data.copy())
    bpy.context.scene.collection.objects.link(w2)
    w.name = f"{name}_knives"
    s = SHARD_SIDE
    th.place_on_bone(w, arm, "hand_R", SHARD_GRIP, SHARD_AXIS, SHARD_LEN, at=0.45, side=s)
    th.place_on_bone(w2, arm, "hand_L", SHARD_GRIP, (-SHARD_AXIS[0], SHARD_AXIS[1], SHARD_AXIS[2]), SHARD_LEN, at=0.45, side=(s[0], -s[1], -s[2]))
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    w.select_set(True)
    w2.select_set(True)
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.join()
    return w
