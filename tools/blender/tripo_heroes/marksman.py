"""Wren (marksman): Tripo body, Tripo longbow in hand_L with a drawable string (bow_string bone), Pip split off as
its own object sharing one texture with the flying Pip prop (left half shoulder Pip, right half flying Pip)."""

CFG = {
    "yaw": -90,
    "height": 1.9,
    "weight": 0.85,
    "tex": 1024,
    "joints": {
        "hip": 0.95,
        "chest": 1.2,
        "neck": 1.42,
        "head_top": 1.85,
        "head_y": -0.03,
        "shoulder": (0.2, 1.28),
        "elbow": (0.42, 1.09),
        "wrist": (0.545, 0.97),
        "finger": (0.64, 0.815),
        "leg_x": 0.165,
        "knee": 0.43,
        "ankle": 0.12,
    },
    "rigid": [
        {"bone": "chest", "box": ((0.13, -0.2, 1.42), (0.42, 0.25, 1.95)), "hue": (330, 20), "sat": 0.4},
        {"bone": "chest", "box": ((0.23, -0.2, 1.45), (0.45, 0.25, 1.95))},
        {"bone": "chest", "box": ((-0.6, -0.05, 1.35), (-0.21, 0.5, 2.0))},
    ],
    "team_hue": (195, 250),
    "attach": [("attach_bow", "marksman_bow_tripo.glb"), ("attach_arrows", "marksman_bow_tripo.glb"), ("split_pip", "marksman_pip_tripo.glb")],
    "clips": "marksman_clips",
}

BOW_LEN = 1.62
BOW_GRIP = (0.083, 0.0, 0.0)
BOW_NOCK = (-0.093, 0.0, 0.452)
STRING_R = 0.0045
BOW_YAW = 90
BOW_DECIMATE = 0.35
BOW_FLAT = 0.6
PIP_BOX = ((0.08, -0.3, 1.43), (0.5, 0.35, 2.0))


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
    dec = w.modifiers.new("dec", "DECIMATE")
    dec.ratio = BOW_DECIMATE
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=dec.name)
    pale = _uv_of(w, lambda p, c: (float(c.sum()) - 3 * float(c.max() - c.min())) if abs(p.center.z) > 0.43 else None)
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


def attach_arrows(name, arm, src_path):
    import bmesh
    bow = bpy.data.objects[name + "_bow"]
    wood = _uv_of(bow, lambda p, c: -abs(float(c[0]) - 0.55) - abs(float(c[1]) - 0.33) - abs(float(c[2]) - 0.15) if abs(p.center.z) < 0.6 else None)
    me = bpy.data.meshes.new(name + "_arrows")
    me.uv_layers.new(name="UVMap")
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    q0, q1 = Vector((-0.19, 0.2, 1.36)), Vector((-0.31, 0.165, 1.63))
    for k in range(5):
        a = k / 5 * math.tau
        off = Vector((math.cos(a) * 0.022, math.sin(a) * 0.022, math.sin(a) * 0.015))
        _tube(bm, uvl, [q0 + off, q1 + off * 1.3 + Vector((0, 0, 0.01 * (k % 2)))], 0.008, wood, segs=4)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name + "_arrows", me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(bow.data.materials[0])
    col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    col.data.foreach_set("color", [1.0] * (len(col.data) * 4))
    me.color_attributes.active_color = col
    _bind(o, arm, {"chest": list(range(len(me.vertices)))})
    return o


