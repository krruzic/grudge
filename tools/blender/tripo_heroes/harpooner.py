"""Brindle Tadwick (harpooner): squat frogfolk fisherman. Tripo body; Tripo whalebone harpoon bow in hand_L with a
drawable string (bow_string bone) and a Tripo harpoon nocked on it (harpoon_nock bone, hidden by the game while one
is in flight); the rope coil and net floats ride the hips. Clips are posed with Wren's IK helpers for his proportions."""

CFG = {
    "yaw": -90,
    "height": 1.7,
    "weight": 1.0,
    "tex": 1024,
    "joints": {
        "hip": 0.55,
        "chest": 0.86,
        "neck": 1.12,
        "head_top": 1.7,
        "head_y": -0.05,
        "shoulder": (0.32, 1.06),
        "elbow": (0.47, 0.9),
        "wrist": (0.6, 0.74),
        "finger": (0.7, 0.62),
        "leg_x": 0.19,
        "knee": 0.3,
        "ankle": 0.1,
    },
    "rigid": [
        {"bone": "hips", "box": ((-0.53, -0.45, 0.2), (-0.3, 0.12, 0.7)), "whole": True},
        {"bone": "hips", "box": ((-0.53, -0.45, 0.2), (-0.31, 0.12, 0.68))},
    ],
    "team_hue": (205, 250),
    "attach": [("attach_bow", "harpooner_bow_tripo.glb"), ("attach_harpoons", "harpoon_tripo.glb")],
    "clips": "harpooner_clips",
}


BOW_LEN = 1.2
BOW_GRIP = (0.065, 0.0, 0.0)
BOW_NOCK = (-0.16, 0.0, 0.44)
STRING_R = 0.0055
BOW_YAW = 90
BOW_DECIMATE = 0.5
BOW_FLAT = 0.8
HARPOON_TRIS = 700


def _bind(obj, arm, groups):
    for bone, idx in groups.items():
        vg = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
        vg.add(idx, 1.0, "REPLACE")
    obj.parent = arm
    m = obj.modifiers.new("Armature", "ARMATURE")
    m.object = arm


def _bow_frame(arm):
    hb = arm.data.bones["hand_L"]
    g = hb.head_local + (hb.tail_local - hb.head_local) * 0.45
    up = -(hb.tail_local - hb.head_local).normalized()
    a = math.radians(BOW_YAW)
    fwd = Vector((-math.sin(a), -math.cos(a), 0))
    fwd = (fwd - up * fwd.dot(up)).normalized()
    side = up.cross(fwd)
    R = Matrix((fwd, side, up)).transposed().to_4x4()
    return Matrix.Translation(g) @ R @ Matrix.Scale(BOW_LEN, 4) @ Matrix.Diagonal((BOW_FLAT, 1, 1, 1)) @ Matrix.Translation(-Vector(BOW_GRIP))


def _uv_of(obj, test):
    img, px = th.tex_lookup(obj)
    cols = th.face_colors(obj, px)
    uv = obj.data.uv_layers.active.data
    best = None
    for p, c in zip(obj.data.polygons, cols):
        s = test(p, c)
        if s is not None and (best is None or s > best[0]):
            best = (s, (sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total, sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total))
    return best[1]


def _tube(bm, uvl, pts, r, uv, segs=5):
    rings = []
    for k, p in enumerate(pts):
        d = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        a = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
        b = d.cross(a)
        rings.append([bm.verts.new(p + (a * math.cos(i / segs * math.tau) + b * math.sin(i / segs * math.tau)) * r) for i in range(segs)])
    for k in range(len(rings) - 1):
        for i in range(segs):
            f = bm.faces.new((rings[k][i], rings[k][(i + 1) % segs], rings[k + 1][(i + 1) % segs], rings[k + 1][i]))
            for l in f.loops:
                l[uvl].uv = uv
    for ring in (rings[0], rings[-1][::-1]):
        f = bm.faces.new(ring[::-1])
        for l in f.loops:
            l[uvl].uv = uv
    return rings


