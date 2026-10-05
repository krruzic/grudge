"""Bramble & Mead (rider): one Tripo mesh of a badger-folk courier sitting on a giant bumblebee. Skinned by hand: the
bee, saddle and Bramble's legs ride the hips bone (the whole mount bobs, pitches and banks with it), her torso is
banded over hips/spine/chest/head, arms by distance to the arm chain, hands and head pieces rigid. Two extra bones,
wing_L / wing_R (children of hips, pointing back along the bee), carry the wings so every clip can buzz them. The
Tripo honey ladle (split off the props mesh) is bound to hand_R. All clips are authored here for a seated rider."""

CFG = {
    "yaw": -90,
    "height": 1.9,
    "weight": 1.0,
    "tex": 1024,
    "joints": {
        "hip": 1.02,
        "chest": 1.32,
        "neck": 1.54,
        "head_top": 1.9,
        "head_y": 0.05,
        "shoulder": (0.22, 1.47),
        "elbow": (0.42, 1.55),
        "wrist": (0.54, 1.62),
        "finger": (0.68, 1.71),
        "leg_x": 0.2,
        "knee": 0.7,
        "ankle": 0.35,
    },
    "team_hue": (195, 250),
    "attach": [("attach_ladle", "rider_props_tripo.glb")],
    "clips": "rider_clips",
}

ARMS = ("arm", "forearm", "hand")
BODY = (("hips", -9.0), ("spine", 1.15), ("chest", 1.33), ("head", 1.56))
BLEND = 0.06
WING_ROOT = (0.2, 0.22, 1.12)
SWING = {"arm": (0.42, -0.3, -0.85), "forearm": (0.2, -0.75, -0.55), "hand": (0.15, -0.8, -0.45)}


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


def smooth(x, a, b):
    s = min(1.0, max(0.0, (x - a) / (b - a)))
    return s * s * (3 - 2 * s)


def torso_skin(p, B):
    side = "L" if p.x > 0 else "R"
    s = smooth(abs(p.x), 0.15, 0.27) * smooth(p.z, 1.28, 1.38)
    w = {n: x * (1 - s) for n, x in body_weights(p.z).items()}
    if s > 0:
        for n, x in arm_weights(p, B, side).items():
            w[n] = w.get(n, 0) + x * s
    return w


def islands(me):
    par = list(range(len(me.vertices)))

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x
    for e in me.edges:
        par[find(e.vertices[0])] = find(e.vertices[1])
    at = {}
    for v in me.vertices:
        k = tuple(round(c, 4) for c in v.co)
        if k in at:
            par[find(v.index)] = find(at[k])
        else:
            at[k] = v.index
    out = {}
    for v in me.vertices:
        out.setdefault(find(v.index), []).append(v.index)
    return list(out.values())


def classify(me):
    """Per island: 'torso' (the biggest rider piece, arms included), 'hand_L/R', 'wing_L/R', 'band' (rider pieces
    weighted by height) or 'hips' (bee, saddle, legs)."""
    out = []
    isl = islands(me)
    torso = max((i for i in isl if np.mean([me.vertices[k].co.z for k in i]) > 1.1), key=len)
    for i in isl:
        co = np.array([me.vertices[k].co[:] for k in i])
        c = co.mean(0)
        lo = co.min(0)
        if i is torso:
            kind = "torso"
        elif abs(c[0]) > 0.4 and c[1] > 0.25 and c[2] > 1.1:
            kind = "wing_L" if c[0] > 0 else "wing_R"
        elif abs(c[0]) > 0.45 and c[2] > 1.45 and c[1] < 0.2:
            kind = "hand_L" if c[0] > 0 else "hand_R"
        elif lo[2] > 1.1 and abs(c[0]) < 0.32 and -0.2 < c[1] < 0.4:
            kind = "band"
        else:
            kind = "hips"
        out.append((kind, i))
    return out


