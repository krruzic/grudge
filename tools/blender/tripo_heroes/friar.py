"""Brother Maddock (friar): Tripo body skinned by hand (robe on the hips), Tripo tankard in hand_R, the thrown ale keg (assets/props/keg.glb, shares its costume texture) slung on his back."""

CFG = {
    "palm_twist": {"L": 70},  # open palm faced out (hand review renders)
    "yaw": -90,
    "height": 1.95,
    "weight": 1.1,
    "tex": 1024,
    "joints": {
        "hip": 0.94,
        "chest": 1.25,
        "neck": 1.52,
        "head_top": 1.95,
        "head_y": -0.02,
        "shoulder": (0.3, 1.4),
        "elbow": (0.43, 1.13),
        "wrist": (0.54, 0.92),
        "finger": (0.64, 0.74),
        "leg_x": 0.22,
        "knee": 0.5,
        "ankle": 0.1,
    },
    "team_hue": (200, 250),
    "team_box": ((-0.45, -0.6, 0.3), (0.45, 0.6, 1.62)),
    "attach": [("attach_tankard", "friar_tankard_tripo.glb"), ("attach_keg", "../props/keg.glb")],
    "clips": "friar_clips",
}

LEGS = ("thigh_L", "thigh_R", "shin_L", "shin_R")
ARMS = ("arm", "forearm", "hand")
ROBE_KEEP = 0.3
ROBE_TOP = 0.95
ARMPIT = (0.345, 1.08)
SLEEVE_SLOPE = 0.35
ARM_REACH = 0.13
ARM_LOW = 0.64
SHOULDER_BLEND = (0.16, 0.44)
BODY = (("hips", -9.0), ("spine", 1.05), ("chest", 1.25), ("head", 1.55))
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


def skin(p, B):
    ax = abs(p.x)
    side = "L" if p.x > 0 else "R"
    xb = ARMPIT[0] + max(0.0, ARMPIT[1] - p.z) * SLEEVE_SLOPE
    if p.z < ARMPIT[1] and p.z > ARM_LOW and ax < xb and ax > xb - 0.08 and p.z > ARMPIT[1] - 0.12:
        s = (ax - xb + 0.08) / 0.08 * (p.z - ARMPIT[1] + 0.12) / 0.12
        w = {n: x * (1 - s) for n, x in body_weights(p.z).items()}
        for n, x in arm_weights(p, B, side).items():
            w[n] = w.get(n, 0) + x * s
        return w
    if p.z < ARMPIT[1] and p.z > ARM_LOW and (ax > xb or min(seg_dist(p, *B[f"{b}_{side}"]) for b in ("forearm", "hand")) < ARM_REACH):
        return arm_weights(p, B, side)
    a, b = SHOULDER_BLEND
    if p.z >= ARMPIT[1] and ax > a:
        s = min(1.0, (ax - a) / (b - a))
        s = s * s * (3 - 2 * s)
        s = s * min(1.0, max(0.0, (ARMPIT[1] + 0.48 - p.z) / 0.24))
        w = {n: x * (1 - s) for n, x in body_weights(p.z).items()}
        for n, x in arm_weights(p, B, side).items():
            w[n] = w.get(n, 0) + x * s
        return w
    if p.z > ROBE_TOP:
        return body_weights(p.z)
    best = min(LEGS, key=lambda n: seg_dist(p, *B[n]))
    if p.z < 0.2 and seg_dist(p, *B[best]) < 0.13:
        return {best: 1.0}
    f = ROBE_KEEP * (1 - p.z / ROBE_TOP) + 0.08
    return {best: f, "hips": 1 - f}


def reskin(name, arm):
    """Auto weights glue the robe to the legs and the belly to the sleeves, so skin the A-pose by hand and redo the arm swing."""
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


def friar_decimate(w, tris):
    n = sum(len(p.vertices) - 2 for p in w.data.polygons)
    if n <= tris:
        return
    d = w.modifiers.new("dec", "DECIMATE")
    d.ratio = tris / n
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=d.name)


TANKARD_GRIP = (0.0, 0.39, 0.0)
TANKARD_LEN = 0.56
TANKARD_UP = (0.0, -0.25, 1.0)
TANKARD_SIDE = (0.15, -1.0, 0.0)
TANKARD_TRIS = 1500


def attach_tankard(name, arm, src_path):
    reskin(name, arm)
    w = th.import_prop(name + "_tankard", src_path, tex=512)
    friar_decimate(w, TANKARD_TRIS)
    w.data.transform(Matrix(((0, 0, -1, 0), (0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1))) @ Matrix.Translation(-Vector(TANKARD_GRIP)))
    th.place_on_bone(w, arm, "hand_R", (0, 0, 0), TANKARD_UP, TANKARD_LEN, at=0.5, side=TANKARD_SIDE)
    w.name = name + "_tankard"
    return w


