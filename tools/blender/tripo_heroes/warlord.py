"""Warlord: Tripo ogre body, Tripo spiked club in hand_R."""

CFG = {
    "yaw": -90,
    "height": 2.4,
    "weight": 1.2,
    "tex": 1024,
    "joints": {
        "hip": 0.95,
        "chest": 1.35,
        "neck": 1.8,
        "head_top": 2.4,
        "head_y": -0.07,
        "shoulder": (0.33, 1.65),
        "elbow": (0.58, 1.32),
        "wrist": (0.61, 1.0),
        "finger": (0.62, 0.72),
        "leg_x": 0.24,
        "knee": 0.5,
        "ankle": 0.15,
    },
    "rigid": [
        {"bone": "chest", "box": ((-0.85, -0.4, 1.53), (-0.27, 0.45, 1.97))},
        {"bone": "chest", "box": ((-0.85, -0.4, 1.85), (-0.4, 0.45, 2.12))},
        {"bone": "chest", "box": ((0.27, -0.4, 1.53), (0.85, 0.45, 1.97))},
        {"bone": "chest", "box": ((0.4, -0.4, 1.85), (0.85, 0.45, 2.12))},
        {"bone": "hips", "box": ((-0.17, -0.45, 0.5), (0.17, -0.2, 0.98)), "hue": (195, 250), "sat": 0.25},
    ],
    "team_hue": (195, 250),
    "attach": [("attach_club", "warlord_club_tripo.glb")],
    "clips": "warlord_clips",
}


def attach_club(name, arm, src_path):
    w = th.import_prop(name + "_club", src_path)
    w.data.transform(Matrix.Rotation(math.radians(90), 4, "Z"))
    dec = w.modifiers.new("dec", "DECIMATE")
    dec.ratio = 0.35
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=dec.name)
    th.place_on_bone(w, arm, "hand_R", (0.3, 0.004, 0.003), (0.0, -0.85, -0.5), 1.15, at=0.5)
    w.name = name + "_club"
    return w


def warlord_clips(clips):
    g = (0, -60, 0)
    clips["cast"]["bones"]["hand_R"] = [(0, (0, 0, 0)), (3, g), (7, g), (9, (0, 0, 0)), (18, (0, 0, 0))]
    clips["block"]["bones"]["hand_R"] = [(0, g), (8, g)]
    return clips