def add_wing_bones(arm):
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for side, sx in (("L", 1), ("R", -1)):
        eb = arm.data.edit_bones.new("wing_" + side)
        eb.head = Vector((WING_ROOT[0] * sx, WING_ROOT[1], WING_ROOT[2]))
        eb.tail = eb.head + Vector((0, 0.18, 0))
        eb.roll = 0.0
        eb.parent = arm.data.edit_bones["hips"]
        eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for side in ("L", "R"):
        arm.pose.bones["wing_" + side].rotation_mode = "XYZ"


def swing_arms(src, arm):
    """Like th.swing_arms_down, but the rest pose holds the arms down, out and forward (reins / ladle ready), so the
    seated clips start much closer to the bind A-pose."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for side, sx in (("R", -1), ("L", 1)):
        for b in ARMS:
            pb = arm.pose.bones[f"{b}_{side}"]
            tx, ty, tz = SWING[b]
            target = Vector((tx * sx, ty, tz))
            bpy.context.view_layer.update()
            cur = (pb.tail - pb.head).normalized()
            q = cur.rotation_difference(target.normalized())
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
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"


def reskin(name, arm):
    """Replace the heat weights: rebuild the A-pose, skin it by island, swing the arms, rebind to the real rig."""
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
    kinds = classify(me)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    B = {n: (Vector(h), Vector(t)) for n, (h, t, _) in bones.items()}
    tmp = th.make_armature(name + "_apose", bones)
    for v, c in zip(src.data.vertices, A):
        v.co = c
    for g in list(src.vertex_groups):
        src.vertex_groups.remove(g)
    for n in list(bones) + ["wing_L", "wing_R"]:
        src.vertex_groups.new(name=n)
    for kind, idx in kinds:
        for i in idx:
            p = src.data.vertices[i].co
            if kind == "torso":
                w = torso_skin(p, B)
            elif kind == "band":
                w = body_weights(p.z)
            else:
                w = {kind: 1.0}
            for n, x in w.items():
                if x > 1e-3:
                    src.vertex_groups[n].add([i], x, "ADD")
    src.parent = None
    for m in src.modifiers:
        if m.type == "ARMATURE":
            m.object = tmp
    swing_arms(src, tmp)
    m = src.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    src.parent = arm
    bpy.data.objects.remove(tmp, do_unlink=True)
    # The real rig got th.swing_arms_down; redo its arms the same way as tmp's so bones and mesh agree.
    restore_arm_rest(arm, bones)
    add_wing_bones(arm)


def restore_arm_rest(arm, bones):
    """Point the rig's arm bones the SWING way (the builder already swung them straight down)."""
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for side, sx in (("R", -1), ("L", 1)):
        head = eb[f"arm_{side}"].head.copy()
        for b in ARMS:
            e = eb[f"{b}_{side}"]
            ln = (Vector(bones[f"{b}_{side}"][1]) - Vector(bones[f"{b}_{side}"][0])).length
            tx, ty, tz = SWING[b]
            d = Vector((tx * sx, ty, tz)).normalized()
            e.head = head
            e.tail = head + d * ln
            e.roll = 0.0
            head = e.tail.copy()
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"


def keep_side(obj, axis, sign):
    import bmesh
    t = np.array([v.co[axis] for v in obj.data.vertices])
    hist, edges = np.histogram(t, 200)
    best, run, at = 0, 0, 0.0
    for i in range(40, 160):
        run = run + 1 if hist[i] == 0 else 0
        if run > best:
            best, at = run, (edges[i - run + 1] + edges[i + 1]) / 2
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f.calc_center_median()[axis] - at) * sign <= 0], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


LADLE_LEN = 0.85
LADLE_GRIP = 0.16
LADLE_AXIS = (-0.05, -0.85, 0.5)
LADLE_OPEN = (0.0, 0.5, 0.85)
LADLE_TRIS = 1600


