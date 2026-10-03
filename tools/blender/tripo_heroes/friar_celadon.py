"""Brother Maddock costume BROTHER CELADON: a squat glazed porcelain figurine body on the friar rig and clips, porcelain teapot in hand_R, ginger jar (keg@celadon) on his back."""

_fr = dict(globals())
exec(open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "friar.py")).read(), _fr)

CFG = {
    **_fr["CFG"],
    "name": "friar",
    "src": "friar_celadon_tripo.glb",
    "out": "friar@celadon",
    "height": 1.85,
    "joints": {
        "hip": 0.46,
        "chest": 1.12,
        "neck": 1.42,
        "head_top": 1.85,
        "head_y": -0.02,
        "shoulder": (0.44, 1.26),
        "elbow": (0.6, 1.15),
        "wrist": (0.74, 1.05),
        "finger": (0.9, 0.97),
        "leg_x": 0.26,
        "knee": 0.2,
        "ankle": 0.07,
    },
    "team_hue": (95, 185),
    "team_box": ((-0.7, -0.8, 0.25), (0.7, 0.8, 1.7)),
    "vivid": {"hue": (95, 185), "to": 150, "pull": 0.2, "sat": 1.7, "val": 1.0, "min_sat": 0.1},
    "attach": [("attach_teapot", "friar_celadon_teapot_tripo.glb"), ("attach_jar", "../props/keg@celadon.glb")],
    "clips": "celadon_clips",
}

LEGS = ("thigh_L", "thigh_R", "shin_L", "shin_R")
ARMS = ("arm", "forearm", "hand")
BODY = (("hips", -9.0), ("spine", 0.78), ("chest", 1.12), ("head", 1.43))
BLEND = 0.06
ROBE_TOP = 0.5
ROBE_KEEP = 0.35
FOOT_Z = 0.27
LEG_R = 0.17
ARM_CUT = (-0.02, 0.1)
ARM_RAD = (0.27, 0.3, 0.14)
SWING = {"arm": (0.95, -0.05), "forearm": (0.8, -0.2), "hand": (0.6, -0.2)}
HEAD_R = (0.27, 0.36)
ARM_OUT = (0.56, 0.75)
LOCF = 0.45


def seg(p, h, t):
    e = t - h
    u = max(0.0, min(1.0, (p - h).dot(e) / max(e.length_squared, 1e-9)))
    return (p - (h + e * u)).length, u


def body_w(z, r=0.0):
    w = {}
    for k, (n, z0) in enumerate(BODY):
        lo = 1.0 if k == 0 else min(1.0, max(0.0, (z - z0 + BLEND) / (2 * BLEND)))
        hi = 1.0 if k == len(BODY) - 1 else 1.0 - min(1.0, max(0.0, (z - BODY[k + 1][1] + BLEND) / (2 * BLEND)))
        if lo * hi > 0:
            w[n] = lo * hi
    h = w.pop("head", 0.0)
    if h:
        k = min(1.0, max(0.0, (HEAD_R[1] - r) / (HEAD_R[1] - HEAD_R[0])))
        w["head"] = h * k
        w["chest"] = w.get("chest", 0.0) + h * (1 - k)
    return w


def arm_w(p, B, side):
    inv = {f"{b}_{side}": 1.0 / max(seg(p, *B[f"{b}_{side}"])[0], 1e-3) ** 6 for b in ARMS}
    tot = sum(inv.values())
    return {n: x / tot for n, x in inv.items()}


def lower_w(p, B):
    best = min(LEGS, key=lambda n: seg(p, *B[n])[0])
    if p.z < FOOT_Z and seg(p, *B[best])[0] < LEG_R:
        return {best: 1.0}
    f = ROBE_KEEP * max(0.0, 1 - (p.z - FOOT_Z) / (ROBE_TOP - FOOT_Z)) + 0.04
    return {best: f, "hips": 1 - f}


