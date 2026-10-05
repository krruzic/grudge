"""Abbess Hollin (scribe): Tripo body skinned by hand (robe on the hips, bell sleeves on the arms, veil on the head and chest), Tripo quill staff in hand_R."""

CFG = {
    "yaw": -90,
    "height": 1.85,
    "weight": 0.95,
    "tex": 1024,
    "joints": {
        "hip": 0.92,
        "chest": 1.2,
        "neck": 1.42,
        "head_top": 1.85,
        "head_y": -0.02,
        "shoulder": (0.2, 1.3),
        "elbow": (0.38, 1.08),
        "wrist": (0.52, 0.94),
        "finger": (0.6, 0.78),
        "leg_x": 0.13,
        "knee": 0.48,
        "ankle": 0.1,
    },
    "team_hue": (200, 245),
    "team_box": ((-0.17, -0.5, 0.3), (0.17, 0.5, 1.4)),
    "attach": [("attach_quill", "scribe_quill_tripo.glb")],
    "clips": "scribe_clips",
}

LEGS = ("thigh_L", "thigh_R", "shin_L", "shin_R")
ARMS = ("arm", "forearm", "hand")
ROBE_KEEP = 0.3
ROBE_TOP = 0.86
ARMPIT = (0.24, 1.2)
SLEEVE_SLOPE = 0.35
ARM_LOW = 0.86
HAND_REACH = 0.15
SHOULDER_BLEND = (0.14, 0.3)
BODY = (("hips", -9.0), ("spine", 1.03), ("chest", 1.2), ("head", 1.44))
BLEND = 0.05


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


def skin(p, B):
    ax = abs(p.x)
    side = "L" if p.x > 0 else "R"
    xb = ARMPIT[0] + max(0.0, ARMPIT[1] - p.z) * SLEEVE_SLOPE
    near_hand = min(seg_dist(p, *B[f"{b}_{side}"]) for b in ("forearm", "hand")) < HAND_REACH
    if p.z < ARMPIT[1] and ((p.z > ARM_LOW and ax > xb) or (near_hand and ax > 0.4) or (ax > 0.43 and p.z > 0.62)):
        if p.z > ARMPIT[1] - 0.1 and ax < xb + 0.06:
            s = max(0.0, min(1.0, (ax - xb) / 0.06)) * 0.5 + 0.5
            w = {n: x * (1 - s) for n, x in body_weights(p.z).items()}
            for n, x in arm_weights(p, B, side).items():
                w[n] = w.get(n, 0) + x * s
            return w
        return arm_weights(p, B, side)
    a, b = SHOULDER_BLEND
    if p.z >= ARMPIT[1] and ax > a and p.z < ARMPIT[1] + 0.2:
        s = min(1.0, (ax - a) / (b - a))
        s = s * s * (3 - 2 * s)
        s = s * min(1.0, max(0.0, (ARMPIT[1] + 0.2 - p.z) / 0.14))
        w = {n: x * (1 - s) for n, x in body_weights(p.z).items()}
        for n, x in arm_weights(p, B, side).items():
            w[n] = w.get(n, 0) + x * s
        return w
    if p.z > ROBE_TOP:
        return body_weights(p.z)
    best = min(LEGS, key=lambda n: seg_dist(p, *B[n]))
    if p.z < 0.24 and seg_dist(p, *B[best]) < 0.13:
        return {best: 1.0}
    f = ROBE_KEEP * (1 - p.z / ROBE_TOP) + 0.06
    return {best: f, "hips": 1 - f}


def reskin(name, arm):
    """Auto weights glue the robe to the legs and the bell sleeves to the robe, so skin the A-pose by hand and redo the arm swing."""
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
        for n, x in skin(v.co, B).items():
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
    bpy.data.objects.remove(tmp, do_unlink=True)


def decimate(obj, tris):
    n = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if n <= tris:
        return
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    d = obj.modifiers.new("dec", "DECIMATE")
    d.ratio = tris / n
    bpy.ops.object.modifier_apply(modifier=d.name)


