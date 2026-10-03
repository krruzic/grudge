"""Stig costume CALLIOPE STIG: Tripo round fairground calliope mechanic on Stig's rig and clips, Tripo wind-up key in hand_R."""

_en = dict(globals())
exec(open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "engineer.py")).read(), _en)
engineer_clips = _en["engineer_clips"]

CFG = {
    **_en["CFG"],
    "name": "engineer",
    "src": "engineer_calliope_tripo.glb",
    "out": "engineer@calliope",
    "height": 1.9,
    "joints": {
        "hip": 0.5,
        "chest": 0.84,
        "neck": 1.16,
        "head_top": 1.62,
        "head_y": -0.06,
        "shoulder": (0.3, 1.08),
        "elbow": (0.43, 0.9),
        "wrist": (0.49, 0.74),
        "finger": (0.52, 0.55),
        "leg_x": 0.18,
        "knee": 0.25,
        "ankle": 0.09,
    },
    "rigid": [
        {"bone": "chest", "box": ((-0.45, 0.09, 0.2), (0.45, 0.5, 2.0)), "whole": True},
        {"bone": "head", "box": ((-0.26, -0.4, 1.17), (0.26, 0.17, 1.66)), "whole": True},
        {"bone": "chest", "box": ((0.25, -0.2, 1.03), (0.45, 0.12, 1.2)), "whole": True},
        {"bone": "chest", "box": ((-0.45, -0.2, 1.03), (-0.25, 0.12, 1.2)), "whole": True},
        {"bone": "shin_L", "box": ((0.1, -0.25, 0.0), (0.35, 0.1, 0.14)), "whole": True},
        {"bone": "shin_R", "box": ((-0.35, -0.25, 0.0), (-0.1, 0.1, 0.14)), "whole": True},
    ],
    "team_hue": (195, 250),
    "team_box": ((-0.32, -0.55, 0.6), (0.32, 0.1, 1.2)),
    "attach": [("attach_key", "engineer_calliope_key_tripo.glb")],
}

GLUE = ((-0.26, -0.5, 0.65), (0.26, -0.37, 1.0))
DROP = [((0.16, -0.2, 0.8), (0.32, 0.2, 1.18)), ((-0.32, -0.2, 0.8), (-0.16, 0.2, 1.18))]
KEY_SCALE = 0.8
KEY_GRIP_X = 0.2


def weld_small_islands(body):
    from mathutils.kdtree import KDTree
    me = body.data
    names = {g.index: g.name for g in body.vertex_groups}
    isl = sorted(th.mesh_islands(me), key=len)
    main = isl.pop()
    kd = KDTree(len(main))
    for i in main:
        kd.insert(me.vertices[i].co, i)
    kd.balance()
    (x0, y0, z0), (x1, y1, z1) = GLUE
    for part in isl:
        c = sum((me.vertices[i].co for i in part), Vector()) / len(part)
        if x0 <= c.x <= x1 and y0 <= c.y <= y1 and z0 <= c.z <= z1:
            ws = [(names[g.group], g.weight) for g in me.vertices[kd.find(c)[1]].groups]
            for g in body.vertex_groups:
                g.remove(part)
            for n, wt in ws:
                body.vertex_groups[n].add(part, wt, "REPLACE")
            continue
        tot = {}
        for i in part:
            for g in me.vertices[i].groups:
                tot[names[g.group]] = tot.get(names[g.group], 0.0) + g.weight
        best = max(tot, key=tot.get)
        for g in body.vertex_groups:
            g.remove(part)
        body.vertex_groups[best].add(part, 1.0, "REPLACE")
    inb = lambda c, b: all(b[0][k] <= c[k] <= b[1][k] for k in range(3))
    drop = [i for part in isl for b in DROP if all(inb(me.vertices[i].co, b) for i in part) for i in part]
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in set(drop)], context="VERTS")
    bm.to_mesh(me)
    bm.free()


def attach_key(name, arm, src_path):
    weld_small_islands(bpy.data.objects[name])
    w = th.import_prop(name + "_wrench", src_path)
    w.data.transform(Matrix(((0, 1, 0, 0), (0, 0, 1, 0), (1, 0, 0, 0), (0, 0, 0, 1))))
    co = np.array([v.co[:] for v in w.data.vertices])
    mid = (co.min(0) + co.max(0)) / 2
    w.data.transform(Matrix.Scale(1.0 / (co[:, 0].max() - co[:, 0].min()), 4) @ Matrix.Translation(Vector(-mid)))
    co = np.array([v.co[:] for v in w.data.vertices])
    sh = co[co[:, 0] > 0.05]
    r = (sh[:, 2].max() - sh[:, 2].min()) / 2
    grip = (KEY_GRIP_X, float(sh[:, 1].max() - r), float((sh[:, 2].min() + sh[:, 2].max()) / 2))
    th.place_on_bone(w, arm, "hand_R", grip, (0.0, -0.45, 0.9), KEY_SCALE, at=0.55, side=(1, 0, 0))
    w.name = name + "_wrench"
    return w
