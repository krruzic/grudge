"""Wren costume STARFALL: tall slender Tripo body on the marksman rig and clips, a lofted silver crescent-moon bow
(texture and silhouette from tools/costume/marksman_starfall_bow.py) with a string of light on the bow_string bone,
a quiver of comet arrows, and a Tripo constellation phoenix perched on the left pauldron (marksman_pip)."""

_mk = dict(globals())
exec(open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "marksman.py")).read(), _mk)
_mk.update({"BOW_LEN": 1.0, "BOW_GRIP": (0.0, 0.0, 0.0), "BOW_FLAT": 1.0, "BOW_YAW": 90})
marksman_clips = _mk["marksman_clips"]

CFG = {
    **_mk["CFG"],
    "name": "marksman",
    "src": "marksman_starfall_tripo.glb",
    "out": "marksman@starfall",
    "height": 2.1,
    "joints": {
        "hip": 1.12,
        "chest": 1.48,
        "neck": 1.71,
        "head_top": 2.06,
        "head_y": -0.03,
        "shoulder": (0.17, 1.6),
        "elbow": (0.275, 1.42),
        "wrist": (0.39, 1.2),
        "finger": (0.465, 1.03),
        "leg_x": 0.12,
        "knee": 0.71,
        "ankle": 0.12,
    },
    "vivid": {"hue": (316, 350), "to": 306, "pull": 0.45, "sat": 1.1, "val": 0.92, "min_sat": 0.35},
    "rigid": [],
    "team_hue": (195, 238),
    "team_box": ((-0.13, -0.4, 0.55), (0.13, 0.2, 1.36)),
    "attach": [("attach_bow", "marksman_starfall_bow.json"), ("attach_arrows", "marksman_starfall_bow.json"), ("attach_pip", "marksman_starfall_pip_tripo.glb")],
    "clips": "marksman_clips",
}

BOW_SPAN = 1.3
BOW_T = 0.032
GRIP_T = 0.042
STRING_R = 0.006
PIP_SCALE = 0.75
PIP_AT = (0.2, 0.0, 1.66)
PIP_TURN = 20
PIP_FOLD = (80, 35)
QUIVER = ((0.14, 1.2), (-0.17, 1.6))
QUIVER_R = 0.036


def _skin(name, path):
    tex = bpy.data.images.load(path, check_existing=False)
    tex.pack()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bs.inputs["Roughness"].default_value = 1.0
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = tex
    nt.links.new(t.outputs["Color"], bs.inputs["Base Color"])
    nt.links.new(bs.outputs[0], o.inputs["Surface"])
    return m


def _white(me):
    for layer in list(me.color_attributes):
        me.color_attributes.remove(layer)
    col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    col.data.foreach_set("color", [1.0] * (len(col.data) * 4))
    me.color_attributes.active_color = col


def _bow_data(src_path):
    import json
    d = json.load(open(src_path))
    s = BOW_SPAN / (d["nock"][2] - d["nock"][1])
    gx, gy = d["grip"]

    def P(px, py, t=0.0):
        return Vector(((gx - px) * s, t, (gy - py) * s))

    def UV(px, py):
        return (px / d["W"], 1 - py / d["H"])
    return d, s, P, UV


def _loft(bm, uvl, rows, P, UV, s, tmax):
    prev = None
    first = last = None
    for y, (xl, xr) in rows:
        w = (xr - xl) * s
        t = min(tmax, max(0.006, w * 0.55))
        xm = (xl + xr) / 2
        ring = [(bm.verts.new(P(xl, y)), UV(xl, y)), (bm.verts.new(P(xm, y, t / 2)), UV(xm, y)), (bm.verts.new(P(xr, y)), UV(xr, y)), (bm.verts.new(P(xm, y, -t / 2)), UV(xm, y))]
        if prev:
            for i in range(4):
                a, b = prev[i], prev[(i + 1) % 4]
                c, d = ring[(i + 1) % 4], ring[i]
                f = bm.faces.new((a[0], b[0], c[0], d[0]))
                for l, q in zip(f.loops, (a, b, c, d)):
                    l[uvl].uv = q[1]
        else:
            first = ring
        prev = ring
        last = ring
    for ring in (first, last[::-1]):
        f = bm.faces.new([q[0] for q in ring])
        for l, q in zip(f.loops, ring):
            l[uvl].uv = q[1]


def _torso(z):
    c = _smooth(1.15, 1.55, z)
    h = 1 - _smooth(0.95, 1.3, z)
    return {"chest": c, "spine": max(0.0, 1 - c - h), "hips": h}


