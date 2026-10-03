"""Francois (duelist): Tripo body, Tripo rapier (blade stretched to rapier proportions) in hand_R, Tripo baguette strapped diagonally across his back."""
import colorsys

CFG = {
    "yaw": -90,
    "height": 2.1,
    "weight": 0.85,
    "tex": 1024,
    "joints": {
        "hip": 0.95,
        "chest": 1.28,
        "neck": 1.55,
        "head_top": 1.9,
        "head_y": -0.06,
        "shoulder": (0.26, 1.46),
        "elbow": (0.37, 1.26),
        "wrist": (0.47, 1.03),
        "finger": (0.56, 0.84),
        "leg_x": 0.15,
        "knee": 0.46,
        "ankle": 0.13,
    },
    "rigid": [
        {"bone": "head", "box": ((-1.2, -1.2, 1.7), (1.2, 1.2, 2.4))},
        {"bone": "head", "box": ((-0.5, 0.28, 1.5), (0.15, 0.9, 2.1))},
        {"bone": "hips", "box": ((0.05, 0.13, 0.1), (0.5, 0.95, 0.95))},
        {"bone": "hips", "box": ((0.2, -0.32, 0.85), (0.4, 0.12, 1.2)), "hue": (25, 65), "sat": 0.3},
        {"bone": "hips", "box": ((0.255, -0.28, 0.94), (0.365, -0.01, 1.17))},
        {"bone": "chest", "box": ((-0.42, 0.1, 0.65), (0.12, 0.42, 1.36)), "hue": (195, 250), "sat": 0.25},
    ],
    "team_hue": (195, 250),
    "attach": [("attach_rapier", "duelist_rapier_tripo.glb"), ("attach_baguette", "duelist_baguette_tripo.glb")],
    "clips": "duelist_clips",
}


