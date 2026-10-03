"""Francois costume THE DROWNED CAPTAIN: gaunt Tripo drowned-captain body on the duelist rig and clips, Tripo narwhal-tusk rapier in hand_R and a swordfish (replaces the baguette) across his back."""

_du = dict(globals())
exec(open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "duelist.py")).read(), _du)
duelist_clips = _du["duelist_clips"]
duelist_decimate = _du["duelist_decimate"]

CFG = {
    **_du["CFG"],
    "name": "duelist",
    "src": "duelist_drowned_tripo.glb",
    "out": "duelist@drowned",
    "weld": 0.005,
    "joints": {
        "hip": 0.97,
        "chest": 1.3,
        "neck": 1.6,
        "head_top": 2.0,
        "head_y": -0.04,
        "shoulder": (0.2, 1.5),
        "elbow": (0.34, 1.27),
        "wrist": (0.47, 1.02),
        "finger": (0.55, 0.8),
        "leg_x": 0.14,
        "knee": 0.55,
        "ankle": 0.13,
    },
    "rigid": [
        {"bone": "head", "box": ((-0.32, -0.4, 1.68), (0.32, 0.4, 2.2))},
        {"bone": "head", "box": ((-0.4, -0.45, 1.6), (0.4, 0.45, 2.2)), "whole": True},
        {"bone": "chest", "box": ((-0.42, -0.4, 1.4), (-0.08, 0.4, 1.85)), "whole": True},
        {"bone": "chest", "box": ((0.1, -0.25, 1.38), (0.35, 0.1, 1.62)), "whole": True},
        {"bone": "chest", "box": ((-0.4, 0.0, 0.46), (0.0, 0.4, 1.58)), "whole": True},
        {"bone": "shin_L", "box": ((0.0, -0.4, -0.01), (0.6, 0.4, 0.53)), "whole": True},
        {"bone": "shin_R", "box": ((-0.6, -0.4, -0.01), (0.0, 0.4, 0.53)), "whole": True},
        {"bone": "hips", "box": ((0.12, -0.4, 0.38), (0.46, 0.15, 1.12)), "whole": True},
        {"bone": "shin_L", "box": ((0.15, -0.15, 0.38), (0.3, 0.1, 0.53)), "whole": True},
    ],
    "team_hue": (203, 236),
    "team_box": ((-9, -9, -9), (9, 9, 1.66)),
    "attach": [("attach_tusk", "duelist_drowned_props_tripo.glb"), ("attach_swordfish", "duelist_drowned_props_tripo.glb")],
    "clips": "duelist_clips",
}

TUSK_GRIP = (0.042, -0.4, 0.262)
TUSK_LEN = 0.98
FISH_LEN = 0.98


def drowned_half(name, src_path, keep_top, tex):
    import bmesh
    bpy.ops.import_scene.gltf(filepath=src_path)
    w = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    for o in list(bpy.context.selected_objects):
        if o is not w:
            bpy.data.objects.remove(o, do_unlink=True)
    w.parent = None
    w.data.transform(w.matrix_world)
    w.matrix_world = Matrix.Identity(4)
    bm = bmesh.new()
    bm.from_mesh(w.data)
    kill = [f for f in bm.faces if (f.calc_center_median().z > 0.07) != keep_top]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(w.data)
    bm.free()
    img, px = th.tex_lookup(w)
    th.bake_material(name, w, {"tex": tex}, img, px, th.face_colors(w, px))
    return w


def attach_tusk(name, arm, src_path):
    w = drowned_half(name + "_rapier", src_path, True, 512)
    duelist_decimate(w, 0.3)
    R = Matrix(((0, -1, 0), (0, 0, 1), (-1, 0, 0))).to_4x4()
    w.data.transform(R @ Matrix.Translation(-Vector(TUSK_GRIP)))
    th.place_on_bone(w, arm, "hand_R", (0.0, 0.0, 0.0), (0.0, -0.4, -0.92), TUSK_LEN, at=0.45, side=(1, 0, 0))
    w.name = name + "_rapier"
    return w


def attach_swordfish(name, arm, src_path):
    w = drowned_half(name + "_baguette", src_path, False, 512)
    duelist_decimate(w, 0.5)
    co = [v.co.copy() for v in w.data.vertices]
    mid = Vector([(min(c[k] for c in co) + max(c[k] for c in co)) / 2 for k in range(3)])
    R = Matrix(((0, 1, 0), (1, 0, 0), (0, 0, -1))).to_4x4()
    w.data.transform(R @ Matrix.Translation(-mid))
    th.place_on_bone(w, arm, "chest", (0.0, 0.0, 0.0), (-0.55, 0.0, 1.0), FISH_LEN, at=0.0, side=(0, -1, 0))
    w.data.transform(Matrix.Translation((0.0, 0.11, 0.0)))
    w.name = name + "_baguette"
    return w