def attach_ladle(name, arm, src_path):
    reskin(name, arm)
    w = th.import_prop(name + "_ladle", src_path, tex=512)
    keep_side(w, 1, -1)
    n = sum(len(p.vertices) - 2 for p in w.data.polygons)
    if n > LADLE_TRIS:
        d = w.modifiers.new("dec", "DECIMATE")
        d.ratio = LADLE_TRIS / n
        bpy.context.view_layer.objects.active = w
        bpy.ops.object.modifier_apply(modifier=d.name)
    co = np.array([v.co[:] for v in w.data.vertices])
    c = co.mean(0)
    u, s, vt = np.linalg.svd(co - c, full_matrices=False)
    ax = vt[0]
    t = (co - c) @ ax
    # The bowl end is the fat end: more spread perpendicular to the axis.
    perp = np.linalg.norm((co - c) - np.outer(t, ax), axis=1)
    if perp[t > 0].mean() < perp[t < 0].mean():
        ax = -ax
        t = -t
    knob = c + ax * t.min()
    length = t.max() - t.min()
    grip = knob + ax * length * LADLE_GRIP
    e1 = Vector(ax.tolist())
    up = Vector((0, 0, 1))
    e2 = (up - e1 * up.dot(e1)).normalized()
    e3 = e1.cross(e2)
    # Source frame -> (long axis = -X, opening = -Y) as place_on_bone expects.
    R = Matrix((-e1, -e2, e3)).to_4x4()
    w.data.transform(R @ Matrix.Translation(-Vector(grip.tolist())))
    w.data.transform(Matrix.Scale(1.0 / length, 4))
    th.place_on_bone(w, arm, "hand_R", (0, 0, 0), LADLE_AXIS, LADLE_LEN, at=0.45, side=LADLE_OPEN)
    w.name = name + "_ladle"
    return w


# ---------------------------------------------------------------------------------------------------------------
# Clips (24 fps). Rest: arms down, out and forward; the clips hold them up. Wings buzz in every clip.
# ---------------------------------------------------------------------------------------------------------------

HOLD = {
    "arm_R": (-30, 0, 4),
    "forearm_R": (-40, 0, 0),
    "hand_R": (30, 0, 0),
    "arm_L": (-25, 0, -4),
    "forearm_L": (-35, 0, 0),
    "hand_L": (0, 0, 0),
    "spine": (4, 0, 0),
    "chest": (0, 0, 0),
    "head": (-4, 0, 0),
}
HOVER = 0.14


