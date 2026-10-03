"""Remnil (summoner): Tripo body, Tripo staff in hand_R, hand-made A-pose skin with the lower robe mostly on the hips."""

CFG = {
    "yaw": -90,
    "height": 2.0,
    "weight": 0.9,
    "tex": 1024,
    "joints": {
        "hip": 1.0,
        "chest": 1.3,
        "neck": 1.56,
        "head_top": 2.0,
        "head_y": -0.02,
        "shoulder": (0.22, 1.46),
        "elbow": (0.4, 1.2),
        "wrist": (0.56, 0.98),
        "finger": (0.62, 0.78),
        "leg_x": 0.17,
        "knee": 0.52,
        "ankle": 0.1,
    },
    "team_hue": (195, 250),
    "attach": [("attach_staff", "summoner_staff_tripo.glb")],
    "clips": "summoner_clips",
}

LEGS = ("thigh_L", "thigh_R", "shin_L", "shin_R")
ARMS = ("arm", "forearm", "hand")
ROBE_KEEP = 0.3
ROBE_TOP = 0.72
ARMPIT = (0.3, 1.36)
SLEEVE_SLOPE = 0.3
BODY = (("hips", -9.0), ("spine", 1.12), ("chest", 1.3), ("head", 1.57))
BLEND = 0.06


def seg_dist(p, h, t):
    e = t - h
    u = max(0.0, min(1.0, (p - h).dot(e) / max(e.length_squared, 1e-9)))
    return (p - (h + e * u)).length


def body_weights(z):
    w = {}
    for k, (n, z0) in enumerate(BODY):
        lo = 1.0 if k == 0 else min(1.0, max(0.0, (z - z0 + BLEND) / (2 * BLEND)))
        hi = 1.0 if k == len(BODY) - 1 else 1.0 - min(1.0, max(0.0, (z - BODY[k + 1][1] + BLEND) / (2 * BLEND)))
        if lo * hi > 0:
            w[n] = lo * hi
    return w


def arm_weights(p, B, side):
    ds = {f"{b}_{side}": seg_dist(p, *B[f"{b}_{side}"]) for b in ARMS}
    inv = {n: 1.0 / max(d, 1e-3) ** 6 for n, d in ds.items()}
    tot = sum(inv.values())
    return {n: x / tot for n, x in inv.items()}


def skin(p, B, legs):
    ax = abs(p.x)
    side = "L" if p.x > 0 else "R"
    xb = ARMPIT[0] + max(0.0, ARMPIT[1] - p.z) * SLEEVE_SLOPE
    if p.z < ARMPIT[1] and ax > xb and p.z > 0.76:
        return arm_weights(p, B, side)
    if p.z >= ARMPIT[1] and ax > 0.16:
        s = min(1.0, (ax - 0.16) / 0.14)
        w = {n: x * (1 - s) for n, x in body_weights(p.z).items()}
        for n, x in arm_weights(p, B, side).items():
            w[n] = w.get(n, 0) + x * s
        return w
    if p.z > ROBE_TOP:
        return body_weights(p.z)
    best = min(legs, key=lambda n: seg_dist(p, *B[n]))
    if p.z < 0.2 and seg_dist(p, *B[best]) < 0.11:
        return {best: 1.0}
    f = ROBE_KEEP * (1 - p.z / ROBE_TOP) + 0.08
    return {best: f, "hips": 1 - f}


def reskin(name, arm):
    """Auto weights mix the robe with the sleeves, so skin the A-pose by hand and redo the arm swing."""
    src = bpy.data.objects[name]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", f"{name}_tripo.glb"))
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
        for n, x in skin(v.co, B, LEGS).items():
            if x > 1e-3:
                src.vertex_groups[n].add([v.index], x, "ADD")
    src.parent = None
    for m in src.modifiers:
        if m.type == "ARMATURE":
            m.object = tmp
    th.swing_arms_down(src, tmp)
    for m in src.modifiers:
        if m.type == "ARMATURE":
            m.object = arm
    src.parent = arm
    print("RESKIN", max((tmp.data.bones[b.name].head_local - b.head_local).length + (tmp.data.bones[b.name].tail_local - b.tail_local).length for b in arm.data.bones))
    bpy.data.objects.remove(tmp, do_unlink=True)


def decimate(obj, ratio):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mods = [m for m in obj.modifiers]
    for m in mods:
        m.show_viewport = False
    d = obj.modifiers.new("dec", "DECIMATE")
    d.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=d.name)
    for m in mods:
        m.show_viewport = True


def attach_staff(name, arm, path):
    reskin(name, arm)
    w = th.import_prop(name + "_staff", path, tex=512)
    decimate(w, STAFF_TRIS / sum(len(p.vertices) - 2 for p in w.data.polygons))
    foot, top = Vector(STAFF_FOOT), Vector(STAFF_TOP)
    d = (top - foot).normalized()
    grip = foot + (top - foot) * STAFF_AT
    q = d.rotation_difference(Vector((-1, 0, 0)))
    w.data.transform(q.to_matrix().to_4x4() @ Matrix.Translation(-grip))
    w.data.transform(Matrix.Rotation(math.radians(STAFF_ROLL), 4, "X"))
    th.place_on_bone(w, arm, "hand_R", (0, 0, 0), STAFF_AXIS, STAFF_LEN, at=0.5, side=(1, 0, 0))
    w.name = name + "_staff"
    return w


STAFF_FOOT = (-0.019, -0.485, -0.281)
STAFF_TOP = (0.025, 0.173, 0.076)
STAFF_AT = 0.55
STAFF_ROLL = 0
STAFF_AXIS = (0, -0.12, 1)
STAFF_LEN = 1.75
STAFF_TRIS = 2000


LEG_SCALE = {"run": 0.6, "attack_a": 0.7, "attack_b": 0.7, "attack_c": 0.7, "slam": 0.5, "cast": 0.7, "block": 0.7, "dodge": 0.35, "death": 0.35, "hit": 0.7}
STAFF_KEEP = {"idle": 0.8, "run": 0.8, "attack_a": 0.75, "attack_b": 0.75, "attack_c": 0.75, "slam": 0.75, "cast": 0.85, "shoot": 0.7, "block": 0.9, "dodge": 0.8, "hit": 0.8}


def lerp_keys(keys, t):
    if not keys:
        return (0.0, 0.0, 0.0)
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = (t - t0) / max(t1 - t0, 1e-6)
            return tuple(x + (y - x) * u for x, y in zip(a, b))
    return keys[-1][1]


def summoner_clips(clips):
    for name, s in LEG_SCALE.items():
        b = clips[name]["bones"]
        for bn in LEGS:
            if bn in b:
                b[bn] = [(t, tuple(x * s for x in r)) for t, r in b[bn]]
    for name, k in STAFF_KEEP.items():
        b = clips[name]["bones"]
        arm, fore = b.get("arm_R", []), b.get("forearm_R", [])
        times = sorted({t for t, _ in arm} | {t for t, _ in fore})
        if not times:
            continue
        b["hand_R"] = [(t, (-(lerp_keys(arm, t)[0] + lerp_keys(fore, t)[0]) * k, 0, 0)) for t in times]
    return clips
