"""Mother Kelp (wreckwitch): Tripo body skinned by hand (sailcloth dress on the hips, kelp hair on the head and
chest), Tripo anchor flail rigid in hand_R. Clips are reworked for a heavy two-handed anchor: wide flail sweeps
(attack_a/b), an overhead anchor smash (attack_c), the anchor whirl (attack_c reused at speed), the Dredge hurl
(throw), Bilge spit (cast) and Davy's Grip (slam)."""

CFG = {
    "palm_twist": {"L": 60},  # open palm faced out (hand review renders)
    "yaw": -90,
    "height": 2.05,
    "weight": 1.05,
    "tex": 1024,
    "joints": {
        "hip": 0.95,
        "chest": 1.27,
        "neck": 1.5,
        "head_top": 1.98,
        "head_y": -0.03,
        "shoulder": (0.24, 1.38),
        "elbow": (0.385, 1.2),
        "wrist": (0.49, 1.06),
        "finger": (0.62, 0.93),
        "leg_x": 0.2,
        "knee": 0.56,
        "ankle": 0.12,
    },
    "team_hue": (200, 250),
    "team_box": ((-0.6, -0.6, 0.3), (0.6, 0.6, 1.7)),
    "attach": [("attach_anchor", "wreckwitch_anchor_tripo.glb")],
    "clips": "witch_clips",
}

LEGS = ("thigh_L", "thigh_R", "shin_L", "shin_R")
ARMS = ("arm", "forearm", "hand")
ROBE_KEEP = 0.3
ROBE_TOP = 0.95
ARMPIT = (0.285, 1.2)
SLEEVE_SLOPE = 1.05
ARM_REACH = 0.14
ARM_LOW = 0.68
SHOULDER_BLEND = (0.19, 0.4)
SHOULDER_TOP = 0.26
BODY = (("hips", -9.0), ("spine", 1.08), ("chest", 1.27), ("head", 1.52))
BLEND = 0.06
BOOT_TOP = 0.42
BOOT_REACH = 0.13


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
        s = s * min(1.0, max(0.0, (ARMPIT[1] + SHOULDER_TOP - p.z) / 0.12))
        w = {n: x * (1 - s) for n, x in body_weights(p.z).items()}
        for n, x in arm_weights(p, B, side).items():
            w[n] = w.get(n, 0) + x * s
        return w
    if p.z > ROBE_TOP:
        return body_weights(p.z)
    best = min(LEGS, key=lambda n: seg_dist(p, *B[n]))
    if p.z < BOOT_TOP and seg_dist(p, *B[best]) < BOOT_REACH:
        return {best: 1.0}
    f = ROBE_KEEP * (1 - p.z / ROBE_TOP) + 0.08
    return {best: f, "hips": 1 - f}


def reskin(name, arm):
    """Auto weights glue the dress to the legs and the hair to the arms, so skin the A-pose by hand and redo the arm swing."""
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


ANCHOR_TILT = 122
ANCHOR_LEN = 0.82
ANCHOR_UP = (0.0, -0.35, -1.0)
ANCHOR_SIDE = (1.0, 0.0, 0.0)
ANCHOR_TRIS = 1600
ANCHOR_GRIP_IN = 0.16


def attach_anchor(name, arm, src_path):
    reskin(name, arm)
    w = th.import_prop(name + "_anchor", src_path, tex=512)
    n = sum(len(p.vertices) - 2 for p in w.data.polygons)
    if n > ANCHOR_TRIS:
        d = w.modifiers.new("dec", "DECIMATE")
        d.ratio = ANCHOR_TRIS / n
        bpy.context.view_layer.objects.active = w
        bpy.ops.object.modifier_apply(modifier=d.name)
    w.data.transform(Matrix.Rotation(math.radians(ANCHOR_TILT), 4, "Y"))
    co = [v.co for v in w.data.vertices]
    top = max(c.x for c in co)
    near = [c for c in co if c.x > top - ANCHOR_GRIP_IN - 0.05 and c.x < top - ANCHOR_GRIP_IN + 0.05]
    grip = Vector((top - ANCHOR_GRIP_IN, sum(c.y for c in near) / len(near), sum(c.z for c in near) / len(near)))
    th.place_on_bone(w, arm, "hand_R", grip, ANCHOR_UP, ANCHOR_LEN, at=0.55, side=ANCHOR_SIDE)
    w.name = name + "_anchor"
    return w


