"""Gristle (vintner): Tripo boar-folk body skinned by hand (apron on the hips), the chain anvil (Tripo) rigid in hand_R and
the big back anvil (same Tripo props mesh) rigid on the chest. Heavy, slow clips timed to his ability hitAts."""

CFG = {
    "yaw": -90,
    "height": 2.1,
    "weight": 1.0,
    "tex": 1024,
    "joints": {
        "hip": 0.98,
        "chest": 1.3,
        "neck": 1.66,
        "head_top": 2.06,
        "head_y": -0.06,
        "shoulder": (0.34, 1.52),
        "elbow": (0.52, 1.22),
        "wrist": (0.64, 0.97),
        "finger": (0.75, 0.74),
        "leg_x": 0.22,
        "knee": 0.52,
        "ankle": 0.12,
    },
    "team_hue": (205, 245),
    "attach": [("attach_anvil", "vintner_props_tripo.glb"), ("attach_backanvil", "vintner_props_tripo.glb")],
    # The weapon: its own Tripo model (vintner_hammer_prompt.txt) - a big anvil head on a chained oak shaft.
    "hammer": "vintner_hammer_tripo.glb",
    "clips": "vintner_clips",
}

LEGS = ("thigh_L", "thigh_R", "shin_L", "shin_R")
ARMS = ("arm", "forearm", "hand")
APRON_TOP = 0.98
ARMPIT = (0.35, 1.36)
SLEEVE_SLOPE = 0.15
ARM_REACH = 0.14
ARM_LOW = 0.66
SHOULDER_BLEND = (0.2, 0.44)
BODY = (("hips", -9.0), ("spine", 1.1), ("chest", 1.3), ("head", 1.64))
BLEND = 0.06
LEG_R = 0.17


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


def leg_weights(p, B):
    side = "L" if p.x > 0 else "R"
    ds = {n: seg_dist(p, *B[n]) for n in (f"thigh_{side}", f"shin_{side}")}
    inv = {n: 1.0 / max(d, 1e-3) ** 6 for n, d in ds.items()}
    tot = sum(inv.values())
    return {n: x / tot for n, x in inv.items()}, min(ds.values())


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
        s = s * min(1.0, max(0.0, (ARMPIT[1] + 0.42 - p.z) / 0.22))
        w = {n: x * (1 - s) for n, x in body_weights(p.z).items()}
        for n, x in arm_weights(p, B, side).items():
            w[n] = w.get(n, 0) + x * s
        return w
    if p.z > APRON_TOP:
        return body_weights(p.z)
    lw, d = leg_weights(p, B)
    # Apron and chainmail skirt (front panel, or anything off the leg tubes) ride mostly on the hips.
    apron = p.z > 0.42 and (p.y < -0.2 or d > LEG_R)
    if apron:
        f = 0.38 * (1 - p.z / APRON_TOP) + 0.06
        w = {n: x * f for n, x in lw.items()}
        w["hips"] = 1 - f
        return w
    top = min(1.0, max(0.0, (APRON_TOP - p.z) / 0.25))
    w = {n: x * top for n, x in lw.items()}
    if top < 1:
        w["hips"] = 1 - top
    return w


def reskin(name, arm):
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


def keep_faces(o, pred):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not pred(f.calc_center_median())], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()


