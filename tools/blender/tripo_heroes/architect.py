"""Professor Hoot (architect): round owl-folk scholar, Tripo body (coat skinned by hand so the hem doesn't glue to the
short legs), the Tripo carpenter's square in hand_R (`architect_square`, hidden by the game while it's thrown), the
ice-block pack rigid on the chest, satchel and slate rigid on the hips. Own clips: square jabs and a sweep, a
sidearm boomerang throw, a stamping build (forts / lookout), a two-armed dome raise and a flapping hop dodge."""

CFG = {
    "yaw": -90,
    "height": 1.85,
    "weight": 0.95,
    "tex": 1024,
    "joints": {
        "hip": 0.56,
        "chest": 1.1,
        "neck": 1.42,
        "head_top": 1.85,
        "head_y": -0.02,
        "shoulder": (0.33, 1.24),
        "elbow": (0.43, 1.03),
        "wrist": (0.51, 0.82),
        "finger": (0.62, 0.64),
        "leg_x": 0.14,
        "knee": 0.29,
        "ankle": 0.1,
    },
    "team_hue": (195, 250),
    "team_box": ((-0.62, -0.6, 0.6), (0.62, 0.3, 1.5)),
    "attach": [("attach_square", "architect_square_tripo.glb")],
    "clips": "architect_clips",
}

LEGS = ("thigh_L", "thigh_R", "shin_L", "shin_R")
ARMS = ("arm", "forearm", "hand")
PACK = ((-0.34, 0.2, 0.86), (0.34, 0.6, 1.62))
SATCHEL = ((-0.4, -0.55, 0.48), (-0.06, -0.12, 0.98))
SLATE = ((0.06, -0.55, 0.48), (0.42, -0.14, 0.95))
COAT_TOP = 0.62
COAT_KEEP = 0.35
ARMPIT = (0.36, 1.12)
SLEEVE_SLOPE = 0.4
ARM_REACH = 0.12
ARM_LOW = 0.56
SHOULDER_BLEND = (0.2, 0.42)
BODY = (("hips", -9.0), ("spine", 0.78), ("chest", 1.1), ("head", 1.42))
BLEND = 0.06


def seg_dist(p, h, t):
    e = t - h
    u = max(0.0, min(1.0, (p - h).dot(e) / max(e.length_squared, 1e-9)))
    return (p - (h + e * u)).length


def in_box(p, box):
    (x0, y0, z0), (x1, y1, z1) = box
    return x0 <= p.x <= x1 and y0 <= p.y <= y1 and z0 <= p.z <= z1


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
    if in_box(p, PACK):
        return {"chest": 1.0}
    if in_box(p, SATCHEL) or in_box(p, SLATE):
        return {"hips": 1.0}
    ax = abs(p.x)
    side = "L" if p.x > 0 else "R"
    xb = ARMPIT[0] + max(0.0, ARMPIT[1] - p.z) * SLEEVE_SLOPE
    if p.z < ARMPIT[1] and p.z > ARM_LOW and (ax > xb or min(seg_dist(p, *B[f"{b}_{side}"]) for b in ("forearm", "hand")) < ARM_REACH):
        return arm_weights(p, B, side)
    a, b = SHOULDER_BLEND
    if p.z >= ARMPIT[1] - 0.06 and ax > a and p.z < 1.5:
        s = min(1.0, (ax - a) / (b - a))
        s = s * s * (3 - 2 * s)
        s = s * min(1.0, max(0.0, (ARMPIT[1] + 0.36 - p.z) / 0.2))
        w = {n: x * (1 - s) for n, x in body_weights(p.z).items()}
        for n, x in arm_weights(p, B, side).items():
            w[n] = w.get(n, 0) + x * s
        return w
    if p.z > COAT_TOP:
        return body_weights(p.z)
    best = min(LEGS, key=lambda n: seg_dist(p, *B[n]))
    d = seg_dist(p, *B[best])
    if p.z < 0.36 and d < 0.13:
        return {best: 1.0}
    f = COAT_KEEP * (1 - p.z / COAT_TOP) + 0.1
    if d < 0.09:
        f = max(f, 0.75)
    return {best: f, "hips": 1 - f}