LEG_SCALE = {"run": 0.6, "attack_a": 0.7, "attack_b": 0.7, "attack_c": 0.7, "slam": 0.55, "cast": 0.7, "block": 0.7, "dodge": 0.45, "death": 0.45, "hit": 0.7, "throw": 0.7}


def flail_sweep(d):
    """Wide horizontal anchor sweep with both hands on the chain, d=1 forehand (right to left), d=-1 backhand."""
    out = 100 if d > 0 else -70
    end = -70 if d > 0 else 80
    return {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (3, (-60, 0, out)), (5, (-75, 0, out + 6 * d)), (7, (-85, 0, (out + end) / 2)), (8, (-82, 0, end)), (11, (-55, 0, end * 0.6)), (15, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (3, (-30 if d > 0 else -75, 0, 0)), (7, (-6, 0, 0)), (9, (-10, 0, 0)), (15, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (3, (15, 0, 0)), (7, (-15, 0, 0)), (15, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (3, (-40, 0, -45 if d > 0 else -15)), (7, (-30, 0, -50)), (15, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (3, (-60, 0, 0)), (15, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (3, (8, -45 * d, 0)), (5, (8, -50 * d, 0)), (7, (16, 40 * d, 0)), (8, (16, 50 * d, 0)), (15, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (3, (0, -14 * d, 0)), (7, (0, 16 * d, 0)), (15, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (3, (0, 32 * d, 0)), (7, (0, -28 * d, 0)), (15, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (3, (-15, 0, 4)), (7, (20, 0, 4)), (15, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (7, (-30, 0, -4)), (15, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (7, (30, 0, 0)), (15, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (3, (0, 0.02, 0.03)), (7, (0, -0.08, -0.08)), (9, (0, -0.08, -0.08)), (15, (0, 0, 0))]},
    }


def witch_clips(clips):
    clips["attack_a"] = flail_sweep(1)
    clips["attack_b"] = flail_sweep(-1)
    clips["attack_c"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (2, (-80, 0, 70)), (4, (-170, 0, 40)), (6, (-185, 0, 10)), (8, (-50, 0, 4)), (9, (-35, 0, 2)), (13, (-40, 0, 4)), (18, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (4, (-40, 0, 0)), (6, (-60, 0, 0)), (8, (-5, 0, 0)), (13, (-10, 0, 0)), (18, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (6, (40, 0, 0)), (8, (-30, 0, 0)), (13, (-30, 0, 0)), (18, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (4, (-150, 0, -20)), (6, (-160, 0, -10)), (8, (-45, 0, -10)), (13, (-30, 0, -20)), (18, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (4, (-50, 0, 0)), (8, (-15, 0, 0)), (18, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (2, (-6, 25, 0)), (4, (-16, 15, 0)), (6, (-22, 10, 0)), (8, (34, -6, 0)), (9, (38, -6, 0)), (13, (32, -4, 0)), (18, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (6, (-16, 0, 0)), (8, (14, 0, 0)), (18, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (6, (-15, 0, 5)), (8, (25, 0, 5)), (18, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (6, (-20, 0, -5)), (8, (-45, 0, -5)), (18, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (6, (20, 0, 0)), (8, (50, 0, 0)), (18, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (4, (0, -0.04, 0)), (6, (0, 0.12, 0.06)), (8, (0, -0.2, -0.14)), (10, (0, -0.21, -0.15)), (18, (0, 0, 0))]},
    }
    # Anchor whirl: the anchor held out at arm's length while the whole body spins (one full turn, loops cleanly).
    clips["whirl"] = {
        "bones": {
            "arm_R": [(0, (-80, 0, 85)), (12, (-80, 0, 85))],
            "forearm_R": [(0, (-5, 0, 0)), (12, (-5, 0, 0))],
            "hand_R": [(0, (-60, 0, 0)), (12, (-60, 0, 0))],
            "arm_L": [(0, (-20, 0, -60)), (12, (-20, 0, -60))],
            "forearm_L": [(0, (-40, 0, 0)), (12, (-40, 0, 0))],
            "hips": [(0, (0, 0, 0)), (3, (0, 90, 0)), (6, (0, 180, 0)), (9, (0, 270, 0)), (12, (0, 360, 0))],
            "spine": [(0, (10, 0, -6)), (12, (10, 0, -6))],
            "head": [(0, (-6, 0, 6)), (12, (-6, 0, 6))],
            "thigh_R": [(0, (-20, 0, 8)), (6, (-5, 0, 8)), (12, (-20, 0, 8))],
            "thigh_L": [(0, (-5, 0, -8)), (6, (-20, 0, -8)), (12, (-5, 0, -8))],
            "shin_R": [(0, (30, 0, 0)), (6, (10, 0, 0)), (12, (30, 0, 0))],
            "shin_L": [(0, (10, 0, 0)), (6, (30, 0, 0)), (12, (10, 0, 0))],
        },
        "loc": {"hips": [(0, (0, -0.08, 0)), (6, (0, -0.05, 0)), (12, (0, -0.08, 0))]},
    }
    # Dredge: wind the anchor back over the right shoulder and hurl it forward on its chain, arm left extended.
    clips["throw"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (3, (-110, 0, 60)), (6, (-160, 0, 40)), (7, (-162, 0, 38)), (9, (-75, 0, 10)), (11, (-80, 0, 8)), (16, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (3, (-70, 0, 0)), (6, (-110, 0, 0)), (7, (-112, 0, 0)), (9, (-5, 0, 0)), (11, (-8, 0, 0)), (16, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (6, (-40, 0, 0)), (9, (20, 0, 0)), (16, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (6, (-50, 0, -40)), (9, (-80, 0, -20)), (12, (-70, 0, -15)), (16, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (6, (-50, 0, 0)), (9, (-20, 0, 0)), (16, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (3, (-6, 25, 0)), (6, (-16, 40, 0)), (7, (-17, 42, 0)), (9, (26, -30, 0)), (11, (28, -34, 0)), (16, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (6, (-6, 10, 0)), (9, (8, -12, 0)), (16, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (6, (8, -26, 0)), (9, (-10, 24, 0)), (16, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (6, (-10, 0, 6)), (9, (-40, 0, 6)), (11, (-42, 0, 6)), (16, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (9, (35, 0, 0)), (11, (36, 0, 0)), (16, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (6, (-20, 0, -4)), (9, (22, 0, -4)), (16, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (6, (25, 0, 0)), (9, (10, 0, 0)), (16, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (6, (0, 0.03, 0.06)), (9, (0, -0.09, -0.1)), (11, (0, -0.1, -0.11)), (16, (0, 0, 0))]},
    }
    # Bilge: rear back, then lurch forward and spit, the free hand clawing at the air.
    clips["cast"] = {
        "bones": {
            "spine": [(0, (0, 0, 0)), (4, (-18, 0, 0)), (7, (-22, 0, 0)), (9, (30, 0, 0)), (13, (28, 0, 0)), (18, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (4, (-10, 0, 0)), (9, (12, 0, 0)), (18, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (4, (-25, 0, 0)), (7, (-30, 0, 0)), (9, (-10, 0, 0)), (13, (-12, 0, 0)), (18, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (4, (-40, 0, -50)), (9, (-95, 0, -20)), (13, (-90, 0, -22)), (18, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (4, (-70, 0, 0)), (9, (-15, 0, 0)), (18, (-14, 0, 0))],
            "hand_L": [(0, (0, 0, 0)), (9, (-30, 0, 0)), (18, (0, 0, 0))],
            "arm_R": [(0, (0, 0, 6)), (4, (10, 0, 30)), (9, (-20, 0, 25)), (18, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (9, (-40, 0, 0)), (18, (-22, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (4, (10, 0, 6)), (9, (-30, 0, 6)), (18, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (9, (30, 0, 0)), (18, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (9, (15, 0, -6)), (18, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (4, (0, -0.02, 0.05)), (9, (0, -0.08, -0.1)), (13, (0, -0.08, -0.1)), (18, (0, 0, 0))]},
    }
    # Davy's Grip: both arms up, then she drives the anchor and her claw down into the ground.
    clips["slam"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (5, (-150, 0, 40)), (10, (-170, 0, 30)), (13, (-40, 0, 14)), (17, (-38, 0, 14)), (22, (0, 0, 6))],
            "arm_L": [(0, (0, 0, -6)), (5, (-150, 0, -40)), (10, (-170, 0, -30)), (13, (-45, 0, -20)), (17, (-42, 0, -20)), (22, (0, 0, -6))],
            "forearm_R": [(0, (-22, 0, 0)), (5, (-40, 0, 0)), (10, (-50, 0, 0)), (13, (-10, 0, 0)), (22, (-22, 0, 0))],
            "forearm_L": [(0, (-14, 0, 0)), (5, (-40, 0, 0)), (10, (-50, 0, 0)), (13, (-10, 0, 0)), (22, (-14, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (10, (30, 0, 0)), (13, (-35, 0, 0)), (22, (0, 0, 0))],
            "hand_L": [(0, (0, 0, 0)), (10, (20, 0, 0)), (13, (-50, 0, 0)), (22, (0, 0, 0))],
            "spine": [(0, (0, 0, 0)), (5, (-10, 0, 0)), (10, (-20, 0, 0)), (13, (38, 0, 0)), (17, (34, 0, 0)), (22, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (10, (-25, 0, 0)), (13, (10, 0, 0)), (22, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (4, (-30, 0, 10)), (10, (-15, 0, 10)), (13, (-50, 0, 12)), (17, (-50, 0, 12)), (22, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (4, (-30, 0, -10)), (10, (-15, 0, -10)), (13, (-50, 0, -12)), (17, (-50, 0, -12)), (22, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (4, (55, 0, 0)), (10, (25, 0, 0)), (13, (80, 0, 0)), (17, (80, 0, 0)), (22, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (4, (55, 0, 0)), (10, (25, 0, 0)), (13, (80, 0, 0)), (17, (80, 0, 0)), (22, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (4, (0, -0.1, 0)), (9, (0, 0.18, 0)), (10, (0, 0.2, 0)), (13, (0, -0.22, -0.08)), (17, (0, -0.22, -0.08)), (22, (0, 0, 0))]},
    }
    # Chain swing (L+X): crouch, swing round on the hooked chain with the anchor arm raised, land.
    clips["swing"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (2, (-160, 0, 30)), (10, (-165, 0, 25)), (13, (-30, 0, 10)), (15, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (2, (-20, 0, 0)), (10, (-20, 0, 0)), (15, (-22, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (2, (-30, 0, -60)), (10, (-30, 0, -70)), (15, (0, 0, -6))],
            "spine": [(0, (0, 0, 0)), (2, (10, 0, 20)), (10, (10, 0, 25)), (15, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (2, (-60, 0, 10)), (10, (-50, 0, 10)), (13, (-20, 0, 0)), (15, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (2, (-30, 0, -10)), (10, (-70, 0, -10)), (13, (-20, 0, 0)), (15, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (2, (80, 0, 0)), (10, (70, 0, 0)), (15, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (2, (50, 0, 0)), (10, (90, 0, 0)), (15, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (2, (0, -0.1, 0)), (6, (0, 0.15, 0)), (10, (0, 0.05, 0)), (13, (0, -0.12, 0)), (15, (0, 0, 0))]},
    }
    # Victory: she plants the anchor and cackles, shoulders shaking.
    clips["victory"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (6, (-40, 0, 20)), (24, (-40, 0, 20))],
            "forearm_R": [(0, (-22, 0, 0)), (6, (-60, 0, 0)), (24, (-60, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (6, (-160, 0, -30)), (10, (-150, 0, -35)), (14, (-160, 0, -30)), (18, (-150, 0, -35)), (24, (-160, 0, -30))],
            "forearm_L": [(0, (-14, 0, 0)), (6, (-30, 0, 0)), (24, (-30, 0, 0))],
            "spine": [(0, (0, 0, 0)), (6, (-14, 0, 0)), (8, (-8, 0, 0)), (10, (-14, 0, 0)), (12, (-8, 0, 0)), (14, (-14, 0, 0)), (24, (-12, 0, 0))],
            "head": [(0, (0, 0, 0)), (6, (-30, 0, 0)), (9, (-22, 0, 4)), (12, (-30, 0, -4)), (15, (-22, 0, 4)), (24, (-28, 0, 0))],
        },
    }
    for name, s in LEG_SCALE.items():
        if name not in clips:
            continue
        b = clips[name]["bones"]
        for bn in LEGS:
            if bn in b:
                b[bn] = [(t, tuple(x * s for x in r)) for t, r in b[bn]]
    return clips