def drop_islands(o, bad):
    """Weld, then delete every connected island whose vertex centroid (source coords) satisfies bad(c)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.verts.ensure_lookup_table()
    seen = set()
    kill = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        seen.add(v.index)
        g = []
        while stack:
            x = stack.pop()
            g.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index)
                    stack.append(y)
        c = sum((x.co for x in g), Vector()) / len(g)
        if bad(c):
            kill += g
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bm.to_mesh(o.data)
    bm.free()


def decimate(w, tris):
    n = sum(len(p.vertices) - 2 for p in w.data.polygons)
    if n <= tris:
        return
    d = w.modifiers.new("dec", "DECIMATE")
    d.ratio = tris / n
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=d.name)


def rigid(w, arm, bone):
    vg = w.vertex_groups.new(name=bone)
    vg.add(list(range(len(w.data.vertices))), 1.0, "REPLACE")
    w.parent = arm
    m = w.modifiers.new("Armature", "ARMATURE")
    m.object = arm


def frame(a, b):
    """Rotation taking orthonormal source axes a (3 vectors) to target axes b."""
    A = Matrix((a[0], a[1], a[2])).transposed()
    Bm = Matrix((b[0], b[1], b[2])).transposed()
    return (Bm @ A.inverted()).to_4x4()


WEAPON_TRIS = 2400
WEAPON_LEN = 1.25
WEAPON_GRIP = 0.14
WEAPON_AXIS = (0.0, -0.55, -1.0)
WEAPON_SIDE = (1.0, 0.0, 0.0)
BACK_TRIS = 1200
BACK_SCALE = 1.25
BACK_AT = (0.0, 0.46, 1.24)


_BACK = []


def attach_backanvil(name, arm, src_path):
    return _BACK.pop()


def attach_anvil(name, arm, src_path):
    """The weapon (<name>_anvil, rigid in hand_R) is the anvil hammer model (CFG["hammer"], own 512 texture); the
    old props sheet still supplies the big back anvil (<name>_backanvil, its half split at y = -0.09)."""
    reskin(name, arm)
    back = th.import_prop(name + "_backanvil", src_path, tex=512)
    horn = lambda c: c.x > 0.09 and -0.29 < c.y and -0.02 < c.z < 0.125
    keep_faces(back, lambda c: c.y >= -0.09 or horn(c))
    drop_islands(back, lambda c: c.y < -0.25)
    decimate(back, BACK_TRIS)
    w = th.import_prop(name + "_anvil", os.path.join(os.path.dirname(src_path), CFG["hammer"]), tex=512)
    decimate(w, WEAPON_TRIS)

    # Weapon: principal axis by PCA, oriented pommel -> anvil head (the head end is the wider one).
    co = np.array([v.co[:] for v in w.data.vertices])
    c = co.mean(0)
    u, s, vt = np.linalg.svd(co - c, full_matrices=False)
    ax = vt[0]
    t = (co - c) @ ax
    lo, hi = t.min(), t.max()
    wid = lambda m: np.linalg.norm((co[m] - c) - np.outer(t[m], ax), axis=1).max()
    if wid(t < lo + (hi - lo) * 0.2) > wid(t > hi - (hi - lo) * 0.2):
        ax, t, lo, hi = -ax, -t, -hi, -lo
    head = t > hi - (hi - lo) * 0.25
    hp = (co[head] - c) - np.outer(t[head], ax)
    horn = hp[np.argmax(np.linalg.norm(hp, axis=1))]
    horn = horn / np.linalg.norm(horn)
    side = np.cross(ax, horn)
    L = hi - lo
    grip = c + ax * (lo + L * WEAPON_GRIP)
    hb = arm.data.bones["hand_R"]
    g = hb.head_local + (hb.tail_local - hb.head_local) * 0.5
    d = Vector(WEAPON_AXIS).normalized()
    sx = Vector(WEAPON_SIDE)
    sx = (sx - d * sx.dot(d)).normalized()
    R = frame([Vector(ax), Vector(horn), Vector(side)], [d, sx, d.cross(sx)])
    w.data.transform(Matrix.Translation(g) @ R @ Matrix.Scale(WEAPON_LEN / L, 4) @ Matrix.Translation(-Vector(grip)))
    rigid(w, arm, "hand_R")
    w.name = name + "_anvil"

    # Back anvil: Tripo long axis (y, horn at -y) -> world X, top face (+z) against the back (-Y world), foot out.
    co = [v.co.copy() for v in back.data.vertices]
    mid = Vector([(min(p[k] for p in co) + max(p[k] for p in co)) / 2 for k in range(3)])
    R = frame([Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))], [Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, -1, 0))])
    back.data.transform(Matrix.Translation(Vector(BACK_AT)) @ R @ Matrix.Scale(BACK_SCALE, 4) @ Matrix.Translation(-mid))
    rigid(back, arm, "chest")
    back.name = name + "_backanvil"
    _BACK.append(back)
    return w


LEG_SCALE = {"attack_a": 0.75, "attack_b": 0.75, "attack_c": 0.75, "pound": 0.7, "crush": 0.7, "headbutt": 0.8, "cast": 0.75, "dodge": 0.8, "block": 0.75, "hit": 0.75, "stomp": 0.7}


def overhead(t0, up, hit, end, big=1.0):
    """Two-handed anvil overhead: wind up at `up`, impact at `hit`, recover by `end` (frames)."""
    a = 1.0 * big
    return {
        "bones": {
            "arm_R": [(t0, (0, 0, 6)), (up, (-165 * a, 0, 18)), (up + 2, (-172 * a, 0, 16)), (hit, (-42, 0, 10)), (hit + 2, (-36, 0, 8)), (end, (0, 0, 6))],
            "arm_L": [(t0, (0, 0, -6)), (up, (-160 * a, 0, -14)), (up + 2, (-168 * a, 0, -12)), (hit, (-40, 0, -14)), (hit + 2, (-34, 0, -12)), (end, (0, 0, -6))],
            "forearm_R": [(t0, (-22, 0, 0)), (up, (-75, 0, 0)), (up + 2, (-85, 0, 0)), (hit, (-8, 0, 0)), (end, (-22, 0, 0))],
            "forearm_L": [(t0, (-14, 0, 0)), (up, (-85, 0, 0)), (up + 2, (-95, 0, 0)), (hit, (-20, 0, 0)), (end, (-14, 0, 0))],
            "hand_R": [(t0, (0, 0, 0)), (up + 2, (25, 0, 0)), (hit, (-20, 0, 0)), (end, (0, 0, 0))],
            "spine": [(t0, (0, 0, 0)), (up, (-18 * big, 0, 0)), (up + 2, (-22 * big, 0, 0)), (hit, (34, 0, 0)), (hit + 2, (38, 0, 0)), (end, (0, 0, 0))],
            "chest": [(t0, (0, 0, 0)), (up + 2, (-8, 0, 0)), (hit, (10, 0, 0)), (end, (0, 0, 0))],
            "head": [(t0, (0, 0, 0)), (up + 2, (-16, 0, 0)), (hit, (10, 0, 0)), (end, (0, 0, 0))],
            "thigh_R": [(t0, (0, 0, 0)), (up, (-20, 0, 8)), (hit, (-45, 0, 10)), (hit + 2, (-45, 0, 10)), (end, (0, 0, 0))],
            "thigh_L": [(t0, (0, 0, 0)), (up, (-20, 0, -8)), (hit, (-30, 0, -10)), (hit + 2, (-30, 0, -10)), (end, (0, 0, 0))],
            "shin_R": [(t0, (0, 0, 0)), (up, (30, 0, 0)), (hit, (70, 0, 0)), (hit + 2, (70, 0, 0)), (end, (0, 0, 0))],
            "shin_L": [(t0, (0, 0, 0)), (up, (30, 0, 0)), (hit, (50, 0, 0)), (hit + 2, (50, 0, 0)), (end, (0, 0, 0))],
        },
        "loc": {"hips": [(t0, (0, 0, 0)), (up, (0, 0.04 * big, 0.06)), (hit, (0, -0.2, -0.12)), (hit + 2, (0, -0.21, -0.13)), (end, (0, 0, 0))]},
    }


def merge(*parts):
    out = {"bones": {}, "loc": {}}
    for p in parts:
        for k in ("bones", "loc"):
            for b, keys in p.get(k, {}).items():
                out[k].setdefault(b, []).extend(keys)
    for k in ("bones", "loc"):
        for b in out[k]:
            seen = {}
            for f, v in out[k][b]:
                seen[f] = v
            out[k][b] = sorted(seen.items())
    return out


def vintner_clips(clips):
    # Idle: a planted, hunched stance with the anvil hanging at his side.
    clips["idle"] = {
        "bones": {
            "spine": [(0, (8, 0, 0)), (14, (11, 0, 0)), (28, (8, 0, 0))],
            "chest": [(0, (0, 0, 0)), (14, (-3, 0, 0)), (28, (0, 0, 0))],
            "head": [(0, (-6, 0, 0)), (14, (-2, 4, 2)), (28, (-6, 0, 0))],
            "arm_R": [(0, (-8, 0, 10)), (14, (-12, 0, 12)), (28, (-8, 0, 10))],
            "arm_L": [(0, (0, 0, -10)), (14, (-5, 0, -13)), (28, (0, 0, -10))],
            "forearm_R": [(0, (-30, 0, 0)), (14, (-36, 0, 0)), (28, (-30, 0, 0))],
            "forearm_L": [(0, (-18, 0, 0)), (14, (-24, 0, 0)), (28, (-18, 0, 0))],
            "thigh_R": [(0, (-8, 0, 6)), (28, (-8, 0, 6))],
            "thigh_L": [(0, (-8, 0, -6)), (28, (-8, 0, -6))],
            "shin_R": [(0, (14, 0, 0)), (28, (14, 0, 0))],
            "shin_L": [(0, (14, 0, 0)), (28, (14, 0, 0))],
        },
        "loc": {"hips": [(0, (0, -0.04, 0)), (14, (0, -0.07, 0)), (28, (0, -0.04, 0))]},
    }
    # A1: a heavy diagonal backhand (right to left), impact ~frame 9 of 16 (hitAt 0.3 / dur 0.56).
    clips["attack_a"] = {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (4, (-120, 0, 70)), (6, (-140, 0, 75)), (9, (-60, 0, -40)), (10, (-50, 0, -50)), (13, (-30, 0, -20)), (16, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (4, (-70, 0, 0)), (6, (-80, 0, 0)), (9, (-10, 0, 0)), (16, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (6, (20, 0, 0)), (9, (-20, 0, 0)), (16, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (6, (-30, 0, -35)), (9, (10, 0, -30)), (16, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (6, (-60, 0, 0)), (16, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (4, (-10, 30, 4)), (6, (-14, 38, 4)), (9, (24, -32, -4)), (10, (26, -36, -4)), (16, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (6, (6, -24, 0)), (9, (-8, 20, 0)), (16, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (6, (-12, 0, 4)), (9, (20, 0, 4)), (16, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (6, (-8, 0, -4)), (9, (-40, 0, -6)), (16, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (9, (40, 0, 0)), (16, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (6, (0, 0.03, 0.04)), (9, (0, -0.12, -0.1)), (11, (0, -0.13, -0.11)), (16, (0, 0, 0))]},
    }
    # A2 (finisher): two-handed overhead anvil smash, impact frame 11 of 20 (hitAt 0.42 / dur 0.74).
    clips["attack_b"] = overhead(0, 6, 11, 20)
    clips["attack_c"] = overhead(0, 6, 11, 20)
    # Charged ANVIL POUND: hoist it higher with a hop, crash down, impact frame 11 of 20 (0.4 / 0.72).
    clips["pound"] = merge(overhead(0, 7, 11, 20, 1.08), {"loc": {"hips": [(0, (0, 0, 0)), (4, (0, -0.12, 0)), (8, (0, 0.18, 0.04)), (11, (0, -0.26, -0.14)), (14, (0, -0.25, -0.14)), (20, (0, 0, 0))]}})
    # HEADBUTT: crouch, then a lowered-head rush held through the charge (hitAt 0.4 / 0.62 = frame 10 of 16).
    clips["headbutt"] = {
        "bones": {
            "spine": [(0, (0, 0, 0)), (2, (30, 0, 0)), (4, (48, 0, 0)), (10, (50, 0, 0)), (11, (40, 0, 0)), (16, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (4, (12, 0, 0)), (10, (12, 0, 0)), (16, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (2, (20, 0, 0)), (4, (-30, 0, 0)), (9, (-30, 0, 0)), (10, (-10, 0, 0)), (16, (0, 0, 0))],
            "arm_R": [(0, (0, 0, 6)), (3, (40, 0, 30)), (10, (45, 0, 30)), (16, (0, 0, 6))],
            "arm_L": [(0, (0, 0, -6)), (3, (40, 0, -30)), (10, (45, 0, -30)), (16, (0, 0, -6))],
            "forearm_R": [(0, (-22, 0, 0)), (3, (-50, 0, 0)), (16, (-22, 0, 0))],
            "forearm_L": [(0, (-14, 0, 0)), (3, (-50, 0, 0)), (16, (-14, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (2, (-40, 0, 0)), (4, (-60, 0, 0)), (6, (30, 0, 0)), (8, (-60, 0, 0)), (10, (25, 0, 0)), (16, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (2, (-20, 0, 0)), (4, (35, 0, 0)), (6, (-55, 0, 0)), (8, (35, 0, 0)), (10, (-40, 0, 0)), (16, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (2, (50, 0, 0)), (4, (40, 0, 0)), (6, (60, 0, 0)), (8, (40, 0, 0)), (10, (50, 0, 0)), (16, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (2, (30, 0, 0)), (4, (60, 0, 0)), (6, (40, 0, 0)), (8, (60, 0, 0)), (10, (40, 0, 0)), (16, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (2, (0, -0.14, 0)), (4, (0, -0.1, -0.12)), (10, (0, -0.1, -0.14)), (12, (0, -0.06, -0.06)), (16, (0, 0, 0))]},
    }
    # SWITCHEROO: a whistle and a big beckoning sweep of the free arm, swap at frame 6 of 12 (0.24 / 0.5).
    clips["cast"] = {
        "bones": {
            "arm_L": [(0, (0, 0, -6)), (3, (-90, 0, -60)), (5, (-100, 0, -70)), (7, (-70, 0, 20)), (9, (-60, 0, 25)), (12, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (3, (-20, 0, 0)), (7, (-90, 0, 0)), (12, (-14, 0, 0))],
            "hand_L": [(0, (0, 0, 0)), (5, (0, -40, 0)), (7, (0, 30, 0)), (12, (0, 0, 0))],
            "arm_R": [(0, (0, 0, 6)), (4, (-20, 0, 25)), (12, (0, 0, 6))],
            "spine": [(0, (0, 0, 0)), (3, (6, 25, 0)), (6, (-6, -30, 0)), (8, (-4, -34, 0)), (12, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (3, (-10, -20, 0)), (6, (-10, 30, 0)), (12, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (4, (-20, 0, 6)), (12, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (4, (30, 0, 0)), (12, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (3, (0, -0.06, 0)), (6, (0, 0.08, 0)), (8, (0, 0.04, 0)), (12, (0, 0, 0))]},
    }
    # CRUSH SEASON: three overhead slams, each bigger, impacts at frames 13, 25 and 39 of 48 (0.55 / 1.05 / 1.62 of 2.0 s).
    clips["crush"] = merge(
        overhead(0, 8, 13, 17, 0.85),
        overhead(17, 21, 25, 28, 0.95),
        overhead(28, 34, 39, 48, 1.12),
        {"loc": {"hips": [(31, (0, -0.15, 0)), (34, (0, 0.22, 0.05)), (39, (0, -0.3, -0.16)), (43, (0, -0.29, -0.15)), (48, (0, 0, 0))]}},
    )
    # ANVIL CURL (his dodge): drop into a tight crouch behind the back anvil, arms wrapped, head tucked, then rise.
    clips["dodge"] = {
        "bones": {
            "spine": [(0, (0, 0, 0)), (2, (55, 0, 0)), (7, (60, 0, 0)), (10, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (2, (25, 0, 0)), (7, (25, 0, 0)), (10, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (2, (35, 0, 0)), (7, (35, 0, 0)), (10, (0, 0, 0))],
            "arm_R": [(0, (0, 0, 6)), (2, (-70, 0, -25)), (7, (-70, 0, -25)), (10, (0, 0, 6))],
            "arm_L": [(0, (0, 0, -6)), (2, (-70, 0, 25)), (7, (-70, 0, 25)), (10, (0, 0, -6))],
            "forearm_R": [(0, (-22, 0, 0)), (2, (-100, 0, 0)), (7, (-100, 0, 0)), (10, (-22, 0, 0))],
            "forearm_L": [(0, (-14, 0, 0)), (2, (-100, 0, 0)), (7, (-100, 0, 0)), (10, (-14, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (2, (-80, 0, 8)), (7, (-80, 0, 8)), (10, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (2, (-80, 0, -8)), (7, (-80, 0, -8)), (10, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (2, (110, 0, 0)), (7, (110, 0, 0)), (10, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (2, (110, 0, 0)), (7, (110, 0, 0)), (10, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (2, (0, -0.42, 0.05)), (7, (0, -0.42, 0.05)), (10, (0, 0, 0))]},
    }
    # Block: the anvil hoisted across the body as a shield.
    clips["block"] = {
        "bones": {
            "arm_R": [(0, (-70, 0, -10)), (8, (-70, 0, -10))],
            "forearm_R": [(0, (-70, 0, 0)), (8, (-70, 0, 0))],
            "hand_R": [(0, (0, 0, 60)), (8, (0, 0, 60))],
            "arm_L": [(0, (-60, 0, -30)), (8, (-60, 0, -30))],
            "forearm_L": [(0, (-90, 0, 0)), (8, (-90, 0, 0))],
            "spine": [(0, (18, 0, 0)), (8, (18, 0, 0))],
            "head": [(0, (-12, 0, 0)), (8, (-12, 0, 0))],
            "thigh_R": [(0, (-25, 0, 8)), (8, (-25, 0, 8))],
            "thigh_L": [(0, (-25, 0, -8)), (8, (-25, 0, -8))],
            "shin_R": [(0, (40, 0, 0)), (8, (40, 0, 0))],
            "shin_L": [(0, (40, 0, 0)), (8, (40, 0, 0))],
        },
        "loc": {"hips": [(0, (0, -0.1, 0)), (8, (0, -0.1, 0))]},
    }
    clips["throw"] = clips["cast"]
    # DIG IN: brace, hike the right knee up high, stamp the hoof down with all his weight at frame 7 of 13
    # (hitAt 0.3 / dur 0.55), arms flexed out and chest up, then settle into the planted stance.
    clips["stomp"] = {
        "bones": {
            "thigh_R": [(0, (0, 0, 4)), (3, (-45, 0, 6)), (5, (-50, 0, 6)), (7, (-10, 0, 6)), (8, (-8, 0, 6)), (13, (-12, 0, 5))],
            "shin_R": [(0, (0, 0, 0)), (3, (45, 0, 0)), (5, (50, 0, 0)), (7, (14, 0, 0)), (8, (12, 0, 0)), (13, (18, 0, 0))],
            "thigh_L": [(0, (0, 0, -4)), (3, (-8, 0, -6)), (7, (-20, 0, -8)), (13, (-14, 0, -6))],
            "shin_L": [(0, (0, 0, 0)), (3, (12, 0, 0)), (7, (28, 0, 0)), (13, (22, 0, 0))],
            "spine": [(0, (0, 0, 0)), (3, (-14, 0, -6)), (5, (-16, 0, -6)), (7, (14, 0, 4)), (9, (10, 0, 2)), (13, (8, 0, 0))],
            "chest": [(0, (0, 0, 0)), (5, (-10, 0, 0)), (7, (6, 0, 0)), (13, (-4, 0, 0))],
            "head": [(0, (0, 0, 0)), (5, (-14, 0, 0)), (7, (8, 0, 0)), (9, (-6, 0, 0)), (13, (-8, 0, 0))],
            "arm_R": [(0, (0, 0, 6)), (5, (-30, 0, 40)), (7, (-20, 0, 55)), (13, (-14, 0, 40))],
            "arm_L": [(0, (0, 0, -6)), (5, (-30, 0, -40)), (7, (-20, 0, -55)), (13, (-14, 0, -40))],
            "forearm_R": [(0, (-22, 0, 0)), (5, (-90, 0, 0)), (7, (-110, 0, 0)), (13, (-95, 0, 0))],
            "forearm_L": [(0, (-14, 0, 0)), (5, (-90, 0, 0)), (7, (-110, 0, 0)), (13, (-95, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (3, (0, 0.06, 0)), (5, (0, 0.08, 0)), (7, (0, -0.12, 0)), (8, (0, -0.13, 0)), (13, (0, -0.08, 0))]},
    }
    for name, sc in LEG_SCALE.items():
        if name not in clips:
            continue
        b = clips[name]["bones"]
        for bn in LEGS:
            if bn in b:
                b[bn] = [(t, tuple(x * sc for x in r)) for t, r in b[bn]]
    return clips