def buzz(n, amp=28, base=0, step=1):
    """Wing keys every `step` frames over n frames (alternating up/down)."""
    L, R = [], []
    for f in range(0, n + 1, step):
        a = base + (amp if (f // step) % 2 == 0 else -amp)
        L.append((f, (0, -a, 0)))
        R.append((f, (0, a, 0)))
    return {"wing_L": L, "wing_R": R}


def clip(n, keys, hips=None, hrot=None, amp=28, base=0, step=1):
    """keys: {bone: [(frame, rot)]}; bones in HOLD default to their hold pose at 0 and n."""
    bones = {}
    for b, r in HOLD.items():
        bones[b] = keys.get(b, [(0, r), (n, r)])
    for b, k in keys.items():
        if b not in bones:
            bones[b] = k
    bones.update(buzz(n, amp, base, step))
    if hrot:
        bones["hips"] = hrot
    out = {"bones": bones, "loc": {"hips": hips or [(0, (0, HOVER, 0)), (n, (0, HOVER, 0))]}}
    return out


def H(*r):
    return HOLD[r[0]] if len(r) == 1 else r


def rider_sweep(d):
    """A ladle whack from the saddle, d=1 forehand (right to left), d=-1 backhand."""
    out = 100 if d > 0 else -55
    end = -55 if d > 0 else 80
    return clip(14, {
        "arm_R": [(0, H("arm_R")), (3, (-75, 0, out)), (4, (-82, 0, out + 4 * d)), (6, (-90, 0, (out + end) / 2)), (7, (-86, 0, end)), (10, (-60, 0, end * 0.6)), (14, H("arm_R"))],
        "forearm_R": [(0, H("forearm_R")), (3, (-40 if d > 0 else -85, 0, 0)), (6, (-8, 0, 0)), (8, (-12, 0, 0)), (14, H("forearm_R"))],
        "hand_R": [(0, H("hand_R")), (3, (12, 0, 0)), (6, (-12, 0, 0)), (14, H("hand_R"))],
        "arm_L": [(0, H("arm_L")), (3, (-30, 0, -45 if d > 0 else -20)), (6, (0, 0, -35)), (14, H("arm_L"))],
        "spine": [(0, H("spine")), (3, (6, -34 * d, 0)), (6, (14, 32 * d, 0)), (7, (14, 38 * d, 0)), (14, H("spine"))],
        "chest": [(0, (0, 0, 0)), (3, (0, -12 * d, 0)), (6, (0, 14 * d, 0)), (14, (0, 0, 0))],
        "head": [(0, H("head")), (3, (0, 26 * d, 0)), (6, (0, -22 * d, 0)), (14, H("head"))],
    }, hips=[(0, (0, HOVER, 0)), (3, (0, HOVER + 0.04, -0.03)), (6, (0, HOVER - 0.03, 0.12)), (9, (0, HOVER - 0.02, 0.1)), (14, (0, HOVER, 0))],
        hrot=[(0, (0, 0, 0)), (3, (-4, -8 * d, 6 * d)), (6, (6, 10 * d, -8 * d)), (10, (2, 4 * d, -3 * d)), (14, (0, 0, 0))])


def rider_clips(clips):
    c = {}
    c["idle"] = clip(48, {
        "spine": [(0, (4, 0, 0)), (24, (7, 0, 0)), (48, (4, 0, 0))],
        "head": [(0, (-4, 0, 0)), (14, (-2, 14, 3)), (30, (-6, -10, -2)), (48, (-4, 0, 0))],
        "arm_R": [(0, H("arm_R")), (24, (-34, 0, 7)), (48, H("arm_R"))],
        "arm_L": [(0, H("arm_L")), (24, (-29, 0, -7)), (48, H("arm_L"))],
    }, hips=[(0, (0, HOVER, 0)), (12, (0, HOVER + 0.07, 0)), (24, (0, HOVER, 0)), (36, (0, HOVER + 0.07, 0)), (48, (0, HOVER, 0))],
        hrot=[(0, (0, 0, 0)), (12, (-2, 0, 2)), (24, (0, 0, 0)), (36, (-2, 0, -2)), (48, (0, 0, 0))], amp=30)
    c["run"] = clip(16, {
        "spine": [(0, (14, 0, 0)), (8, (17, 0, 0)), (16, (14, 0, 0))],
        "head": [(0, (-14, 0, 0)), (8, (-12, 0, 0)), (16, (-14, 0, 0))],
        "arm_R": [(0, (-40, 0, 8)), (8, (-46, 0, 8)), (16, (-40, 0, 8))],
        "arm_L": [(0, (-46, 0, -8)), (8, (-40, 0, -8)), (16, (-46, 0, -8))],
        "forearm_R": [(0, (-50, 0, 0)), (16, (-50, 0, 0))],
        "forearm_L": [(0, (-50, 0, 0)), (16, (-50, 0, 0))],
    }, hips=[(0, (0, HOVER + 0.12, 0)), (4, (0, HOVER + 0.17, 0)), (8, (0, HOVER + 0.12, 0)), (12, (0, HOVER + 0.17, 0)), (16, (0, HOVER + 0.12, 0))],
        hrot=[(0, (10, 0, 2)), (8, (12, 0, -2)), (16, (10, 0, 2))], amp=34)
    c["attack_a"] = rider_sweep(1)
    c["attack_b"] = rider_sweep(-1)
    c["attack_c"] = clip(18, {
        "arm_R": [(0, H("arm_R")), (4, (-140, 0, 18)), (6, (-155, 0, 14)), (8, (-55, 0, 4)), (9, (-40, 0, 2)), (13, (-45, 0, 4)), (18, H("arm_R"))],
        "forearm_R": [(0, H("forearm_R")), (4, (-70, 0, 0)), (6, (-80, 0, 0)), (8, (-5, 0, 0)), (13, (-10, 0, 0)), (18, H("forearm_R"))],
        "hand_R": [(0, H("hand_R")), (6, (30, 0, 0)), (8, (-25, 0, 0)), (13, (-20, 0, 0)), (18, H("hand_R"))],
        "arm_L": [(0, H("arm_L")), (4, (-60, 0, -40)), (8, (10, 0, -30)), (18, H("arm_L"))],
        "spine": [(0, H("spine")), (4, (-12, 8, 0)), (6, (-16, 10, 0)), (8, (28, -4, 0)), (9, (30, -4, 0)), (13, (24, -3, 0)), (18, H("spine"))],
        "head": [(0, H("head")), (6, (-14, 0, 0)), (8, (10, 0, 0)), (18, H("head"))],
    }, hips=[(0, (0, HOVER, 0)), (5, (0, HOVER + 0.18, -0.05)), (8, (0, HOVER - 0.06, 0.16)), (11, (0, HOVER - 0.05, 0.14)), (18, (0, HOVER, 0))],
        hrot=[(0, (0, 0, 0)), (5, (-10, 0, 0)), (8, (12, 0, 0)), (12, (8, 0, 0)), (18, (0, 0, 0))])
    c["throw"] = clip(16, {
        "arm_L": [(0, H("arm_L")), (3, (-100, 0, -45)), (6, (-150, 0, -30)), (7, (-152, 0, -28)), (9, (-70, 0, -6)), (11, (-35, 0, 10)), (16, H("arm_L"))],
        "forearm_L": [(0, H("forearm_L")), (3, (-70, 0, 0)), (6, (-115, 0, 0)), (7, (-118, 0, 0)), (9, (-5, 0, 0)), (11, (-15, 0, 0)), (16, H("forearm_L"))],
        "hand_L": [(0, (0, 0, 0)), (6, (-40, 0, 0)), (9, (30, 0, 0)), (16, (0, 0, 0))],
        "arm_R": [(0, H("arm_R")), (6, (-45, 0, 35)), (9, (-20, 0, 25)), (16, H("arm_R"))],
        "spine": [(0, H("spine")), (3, (-4, 18, 0)), (6, (-12, 34, 0)), (7, (-13, 36, 0)), (9, (20, -26, 0)), (11, (22, -30, 0)), (16, H("spine"))],
        "chest": [(0, (0, 0, 0)), (6, (-6, 10, 0)), (9, (8, -12, 0)), (16, (0, 0, 0))],
        "head": [(0, H("head")), (6, (6, -24, 0)), (9, (-10, 22, 0)), (16, H("head"))],
    }, hips=[(0, (0, HOVER, 0)), (6, (0, HOVER + 0.06, -0.04)), (9, (0, HOVER - 0.02, 0.08)), (16, (0, HOVER, 0))],
        hrot=[(0, (0, 0, 0)), (6, (-6, 8, 0)), (9, (6, -8, 0)), (16, (0, 0, 0))])
    c["fling"] = clip(14, {
        "arm_R": [(0, H("arm_R")), (3, (-20, 0, 30)), (5, (-10, 0, 30)), (7, (-130, 0, 10)), (8, (-140, 0, 8)), (10, (-110, 0, 8)), (14, H("arm_R"))],
        "forearm_R": [(0, H("forearm_R")), (3, (-20, 0, 0)), (5, (-15, 0, 0)), (7, (-30, 0, 0)), (8, (-25, 0, 0)), (14, H("forearm_R"))],
        "hand_R": [(0, H("hand_R")), (5, (30, 0, 0)), (7, (-40, 0, 0)), (14, H("hand_R"))],
        "spine": [(0, H("spine")), (5, (-8, 14, 0)), (7, (14, -16, 0)), (14, H("spine"))],
        "head": [(0, H("head")), (5, (-8, -8, 0)), (7, (-12, 8, 0)), (14, H("head"))],
    }, hips=[(0, (0, HOVER, 0)), (5, (0, HOVER + 0.05, -0.05)), (7, (0, HOVER, 0.08)), (14, (0, HOVER, 0))],
        hrot=[(0, (0, 0, 0)), (5, (-8, 0, 0)), (7, (6, 0, 0)), (14, (0, 0, 0))])
    c["cast"] = clip(18, {
        "arm_R": [(0, H("arm_R")), (4, (-70, 0, 35)), (8, (-150, 0, 30)), (13, (-150, 0, 30)), (18, H("arm_R"))],
        "forearm_R": [(0, H("forearm_R")), (4, (-60, 0, 0)), (8, (-15, 0, 0)), (13, (-15, 0, 0)), (18, H("forearm_R"))],
        "arm_L": [(0, H("arm_L")), (4, (-70, 0, -35)), (8, (-150, 0, -30)), (13, (-150, 0, -30)), (18, H("arm_L"))],
        "forearm_L": [(0, H("forearm_L")), (4, (-60, 0, 0)), (8, (-15, 0, 0)), (13, (-15, 0, 0)), (18, H("forearm_L"))],
        "spine": [(0, H("spine")), (4, (10, 0, 0)), (8, (-12, 0, 0)), (13, (-10, 0, 0)), (18, H("spine"))],
        "head": [(0, H("head")), (4, (8, 0, 0)), (8, (-24, 0, 0)), (13, (-20, 0, 0)), (18, H("head"))],
    }, hips=[(0, (0, HOVER, 0)), (4, (0, HOVER - 0.04, 0)), (8, (0, HOVER + 0.4, 0)), (13, (0, HOVER + 0.38, 0)), (18, (0, HOVER, 0))],
        hrot=[(0, (0, 0, 0)), (4, (6, 0, 0)), (8, (-8, 0, 0)), (13, (-6, 0, 0)), (18, (0, 0, 0))], amp=36)
    c["fly"] = clip(16, {
        "arm_R": [(0, (-60, 0, 45)), (8, (-62, 0, 52)), (16, (-60, 0, 45))],
        "arm_L": [(0, (-60, 0, -45)), (8, (-62, 0, -52)), (16, (-60, 0, -45))],
        "forearm_R": [(0, (-20, 0, 0)), (16, (-20, 0, 0))],
        "forearm_L": [(0, (-20, 0, 0)), (16, (-20, 0, 0))],
        "spine": [(0, (-6, 0, 0)), (8, (-4, 0, 0)), (16, (-6, 0, 0))],
        "head": [(0, (-12, 0, 0)), (16, (-12, 0, 0))],
    }, hips=[(0, (0, 0.0, 0)), (8, (0, 0.06, 0)), (16, (0, 0.0, 0))],
        hrot=[(0, (6, 0, 3)), (8, (8, 0, -3)), (16, (6, 0, 3))], amp=40)
    c["block"] = clip(8, {
        "arm_R": [(0, (-80, 0, -20)), (8, (-80, 0, -20))],
        "forearm_R": [(0, (-70, 0, 0)), (8, (-70, 0, 0))],
        "arm_L": [(0, (-80, 0, 20)), (8, (-80, 0, 20))],
        "forearm_L": [(0, (-70, 0, 0)), (8, (-70, 0, 0))],
        "spine": [(0, (14, 0, 0)), (8, (14, 0, 0))],
        "head": [(0, (-6, 0, 0)), (8, (-6, 0, 0))],
    }, hips=[(0, (0, HOVER - 0.06, -0.06)), (8, (0, HOVER - 0.06, -0.06))], hrot=[(0, (-8, 0, 0)), (8, (-8, 0, 0))])
    c["dodge"] = clip(10, {
        "spine": [(0, H("spine")), (2, (0, 0, -16)), (7, (0, 0, -12)), (10, H("spine"))],
        "head": [(0, H("head")), (2, (0, 0, 10)), (10, H("head"))],
        "arm_R": [(0, H("arm_R")), (2, (-50, 0, 45)), (8, (-50, 0, 40)), (10, H("arm_R"))],
        "arm_L": [(0, H("arm_L")), (2, (-50, 0, -45)), (8, (-50, 0, -40)), (10, H("arm_L"))],
    }, hips=[(0, (0, HOVER, 0)), (2, (0, HOVER + 0.2, 0)), (7, (0, HOVER + 0.16, 0)), (10, (0, HOVER, 0))],
        hrot=[(0, (0, 0, 0)), (2, (0, 0, 28)), (5, (0, 0, 22)), (8, (0, 0, -8)), (10, (0, 0, 0))], amp=42)
    c["hit"] = clip(10, {
        "spine": [(0, H("spine")), (1, (-26, 0, 10)), (3, (-18, 0, 6)), (6, (6, 0, -2)), (10, H("spine"))],
        "head": [(0, H("head")), (1, (-26, 0, -10)), (4, (-10, 0, -4)), (10, H("head"))],
        "arm_R": [(0, H("arm_R")), (1, (10, 0, 45)), (5, (-15, 0, 20)), (10, H("arm_R"))],
        "arm_L": [(0, H("arm_L")), (1, (10, 0, -45)), (5, (-15, 0, -20)), (10, H("arm_L"))],
    }, hips=[(0, (0, HOVER, 0)), (1, (0, HOVER - 0.04, -0.12)), (4, (0, HOVER - 0.02, -0.06)), (10, (0, HOVER, 0))],
        hrot=[(0, (0, 0, 0)), (1, (-12, 0, 6)), (4, (-6, 0, 3)), (10, (0, 0, 0))])
    c["death"] = clip(16, {
        "spine": [(0, H("spine")), (3, (-30, 0, 10)), (9, (-20, 0, 30)), (16, (-25, 0, 35))],
        "head": [(0, H("head")), (3, (-30, 0, 0)), (12, (-10, 20, 10)), (16, (-14, 24, 10))],
        "arm_R": [(0, H("arm_R")), (3, (-80, 0, 70)), (10, (-140, 0, 80)), (16, (-150, 0, 75))],
        "arm_L": [(0, H("arm_L")), (3, (-80, 0, -70)), (10, (-120, 0, -40)), (16, (-110, 0, -30))],
        "forearm_R": [(0, H("forearm_R")), (8, (-10, 0, 0)), (16, (-10, 0, 0))],
        "forearm_L": [(0, H("forearm_L")), (8, (-20, 0, 0)), (16, (-20, 0, 0))],
    }, hips=[(0, (0, HOVER, 0)), (3, (0, HOVER + 0.15, 0)), (9, (0, -0.25, 0)), (11, (0, -0.2, 0)), (14, (0, -0.28, 0)), (16, (0, -0.28, 0))],
        hrot=[(0, (0, 0, 0)), (3, (-10, 0, -10)), (9, (8, 0, -70)), (11, (6, 0, -62)), (14, (8, 0, -72)), (16, (8, 0, -72))], amp=20, step=2)
    c["death"]["bones"].update(buzz_stop(16))
    c["slam"] = c["cast"]
    c["shoot"] = c["fling"]
    return c


def buzz_stop(n):
    """Death: the wings flutter, slow and stop folded down."""
    L, R = [], []
    for f, a in ((0, 30), (1, -30), (2, 30), (3, -30), (5, 25), (7, -20), (10, 15), (13, -5), (16, -10)):
        L.append((f, (0, -a, 0)))
        R.append((f, (0, a, 0)))
    return {"wing_L": L, "wing_R": R}
