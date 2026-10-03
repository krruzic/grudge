"""Warlord costume IRON COLOSSUS: Tripo steam-automaton body on the Warlord rig and clips, Tripo steam hammer in hand_R (haft bridged)."""

_wl = dict(globals())
exec(open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "warlord.py")).read(), _wl)
warlord_clips = _wl["warlord_clips"]

CFG = {
    **_wl["CFG"],
    "name": "warlord",
    "src": "warlord_colossus_tripo.glb",
    "out": "warlord@colossus",
    "vivid": {"hue": (290, 345), "to": 312, "pull": 0.3, "sat": 1.2, "val": 1.18},
    "joints": {
        "hip": 0.95,
        "chest": 1.38,
        "neck": 1.86,
        "head_top": 2.4,
        "head_y": 0.0,
        "shoulder": (0.4, 1.7),
        "elbow": (0.6, 1.36),
        "wrist": (0.66, 1.0),
        "finger": (0.68, 0.7),
        "leg_x": 0.26,
        "knee": 0.52,
        "ankle": 0.16,
    },
    "rigid": [
        {"bone": "shin_L", "box": ((0.02, -0.7, -0.1), (0.8, 0.6, 0.24))},
        {"bone": "shin_R", "box": ((-0.8, -0.7, -0.1), (-0.02, 0.6, 0.24))},
        {"bone": "head", "box": ((-0.36, -0.5, 1.84), (0.36, 0.5, 2.45)), "whole": True},
        {"bone": "chest", "box": ((0.15, -0.35, 1.55), (0.7, 0.45, 2.2)), "whole": True},
        {"bone": "chest", "box": ((-0.7, -0.35, 1.55), (-0.15, 0.45, 2.2)), "whole": True},
        {"bone": "chest", "box": ((-0.25, -0.5, 1.3), (0.25, -0.2, 1.8)), "whole": True},
        {"bone": "hips", "box": ((-0.35, -0.5, 0.5), (0.35, -0.1, 1.3)), "whole": True},
    ],
    "attach": [("attach_hammer", "warlord_colossus_hammer_tripo.glb")],
}

HAMMER_POMMEL = (0.142, -0.485, -0.483)
HAMMER_GRIP_TOP = (0.072, -0.215, -0.209)
HAMMER_COLLAR = (0.003, 0.12, 0.13)
HAMMER_HEAD = (-0.686, -0.534, 0.495)


def attach_hammer(name, arm, src_path):
    w = th.import_prop(name + "_club", src_path)
    img, px = th.tex_lookup(w)
    cols = th.face_colors(w, px)
    uv = w.data.uv_layers.active.data
    g0, g1 = Vector(HAMMER_GRIP_TOP), Vector(HAMMER_COLLAR)
    pick, best = None, 1e9
    for p, c in zip(w.data.polygons, cols):
        mx, mn = float(max(c)), float(min(c))
        if mx < 0.12 or mx > 0.45 or (mx - mn) / mx > 0.25:
            continue
        d = (p.center - g0).length
        if d < best:
            best = d
            pick = (sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total, sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total)
    th.bridge(w, g0 - (g1 - g0).normalized() * 0.03, g1, 0.034, px, pick)
    a = (g1 - Vector(HAMMER_POMMEL)).normalized()
    h = Vector(HAMMER_HEAD)
    h = (h - a * h.dot(a)).normalized()
    r1, r2 = -a, -h
    R0 = Matrix((r1, r2, r1.cross(r2))).to_4x4()
    grip = Vector(HAMMER_POMMEL) + a * 0.24
    w.data.transform(R0 @ Matrix.Translation(-grip))
    th.place_on_bone(w, arm, "hand_R", (0, 0, 0), (0.0, -0.85, -0.5), 1.12, at=0.5, side=(0, -0.5, 0.85))
    w.name = name + "_club"
    return w