def reskin(name, arm):
    """Auto weights glue the coat to the legs and the belly to the sleeves: skin the A-pose by hand, then swing the arms."""
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


SQUARE_SCALE = 1.0
SQUARE_TRIS = 1400
# Source grip (the leather wrap on the short arm) and its frame: the short arm runs -Y toward the corner, the long
# arm +Z from the corner, the flat faces along X.
SQUARE_FWD = (0.1, -1.0, 0.0)
SQUARE_LONG = (0.05, 0.2, 1.0)


def square_grip(w):
    co = np.array([v.co[:] for v in w.data.vertices])
    lo, hi = co.min(0), co.max(0)
    return Vector(((lo[0] + hi[0]) / 2, hi[1] - (hi[1] - lo[1]) * 0.16, lo[2] + (hi[2] - lo[2]) * 0.06))


def attach_square(name, arm, src_path):
    reskin(name, arm)
    w = th.import_prop(name + "_square", src_path, tex=512)
    n = sum(len(p.vertices) - 2 for p in w.data.polygons)
    if n > SQUARE_TRIS:
        d = w.modifiers.new("dec", "DECIMATE")
        d.ratio = SQUARE_TRIS / n
        bpy.context.view_layer.objects.active = w
        bpy.ops.object.modifier_apply(modifier=d.name)
    g = square_grip(w)
    f = Vector(SQUARE_FWD).normalized()
    o = Vector(SQUARE_LONG)
    o = (o - f * o.dot(f)).normalized()
    nrm = (-f).cross(o)
    R = Matrix((nrm, -f, o)).transposed().to_4x4()
    hb = arm.data.bones["hand_R"]
    at = hb.head_local + (hb.tail_local - hb.head_local) * 0.55
    w.data.transform(Matrix.Translation(at) @ R @ Matrix.Scale(SQUARE_SCALE, 4) @ Matrix.Translation(-g))
    vg = w.vertex_groups.new(name="hand_R")
    vg.add(list(range(len(w.data.vertices))), 1.0, "REPLACE")
    w.parent = arm
    m = w.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    w.name = name + "_square"
    return w


LEG_SCALE = {"run": 0.75, "attack_a": 0.7, "attack_b": 0.7, "attack_c": 0.8, "slam": 0.6, "build": 0.7, "cast": 0.7, "block": 0.7, "death": 0.6, "hit": 0.7, "throw": 0.7}