QUILL_NIB = (-0.01, -0.492, -0.387)
QUILL_TIP = (0.042, 0.485, 0.381)
QUILL_AT = 0.3
QUILL_AXIS = (0, -0.1, 1)
QUILL_LEN = 1.3
QUILL_ROLL = 0
QUILL_TRIS = 1800


def attach_quill(name, arm, path):
    reskin(name, arm)
    w = th.import_prop(name + "_quill", path, tex=512)
    decimate(w, QUILL_TRIS)
    nib, tip = Vector(QUILL_NIB), Vector(QUILL_TIP)
    d = (tip - nib).normalized()
    grip = nib + (tip - nib) * QUILL_AT
    q = d.rotation_difference(Vector((-1, 0, 0)))
    w.data.transform(q.to_matrix().to_4x4() @ Matrix.Translation(-grip))
    w.data.transform(Matrix.Rotation(math.radians(QUILL_ROLL), 4, "X"))
    th.place_on_bone(w, arm, "hand_R", (0, 0, 0), QUILL_AXIS, QUILL_LEN, at=0.5, side=(1, 0, 0))
    w.name = name + "_quill"
    return w


LEG_SCALE = {"run": 0.6, "attack_a": 0.7, "attack_b": 0.7, "attack_c": 0.7, "slam": 0.55, "cast": 0.7, "shoot": 0.7, "block": 0.7, "dodge": 0.4, "death": 0.4, "hit": 0.7, "gust": 0.6}
QUILL_KEEP = {"idle": 0.85, "run": 0.8, "block": 0.9, "dodge": 0.8, "hit": 0.8, "death": 0.5}


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


def aim_quill(clip, tilt):
    """Key hand_R so the quill's total pitch (arm + forearm + hand) follows `tilt`: 0 upright, + tip forward, - tip back."""
    b = clip["bones"]
    arm, fore = b.get("arm_R", []), b.get("forearm_R", [])
    times = sorted({t for t, _ in arm} | {t for t, _ in fore} | {t for t, _ in tilt})
    b["hand_R"] = [(t, (lerp_keys(tilt, t)[0] - lerp_keys(arm, t)[0] - lerp_keys(fore, t)[0], 0, 0)) for t in times]
    return clip