def _pip_faces(src):
    import colorsys
    img, px = th.tex_lookup(src)
    me = src.data
    h, w = px.shape[:2]
    uv = me.uv_layers.active.data
    bary = [((i + 0.3) / 4, (j + 0.3) / 4, 1 - (i + j + 0.6) / 4) for i in range(4) for j in range(4 - i)]
    (x0, y0, z0), (x1, y1, z1) = PIP_BOX
    kind = []
    for p in me.polygons:
        q = p.center
        if not (x0 <= q.x <= x1 and y0 <= q.y <= y1 and z0 <= q.z <= z1):
            kind.append(0)
            continue
        t = [uv[i].uv for i in p.loop_indices[:3]]
        red = gold = green = tan = 0
        for a, b, d in bary:
            u = (t[0].x * a + t[1].x * b + t[2].x * d) % 1.0
            v = (t[0].y * a + t[1].y * b + t[2].y * d) % 1.0
            hh, ss, vv = colorsys.rgb_to_hsv(*[float(c) for c in px[min(h - 1, int(v * h)), min(w - 1, int(u * w)), :3]])
            hh *= 360
            red += (hh >= 330 or hh <= 8) and ss > 0.35
            gold += 25 <= hh <= 65 and ss > 0.25 and vv > 0.4
            tan += 25 <= hh <= 65 and ss > 0.15 and vv > 0.45
            green += (60 <= hh <= 170 and ss > 0.12) or (vv > 0.55 and ss < 0.45 and hh < 40 and not red)
        n = len(bary)
        kind.append(2 if red > n * 0.5 else (1 if red + gold > n * 0.5 or (q.z > 1.5 and q.x > 0.19 and green < n * 0.3) or (q.z > 1.43 and q.x > 0.17 and tan > n * 0.5) else 0))
    key = {}
    vid = [key.setdefault((round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4)), len(key)) for v in me.vertices]
    by_v = {}
    for p in me.polygons:
        for v in p.vertices:
            by_v.setdefault(vid[v], []).append(p.index)
    par = list(range(len(key)))

    def root(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a
    for p in me.polygons:
        r0 = root(vid[p.vertices[0]])
        for v in p.vertices[1:]:
            r = root(vid[v])
            if r != r0:
                par[r] = r0
    comps = {}
    for p in me.polygons:
        comps.setdefault(root(vid[p.vertices[0]]), []).append(p.index)
    sel = {p.index for p in me.polygons if kind[p.index] == 2 and p.center.z > 1.47}
    todo = list(sel)
    while todo:
        f = todo.pop()
        for v in me.polygons[f].vertices:
            for g in by_v[vid[v]]:
                if g not in sel and kind[g]:
                    sel.add(g)
                    todo.append(g)
    for fs in comps.values():
        if len(fs) > 200:
            continue
        cs = [me.polygons[i].center for i in fs]
        if not all(x0 <= c.x <= x1 and y0 <= c.y <= y1 and z0 - 0.1 <= c.z for c in cs):
            continue
        if sum(kind[i] > 0 for i in fs) > len(fs) * 0.4 or min(c.z for c in cs) > 1.5:
            sel.update(fs)
    own = {}
    for i in sel:
        for v in me.polygons[i].vertices:
            own.setdefault(vid[v], []).append(i)
    seen, parts = set(), []
    for i in sel:
        if i in seen:
            continue
        part, todo = [], [i]
        seen.add(i)
        while todo:
            f = todo.pop()
            part.append(f)
            for v in me.polygons[f].vertices:
                for g in own[vid[v]]:
                    if g not in seen:
                        seen.add(g)
                        todo.append(g)
        parts.append(part)
    return {i for part in parts if len(part) >= 12 for i in part}


def split_pip(name, arm, src_path):
    src = bpy.data.objects[name]
    sel = _pip_faces(src)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = src
    src.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for p in src.data.polygons:
        p.select = p.index in sel
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    pip = [o for o in bpy.context.selected_objects if o is not src][0]
    pip.name = name + "_pip"
    for g in list(pip.vertex_groups):
        if g.name != "chest":
            pip.vertex_groups.remove(g)
    pip.vertex_groups["chest"].add(list(range(len(pip.data.vertices))), 1.0, "REPLACE")
    left = _rebake_pip(pip)
    fly = _fly_texture(src_path)
    atlas = np.concatenate([left, fly], axis=1)
    path = os.path.join(ROOT, "assets", "source", "marksman_pip_tex.jpg")
    _save(atlas, path)
    _pip_material(name, pip, path)
    return pip


def _save(px, path):
    h, w = px.shape[:2]
    im = bpy.data.images.new("pip_save", w, h, alpha=False)
    im.pixels.foreach_set(np.concatenate([px[:, :, :3], np.ones((h, w, 1), np.float32)], axis=2).ravel())
    im.file_format = "JPEG"
    im.filepath_raw = path
    im.save()
    bpy.data.images.remove(im)


def _rebake_pip(pip):
    me = pip.data
    old = me.uv_layers.active.name
    new = me.uv_layers.new(name="pipuv")
    me.uv_layers.active = new
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = pip
    pip.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.012)
    bpy.ops.object.mode_set(mode="OBJECT")
    body_img = next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    S = 1024
    target = bpy.data.images.new("pip_bake", S, S, alpha=False)
    m = bpy.data.materials.new("pip_bake_mat")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = old
    tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = body_img
    em = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tg = nt.nodes.new("ShaderNodeTexImage")
    tg.image = target
    nt.links.new(uvn.outputs["UV"], tx.inputs["Vector"])
    nt.links.new(tx.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    nt.nodes.active = tg
    me.materials.clear()
    me.materials.append(m)
    sc = bpy.context.scene
    prev = sc.render.engine
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 1
    bpy.ops.object.bake(type="EMIT", margin=6, use_clear=True)
    sc.render.engine = prev
    px = np.array(target.pixels[:], dtype=np.float32).reshape(S, S, 4)[:, :, :3]
    me.uv_layers.remove(me.uv_layers[old])
    uv = me.uv_layers["pipuv"].data
    for l in uv:
        l.uv = (l.uv.x * 0.5, l.uv.y)
    me.materials.clear()
    return px[:, ::2]


def _fly_texture(src_path):
    bpy.ops.import_scene.gltf(filepath=src_path)
    objs = list(bpy.context.selected_objects)
    w = [o for o in objs if o.type == "MESH"][0]
    img, px = th.tex_lookup(w)
    h, wd = px.shape[:2]
    im = bpy.data.images.new("fly_tmp", wd, h, alpha=False)
    im.pixels.foreach_set(px.ravel())
    im.scale(512, 1024)
    out = np.array(im.pixels[:], dtype=np.float32).reshape(1024, 512, 4)[:, :, :3]
    bpy.data.images.remove(im)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    return out


def _pip_material(name, pip, path):
    tex = bpy.data.images.load(path, check_existing=False)
    tex.pack()
    m = bpy.data.materials.new(name + "_pip_skin")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bs.inputs["Roughness"].default_value = 1.0
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = tex
    nt.links.new(t.outputs["Color"], bs.inputs["Base Color"])
    nt.links.new(bs.outputs[0], o.inputs["Surface"])
    pip.data.materials.append(m)
    for p in pip.data.polygons:
        p.material_index = 0


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
    arm = bpy.data.objects["marksman_rig"]
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


def _shoot():
    k = []
    k.append((0, _p(_stance(0.0))))
    k.append((3, _p(_stance(0.6), bow=((0, -1, -0.3), UP), draw="grip", gripoff=(0.02, 0.1, 0.0), poleR=(-0.5, 0.2, -0.8))))
    k.append((6, _p(_stance(1.0, crouch=0.02), bow=((0, -1, 0.36), UP), draw="anchor", drawlen=0.6, string="hand")))
    k.append((9, _p(_stance(1.0, crouch=0.02), bow=((0, -1, 0.37), UP), draw="anchor", drawlen=0.64, string="hand")))
    k.append((10, _p(_stance(1.0, crouch=0.01), bow=((0, -1, 0.44), UP), draw="anchor", drawlen=0.8, anchoroff=(-0.12, 0, 0.06), poleR=(-0.6, 0.4, 0.6))))
    k.append((13, _p(_stance(0.9), bow=((0, -1, 0.4), UP), draw="anchor", drawlen=0.8, anchoroff=(-0.16, 0, 0.02), poleR=(-0.6, 0.4, 0.6))))
    k.append((18, _p(_stance(0.0))))
    return _clip(k)


def _heartseeker():
    k = []
    k.append((0, _p(_stance(0.0))))
    k.append((3, _p(_stance(0.5, crouch=0.04), bow=((0, -1, -0.4), UP), draw="grip", gripoff=(0.02, 0.1, 0.0), poleR=(-0.5, 0.2, -0.8))))
    k.append((7, _p(_stance(0.9, crouch=0.06), bow=((0, -1, 0.3), UP), draw="anchor", drawlen=0.45, string="hand")))
    k.append((11, _p(_stance(1.1, crouch=0.08, head=62), bow=((0, -1, 0.36), (0.05, 0, 1)), draw="anchor", drawlen=0.7, anchoroff=(-0.02, 0, 0.02), string="hand")))
    k.append((13, _p(_stance(1.12, crouch=0.08, head=63), bow=((0, -1, 0.36), (0.05, 0, 1)), draw="anchor", drawlen=0.73, anchoroff=(-0.02, 0, 0.02), string="hand")))
    rec = _stance(1.0, crouch=0.03)
    rec["spine"] = (-10, rec["spine"][1], 0)
    rec["@hips"] = (0, -0.03, -0.06)
    k.append((14, _p(rec, bow=((0, -1, 0.62), (-0.1, 0, 1)), draw="anchor", drawlen=0.86, anchoroff=(-0.16, 0, 0.08), poleR=(-0.6, 0.4, 0.6))))
    k.append((17, _p(_stance(0.9, crouch=0.02), bow=((0, -1, 0.42), UP), draw="anchor", drawlen=0.84, anchoroff=(-0.18, 0, 0.03), poleR=(-0.6, 0.4, 0.6))))
    k.append((22, _p(_stance(0.0))))
    return _clip(k)


def _volley():
    sky = (0, -0.75, 1)
    bu = (0, 1, 0.7)
    k = []
    k.append((0, _p(_stance(0.0))))
    k.append((3, _p(_stance(0.5, crouch=0.04), bow=((0, -1, 0.1), UP), draw="grip", gripoff=(0.02, 0.1, 0.0), poleR=(-0.5, 0.2, -0.8))))
    lean = _stance(1.0, crouch=0.04, head=45)
    lean["spine"] = (-14, lean["spine"][1], 0)
    lean["chest"] = (-6, -6, 0)
    lean["head"] = (-24, 45, 0)
    k.append((7, _p(lean, arrow=(sky, bu), drawlen=0.56, string="hand")))
    k.append((10, _p(lean, arrow=(sky, bu), drawlen=0.6, string="hand")))
    rel = dict(lean)
    rel["spine"] = (-18, lean["spine"][1], 0)
    k.append((11, _p(rel, arrow=((0, -0.6, 1), bu), drawlen=0.6, anchoroff=(-0.16, 0.12, 0.04), poleR=(-0.6, 0.4, 0.6))))
    k.append((14, _p(rel, arrow=((0, -0.65, 1), bu), drawlen=0.6, anchoroff=(-0.2, 0.14, 0.0), poleR=(-0.6, 0.4, 0.6))))
    k.append((17, _p(_stance(0.5), bow=((0, -1, -0.1), UP), draw="grip", gripoff=(0.0, 0.16, -0.12), poleR=(-0.5, 0.2, -0.8))))
    k.append((21, _p(_stance(0.0))))
    return _clip(k)


def _cast():
    k = []
    k.append((0, {}))
    wind = {"spine": (8, -14, 0), "chest": (0, -6, 0), "head": (4, 16, 0), "hips": (0, -8, 0), "@hips": (0, -0.04, 0),
            "thigh_R": (-6, 0, 8), "shin_R": (14, 0, 0), "thigh_L": (-14, 0, -8), "shin_L": (18, 0, 0)}
    k.append((4, _p(wind, draw=(0.1, -0.14, 1.4), poleR=(-0.3, 0.2, -1), **{"arm_L": (-8, 0, -14), "forearm_L": (-26, 0, 0)})))
    k.append((6, _p(wind, draw=(0.08, -0.17, 1.43), poleR=(-0.3, 0.2, -1), **{"arm_L": (-8, 0, -14), "forearm_L": (-26, 0, 0)})))
    thr = {"spine": (18, 30, 0), "chest": (4, 10, 0), "head": (-14, -26, 0), "hips": (0, 14, 0), "@hips": (0, -0.08, 0),
           "thigh_R": (-40, 0, 6), "shin_R": (40, 0, 0), "thigh_L": (18, 0, -6), "shin_L": (14, 0, 0)}
    k.append((8, _p(thr, reachR=((0.05, -1, 0.75), 0.995), poleR=(-1, 0.3, -0.5), **{"arm_L": (16, 0, -22), "forearm_L": (-24, 0, 0), "hand_R": (-25, 0, 0)})))
    k.append((11, _p(thr, reachR=((0.05, -1, 0.8), 0.99), poleR=(-1, 0.3, -0.5), **{"arm_L": (16, 0, -22), "forearm_L": (-24, 0, 0), "hand_R": (-35, 0, 0)})))
    k.append((17, {}))
    return _clip(k)


def marksman_clips(clips):
    clips["shoot"] = _shoot()
    clips["heartseeker"] = _heartseeker()
    clips["volley"] = _volley()
    clips["cast"] = _cast()
    for n in ("attack_a", "attack_b", "attack_c"):
        clips[n] = _shoot()
    for c in clips.values():
        c.setdefault("loc", {}).setdefault("bow_string", [(0, (0, 0, 0))])
    return clips