def skin(p, B):
    side = "L" if p.x > 0 else "R"
    S, E = B[f"arm_{side}"]
    d = (E - S).normalized()
    t = (p - S).dot(d)
    lat = min(seg(p, *B[f"{b}_{side}"])[0] for b in ARMS)
    if abs(p.x) > ARM_OUT[0] and p.z > ARM_OUT[1]:
        return arm_w(p, B, side)
    base = body_w(p.z, math.hypot(p.x, (p.y + 0.02) * 0.7)) if p.z > ROBE_TOP else lower_w(p, B)
    if t > ARM_CUT[0] and lat < max(ARM_RAD[2], ARM_RAD[0] - max(0.0, t) * ARM_RAD[1]):
        s = min(1.0, (t - ARM_CUT[0]) / (ARM_CUT[1] - ARM_CUT[0]))
        s = s * s * (3 - 2 * s)
        w = {n: x * (1 - s) for n, x in base.items()}
        for n, x in arm_w(p, B, side).items():
            w[n] = w.get(n, 0) + x * s
        return w
    return base


def swing(src, arm):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for side, sx in (("R", -1), ("L", 1)):
        for b in ARMS:
            ox, oy = SWING[b]
            pb = arm.pose.bones[f"{b}_{side}"]
            bpy.context.view_layer.update()
            cur = (pb.tail - pb.head).normalized()
            q = cur.rotation_difference(Vector((ox * sx, oy, -1)).normalized())
            M = pb.matrix.copy()
            loc = M.to_translation()
            pb.matrix = Matrix.Translation(loc) @ q.to_matrix().to_4x4() @ Matrix.Translation(-loc) @ M
            bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = src
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    src.select_set(True)
    mod = next(m for m in src.modifiers if m.type == "ARMATURE")
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in arm.data.edit_bones:
        eb.roll = 0.0
    bpy.ops.object.mode_set(mode="OBJECT")


def copy_rest(dst, src_arm):
    rest = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in src_arm.data.bones}
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = dst
    dst.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in dst.data.edit_bones:
        eb.head, eb.tail = rest[eb.name]
        eb.roll = 0.0
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in dst.pose.bones:
        pb.rotation_mode = "XYZ"


def team_flags(me, px):
    """Stole faces: most of the face's samples are jade green (the shared check samples only the face centre and misses the stole's edges)."""
    h, w = px.shape[:2]
    uv = me.uv_layers.active.data
    lo, hi = CFG["team_hue"]
    (x0, y0, z0), (x1, y1, z1) = CFG["team_box"]

    def green(u, v):
        r, g, b = px[min(h - 1, max(0, int((v % 1.0) * h))), min(w - 1, max(0, int((u % 1.0) * w))), :3]
        mx, mn = max(r, g, b), min(r, g, b)
        if mx < 0.08 or (mx - mn) / mx < 0.12:
            return False
        d = mx - mn
        hue = (((g - b) / d) % 6 if mx == r else ((b - r) / d + 2 if mx == g else (r - g) / d + 4)) * 60
        return lo <= hue <= hi

    cnt = []
    for p in me.polygons:
        pts = [uv[i].uv for i in p.loop_indices]
        cu = sum(q.x for q in pts) / len(pts)
        cv = sum(q.y for q in pts) / len(pts)
        n = green(cu, cv) * 2 + sum(green(cu * 0.6 + q.x * 0.4, cv * 0.6 + q.y * 0.4) for q in pts)
        c = p.center
        cnt.append(n if x0 <= c.x <= x1 and y0 <= c.y <= y1 and z0 <= c.z <= z1 else 0)
    flags = [n >= 3 for n in cnt]
    vf = {}
    for i, p in enumerate(me.polygons):
        for v in p.vertices:
            vf.setdefault(v, []).append(i)
    grow = set()
    for i, p in enumerate(me.polygons):
        if not flags[i] and cnt[i] >= 1 and any(flags[j] for v in p.vertices for j in vf[v]):
            grow.add(i)
    for i in grow:
        flags[i] = True
    return flags