def attach_bow(name, arm, src_path):
    import bmesh
    w = th.import_prop(name + "_bow", src_path, tex=512)
    w.data.transform(Matrix.Rotation(math.radians(90), 4, "Z"))
    dec = w.modifiers.new("dec", "DECIMATE")
    dec.ratio = BOW_DECIMATE
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=dec.name)
    pale = _uv_of(w, lambda p, c: (float(c.max() - c.min()) * float(c.max())) if 0.36 < abs(p.center.z) < 0.47 else None)
    M = _bow_frame(arm)
    w.data.transform(M)
    nt, nb = M @ Vector(BOW_NOCK), M @ Vector((BOW_NOCK[0], BOW_NOCK[1], -BOW_NOCK[2]))
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
    n0 = len(w.data.vertices)
    bm = bmesh.new()
    bm.from_mesh(w.data)
    uvl = bm.loops.layers.uv.active
    rings = _tube(bm, uvl, [nt, mid, nb], STRING_R, pale)
    bm.verts.index_update()
    mid_idx = [v.index for v in rings[1]]
    bm.to_mesh(w.data)
    bm.free()
    ends = [i for i in range(n0, len(w.data.vertices)) if i not in mid_idx]
    _bind(w, arm, {"hand_L": list(range(n0)) + ends, "bow_string": mid_idx})
    for p in w.data.polygons:
        p.use_smooth = p.index < len(w.data.polygons) - 12
    w.name = name + "_bow"
    return w




REST = {"arm_R": (0, 0, 6), "arm_L": (0, 0, -6), "forearm_R": (-22, 0, 0), "forearm_L": (-14, 0, 0)}
POSED = ("arm_R", "forearm_R", "hand_R", "arm_L", "forearm_L", "hand_L")


def _apply(arm, pose):
    for pb in arm.pose.bones:
        e = pose.get(pb.name, REST.get(pb.name, (0, 0, 0)))
        pb.rotation_euler = [math.radians(x) for x in e]
        pb.location = (0, 0, 0)
    arm.pose.bones["hips"].location = pose.get("@hips", (0, 0, 0))
    bpy.context.view_layer.update()


def _base(arm, name):
    pb = arm.pose.bones[name]
    rel = pb.bone.parent.matrix_local.inverted() @ pb.bone.matrix_local
    return pb.parent.matrix @ rel


def _rot(arm, name, R, prev):
    basis = _base(arm, name).to_3x3().inverted() @ R
    e = basis.to_euler("XYZ", prev) if prev is not None else basis.to_euler("XYZ")
    arm.pose.bones[name].rotation_euler = e
    bpy.context.view_layer.update()
    return e


def _aim(arm, name, d, prev):
    base = _base(arm, name).to_3x3()
    q = base.col[1].normalized().rotation_difference(Vector(d).normalized())
    return _rot(arm, name, q.to_matrix() @ base, prev)


def _ik(arm, side, target, pole, prev):
    up, fo = arm.pose.bones["arm_" + side], arm.pose.bones["forearm_" + side]
    S = up.head.copy()
    l1, l2 = up.bone.length, fo.bone.length
    d = Vector(target) - S
    L = max(0.05, min(d.length, (l1 + l2) * 0.999))
    dn = d.normalized()
    c = max(-1.0, min(1.0, (l1 * l1 + L * L - l2 * l2) / (2 * l1 * L)))
    p = Vector(pole) - dn * Vector(pole).dot(dn)
    p.normalize()
    E = S + dn * (l1 * c) + p * (l1 * math.sqrt(1 - c * c))
    e1 = _aim(arm, "arm_" + side, E - S, prev.get("arm_" + side))
    e2 = _aim(arm, "forearm_" + side, S + dn * L - E, prev.get("forearm_" + side))
    return e1, e2


def _bow_hand(arm, F, U, prev):
    hb = arm.data.bones["hand_L"]
    H0 = hb.matrix_local.to_3x3()
    M = _bow_frame(arm).to_3x3()
    cvx, upv = (M @ Vector((1, 0, 0))).normalized(), (M @ Vector((0, 0, 1))).normalized()
    cl, ul = H0.inverted() @ cvx, H0.inverted() @ upv
    F = Vector(F).normalized()
    U = Vector(U)
    U = (U - F * U.dot(F)).normalized()
    A = Matrix((cl, ul, cl.cross(ul))).transposed()
    B = Matrix((F, U, F.cross(U))).transposed()
    return _rot(arm, "hand_L", B @ A.inverted(), prev)