KEG_AT = (0.0, 0.5, 1.12)
KEG_SCALE = 0.85
KEG_TILT = 22


def attach_keg(name, arm, src_path):
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
    w.data.transform(Matrix.Translation(Vector(KEG_AT)) @ Matrix.Rotation(math.radians(KEG_TILT), 4, "Y") @ Matrix.Rotation(math.radians(90), 4, "Z") @ Matrix.Scale(KEG_SCALE, 4) @ Matrix.Translation(-mid))
    vg = w.vertex_groups.new(name="chest")
    vg.add(list(range(len(w.data.vertices))), 1.0, "REPLACE")
    w.parent = arm
    m = w.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    w.name = name + "_keg"
    return w


LEG_SCALE = {"run": 0.6, "attack_a": 0.7, "attack_b": 0.7, "attack_c": 0.7, "slam": 0.55, "cast": 0.7, "block": 0.7, "dodge": 0.45, "death": 0.45, "hit": 0.7, "throw": 0.7}


def friar_sweep(d):
    """Horizontal tankard sweep, d=1 forehand (right to left), d=-1 backhand (left to right)."""
    out = 95 if d > 0 else -65
    end = -60 if d > 0 else 72
    return {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (3, (-70, 0, out)), (4, (-78, 0, out + 4 * d)), (6, (-88, 0, (out + end) / 2)), (7, (-85, 0, end)), (10, (-60, 0, end * 0.6)), (14, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (3, (-35 if d > 0 else -80, 0, 0)), (6, (-8, 0, 0)), (8, (-10, 0, 0)), (14, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (3, (10, 0, 0)), (6, (-10, 0, 0)), (14, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (3, (-30, 0, -50 if d > 0 else -20)), (6, (10, 0, -35)), (14, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (3, (-50, 0, 0)), (14, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (3, (6, -40 * d, 0)), (6, (14, 38 * d, 0)), (7, (14, 46 * d, 0)), (14, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (3, (0, -12 * d, 0)), (6, (0, 14 * d, 0)), (14, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (3, (0, 30 * d, 0)), (6, (0, -26 * d, 0)), (14, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (3, (-15, 0, 4)), (6, (20, 0, 4)), (14, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (6, (-30, 0, -4)), (14, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (6, (30, 0, 0)), (14, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (3, (0, 0.02, 0.03)), (6, (0, -0.07, -0.08)), (8, (0, -0.07, -0.08)), (14, (0, 0, 0))]},
    }


def friar_clips(clips):
    clips["attack_a"] = friar_sweep(1)
    clips["attack_b"] = friar_sweep(-1)
    clips["attack_c"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (4, (-130, 0, 20)), (6, (-145, 0, 16)), (8, (-45, 0, 4)), (9, (-30, 0, 2)), (13, (-38, 0, 4)), (18, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (4, (-70, 0, 0)), (6, (-80, 0, 0)), (8, (-5, 0, 0)), (13, (-10, 0, 0)), (18, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (6, (30, 0, 0)), (8, (-25, 0, 0)), (13, (-25, 0, 0)), (18, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (4, (-60, 0, -40)), (6, (-50, 0, -50)), (8, (20, 0, -35)), (13, (10, 0, -30)), (18, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (4, (-60, 0, 0)), (8, (-20, 0, 0)), (18, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (4, (-14, 10, 0)), (6, (-20, 12, 0)), (8, (32, -6, 0)), (9, (36, -6, 0)), (13, (30, -4, 0)), (18, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (6, (-14, 0, 0)), (8, (12, 0, 0)), (18, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (6, (-15, 0, 5)), (8, (25, 0, 5)), (18, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (6, (-20, 0, -5)), (8, (-45, 0, -5)), (18, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (6, (20, 0, 0)), (8, (50, 0, 0)), (18, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (4, (0, -0.04, 0)), (6, (0, 0.14, 0.06)), (8, (0, -0.2, -0.14)), (10, (0, -0.21, -0.15)), (18, (0, 0, 0))]},
    }
    clips["slam"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (5, (-110, 0, 30)), (10, (-135, 0, 28)), (13, (-55, 0, 22)), (16, (-50, 0, 20)), (22, (0, 0, 6))],
            "arm_L": [(0, (0, 0, -6)), (5, (-110, 0, -30)), (10, (-135, 0, -28)), (13, (-55, 0, -22)), (16, (-50, 0, -20)), (22, (0, 0, -6))],
            "forearm_R": [(0, (-22, 0, 0)), (5, (-70, 0, 0)), (10, (-75, 0, 0)), (13, (-20, 0, 0)), (22, (-22, 0, 0))],
            "forearm_L": [(0, (-14, 0, 0)), (5, (-70, 0, 0)), (10, (-75, 0, 0)), (13, (-20, 0, 0)), (22, (-14, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (10, (20, 0, 0)), (13, (-20, 0, 0)), (22, (0, 0, 0))],
            "spine": [(0, (0, 0, 0)), (5, (-8, 0, 0)), (10, (-16, 0, 0)), (13, (34, 0, 0)), (16, (30, 0, 0)), (22, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (10, (-16, 0, 0)), (13, (14, 0, 0)), (22, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (4, (-30, 0, 10)), (10, (-15, 0, 10)), (13, (-50, 0, 12)), (16, (-50, 0, 12)), (22, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (4, (-30, 0, -10)), (10, (-15, 0, -10)), (13, (-50, 0, -12)), (16, (-50, 0, -12)), (22, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (4, (55, 0, 0)), (10, (25, 0, 0)), (13, (80, 0, 0)), (16, (80, 0, 0)), (22, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (4, (55, 0, 0)), (10, (25, 0, 0)), (13, (80, 0, 0)), (16, (80, 0, 0)), (22, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (4, (0, -0.1, 0)), (9, (0, 0.2, 0)), (10, (0, 0.22, 0)), (13, (0, -0.2, -0.08)), (16, (0, -0.2, -0.08)), (22, (0, 0, 0))]},
    }
    clips["throw"] = {
        "bones": {
            "arm_L": [(0, (0, 0, -6)), (3, (-100, 0, -50)), (6, (-150, 0, -35)), (7, (-152, 0, -32)), (9, (-70, 0, -8)), (11, (-30, 0, 18)), (16, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (3, (-70, 0, 0)), (6, (-120, 0, 0)), (7, (-122, 0, 0)), (9, (-5, 0, 0)), (11, (-15, 0, 0)), (16, (-14, 0, 0))],
            "hand_L": [(0, (0, 0, 0)), (6, (-40, 0, 0)), (9, (30, 0, 0)), (16, (0, 0, 0))],
            "arm_R": [(0, (0, 0, 6)), (6, (-45, 0, 40)), (9, (10, 0, 30)), (12, (0, 0, 15)), (16, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (6, (-50, 0, 0)), (9, (-30, 0, 0)), (16, (-22, 0, 0))],
            "spine": [(0, (0, 0, 0)), (3, (-6, 20, 0)), (6, (-16, 38, 0)), (7, (-17, 40, 0)), (9, (24, -30, 0)), (11, (28, -36, 0)), (16, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (6, (-6, 10, 0)), (9, (8, -12, 0)), (16, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (6, (8, -26, 0)), (9, (-10, 24, 0)), (16, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (6, (-10, 0, 6)), (9, (-40, 0, 6)), (11, (-42, 0, 6)), (16, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (9, (35, 0, 0)), (11, (36, 0, 0)), (16, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (6, (-20, 0, -4)), (9, (22, 0, -4)), (16, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (6, (25, 0, 0)), (9, (10, 0, 0)), (16, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (6, (0, 0.03, 0.06)), (9, (0, -0.09, -0.1)), (11, (0, -0.1, -0.11)), (16, (0, 0, 0))]},
    }
    clips["cast"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (4, (-80, 0, 30)), (8, (-140, 0, 24)), (13, (-140, 0, 24)), (18, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (4, (-70, 0, 0)), (8, (-25, 0, 0)), (13, (-25, 0, 0)), (18, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (8, (0, 0, 0)), (10, (0, 0, -55)), (13, (0, 0, -60)), (15, (0, 0, 0)), (18, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (4, (-40, 0, -40)), (8, (-70, 0, -70)), (13, (-75, 0, -72)), (18, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (8, (-20, 0, 0)), (18, (-14, 0, 0))],
            "hand_L": [(0, (0, 0, 0)), (8, (0, -60, 0)), (13, (0, -60, 0)), (18, (0, 0, 0))],
            "spine": [(0, (0, 0, 0)), (4, (10, 0, 0)), (8, (-14, 0, 0)), (13, (-12, 0, 0)), (18, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (4, (10, 0, 0)), (8, (-24, 0, 0)), (13, (-22, 0, 4)), (18, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (4, (-20, 0, 6)), (8, (0, 0, 6)), (18, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (4, (-20, 0, -6)), (8, (0, 0, -6)), (18, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (4, (35, 0, 0)), (8, (0, 0, 0)), (18, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (4, (35, 0, 0)), (8, (0, 0, 0)), (18, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (4, (0, -0.08, 0)), (8, (0, 0.06, 0)), (13, (0, 0.05, 0)), (18, (0, 0, 0))]},
    }
    for name, s in LEG_SCALE.items():
        if name not in clips:
            continue
        b = clips[name]["bones"]
        for bn in LEGS:
            if bn in b:
                b[bn] = [(t, tuple(x * s for x in r)) for t, r in b[bn]]
    return clips
