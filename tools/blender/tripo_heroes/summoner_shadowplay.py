"""Remnil costume THE SHADOW PLAY: Tripo shadow-puppet body on the Remnil rig and clips, hand skinning for the paper skirt, procedural puppet rods rigid on the forearms, Tripo calligraphy brush staff in hand_R."""

_sm = dict(globals())
exec(open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "summoner.py")).read(), _sm)
seg_dist = _sm["seg_dist"]
decimate = _sm["decimate"]

GOLD = {"hue": (25, 60), "to": 44, "pull": 0.4, "sat": 1.3, "val": 1.22, "min_sat": 0.25}

CFG = {
    **_sm["CFG"],
    "name": "summoner",
    "src": "summoner_shadowplay_tripo.glb",
    "out": "summoner@shadowplay",
    "height": 2.3,
    "vivid": GOLD,
    "joints": {
        "hip": 1.0,
        "chest": 1.42,
        "neck": 1.74,
        "head_top": 2.3,
        "head_y": -0.02,
        "shoulder": (0.24, 1.64),
        "elbow": (0.39, 1.38),
        "wrist": (0.56, 1.0),
        "finger": (0.63, 0.72),
        "leg_x": 0.105,
        "knee": 0.65,
        "ankle": 0.13,
    },
    "attach": [("attach_shadowplay", "summoner_shadowplay_staff_tripo.glb")],
    "clips": "shadowplay_clips",
}

LEGS = ("thigh_L", "thigh_R", "shin_L", "shin_R")
ARMS = ("arm", "forearm", "hand")
BODY = (("hips", -9.0), ("spine", 1.17), ("chest", 1.42), ("head", 1.76))
BLEND = 0.05
TORSO_X = 0.17
ARM_ZMIN = 0.55
SHOULDER_Z = 1.68
SKIRT_TOP = 1.3
SKIRT_BOT = 0.84
LEG_R = 0.085
HEAD_X = 0.125


def body_weights(z):
    w = {}
    for k, (n, z0) in enumerate(BODY):
        lo = 1.0 if k == 0 else min(1.0, max(0.0, (z - z0 + BLEND) / (2 * BLEND)))
        hi = 1.0 if k == len(BODY) - 1 else 1.0 - min(1.0, max(0.0, (z - BODY[k + 1][1] + BLEND) / (2 * BLEND)))
        if lo * hi > 0:
            w[n] = lo * hi
    return w


def limb_weights(p, B, names):
    ds = {n: seg_dist(p, *B[n]) for n in names}
    inv = {n: 1.0 / max(d, 1e-3) ** 6 for n, d in ds.items()}
    tot = sum(inv.values())
    return {n: x / tot for n, x in inv.items()}


def skin(p, B):
    ax = abs(p.x)
    side = "L" if p.x > 0 else "R"
    arm_names = [f"{b}_{side}" for b in ARMS]
    if ARM_ZMIN < p.z < SHOULDER_Z and ax > TORSO_X:
        d_arm = min(seg_dist(p, *B[n]) for n in arm_names)
        if d_arm < 0.11 or ax > 0.34:
            w = limb_weights(p, B, arm_names)
            if p.z > 1.5:
                s = min(1.0, max(0.0, (ax - TORSO_X) / 0.1))
                w = {n: x * s for n, x in w.items()}
                for n, x in body_weights(p.z).items():
                    w[n] = w.get(n, 0) + x * (1 - s)
            return w
    if p.z >= SHOULDER_Z:
        if p.z > 1.92 or (ax < HEAD_X and p.z > BODY[3][1] and p.y < 0.06):
            return {"head": 1.0}
        return {"chest": 1.0}
    if p.z > SKIRT_TOP:
        return body_weights(p.z)
    legs = [f"thigh_{side}", f"shin_{side}"]
    d_leg = min(seg_dist(p, *B[n]) for n in legs)
    if p.z < SKIRT_BOT or d_leg < LEG_R:
        if p.z > 0.95:
            f = min(1.0, (p.z - 0.95) / 0.12)
            return {f"thigh_{side}": 1 - f * 0.6, "hips": f * 0.6}
        return limb_weights(p, B, legs)
    f = 0.25 * max(0.0, 1 - (p.z - SKIRT_BOT) / (SKIRT_TOP - SKIRT_BOT))
    return {f"thigh_{side}": f, "hips": 1 - f}


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