def _grip(arm):
    hb = arm.pose.bones["hand_L"]
    return hb.head + (hb.tail - hb.head) * 0.45


def _fingers(arm):
    hb = arm.pose.bones["hand_R"]
    return hb.head + (hb.tail - hb.head) * 0.4


def _string_loc(arm, P):
    return tuple(_base(arm, "bow_string").inverted() @ Vector(P))


def _deg(e):
    return tuple(round(math.degrees(x), 2) for x in e)


def _clip(keys):
    """keys: [(frame, pose)]. pose: bone eulers plus optional
    'bow': (dir, up) to aim the bow arm and stand the bow up; 'draw': wrist target for the right hand with 'pole';
    'string': 'hand' to hang the string on the right fingers, else rest."""
    arm = bpy.data.objects["harpooner_rig"]
    out = {"bones": {}, "loc": {"hips": [], "bow_string": []}}
    prev = {}
    for f, pose in keys:
        _apply(arm, pose)
        got = {}
        if "arrow" in pose:
            d, u = pose["arrow"]
            hb = arm.pose.bones["head"]
            chin = hb.head + Vector(pose.get("chin", (-0.04, -0.06, 0.06)))
            pose["bow"] = (d, u)
            pose["draw"] = tuple(chin + Vector(pose.get("anchoroff", (0, 0, 0))))
            grip_t = chin + Vector(d).normalized() * pose.get("drawlen", 0.6)
        if "bow" in pose:
            d, u = pose["bow"]
            sh = arm.pose.bones["arm_L"].head
            reach = arm.pose.bones["arm_L"].bone.length + arm.pose.bones["forearm_L"].bone.length
            tgt = sh + Vector(d).normalized() * reach * pose.get("reach", 0.97)
            if "arrow" in pose:
                tgt = sh + (grip_t - sh).normalized() * min((grip_t - sh).length, reach * 0.99)
            got["arm_L"], got["forearm_L"] = _ik(arm, "L", tgt, pose.get("poleL", (0.4, 0.3, -1)), prev)
            got["hand_L"] = _bow_hand(arm, pose.get("face", d), u, prev.get("hand_L"))
        if "reachR" in pose:
            d, fr = pose["reachR"]
            sh = arm.pose.bones["arm_R"].head
            reach = arm.pose.bones["arm_R"].bone.length + arm.pose.bones["forearm_R"].bone.length
            pose["draw"] = tuple(sh + Vector(d).normalized() * reach * fr)
        if "draw" in pose:
            P = pose["draw"]
            if P == "grip":
                P = _grip(arm) + Vector(pose.get("gripoff", (0.0, 0.05, -0.02)))
            elif P == "line":
                g = _grip(arm)
                d = Vector(pose["bow"][0]).normalized()
                P = g - d * pose.get("drawlen", 0.62) + Vector(pose.get("anchoroff", (0, 0, 0)))
            elif P == "anchor":
                g = _grip(arm)
                hz = arm.pose.bones["head"].head.z
                P = Vector((g.x - 0.05, g.y + pose.get("drawlen", 0.62), hz + 0.02)) + Vector(pose.get("anchoroff", (0, 0, 0)))
            got["arm_R"], got["forearm_R"] = _ik(arm, "R", P, pose.get("poleR", (-0.6, 0.6, 0.4)), prev)
        for b in POSED:
            e = got.get(b)
            if e is None:
                e = arm.pose.bones[b].rotation_euler.copy()
            prev[b] = e.copy()
        for pb in arm.pose.bones:
            if pb.name == "bow_string" or pb.name == "root":
                continue
            out["bones"].setdefault(pb.name, []).append((f, _deg(pb.rotation_euler)))
        out["loc"]["hips"].append((f, tuple(arm.pose.bones["hips"].location)))
        sl = (0, 0, 0)
        if pose.get("string") == "hand":
            sl = _string_loc(arm, _fingers(arm))
        out["loc"]["bow_string"].append((f, sl))
    _apply(arm, {})
    return out


def _stance(t, hip=-32, spine=-20, head=52, crouch=0.0):
    return {
        "hips": (0, hip * t, 0),
        "spine": (4 * t, spine * t, 0),
        "chest": (0, -6 * t, 0),
        "head": (-4 * t, head * t, 0),
        "thigh_R": (-6 * t, 0, 12 * t),
        "thigh_L": (-10 * t, 0, -14 * t),
        "shin_R": (10 * t, 0, 0),
        "shin_L": (12 * t, 0, 0),
        "@hips": (0, -crouch * t, 0),
    }