def fix_cloak(name):
    """The cloak/hood island hangs behind the arms in the A-pose; auto weights glue it to them. Hand its arm weights to
    the torso so it hangs from the shoulders."""
    body = bpy.data.objects[name]
    me = body.data
    top = max(range(len(me.vertices)), key=lambda i: me.vertices[i].co.z)
    cloak = next(isl for isl in th.mesh_islands(me) if top in isl)
    names = {g.index: g.name for g in body.vertex_groups}
    limb = ("arm_", "forearm_", "hand_")
    for i in cloak:
        v = me.vertices[i]
        lost = sum(g.weight for g in v.groups if names[g.group].startswith(limb))
        if lost <= 0:
            continue
        for g in list(v.groups):
            if names[g.group].startswith(limb):
                body.vertex_groups[names[g.group]].remove([i])
        for b, wt in _torso(v.co.z).items():
            if wt > 0:
                body.vertex_groups[b].add([i], wt * lost, "ADD")


def attach_bow(name, arm, src_path):
    import bmesh
    fix_cloak(name)
    d, s, P, UV = _bow_data(src_path)
    me = bpy.data.meshes.new(name + "_bow")
    me.uv_layers.new(name="UVMap")
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    a_rows = [(y, runs[0]) for y, runs in d["rows"]]
    _loft(bm, uvl, a_rows, P, UV, s, BOW_T)
    seg = []
    for y, runs in d["rows"]:
        if len(runs) == 2:
            seg.append((y, runs[1]))
        elif seg:
            break
    _loft(bm, uvl, seg, P, UV, s, GRIP_T)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    w = bpy.data.objects.new(name + "_bow", me)
    bpy.context.scene.collection.objects.link(w)
    me.materials.append(_skin(name + "_bow_skin", os.path.join(ROOT, "assets", "source", "marksman_starfall_bow_tex.jpg")))
    M = _mk["_bow_frame"](arm)
    me.transform(M)
    nx, ntop, nbot = d["nock"]
    nt, nb = M @ P(nx, ntop), M @ P(nx, nbot)
    mid = (nt + nb) / 2
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones.new("bow_string")
    eb.head = mid
    eb.tail = mid + Vector((0, 0.06, 0))
    eb.roll = 0.0
    eb.parent = arm.data.edit_bones["hand_L"]
    eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.pose.bones["bow_string"].rotation_mode = "XYZ"
    n0 = len(me.vertices)
    nf = len(me.polygons)
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    rings = _mk["_tube"](bm, uvl, [nt, mid, nb], STRING_R, tuple(d["swatch"]["glow"]))
    bm.verts.index_update()
    mid_idx = [v.index for v in rings[1]]
    bm.to_mesh(me)
    bm.free()
    ends = [i for i in range(n0, len(me.vertices)) if i not in mid_idx]
    _mk["_bind"](w, arm, {"hand_L": list(range(n0)) + ends, "bow_string": mid_idx})
    for p in me.polygons:
        p.use_smooth = p.index < nf
    _white(me)
    return w


def _back(bvh, x, z, r):
    h = bvh.ray_cast(Vector((x, 1.5, z)), Vector((0, -1, 0)), 3.0)
    return Vector((x, (h[0].y if h[0] else 0.12) + r * 0.9, z))