def gold_uv(obj):
    img, px = th.tex_lookup(obj)
    cols = th.face_colors(obj, px)
    uv = obj.data.uv_layers.active.data
    target = np.array(ROD_GOLD)
    areas = sorted(p.area for p in obj.data.polygons)
    amin = areas[len(areas) * 3 // 4]
    best, pick = 1e9, None
    for p, c in zip(obj.data.polygons, cols):
        if p.area < amin:
            continue
        d = float(np.abs(np.array(c) - target).sum())
        if d < best:
            best = d
            pick = (sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total, sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total)
    return pick


def tube(bm, uvl, pts, r, uvp, segs=8):
    rings = []
    for k, c in enumerate(pts):
        d = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        side = d.cross(Vector((0, 1, 0)))
        if side.length < 1e-3:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(d)
        rr = r[k] if isinstance(r, (list, tuple)) else r
        rings.append([bm.verts.new(c + (side * math.cos(i / segs * 2 * math.pi) + up * math.sin(i / segs * 2 * math.pi)) * rr) for i in range(segs)])
    faces = []
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            faces.append(bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i])))
    faces.append(bm.faces.new(list(reversed(rings[0]))))
    faces.append(bm.faces.new(rings[-1]))
    for f in faces:
        f.smooth = True
        for i, l in enumerate(f.loops):
            l[uvl].uv = (uvp[0] + 0.001 * (i % 2), uvp[1] + 0.001 * (i // 2 % 2))
    return [v for ring in rings for v in ring]


def sphere(bm, uvl, c, r, uvp):
    pts = [c + Vector((0, 0, -r + 2 * r * k / 6)) for k in range(7)]
    rad = [max(0.002, r * math.sin(math.pi * k / 6)) for k in range(7)]
    return tube(bm, uvl, pts, rad, uvp)


def add_rods(name, arm):
    import bmesh
    src = bpy.data.objects[name]
    uvp = gold_uv(src)
    for side, sx in (("L", 1), ("R", -1)):
        fb = arm.data.bones[f"forearm_{side}"]
        E, W = fb.head_local.copy(), fb.tail_local.copy()
        a = (E - W).normalized()
        out = Vector((sx, 0, 0))
        out = (out - a * out.dot(a)).normalized()
        back = a.cross(out) * sx
        ctrl = [W + out * 0.015, W + out * 0.13 + a * 0.12 + back * ROD_BACK, E + out * ROD_OUT + a * 0.02 + back * ROD_BACK, E + out * (ROD_OUT - 0.03) + a * ROD_UP + back * ROD_BACK]
        pts = []
        n = 14
        for k in range(n + 1):
            t = k / n
            q = [ctrl[0], ctrl[1], ctrl[2], ctrl[3]]
            while len(q) > 1:
                q = [q[i] + (q[i + 1] - q[i]) * t for i in range(len(q) - 1)]
            pts.append(q[0])
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new(src.data.uv_layers.active.name)
        vs = tube(bm, uvl, pts, ROD_R, uvp)
        vs += sphere(bm, uvl, pts[-1] + (pts[-1] - pts[-2]).normalized() * ROD_KNOB * 0.6, ROD_KNOB, uvp)
        vs += tube(bm, uvl, [W - a * 0.03, W + a * 0.035], ROD_RING, uvp, segs=10)
        bm.normal_update()
        me = bpy.data.meshes.new(f"rod_{side}")
        bm.to_mesh(me)
        bm.free()
        col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        col.data.foreach_set("color", [1.0] * (len(col.data) * 4))
        for p in me.polygons:
            p.use_smooth = True
        ob = bpy.data.objects.new(f"rod_{side}", me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(src.data.materials[0])
        ob.vertex_groups.new(name=f"forearm_{side}").add(list(range(len(me.vertices))), 1.0, "REPLACE")
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        ob.select_set(True)
        src.select_set(True)
        bpy.context.view_layer.objects.active = src
        bpy.ops.object.join()


def import_staff(name, path):
    bpy.ops.import_scene.gltf(filepath=path)
    w = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    for o in list(bpy.context.selected_objects):
        if o is not w:
            bpy.data.objects.remove(o, do_unlink=True)
    w.parent = None
    w.data.transform(w.matrix_world)
    w.matrix_world = Matrix.Identity(4)
    img, px = th.tex_lookup(w)
    th.bake_material(name, w, {"tex": 512, "vivid": GOLD}, img, px, th.face_colors(w, px))
    return w


def droop(w, foot, d, length):
    dd = Vector((0, 0, -1))
    dd = (dd - d * dd.dot(d)).normalized()
    t0 = length * DRIP_FROM
    for v in w.data.vertices:
        r = v.co - foot
        t = r.dot(d)
        s = r.dot(dd)
        if t > t0 and s > DRIP_R:
            v.co -= d * (s - DRIP_R) * DRIP_K * min(1.0, (t - t0) / 0.05)


def attach_shadowplay(name, arm, path):
    reskin(name, arm)
    add_rods(name, arm)
    w = import_staff(name + "_staff", path)
    decimate(w, STAFF_TRIS / sum(len(p.vertices) - 2 for p in w.data.polygons))
    foot, top = Vector(STAFF_FOOT), Vector(STAFF_TOP)
    d = (top - foot).normalized()
    droop(w, foot, d, (top - foot).length)
    grip = foot + (top - foot) * STAFF_AT
    q = d.rotation_difference(Vector((-1, 0, 0)))
    w.data.transform(q.to_matrix().to_4x4() @ Matrix.Translation(-grip))
    w.data.transform(Matrix.Rotation(math.radians(STAFF_ROLL), 4, "X"))
    w.data.transform(Matrix.Diagonal((STAFF_LEN / (top - foot).length, STAFF_R, STAFF_R, 1.0)))
    th.place_on_bone(w, arm, "hand_R", (0, 0, 0), STAFF_AXIS, 1.0, at=0.5, side=(1, 0, 0))
    w.name = name + "_staff"
    return w


ROD_GOLD = (0.85, 0.66, 0.28)
ROD_R = 0.016
ROD_KNOB = 0.034
ROD_RING = 0.045
ROD_OUT = 0.15
ROD_UP = 0.32
ROD_BACK = 0.05
STAFF_FOOT = (0.178, -0.494, -0.21)
STAFF_TOP = (-0.16, 0.49, 0.117)
STAFF_AT = 0.42
STAFF_ROLL = 0
STAFF_AXIS = (0, -0.12, 1)
STAFF_LEN = 2.45
STAFF_R = 1.3
STAFF_TRIS = 2500
DRIP_FROM = 0.58
DRIP_R = 0.07
DRIP_K = 0.9


def shadowplay_clips(clips):
    _sm["LEG_SCALE"].clear()
    _sm["LEG_SCALE"].update(LEG_SCALE)
    clips = _sm["summoner_clips"](clips)
    arm = bpy.data.objects["summoner_rig"]
    body = bpy.data.objects["summoner"]
    groups = {g.index: g.name for g in body.vertex_groups}
    feet = {}
    for v in list(body.data.vertices)[::7]:
        g = max(v.groups, key=lambda g: g.weight, default=None)
        if g:
            feet.setdefault(groups[g.group], []).append(v.co.copy())
    lk = _sm["lerp_keys"]
    hd = clips["death"]["bones"]["head"]
    clips["death"]["bones"]["head"] = [(t, (r[0] + DEATH_NOD * min(1.0, t / 8), r[1], r[2])) for t, r in hd]
    for name, c in clips.items():
        if name in GROUND_SKIP:
            continue
        rots = {**c.get("bones", {}), **c.get("rot", {})}
        locs = c.get("loc", {})
        times = sorted({t for keys in list(rots.values()) + list(locs.values()) for t, _ in keys})
        if not times:
            continue
        times = sorted(set(times) | {(a + b) / 2 for a, b in zip(times, times[1:]) if b - a > 1})
        hips = []
        for t in times:
            for pb in arm.pose.bones:
                pb.rotation_euler = tuple(math.radians(r) for r in lk(rots[pb.name], t)) if pb.name in rots else (0, 0, 0)
                pb.location = lk(locs[pb.name], t) if pb.name in locs else (0, 0, 0)
            bpy.context.view_layer.update()
            low = 9.0
            for n, ps in feet.items():
                if n.startswith(GROUND_IGNORE.get(name, ("-",))):
                    continue
                pb = arm.pose.bones[n]
                M = pb.matrix @ pb.bone.matrix_local.inverted()
                low = min(low, min((M @ p).z for p in ps))
            rb, hb = arm.pose.bones["root"], arm.pose.bones["hips"]
            R = (rb.matrix @ rb.bone.matrix_local.inverted() @ hb.bone.matrix_local).to_3x3()
            lift = R.inverted() @ Vector((0, 0, max(0.0, -low)))
            hips.append((t, tuple(a + b for a, b in zip(lk(locs.get("hips", []), t), lift))))
        c.setdefault("loc", {})["hips"] = hips
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
    return clips


GROUND_SKIP = ()
GROUND_IGNORE = {"death": ("arm_", "forearm_", "hand_", "head")}
DEATH_NOD = 40
LEG_SCALE = {"run": 0.85, "dodge": 0.7, "death": 0.7}