def _p(*parts, **kw):
    out = {}
    for d in parts:
        out.update(d)
    out.update(kw)
    return out


FWD = (0, -1, 0)


UP = (0.12, 0.0, 1)


def attach_harpoons(name, arm, src_path):
    """Two spare harpoons strapped diagonally across his back (rigid on the chest), points up over his left shoulder."""
    objs = []
    for k, (off, tilt) in enumerate((((0.0, 0.2, 0.78), 24), ((0.06, 0.22, 0.74), 30))):
        w = th.import_prop(f"{name}_harpoon{k}", src_path, tex=256)
        n = sum(len(p.vertices) - 2 for p in w.data.polygons)
        d = w.modifiers.new("dec", "DECIMATE")
        d.ratio = HARPOON_TRIS / n
        bpy.context.view_layer.objects.active = w
        bpy.ops.object.modifier_apply(modifier=d.name)
        w.data.transform(Matrix.Translation(Vector(off)) @ Matrix.Rotation(math.radians(-tilt), 4, "Y") @ Matrix.Rotation(math.radians(4), 4, "X") @ Matrix.Scale(0.8, 4))
        objs.append(w)
    bpy.ops.object.select_all(action="DESELECT")
    for w in objs:
        w.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    w = objs[0]
    _bind(w, arm, {"chest": list(range(len(w.data.vertices)))})
    w.name = name + "_harpoons"
    return w


def _shoot(heavy=False):
    k = []
    k.append((0, _p(_stance(0.0))))
    k.append((3, _p(_stance(0.6), bow=((0, -1, -0.25), UP), draw="grip", gripoff=(0.02, 0.08, 0.0), poleR=(-0.5, 0.2, -0.8))))
    k.append((6, _p(_stance(1.0, crouch=0.02), bow=((0, -1, 0.2), UP), draw="anchor", drawlen=0.4, string="hand")))
    k.append((9, _p(_stance(1.0, crouch=0.02), bow=((0, -1, 0.22), UP), draw="anchor", drawlen=0.44, string="hand")))
    if not heavy:
        k.append((10, _p(_stance(1.0, crouch=0.01), bow=((0, -1, 0.3), UP), draw="anchor", drawlen=0.55, anchoroff=(-0.1, 0, 0.05), poleR=(-0.6, 0.4, 0.6))))
        k.append((13, _p(_stance(0.9), bow=((0, -1, 0.26), UP), draw="anchor", drawlen=0.55, anchoroff=(-0.12, 0, 0.02), poleR=(-0.6, 0.4, 0.6))))
        k.append((18, _p(_stance(0.0))))
        return _clip(k)
    k.append((10, _p(_stance(1.0, crouch=0.01), bow=((0, -1, 0.3), UP), draw="anchor", drawlen=0.55, anchoroff=(-0.1, 0, 0.05), poleR=(-0.6, 0.4, 0.6))))
    yank = _stance(1.0, crouch=0.06)
    yank["spine"] = (-22, yank["spine"][1], 0)
    yank["chest"] = (-10, -6, 0)
    yank["@hips"] = (0, -0.06, 0.08)
    yank["thigh_L"] = (-30, 0, -14)
    yank["shin_L"] = (30, 0, 0)
    k.append((13, _p(yank, bow=((0, -1, 0.05), UP), draw=(0.16, 0.12, 0.85), poleR=(-0.6, 0.6, -0.3))))
    k.append((16, _p(yank, bow=((0, -1, 0.0), UP), draw=(0.18, 0.16, 0.82), poleR=(-0.6, 0.6, -0.3))))
    k.append((22, _p(_stance(0.0))))
    return _clip(k)