def square_swing(d):
    """Quick flat swing with the square, d=1 forehand (right to left), d=-1 backhand. Contact at frame 5 of 12."""
    out = 90 if d > 0 else -55
    end = -55 if d > 0 else 70
    return {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (3, (-65, 0, out)), (5, (-80, 0, (out + end) / 2)), (6, (-82, 0, end)), (9, (-55, 0, end * 0.5)), (12, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (3, (-30 if d > 0 else -85, 0, 0)), (5, (-6, 0, 0)), (7, (-10, 0, 0)), (12, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (3, (0, 0, 25 * d)), (5, (0, 0, -20 * d)), (12, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (3, (-25, 0, -45 if d > 0 else -20)), (5, (10, 0, -35)), (12, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (3, (-45, 0, 0)), (12, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (3, (4, -34 * d, 0)), (5, (10, 30 * d, 0)), (6, (10, 36 * d, 0)), (12, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (3, (0, -10 * d, 0)), (5, (0, 10 * d, 0)), (12, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (3, (0, 26 * d, 0)), (5, (0, -22 * d, 0)), (12, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (3, (-12, 0, 4)), (5, (16, 0, 4)), (12, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (5, (-26, 0, -4)), (12, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (5, (26, 0, 0)), (12, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (3, (0, 0.02, 0.03)), (5, (0, -0.05, -0.07)), (7, (0, -0.05, -0.07)), (12, (0, 0, 0))]},
    }


def architect_clips(clips):
    clips["attack_a"] = square_swing(1)
    clips["attack_b"] = square_swing(-1)
    # Finisher: a hop and an overhead chop with the square's long arm (contact at frame 8 of 18).
    clips["attack_c"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (4, (-150, 0, 18)), (6, (-170, 0, 14)), (8, (-50, 0, 4)), (9, (-35, 0, 2)), (13, (-40, 0, 4)), (18, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (4, (-60, 0, 0)), (6, (-70, 0, 0)), (8, (-5, 0, 0)), (13, (-10, 0, 0)), (18, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (6, (35, 0, 0)), (8, (-30, 0, 0)), (13, (-25, 0, 0)), (18, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (4, (-40, 0, -70)), (6, (-30, 0, -80)), (8, (10, 0, -45)), (13, (5, 0, -30)), (18, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (4, (-30, 0, 0)), (8, (-20, 0, 0)), (18, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (4, (-16, 8, 0)), (6, (-22, 10, 0)), (8, (30, -6, 0)), (9, (34, -6, 0)), (13, (28, -4, 0)), (18, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (6, (-14, 0, 0)), (8, (12, 0, 0)), (18, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (4, (-35, 0, 6)), (6, (-30, 0, 6)), (8, (20, 0, 5)), (18, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (4, (-35, 0, -6)), (6, (-30, 0, -6)), (8, (-40, 0, -5)), (18, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (4, (50, 0, 0)), (6, (40, 0, 0)), (8, (10, 0, 0)), (18, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (4, (50, 0, 0)), (6, (40, 0, 0)), (8, (45, 0, 0)), (18, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (2, (0, -0.08, 0)), (5, (0, 0.28, 0.04)), (6, (0, 0.3, 0.05)), (8, (0, -0.14, -0.12)), (10, (0, -0.15, -0.13)), (18, (0, 0, 0))]},
    }
    # Charged A: wind the square back behind the right shoulder, then a flat sidearm boomerang throw (release
    # frame 7 of 16, the sim's hitAt 0.22 of 0.5 s).
    clips["throw"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (4, (-60, 0, 95)), (6, (-75, 0, 110)), (7, (-85, 0, 40)), (8, (-85, 0, -30)), (10, (-70, 0, -50)), (16, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (4, (-95, 0, 0)), (6, (-100, 0, 0)), (7, (-30, 0, 0)), (8, (-5, 0, 0)), (16, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (6, (0, 0, 45)), (7, (0, 0, 0)), (8, (0, 0, -40)), (16, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (4, (-70, 0, -30)), (7, (-60, 0, -20)), (9, (20, 0, -40)), (16, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (4, (-40, 0, 0)), (16, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (4, (-4, -45, 0)), (6, (-6, -55, 0)), (7, (6, 0, 0)), (8, (12, 40, 0)), (10, (12, 44, 0)), (16, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (6, (0, -12, 0)), (8, (0, 14, 0)), (16, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (6, (0, 45, 0)), (8, (0, -30, 0)), (16, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (6, (-10, 0, 8)), (8, (25, 0, 6)), (16, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (6, (-25, 0, -6)), (8, (-40, 0, -6)), (16, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (6, (25, 0, 0)), (8, (40, 0, 0)), (16, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (6, (0, -0.04, 0.05)), (8, (0, -0.08, -0.1)), (10, (0, -0.08, -0.1)), (16, (0, 0, 0))]},
    }
    # Snow Fort / Lookout: heave the square up two-handed and ram it down into the ground ahead (frame 10 of 18).
    clips["build"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (5, (-150, 0, 20)), (8, (-165, 0, 16)), (10, (-40, 0, 8)), (13, (-35, 0, 8)), (18, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (5, (-50, 0, 0)), (8, (-55, 0, 0)), (10, (-10, 0, 0)), (18, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (8, (30, 0, 0)), (10, (-50, 0, 0)), (14, (-50, 0, 0)), (18, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (5, (-150, 0, -10)), (8, (-165, 0, -8)), (10, (-45, 0, -4)), (13, (-40, 0, -6)), (18, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (5, (-50, 0, 0)), (8, (-55, 0, 0)), (10, (-10, 0, 0)), (18, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (5, (-14, 0, 0)), (8, (-18, 0, 0)), (10, (34, 0, 0)), (13, (30, 0, 0)), (18, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (8, (-16, 0, 0)), (10, (10, 0, 0)), (18, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (5, (-20, 0, 8)), (10, (-45, 0, 8)), (13, (-45, 0, 8)), (18, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (5, (-20, 0, -8)), (10, (-45, 0, -8)), (13, (-45, 0, -8)), (18, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (5, (30, 0, 0)), (10, (75, 0, 0)), (13, (75, 0, 0)), (18, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (5, (30, 0, 0)), (10, (75, 0, 0)), (13, (75, 0, 0)), (18, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (5, (0, 0.08, 0)), (8, (0, 0.1, 0)), (10, (0, -0.18, -0.06)), (13, (0, -0.18, -0.06)), (18, (0, 0, 0))]},
    }
    # Avalanche Dome: crouch with the wings folded, then fling both wings up and wide (frame 12 of 22).
    clips["cast"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (5, (-40, 0, 20)), (9, (-30, 0, 15)), (12, (-90, 0, 120)), (17, (-90, 0, 125)), (22, (0, 0, 6))],
            "arm_L": [(0, (0, 0, -6)), (5, (-40, 0, -20)), (9, (-30, 0, -15)), (12, (-90, 0, -120)), (17, (-90, 0, -125)), (22, (0, 0, -6))],
            "forearm_R": [(0, (-22, 0, 0)), (5, (-100, 0, 0)), (9, (-110, 0, 0)), (12, (-10, 0, 0)), (22, (-22, 0, 0))],
            "forearm_L": [(0, (-14, 0, 0)), (5, (-100, 0, 0)), (9, (-110, 0, 0)), (12, (-10, 0, 0)), (22, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (5, (22, 0, 0)), (9, (26, 0, 0)), (12, (-16, 0, 0)), (17, (-14, 0, 0)), (22, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (5, (16, 0, 0)), (12, (-26, 0, 0)), (17, (-22, 0, 0)), (22, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (5, (-30, 0, 8)), (9, (-30, 0, 8)), (12, (5, 0, 8)), (22, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (5, (-30, 0, -8)), (9, (-30, 0, -8)), (12, (5, 0, -8)), (22, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (5, (55, 0, 0)), (9, (55, 0, 0)), (12, (0, 0, 0)), (22, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (5, (55, 0, 0)), (9, (55, 0, 0)), (12, (0, 0, 0)), (22, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (5, (0, -0.12, 0)), (9, (0, -0.13, 0)), (12, (0, 0.1, 0)), (17, (0, 0.08, 0)), (22, (0, 0, 0))]},
    }
    clips["slam"] = clips["build"]
    # Dodge / hop: no roll for a round owl - a flapping hop, wings beating twice, feet tucked (10 frames).
    clips["dodge"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (2, (-20, 0, 110)), (4, (-10, 0, 30)), (6, (-20, 0, 115)), (8, (-10, 0, 35)), (10, (0, 0, 6))],
            "arm_L": [(0, (0, 0, -6)), (2, (-20, 0, -110)), (4, (-10, 0, -30)), (6, (-20, 0, -115)), (8, (-10, 0, -35)), (10, (0, 0, -6))],
            "forearm_R": [(0, (-22, 0, 0)), (2, (-5, 0, 0)), (4, (-40, 0, 0)), (6, (-5, 0, 0)), (8, (-40, 0, 0)), (10, (-22, 0, 0))],
            "forearm_L": [(0, (-14, 0, 0)), (2, (-5, 0, 0)), (4, (-40, 0, 0)), (6, (-5, 0, 0)), (8, (-40, 0, 0)), (10, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (2, (16, 0, 0)), (8, (14, 0, 0)), (10, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (2, (-12, 0, 0)), (8, (-10, 0, 0)), (10, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (2, (-55, 0, 6)), (8, (-50, 0, 6)), (10, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (2, (-55, 0, -6)), (8, (-50, 0, -6)), (10, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (2, (70, 0, 0)), (8, (65, 0, 0)), (10, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (2, (70, 0, 0)), (8, (65, 0, 0)), (10, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (1, (0, -0.08, 0)), (3, (0, 0.35, 0)), (6, (0, 0.42, 0)), (9, (0, 0.05, 0)), (10, (0, 0, 0))]},
    }
    for name, s in LEG_SCALE.items():
        if name not in clips:
            continue
        b = clips[name]["bones"]
        for bn in LEGS:
            if bn in b:
                b[bn] = [(t, tuple(x * s for x in r)) for t, r in b[bn]]
    return clips