def duelist_thrust(lunge, f):
    a, b, c, d = f
    return {
        "bones": {
            "arm_R": [(0, (0, 0, 6)), (a, (-55, 0, 25)), (b, (-92, 0, 2)), (c, (-90, 0, 2)), (d, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (a, (-85, 0, 0)), (b, (0, 0, 0)), (c, (-4, 0, 0)), (d, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (a, (-20, 0, 0)), (b, (6, 0, 0)), (d, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (a, (25, 0, -20)), (b, (45, 0, -35)), (c, (45, 0, -35)), (d, (0, 0, -6))],
            "forearm_L": [(0, (-14, 0, 0)), (b, (-50, 0, 0)), (d, (-14, 0, 0))],
            "spine": [(0, (0, 0, 0)), (a, (-4, 22, 0)), (b, (12 * lunge, -28, 0)), (c, (12 * lunge, -26, 0)), (d, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (a, (4, -14, 0)), (b, (-8 * lunge, 22, 0)), (d, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (a, (-10, 0, 0)), (b, (-40 * lunge, 0, 4)), (c, (-40 * lunge, 0, 4)), (d, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (b, (30 * lunge, 0, 0)), (c, (30 * lunge, 0, 0)), (d, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (a, (5, 0, 0)), (b, (28 * lunge, 0, -4)), (c, (28 * lunge, 0, -4)), (d, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (b, (12 * lunge, 0, 0)), (d, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (a, (0, 0.02, 0.04)), (b, (0, -0.1 * lunge, -0.22 * lunge)), (c, (0, -0.1 * lunge, -0.23 * lunge)), (d, (0, 0, 0))]},
    }


def duelist_clips(clips):
    clips["attack_a"] = duelist_thrust(0.6, (3, 5, 7, 12))
    clips["attack_b"] = duelist_thrust(1.0, (3, 5, 8, 14))
    clips["attack_c"] = {
        "bones": {
            "hips": [(0, (0, 0, 0)), (2, (0, 30, 0)), (8, (0, -330, 0)), (9, (0, -360, 0)), (16, (0, -360, 0))],
            "arm_R": [(0, (0, 0, 6)), (2, (-40, 0, 40)), (4, (-15, 0, 80)), (8, (-15, 0, 80)), (10, (-92, 0, 2)), (12, (-90, 0, 2)), (16, (0, 0, 6))],
            "forearm_R": [(0, (-22, 0, 0)), (2, (-60, 0, 0)), (4, (0, 0, 0)), (12, (-4, 0, 0)), (16, (-22, 0, 0))],
            "hand_R": [(0, (0, 0, 0)), (4, (-30, 0, 0)), (8, (-30, 0, 0)), (10, (6, 0, 0)), (16, (0, 0, 0))],
            "arm_L": [(0, (0, 0, -6)), (4, (20, 0, -50)), (10, (45, 0, -35)), (16, (0, 0, -6))],
            "spine": [(0, (0, 0, 0)), (4, (8, 0, 0)), (10, (14, -26, 0)), (12, (14, -24, 0)), (16, (0, 0, 0))],
            "thigh_R": [(0, (0, 0, 0)), (4, (-20, 0, 8)), (8, (-20, 0, 8)), (10, (-40, 0, 4)), (12, (-40, 0, 4)), (16, (0, 0, 0))],
            "shin_R": [(0, (0, 0, 0)), (4, (30, 0, 0)), (10, (30, 0, 0)), (16, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, 0)), (4, (-10, 0, -8)), (10, (28, 0, -4)), (12, (28, 0, -4)), (16, (0, 0, 0))],
            "shin_L": [(0, (0, 0, 0)), (4, (25, 0, 0)), (10, (12, 0, 0)), (16, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, 0, 0)), (4, (0, -0.06, 0)), (8, (0, -0.06, 0)), (10, (0, -0.1, -0.22)), (12, (0, -0.1, -0.23)), (16, (0, 0, 0))]},
    }
    return clips


def duelist_decimate(w, ratio):
    dec = w.modifiers.new("dec", "DECIMATE")
    dec.ratio = ratio
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=dec.name)


def duelist_kinds(w):
    img, px = th.tex_lookup(w)
    out = []
    for c in th.face_colors(w, px):
        h, s, v = colorsys.rgb_to_hsv(*[float(x) for x in c])
        if s < 0.2 and v > 0.3:
            out.append("steel")
        elif 0.0 < h < 0.1 and s > 0.3 and v < 0.6:
            out.append("leather")
        else:
            out.append("gold")
    return out


def duelist_fix_rapier(w):
    import bmesh
    me = w.data
    kinds = duelist_kinds(w)
    co = np.array([v.co[:] for v in me.vertices])
    mean = co.mean(axis=0)
    _, _, vt = np.linalg.svd(co - mean, full_matrices=False)
    ax = vt[0]
    steel_v = sorted({i for p, k in zip(me.polygons, kinds) if k == "steel" for i in p.vertices})
    if ((co[steel_v] - mean) @ ax).mean() < 0:
        ax = -ax
    t0 = (co - mean) @ ax
    grip_v = sorted({i for p, k in zip(me.polygons, kinds) if k == "leather" for i in p.vertices if -0.22 < t0[i] < -0.04})
    grip_c = co[grip_v].mean(axis=0)
    tip = co[[i for i in steel_v if t0[i] > 0.4]]
    _, _, vs = np.linalg.svd(tip - tip.mean(axis=0), full_matrices=False)
    d = vs[0] if vs[0] @ ax > 0 else -vs[0]
    grip_c = tip.mean(axis=0) + d * ((grip_c - tip.mean(axis=0)) @ d)
    rel = co - grip_c
    t = rel @ d
    radial = rel - np.outer(t, d)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    kill = [f for f, k in zip(bm.faces, kinds) if k == "leather" and np.linalg.norm(radial[[v.index for v in f.verts]], axis=1).mean() > 0.05]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(me)
    bm.free()
    kinds = duelist_kinds(w)
    co = np.array([v.co[:] for v in me.vertices])
    rel = co - grip_c
    t = rel @ d
    radial = rel - np.outer(t, d)
    blade = np.ones(len(co), dtype=bool)
    for p, k in zip(me.polygons, kinds):
        if k != "steel":
            blade[list(p.vertices)] = False
    tb = t[~blade].max()
    bw = radial[blade & (t > tb + 0.1)]
    _, _, vb = np.linalg.svd(bw - bw.mean(axis=0), full_matrices=False)
    wd = vb[0] - d * (vb[0] @ d)
    wd /= np.linalg.norm(wd)
    bc = bw.mean(axis=0)
    for i in np.where(blade)[0]:
        ramp = min(1.0, max(0.0, (t[i] - tb + 0.1) / 0.12))
        sw = 1.0 - 0.55 * ramp
        a = (radial[i] - bc) @ wd
        r = radial[i] - wd * a * (1 - sw)
        ti = t[i] if t[i] < tb else tb + (t[i] - tb) * 1.7
        co[i] = grip_c + d * ti + r
    me.vertices.foreach_set("co", co.ravel())
    me.update()
    hold = grip_c + d * 0.02
    nz = np.cross(-d, wd)
    R = Matrix((Vector(-d), Vector(wd), Vector(nz)))
    w.data.transform(Matrix.Scale(0.6, 4) @ R.to_4x4() @ Matrix.Translation(-Vector(hold)))


def fix_scabbard_tip(name):
    import bmesh
    body = bpy.data.objects.get(name)
    if not body:
        return
    bm = bmesh.new()
    bm.from_mesh(body.data)
    tip = [f for f in bm.faces if f.calc_center_median().y > 0.55 and f.calc_center_median().z < 0.75 and f.calc_center_median().x > -0.1]
    bmesh.ops.recalc_face_normals(bm, faces=tip)
    for f in list(tip):
        if f.calc_area() < 1e-7:
            tip.remove(f)
    edges = [e for e in bm.edges if e.is_boundary and all(f in tip for f in e.link_faces)]
    if edges:
        bmesh.ops.holes_fill(bm, edges=edges, sides=8)
    bm.to_mesh(body.data)
    bm.free()


def attach_rapier(name, arm, src_path):
    fix_scabbard_tip(name)
    w = th.import_prop(name + "_rapier", src_path, tex=512)
    duelist_fix_rapier(w)
    duelist_decimate(w, 0.35)
    th.place_on_bone(w, arm, "hand_R", (0.0, 0.0, 0.0), (0.0, -0.4, -0.92), 1.0, at=0.45, side=(1, 0, 0))
    w.name = name + "_rapier"
    return w


def attach_baguette(name, arm, src_path):
    w = th.import_prop(name + "_baguette", src_path, tex=256, team_hue=(195, 250))
    duelist_decimate(w, 0.3)
    co = [v.co.copy() for v in w.data.vertices]
    mid = Vector([(min(c[k] for c in co) + max(c[k] for c in co)) / 2 for k in range(3)])
    th.place_on_bone(w, arm, "chest", tuple(mid), (-0.55, 0.0, 1.0), 0.62, at=0.0, side=(0, -1, 0))
    w.data.transform(Matrix.Translation((0.0, 0.27, -0.02)))
    w.name = name + "_baguette"
    return w