def _tongue():
    k = []
    k.append((0, {}))
    crouch = {"spine": (14, 0, 0), "head": (6, 0, 0), "@hips": (0, -0.1, 0), "thigh_R": (-40, 0, 8), "thigh_L": (-40, 0, -8),
              "shin_R": (60, 0, 0), "shin_L": (60, 0, 0), "arm_R": (20, 0, 30), "arm_L": (20, 0, -30)}
    k.append((3, crouch))
    lash = {"spine": (30, 0, 0), "chest": (10, 0, 0), "head": (-28, 0, 0), "@hips": (0, -0.04, -0.06), "thigh_R": (-20, 0, 8),
            "thigh_L": (10, 0, -8), "shin_R": (20, 0, 0), "shin_L": (10, 0, 0), "arm_R": (45, 0, 40), "arm_L": (45, 0, -40),
            "forearm_R": (-30, 0, 0), "forearm_L": (-30, 0, 0)}
    k.append((6, lash))
    k.append((10, lash))
    k.append((14, {}))
    return _clip(k)


def _slide():
    """Belly slide (his dodge): a hop, then flat on his belly, arms forward, legs trailing, sliding low."""
    flat = {"hips": (78, 0, 0), "spine": (6, 0, 0), "chest": (4, 0, 0), "head": (-62, 0, 0), "@hips": (0, -0.22, 0.0),
            "arm_R": (-150, 0, 22), "arm_L": (-150, 0, -22), "forearm_R": (-10, 0, 0), "forearm_L": (-10, 0, 0),
            "thigh_R": (24, 0, 8), "thigh_L": (24, 0, -8), "shin_R": (10, 0, 0), "shin_L": (10, 0, 0)}
    k = [(0, {}), (2, {"hips": (30, 0, 0), "spine": (10, 0, 0), "@hips": (0, -0.08, 0), "arm_R": (-80, 0, 30), "arm_L": (-80, 0, -30),
                       "thigh_R": (-30, 0, 6), "thigh_L": (-30, 0, -6), "shin_R": (40, 0, 0), "shin_L": (40, 0, 0)}),
         (4, flat), (10, flat), (12, {"hips": (30, 0, 0), "@hips": (0, -0.12, 0), "thigh_R": (-40, 0, 8), "thigh_L": (-40, 0, -8),
                                       "shin_R": (60, 0, 0), "shin_L": (60, 0, 0)}), (14, {})]
    return _clip(k)


def _riptide():
    k = []
    k.append((0, {}))
    up = {"spine": (-14, 0, 0), "head": (-20, 0, 0), "@hips": (0, 0.06, 0), "thigh_R": (-20, 0, 10), "thigh_L": (-20, 0, -10),
          "shin_R": (30, 0, 0), "shin_L": (30, 0, 0), "arm_R": (-170, 0, 30), "forearm_R": (-20, 0, 0), "hand_R": (0, 0, 0)}
    k.append((5, _p(up, bow=((0, -0.2, 1), (0, 1, 0.2)))))
    k.append((9, _p(up, bow=((0, -0.25, 1), (0, 1, 0.2)))))
    down = {"spine": (30, 0, 0), "head": (14, 0, 0), "@hips": (0, -0.2, -0.04), "thigh_R": (-55, 0, 14), "thigh_L": (-55, 0, -14),
            "shin_R": (85, 0, 0), "shin_L": (85, 0, 0), "arm_R": (-60, 0, 30), "forearm_R": (-20, 0, 0)}
    k.append((12, _p(down, bow=((0, -1, -0.8), UP))))
    k.append((16, _p(down, bow=((0, -1, -0.8), UP))))
    k.append((22, {}))
    return _clip(k)


LEG_SCALE = {"run": 0.75, "attack_a": 0.7, "attack_b": 0.7, "attack_c": 0.7, "block": 0.7, "death": 0.6, "hit": 0.7}
LEGS = ("thigh_L", "thigh_R", "shin_L", "shin_R")


def harpooner_clips(clips):
    for name, s in LEG_SCALE.items():
        b = clips[name]["bones"]
        for bn in LEGS:
            if bn in b:
                b[bn] = [(t, tuple(x * s for x in r)) for t, r in b[bn]]
    clips["shoot"] = _shoot()
    clips["throw"] = _shoot(heavy=True)
    clips["cast"] = _tongue()
    clips["dodge"] = _slide()
    clips["slam"] = _riptide()
    for n in ("attack_a", "attack_b", "attack_c"):
        clips[n] = _shoot()
    for c in clips.values():
        c.setdefault("loc", {}).setdefault("bow_string", [(0, (0, 0, 0))])
    return clips
