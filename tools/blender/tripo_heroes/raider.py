"""Grim (raider): Tripo body, one Tripo knife mesh bound to both hands."""

CFG = {
    "yaw": -90,
    "height": 1.92,
    "weight": 0.8,
    "tex": 1024,
    "joints": {
        "hip": 0.8,
        "chest": 1.15,
        "neck": 1.42,
        "head_top": 1.86,
        "head_y": -0.03,
        "shoulder": (0.2, 1.33),
        "elbow": (0.42, 1.13),
        "wrist": (0.52, 0.92),
        "finger": (0.575, 0.71),
        "leg_x": 0.165,
        "knee": 0.43,
        "ankle": 0.12,
    },
    "rigid": [
        {"bone": "hips", "box": ((-0.45, 0.17, 0.3), (0.45, 0.5, 1.0))},
        {"bone": "hips", "box": ((-0.37, -0.08, 0.3), (-0.22, 0.5, 1.1))},
        {"bone": "hips", "box": ((0.22, -0.08, 0.3), (0.37, 0.5, 1.1))},
        {"bone": "chest", "box": ((-0.18, -0.5, 1.1), (0.18, 0.3, 1.4))},
    ],
    "team_hue": (195, 250),
    "attach": [("attach_knives", "raider_knife_tripo.glb")],
    "clips": "raider_clips",
}

KNIFE_LEN = 0.7
KNIFE_GRIP = (0.35, 0.0, 0.005)
KNIFE_AXIS = (0.0, -0.45, -1.0)
KNIFE_SIDE = (1.0, 0.0, 0.0)
KNIFE_DECIMATE = 0.25


def raider_clips(clips):
    a = clips["attack_a"]["bones"]
    a["arm_R"] = [(0, (0, 0, 6)), (3, (-135, 0, 40)), (4, (-150, 0, 45)), (6, (-40, 0, -5)), (7, (-25, 0, -10)), (10, (-30, 0, 0)), (14, (0, 0, 6))]
    a["forearm_R"] = [(0, (-22, 0, 0)), (4, (-55, 0, 0)), (6, (0, 0, 0)), (8, (-10, 0, 0)), (14, (-22, 0, 0))]
    c = clips["attack_c"]["bones"]
    c["arm_R"] = [(0, (0, 0, 6)), (4, (-150, 0, 35)), (6, (-165, 0, 40)), (8, (-40, 0, 0)), (9, (-25, 0, 0)), (13, (-35, 0, 0)), (18, (-20, 0, 6))]
    c["arm_L"] = [(0, (0, 0, -6)), (4, (-150, 0, -35)), (6, (-165, 0, -40)), (8, (-40, 0, 0)), (9, (-25, 0, 0)), (13, (-35, 0, 0)), (18, (0, 0, -6))]
    c["forearm_R"] = [(0, (-22, 0, 0)), (6, (-30, 0, 0)), (8, (0, 0, 0)), (18, (-22, 0, 0))]
    c["forearm_L"] = [(0, (-14, 0, 0)), (6, (-30, 0, 0)), (8, (0, 0, 0)), (18, (-14, 0, 0))]
    c["spine"] = [(0, (0, 0, 0)), (6, (-18, 0, 0)), (8, (42, 0, 0)), (9, (46, 0, 0)), (18, (0, 0, 0))]
    return clips


def attach_knives(name, arm, src_path):
    w = th.import_prop(f"{name}_knife", src_path, tex=512)
    w.data.transform(Matrix.Rotation(math.radians(90), 4, "Z"))
    dec = w.modifiers.new("dec", "DECIMATE")
    dec.ratio = KNIFE_DECIMATE
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=dec.name)
    w2 = bpy.data.objects.new(f"{name}_knife_L", w.data.copy())
    bpy.context.scene.collection.objects.link(w2)
    w.name = f"{name}_knives"
    s = KNIFE_SIDE
    th.place_on_bone(w, arm, "hand_R", KNIFE_GRIP, KNIFE_AXIS, KNIFE_LEN, at=0.45, side=s)
    th.place_on_bone(w2, arm, "hand_L", KNIFE_GRIP, (-KNIFE_AXIS[0], KNIFE_AXIS[1], KNIFE_AXIS[2]), KNIFE_LEN, at=0.45, side=(s[0], -s[1], -s[2]))
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    w.select_set(True)
    w2.select_set(True)
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.join()
    return w
