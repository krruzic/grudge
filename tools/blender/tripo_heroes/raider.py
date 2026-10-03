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


REST = {"arm_R": (0, 0, 6), "arm_L": (0, 0, -6), "forearm_R": (-22, 0, 0), "forearm_L": (-14, 0, 0)}


def _mirror(clip):
    swap = {"_R": "_L", "_L": "_R"}
    out = {}
    for part, bones in clip.items():
        out[part] = {}
        for b, keys in bones.items():
            nb = b[:-2] + swap[b[-2:]] if b[-2:] in swap else b
            if part == "loc":
                out[part][nb] = [(f, (-x, y, z)) for f, (x, y, z) in keys]
            else:
                out[part][nb] = [(f, (x, -y, -z)) for f, (x, y, z) in keys]
    return out


def _slash_r():
    return {
        "bones": {
            "arm_R": [(0, (-70, 85, -15)), (2, (-95, 15, 0)), (4, (-85, -65, 0)), (8, (-78, -80, 0)), (11, (-65, -65, 5)), (20, REST["arm_R"])],
            "forearm_R": [(0, (-10, 0, 0)), (2, (-5, 0, 0)), (4, (0, 0, 0)), (11, (-15, 0, 0)), (20, REST["forearm_R"])],
            "arm_L": [(0, (-45, 0, -30)), (3, (-30, 0, -40)), (11, (-30, 0, -30)), (20, REST["arm_L"])],
            "forearm_L": [(0, (-45, 0, 0)), (3, (-28, 0, 0)), (11, (-28, 0, 0)), (20, REST["forearm_L"])],
            "spine": [(0, (-4, -38, 0)), (2, (12, 5, 0)), (4, (18, 42, 0)), (8, (20, 48, 0)), (11, (14, 38, 0)), (20, (0, 0, 0))],
            "head": [(0, (0, 22, 0)), (2, (-6, 0, 0)), (4, (-10, -24, 0)), (11, (-8, -20, 0)), (20, (0, 0, 0))],
            "thigh_R": [(0, (-8, 0, 4)), (2, (-40, 0, 6)), (11, (-38, 0, 6)), (20, (0, 0, 0))],
            "shin_R": [(0, (10, 0, 0)), (2, (35, 0, 0)), (11, (35, 0, 0)), (20, (0, 0, 0))],
            "thigh_L": [(0, (0, 0, -4)), (2, (25, 0, -4)), (11, (22, 0, -4)), (20, (0, 0, 0))],
            "shin_L": [(0, (10, 0, 0)), (2, (30, 0, 0)), (11, (30, 0, 0)), (20, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, -0.03, 0)), (2, (0, -0.1, 0)), (11, (0, -0.1, 0)), (20, (0, 0, 0))]},
    }


def _finisher():
    return {
        "bones": {
            "hips": [(0, (0, -25, 0)), (2, (0, 40, 0)), (4, (0, 150, 0)), (6, (0, 260, 0)), (8, (0, 340, 0)), (10, (0, 360, 0)), (28, (0, 360, 0))],
            "arm_R": [(0, (-55, -45, 10)), (2, (-30, 0, 80)), (8, (-20, 0, 88)), (10, (-85, 25, 10)), (12, (-70, -35, 0)), (17, (-65, -30, 0)), (28, REST["arm_R"])],
            "arm_L": [(0, (-55, 45, -10)), (2, (-30, 0, -80)), (8, (-20, 0, -88)), (10, (-85, -25, -10)), (12, (-70, 35, 0)), (17, (-65, 30, 0)), (28, REST["arm_L"])],
            "forearm_R": [(0, (-70, 0, 0)), (2, (0, 0, 0)), (10, (-10, 0, 0)), (12, (0, 0, 0)), (17, (-10, 0, 0)), (28, REST["forearm_R"])],
            "forearm_L": [(0, (-70, 0, 0)), (2, (0, 0, 0)), (10, (-10, 0, 0)), (12, (0, 0, 0)), (17, (-10, 0, 0)), (28, REST["forearm_L"])],
            "spine": [(0, (25, -20, 0)), (2, (-8, 15, 0)), (8, (-5, 10, 0)), (10, (20, 0, 0)), (12, (34, 0, 0)), (17, (30, 0, 0)), (28, (0, 0, 0))],
            "head": [(0, (-15, 15, 0)), (2, (5, -10, 0)), (12, (-22, 0, 0)), (17, (-20, 0, 0)), (28, (0, 0, 0))],
            "thigh_R": [(0, (-45, 0, 8)), (2, (-15, 0, 15)), (8, (-25, 0, 15)), (11, (-55, 0, 8)), (17, (-55, 0, 8)), (28, (0, 0, 0))],
            "thigh_L": [(0, (-45, 0, -8)), (2, (-10, 0, -15)), (8, (-20, 0, -15)), (11, (25, 0, -6)), (17, (22, 0, -6)), (28, (0, 0, 0))],
            "shin_R": [(0, (70, 0, 0)), (2, (20, 0, 0)), (8, (40, 0, 0)), (11, (60, 0, 0)), (17, (60, 0, 0)), (28, (0, 0, 0))],
            "shin_L": [(0, (70, 0, 0)), (2, (20, 0, 0)), (8, (40, 0, 0)), (11, (45, 0, 0)), (17, (45, 0, 0)), (28, (0, 0, 0))],
        },
        "loc": {"hips": [(0, (0, -0.16, 0)), (2, (0, 0.06, 0)), (5, (0, 0.16, 0)), (8, (0, 0.08, 0)), (11, (0, -0.17, 0)), (17, (0, -0.16, 0)), (28, (0, 0, 0))]},
    }


def raider_clips(clips):
    clips["attack_a"] = _slash_r()
    clips["attack_b"] = _mirror(_slash_r())
    clips["attack_c"] = _finisher()
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