def attach_arrows(name, arm, src_path):
    import bmesh
    from mathutils.bvhtree import BVHTree
    d, s, P, UV = _bow_data(src_path)
    sw = {k: tuple(v) for k, v in d["swatch"].items()}
    body = bpy.data.objects[name]
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(body, dg)
    (xa, za), (xb, zb) = QUIVER
    q0 = _back(bvh, xa, za, QUIVER_R)
    q1 = _back(bvh, xb, zb, QUIVER_R)
    for k in range(1, 8):
        t = k / 8
        need = _back(bvh, xa + (xb - xa) * t, za + (zb - za) * t, QUIVER_R).y - (q0.y + (q1.y - q0.y) * t)
        if need > 0:
            q0.y += need
            q1.y += need
    ax = (q1 - q0).normalized()
    me = bpy.data.meshes.new(name + "_arrows")
    me.uv_layers.new(name="UVMap")
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    tube = _mk["_tube"]
    tube(bm, uvl, [q0, q0 + ax * 0.03], QUIVER_R * 1.1, sw["silver"], segs=10)
    tube(bm, uvl, [q0 + ax * 0.03, q1 - ax * 0.04], QUIVER_R, sw["dark"], segs=10)
    tube(bm, uvl, [q1 - ax * 0.04, q1], QUIVER_R * 1.14, sw["silver"], segs=10)
    side = ax.cross(Vector((0, 1, 0))).normalized()
    up = side.cross(ax).normalized()
    for k in range(5):
        a = k / 5 * math.tau + 0.4
        off = (side * math.cos(a) + up * math.sin(a)) * QUIVER_R * 0.5
        base = q1 - ax * 0.12 + off
        tip = q1 + ax * (0.13 + 0.025 * (k % 2)) + off * 1.6
        tube(bm, uvl, [base, tip], 0.006, sw["silver"], segs=4)
        tube(bm, uvl, [tip - ax * 0.07, tip - ax * 0.02], 0.014, sw["magenta"], segs=5)
        tube(bm, uvl, [tip - ax * 0.12, tip - ax * 0.07], 0.009, sw["blue"], segs=5)
        g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.022)
        for v in g["verts"]:
            v.co = tip + v.co
        for f in {f for v in g["verts"] for f in v.link_faces}:
            for l in f.loops:
                l[uvl].uv = sw["glow"]
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name + "_arrows", me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(bpy.data.objects[name + "_bow"].data.materials[0])
    _white(me)
    _mk["_bind"](o, arm, {"chest": list(range(len(me.vertices)))})
    return o


def _smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def fold_wings(me, root=(0.02, 0.1, 0.05), fold=PIP_FOLD):
    th_, ph = (math.radians(a) for a in fold)
    for v in me.vertices:
        c = v.co
        sg = 1 if c.y > 0 else -1
        w = _smooth(0.085, 0.16, abs(c.y)) * _smooth(-0.11, -0.04, c.z)
        if w <= 0:
            continue
        p = Vector((root[0], sg * root[1], root[2]))
        R = Matrix.Rotation(-ph * w, 3, "Y") @ Matrix.Rotation(sg * th_ * w, 3, "Z")
        v.co = p + R @ (c - p)


def attach_pip(name, arm, src_path):
    w = th.import_prop(name + "_pip", src_path, tex=512)
    dec = w.modifiers.new("dec", "DECIMATE")
    dec.ratio = 1700 / len(w.data.polygons)
    dec.delimit = {"UV"}
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=dec.name)
    fold_wings(w.data)
    T = Matrix.Translation(Vector(PIP_AT)) @ Matrix.Rotation(math.radians(-90 + PIP_TURN), 4, "Z") @ Matrix.Scale(PIP_SCALE, 4) @ Matrix.Translation((0, 0, 0.06))
    w.data.transform(T)
    _mk["_bind"](w, arm, {"chest": list(range(len(w.data.vertices)))})
    w.name = name + "_pip"
    return w


def _cast():
    _p, _clip = _mk["_p"], _mk["_clip"]
    k = [(0, {})]
    wind = {"spine": (8, -14, 0), "chest": (0, -6, 0), "head": (4, 16, 0), "hips": (0, -8, 0), "@hips": (0, -0.04, 0),
            "thigh_R": (-6, 0, 8), "shin_R": (14, 0, 0), "thigh_L": (-14, 0, -8), "shin_L": (18, 0, 0)}
    k.append((4, _p(wind, draw=(0.1, -0.16, 1.66), poleR=(-0.3, 0.2, -1), **{"arm_L": (-8, 0, -14), "forearm_L": (-26, 0, 0)})))
    k.append((6, _p(wind, draw=(0.08, -0.19, 1.69), poleR=(-0.3, 0.2, -1), **{"arm_L": (-8, 0, -14), "forearm_L": (-26, 0, 0)})))
    thr = {"spine": (18, 30, 0), "chest": (4, 10, 0), "head": (-14, -26, 0), "hips": (0, 14, 0), "@hips": (0, -0.08, 0),
           "thigh_R": (-40, 0, 6), "shin_R": (40, 0, 0), "thigh_L": (18, 0, -6), "shin_L": (14, 0, 0)}
    k.append((8, _p(thr, reachR=((0.05, -1, 0.75), 0.995), poleR=(-1, 0.3, -0.5), **{"arm_L": (16, 0, -22), "forearm_L": (-24, 0, 0), "hand_R": (-25, 0, 0)})))
    k.append((11, _p(thr, reachR=((0.05, -1, 0.8), 0.99), poleR=(-1, 0.3, -0.5), **{"arm_L": (16, 0, -22), "forearm_L": (-24, 0, 0), "hand_R": (-35, 0, 0)})))
    k.append((17, {}))
    return _clip(k)


_mk["_cast"] = _cast
