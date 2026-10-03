"""Wren (marksman): Tripo body, procedural bow in hand_L and arrow shafts for the quiver."""
import build_heroes as bh  # noqa: E402

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
    "extras": "marksman_extras",
}


def marksman_extras(name, arm, images):
    B = {b.name: (tuple(b.head_local), tuple(b.tail_local), b.parent.name if b.parent else None) for b in arm.data.bones}
    c = th.charkit.Char(name + "_gear", images)
    import build_heroes as bh
    WOOD = (0.75, 0.5, 0.3)
    LTH_DK = (0.36, 0.24, 0.16)
    CREAM = (1.15, 1.05, 0.88)
    h0, h1, _ = B["hand_L"]
    g = Vector(h0) + (Vector(h1) - Vector(h0)) * 0.45
    gx, gy, gz = g.x, g.y, g.z
    n = 24
    pts, rad = [], []
    for k in range(n + 1):
        t = k / n * 2 - 1
        bulge = 0.2 * (1 - t * t)
        recurve = 0.07 * max(0.0, abs(t) - 0.78) / 0.22
        pts.append((gx, gy - 0.02 - bulge + recurve * 2.2 + 0.2, gz + 0.16 + 0.86 * t))
        rad.append(0.026 - 0.016 * abs(t) ** 1.3 + (0.008 if abs(t) < 0.1 else 0.0))
    bh.tube(c, pts, rad, "wood", "hand_L", segs=7, shade=WOOD, cap=True)
    for t in (-0.09, -0.03, 0.03, 0.09):
        bh.ring(c, 0.032, 0.006, (gx, gy, gz + 0.16 + 0.86 * t), "leather", "hand_L", segs=8, shade=LTH_DK)
    for sgn in (-1, 1):
        tp = Vector(pts[0 if sgn < 0 else -1])
        c.cone(0.014, 0.0, 0.07, tuple(tp + Vector((0, -0.01, 0.03 * sgn))), "bone", "hand_L", segs=5, rot=(0 if sgn > 0 else math.pi, 0, 0), shade=CREAM)
        bh.ring(c, 0.016, 0.005, tuple(Vector(pts[2 if sgn < 0 else -3])), "gold", "hand_L", segs=8)
    c.limb(tuple(Vector(pts[1])), tuple(Vector(pts[-2])), 0.0035, 0.0035, "plain", "hand_L", segs=4, shade=(1.1, 1.05, 0.95))
    q0, q1 = Vector((-0.19, 0.2, 1.36)), Vector((-0.31, 0.165, 1.63))
    for k in range(5):
        a = k / 5 * math.tau
        off = Vector((math.cos(a) * 0.022, math.sin(a) * 0.022, math.sin(a) * 0.015))
        c.limb(tuple(q0 + off), tuple(q1 + off * 1.3 + Vector((0, 0, 0.01 * (k % 2)))), 0.008, 0.008, "wood", "chest", segs=4, shade=WOOD)
    return c