def ink_flick():
    """A: Ink Bolt. Quill drawn back over the shoulder, then flicked forward like a brush stroke (release ~40%)."""
    return {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (3, (-125, 0, 28)), (5, (-110, 0, 22)), (6, (-62, 0, 10)), (8, (-50, 0, 8)), (15, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (3, (-70, 0, 0)), (5, (-55, 0, 0)), (6, (-8, 0, 0)), (8, (-12, 0, 0)), (15, (-22, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (3, (-35, 0, -30)), (6, (-78, 0, -22)), (9, (-70, 0, -20)), (15, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (3, (-45, 0, 0)), (6, (-12, 0, 0)), (15, (-14, 0, 0))],
            "hand_L": [(0, (0, 0, 0)), (6, (40, 0, 0)), (15, (0, 0, 0))],
            "spine": [(0, (0, 0, 0)), (3, (-8, -22, 0)), (6, (12, 16, 0)), (8, (14, 18, 0)), (15, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (3, (4, 18, 0)), (6, (-6, -10, 0)), (15, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (6, (12, 0, 4)), (15, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (6, (-22, 0, -4)), (15, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (6, (24, 0, 0)), (15, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (3, (0, 0.03, 0.01)), (6, (0, -0.06, -0.04)), (15, (0, 0, 0))]},
    }


def quill_sweep(d):
    """Horizontal quill sweep (shove / crossing-out strike), d=1 forehand, d=-1 backhand."""
    out = 80 if d > 0 else -50
    end = -50 if d > 0 else 70
    return {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (3, (-70, 0, out)), (6, (-85, 0, (out + end) / 2)), (7, (-82, 0, end)), (10, (-55, 0, end * 0.6)), (14, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (3, (-40, 0, 0)), (6, (-10, 0, 0)), (14, (-22, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (3, (-25, 0, -40)), (6, (5, 0, -30)), (14, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (3, (-45, 0, 0)), (14, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (3, (5, -32 * d, 0)), (6, (10, 30 * d, 0)), (7, (10, 36 * d, 0)), (14, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (3, (0, 22 * d, 0)), (6, (0, -18 * d, 0)), (14, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (6, (15, 0, 4)), (14, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (6, (-22, 0, -4)), (14, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (3, (0, 0.02, 0.02)), (6, (0, -0.05, -0.05)), (14, (0, 0, 0))]},
    }


def scribe_clips(clips):
    clips["shoot"] = aim_quill(ink_flick(), [(0, (0, 0, 0)), (3, (-60, 0, 0)), (5, (-40, 0, 0)), (6, (55, 0, 0)), (8, (50, 0, 0)), (15, (0, 0, 0))])
    sweep = [(0, (0, 0, 0)), (3, (30, 0, 0)), (6, (40, 0, 0)), (10, (25, 0, 0)), (14, (0, 0, 0))]
    clips["attack_a"] = aim_quill(quill_sweep(1), sweep)
    clips["attack_b"] = aim_quill(quill_sweep(-1), sweep)
    clips["attack_c"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (4, (-150, 0, 14)), (6, (-155, 0, 12)), (8, (-55, 0, 6)), (12, (-50, 0, 6)), (17, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (4, (-40, 0, 0)), (8, (-10, 0, 0)), (17, (-22, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (4, (-50, 0, -40)), (8, (10, 0, -30)), (17, (0, 0, -6))],
            "spine": [(0, (0, 0, 0)), (4, (-14, 0, 0)), (8, (28, 0, 0)), (12, (24, 0, 0)), (17, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (4, (-12, 0, 0)), (8, (10, 0, 0)), (17, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (8, (-35, 0, -4)), (17, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (8, (40, 0, 0)), (17, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (4, (0, 0.06, 0.03)), (8, (0, -0.12, -0.08)), (12, (0, -0.12, -0.08)), (17, (0, 0, 0))]},
    }
    # B: Swarm. Quill raised, the left hand sweeps out and up, palm open, releasing the bees (~55%).
    clips["cast"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (5, (-50, 0, 24)), (10, (-95, 0, 26)), (13, (-95, 0, 26)), (18, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (5, (-50, 0, 0)), (10, (-40, 0, 0)), (18, (-22, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (5, (-30, 0, -20)), (8, (-60, 0, -55)), (10, (-115, 0, -50)), (13, (-118, 0, -48)), (18, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (5, (-80, 0, 0)), (8, (-50, 0, 0)), (10, (-15, 0, 0)), (18, (-14, 0, 0))],
            "hand_L": [(0, (0, 0, 0)), (5, (0, 50, 0)), (10, (-30, 70, 0)), (13, (-30, 70, 0)), (18, (0, 0, 0))],
            "spine": [(0, (0, 0, 0)), (5, (12, 18, 0)), (10, (-12, -10, 0)), (13, (-10, -8, 0)), (18, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (5, (12, 10, 0)), (10, (-20, -12, 0)), (13, (-18, -10, 0)), (18, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (5, (-15, 0, 5)), (10, (0, 0, 5)), (18, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (5, (-15, 0, -5)), (10, (0, 0, -5)), (18, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (5, (25, 0, 0)), (10, (0, 0, 0)), (18, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (5, (25, 0, 0)), (10, (0, 0, 0)), (18, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (5, (0, -0.07, 0)), (10, (0, 0.04, 0)), (13, (0, 0.03, 0)), (18, (0, 0, 0))]},
    }
    # Z: Illuminated Manuscript. Quill raised high in both hands, then driven nib-first into the ground (~55%).
    clips["slam"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (5, (-105, 0, 26)), (10, (-138, 0, 30)), (12, (-70, 0, 8)), (16, (-62, 0, 8)), (22, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (5, (-40, 0, 0)), (10, (-20, 0, 0)), (12, (-10, 0, 0)), (22, (-22, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (5, (-105, 0, -26)), (10, (-138, 0, -30)), (12, (-75, 0, -6)), (16, (-65, 0, -8)), (22, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (5, (-40, 0, 0)), (10, (-25, 0, 0)), (12, (-15, 0, 0)), (22, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (5, (-10, 0, 0)), (10, (-20, 0, 0)), (12, (30, 0, 0)), (16, (26, 0, 0)), (22, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (10, (-22, 0, 0)), (12, (12, 0, 0)), (22, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (5, (-20, 0, 8)), (12, (-35, 0, 10)), (16, (-35, 0, 10)), (22, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (5, (-20, 0, -8)), (12, (-35, 0, -10)), (16, (-35, 0, -10)), (22, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (5, (35, 0, 0)), (12, (60, 0, 0)), (16, (60, 0, 0)), (22, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (5, (35, 0, 0)), (12, (60, 0, 0)), (16, (60, 0, 0)), (22, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (5, (0, -0.06, 0)), (10, (0, 0.08, 0)), (12, (0, -0.14, -0.06)), (16, (0, -0.14, -0.06)), (22, (0, 0, 0))]},
    }
    # L+X: Page Gust. She leans back reading an open page (left palm up), carried backwards by the wind.
    clips["gust"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (3, (-40, 0, 30)), (8, (-45, 0, 32)), (11, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (3, (-30, 0, 0)), (11, (-22, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (3, (-55, 0, -12)), (8, (-58, 0, -12)), (11, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (3, (-60, 0, 0)), (8, (-60, 0, 0)), (11, (-14, 0, 0))],
            "hand_L": [(0, (0, 0, 0)), (3, (0, 70, 0)), (8, (0, 70, 0)), (11, (0, 0, 0))],
            "spine": [(0, (0, 0, 0)), (3, (-16, 0, 0)), (8, (-14, 0, 0)), (11, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (3, (-6, 0, 0)), (11, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (3, (22, 0, 0)), (8, (20, 0, 0)), (11, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (3, (20, 0, 4)), (8, (18, 0, 4)), (11, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (3, (-10, 0, -4)), (8, (-8, 0, -4)), (11, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (3, (20, 0, 0)), (11, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (3, (0, 0.12, 0.05)), (8, (0, 0.1, 0.04)), (11, (0, 0, 0))]},
    }
    aim_quill(clips["attack_c"], [(0, (0, 0, 0)), (4, (-30, 0, 0)), (6, (-30, 0, 0)), (8, (-20, 0, 0)), (12, (-20, 0, 0)), (17, (0, 0, 0))])
    aim_quill(clips["cast"], [(0, (0, 0, 0)), (5, (10, 0, 0)), (10, (15, 0, 0)), (13, (15, 0, 0)), (18, (0, 0, 0))])
    aim_quill(clips["slam"], [(0, (0, 0, 0)), (5, (-5, 0, 0)), (10, (-10, 0, 0)), (12, (-30, 0, 0)), (16, (-30, 0, 0)), (22, (0, 0, 0))])
    aim_quill(clips["gust"], [(0, (0, 0, 0)), (3, (5, 0, 0)), (8, (5, 0, 0)), (11, (0, 0, 0))])
    for name, s in LEG_SCALE.items():
        if name not in clips:
            continue
        b = clips[name]["bones"]
        for bn in LEGS:
            if bn in b:
                b[bn] = [(t, tuple(x * s for x in r)) for t, r in b[bn]]
    for name, k in QUILL_KEEP.items():
        b = clips[name]["bones"]
        arm, fore = b.get("arm_R", []), b.get("forearm_R", [])
        times = sorted({t for t, _ in arm} | {t for t, _ in fore})
        if not times:
            continue
        b["hand_R"] = [(t, (-(lerp_keys(arm, t)[0] + lerp_keys(fore, t)[0]) * k, 0, 0)) for t in times]
    return clips