def reskin(name, arm):
    src = bpy.data.objects[name]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", CFG["src"]))
    new = [o for o in bpy.data.objects if o not in before]
    ref = next(o for o in new if o.type == "MESH")
    me = ref.data
    me.transform(ref.matrix_world)
    me.transform(Matrix.Rotation(math.radians(CFG["yaw"]), 4, "Z"))
    zs = [v.co.z for v in me.vertices]
    me.transform(Matrix.Scale(CFG["height"] / (max(zs) - min(zs)), 4))
    z0 = min(v.co.z for v in me.vertices)
    me.transform(Matrix.Translation((0, 0, -z0)))
    bones = th.fit_joint_depth(ref, th.a_pose_bones(CFG["joints"]))
    A = [v.co.copy() for v in me.vertices]
    img, px = th.tex_lookup(ref)
    flags = team_flags(me, px)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    B = {n: (Vector(h), Vector(t)) for n, (h, t, _) in bones.items()}
    tmp = th.make_armature(name + "_apose", bones)
    for v, c in zip(src.data.vertices, A):
        v.co = c
    for g in list(src.vertex_groups):
        src.vertex_groups.remove(g)
    for n in bones:
        src.vertex_groups.new(name=n)
    for v in src.data.vertices:
        for n, x in skin(v.co, B).items():
            if x > 1e-3:
                src.vertex_groups[n].add([v.index], x, "ADD")
    for m in list(src.data.materials):
        bpy.data.materials.remove(m)
    th.bake_material(name, src, CFG, img, px, [(0.1, 0.6, 0.3) if f else (0.5, 0.5, 0.5) for f in flags])
    src.parent = None
    for m in src.modifiers:
        if m.type == "ARMATURE":
            m.object = tmp
    swing(src, tmp)
    copy_rest(arm, tmp)
    m = src.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    src.parent = arm
    bpy.data.objects.remove(tmp, do_unlink=True)


TEAPOT_TRIS = 1500
TEAPOT_LEN = 0.62
TEAPOT_GRIP = (0.9, 0.0, 0.5)
TEAPOT_AXIS = (0.0, -1.0, -0.15)
TEAPOT_SIDE = (1.0, 0.0, 0.0)


def attach_teapot(name, arm, src_path):
    reskin(name, arm)
    w = th.import_prop(name + "_tankard", src_path, tex=512)
    _fr["friar_decimate"](w, TEAPOT_TRIS)
    co = [v.co.copy() for v in w.data.vertices]
    lo = Vector([min(c[k] for c in co) for k in range(3)])
    hi = Vector([max(c[k] for c in co) for k in range(3)])
    s = 1.0 / (hi.y - lo.y)
    w.data.transform(Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))))
    co = [v.co.copy() for v in w.data.vertices]
    lo = Vector([min(c[k] for c in co) for k in range(3)])
    hi = Vector([max(c[k] for c in co) for k in range(3)])
    g = Vector((lo.x + (hi.x - lo.x) * TEAPOT_GRIP[0], (lo.y + hi.y) / 2 + TEAPOT_GRIP[1], lo.z + (hi.z - lo.z) * TEAPOT_GRIP[2]))
    th.place_on_bone(w, arm, "hand_R", g, TEAPOT_AXIS, TEAPOT_LEN, at=0.5, side=TEAPOT_SIDE)
    w.name = name + "_tankard"
    return w


JAR_AT = (0.0, 0.56, 1.02)
JAR_SCALE = 0.95
JAR_TILT = -12


def attach_jar(name, arm, src_path):
    bpy.ops.import_scene.gltf(filepath=os.path.normpath(src_path))
    w = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    for o in list(bpy.context.selected_objects):
        if o is not w:
            bpy.data.objects.remove(o, do_unlink=True)
    w.parent = None
    w.data.transform(w.matrix_world)
    w.matrix_world = Matrix.Identity(4)
    co = [v.co.copy() for v in w.data.vertices]
    lo = Vector([min(c[k] for c in co) for k in range(3)])
    hi = Vector([max(c[k] for c in co) for k in range(3)])
    mid = (lo + hi) / 2
    w.data.transform(Matrix.Translation(Vector(JAR_AT)) @ Matrix.Rotation(math.radians(JAR_TILT), 4, "X") @ Matrix.Rotation(math.radians(180), 4, "Z") @ Matrix.Scale(JAR_SCALE, 4) @ Matrix.Translation(-mid))
    vg = w.vertex_groups.new(name="chest")
    vg.add(list(range(len(w.data.vertices))), 1.0, "REPLACE")
    w.parent = arm
    m = w.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    w.data.materials[0].name = "keg_skin"
    w.name = name + "_keg"
    return w


def celadon_clips(clips):
    clips = _fr["friar_clips"](clips)
    for c in clips.values():
        for bn, keys in c.get("loc", {}).items():
            c["loc"][bn] = [(t, tuple(x * LOCF for x in v)) for t, v in keys]
    return clips
