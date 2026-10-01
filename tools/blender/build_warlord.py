"""Warlord: ogre champion of House Grudgeholm. Big head, bigger club.

Run inside Blender (MCP): exec(open(".../tools/blender/build_warlord.py").read())
Exports assets/heroes/warlord.glb and turntable renders to assets/renders/.
"""
import importlib
import math
import os
import sys

import bmesh
import bpy

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import anims  # noqa: E402
import charkit  # noqa: E402
import texgen  # noqa: E402

importlib.reload(texgen)
importlib.reload(charkit)
importlib.reload(anims)

NAME = "warlord"
SKIN = "skin"
IRON = "iron"
TEAM = "team_cloth"
PAINT = "team_paint"

BONES = {
    "root": ((0, 0, 0), (0, 0, 0.3), None),
    "hips": ((0, 0, 0.82), (0, 0, 1.0), "root"),
    "spine": ((0, 0, 1.0), (0, 0, 1.25), "hips"),
    "chest": ((0, 0, 1.25), (0, 0, 1.5), "spine"),
    "head": ((0, -0.05, 1.55), (0, -0.05, 1.9), "chest"),
}
for side, sx in (("R", -1), ("L", 1)):
    BONES[f"arm_{side}"] = ((0.6 * sx, 0, 1.42), (0.7 * sx, -0.01, 1.02), "chest")
    BONES[f"forearm_{side}"] = ((0.7 * sx, -0.01, 1.02), (0.72 * sx, -0.06, 0.68), f"arm_{side}")
    BONES[f"hand_{side}"] = ((0.72 * sx, -0.06, 0.68), (0.72 * sx, -0.07, 0.5), f"forearm_{side}")
    BONES[f"thigh_{side}"] = ((0.22 * sx, 0, 0.84), (0.22 * sx, -0.01, 0.48), "hips")
    BONES[f"shin_{side}"] = ((0.22 * sx, -0.01, 0.48), (0.22 * sx, 0, 0.12), f"thigh_{side}")


def build(images):
    import build_heroes as bh
    importlib.reload(bh)
    from mathutils import Vector
    c = charkit.Char(NAME, images)
    OG = "ogre"
    FUR = (1.25, 0.4, 0.05)
    FUR_D = (0.85, 0.24, 0.03)
    LTH = (0.7, 0.6, 0.55)
    VOID = (0.05, 0.03, 0.03)
    TOOTH = (1.0, 0.95, 0.8)

    hc = Vector((0, -0.08, 1.7))
    hf = bh.human_head(w=0.4, d=0.37, h=0.25, face=0.32, jaw=-0.25, chin=0.07)
    c.ico(1.0, tuple(hc), OG, "head", sub=3, deform=hf)

    def surf(xr, zr, out=0.0):
        y = -math.sqrt(max(0.0, 1 - xr * xr - zr * zr))
        return hc + hf(Vector((xr, y, zr))) + Vector((0, -out, 0))

    bh.tube(c, [surf(-0.62, 0.2, 0.02), surf(-0.25, 0.26, 0.035), surf(0.0, 0.23, 0.035), surf(0.25, 0.26, 0.035), surf(0.62, 0.2, 0.02)], [0.03, 0.04, 0.036, 0.04, 0.03], OG, "head", segs=7, shade=(0.85, 0.9, 0.85))
    for sx in (-1, 1):
        e = surf(0.3 * sx, 0.06, 0.0)
        c.ico(1.0, tuple(e), "plain", "head", sub=2, scale=(0.034, 0.012, 0.022), shade=(1.1, 1.05, 0.7))
        c.ico(1.0, tuple(e + Vector((0.004 * -sx, -0.009, 0.0))), "plain", "head", sub=1, scale=(0.014, 0.005, 0.016), shade=(1.2, 0.85, 0.15))
        c.ico(1.0, tuple(e + Vector((0.004 * -sx, -0.013, 0.0))), "plain", "head", sub=1, scale=(0.006, 0.002, 0.009), shade=VOID)
        lid = [e + Vector((-0.036 * sx * k, -0.004 - 0.005 * (1 - abs(k)), 0.016 + 0.004 * (1 - abs(k)))) for k in (-1, 0, 1)]
        bh.tube(c, lid, [0.008, 0.012, 0.008], OG, "head", segs=5, shade=(0.75, 0.82, 0.75), cap=False)
        c.ico(0.1, tuple(Vector((0.4 * sx, -0.1, 1.72))), OG, "head", sub=2, scale=(0.5, 1.0, 1.3))
        bh.tube(c, [(0.44 * sx, -0.06, 1.8), (0.55 * sx, -0.04, 1.88), (0.6 * sx, -0.02, 1.95)], [0.06, 0.035, 0.0], OG, "head", segs=6)
        bh.ring(c, 0.04, 0.01, (0.46 * sx, -0.14, 1.62), "gold", "head", rot=(1.57, 0, 0.3 * sx), segs=10)
    nose = surf(0.0, -0.15, 0.07)
    c.ico(1.0, tuple(nose), OG, "head", sub=2, scale=(0.09, 0.07, 0.06), shade=(0.92, 0.95, 0.88))
    for sx in (-1, 1):
        c.ico(1.0, tuple(nose + Vector((0.04 * sx, -0.02, -0.035))), "plain", "head", sub=1, scale=(0.018, 0.016, 0.01), shade=VOID)
    jaw = surf(0.0, -0.7, 0.05)
    c.ico(1.0, tuple(jaw), OG, "head", sub=2, scale=(0.27, 0.1, 0.1))
    mouth = [surf(-0.42, -0.42, 0.02), surf(-0.2, -0.48, 0.045), surf(0.0, -0.49, 0.055), surf(0.2, -0.48, 0.045), surf(0.42, -0.42, 0.02)]
    bh.tube(c, mouth, [0.012, 0.018, 0.02, 0.018, 0.012], "plain", "head", segs=6, shade=VOID, cap=False)
    for k in range(6):
        x = (k - 2.5) * 0.045
        c.cone(0.018, 0.008, 0.035, tuple(surf(x / 0.4, -0.53, 0.065)), "bone", "head", segs=5, rot=(0, 0, 0), shade=TOOTH)
    for sx in (-1, 1):
        t0 = surf(0.3 * sx, -0.58, 0.08)
        bh.tube(c, [t0, t0 + Vector((0.01 * sx, -0.02, 0.07)), t0 + Vector((0.025 * sx, -0.015, 0.13))], [0.03, 0.022, 0.0], "bone", "head", segs=7, shade=TOOTH)

    c.lathe([(0.0, 1.82), (0.43, 1.82), (0.45, 1.88), (0.44, 1.96), (0.39, 2.06), (0.28, 2.13), (0.14, 2.17), (0.0, 2.18)], (0, -0.08, 0), IRON, "head", segs=18, sx=1.1)
    c.lathe([(0.45, 1.8), (0.48, 1.84), (0.48, 1.9), (0.45, 1.94)], (0, -0.08, 0), PAINT, "head", segs=18, sx=1.1)
    for k in range(12):
        a = k / 12 * math.tau
        c.ico(0.018, (math.cos(a) * 0.53, -0.08 + math.sin(a) * 0.485, 1.87), IRON, "head", sub=1, shade=(1.3, 1.3, 1.35))
    bh.tube(c, [(0, -0.56, 1.98), (0, -0.4, 2.12), (0, -0.08, 2.2), (0, 0.25, 2.1)], [0.025] * 4, IRON, "head", segs=6, shade=(1.2, 1.2, 1.25))
    for sx in (-1, 1):
        horn = [(0.42 * sx, -0.08, 2.0), (0.58 * sx, -0.1, 2.06), (0.72 * sx, -0.12, 2.2), (0.76 * sx, -0.14, 2.36), (0.7 * sx, -0.15, 2.5)]
        bh.tube(c, horn, [0.1, 0.08, 0.06, 0.035, 0.0], "bone", "head", segs=9, shade=(1.0, 0.95, 0.85))
        for k in (1, 2):
            bh.ring(c, (0.085, 0.065)[k - 1], 0.012, tuple(Vector(horn[k])), IRON, "head", rot=(0, (1.1, 0.7)[k - 1] * sx, 0), segs=12)

    bh.folded(c, [(0.4, 0.96), (0.5, 1.1), (0.56, 1.3), (0.54, 1.46), (0.34, 1.56), (0.0, 1.58)], (0, 0.02, 0), "hair", "chest", segs=24, folds=10, amp=0.05, sy=0.78, shade=FUR)
    rows = bh.cloak_rows(1.1, 0.86, 0.5, 0.52, 0.0, math.tau, 26, 2, cy=0.02, tatter=0.06, seed=9)
    rows = [[(x, y * 0.8, z) for x, y, z in r] for r in rows]
    bh.sheet(c, rows, "hair", "spine", thick=0.03, shade=FUR_D)
    sash = [(-0.56, -0.3, 1.5), (-0.2, -0.43, 1.32), (0.2, -0.42, 1.12), (0.5, -0.3, 0.98)]
    bh.tube(c, sash, [0.07] * 4, TEAM, "chest", segs=7)
    bk = [(-0.56, 0.3, 1.5), (-0.2, 0.45, 1.32), (0.2, 0.44, 1.12), (0.5, 0.3, 0.98)]
    bh.tube(c, bk, [0.07] * 4, TEAM, "chest", segs=7, shade=(0.8, 0.8, 0.8))
    bh.skull(c, 0.06, (-0.02, -0.5, 1.26), "chest")
    for sx in (-1, 1):
        c.lathe([(0.0, 0.16), (0.2, 0.14), (0.28, 0.06), (0.3, -0.02), (0.26, -0.08), (0.2, -0.06)], (0.6 * sx, 0.0, 1.42), IRON, "chest", segs=14, sx=1.0, sy=1.15, rot=(0, 0.35 * sx, 0))
        c.lathe([(0.3, -0.02), (0.315, -0.04), (0.29, -0.09), (0.27, -0.08)], (0.6 * sx, 0.0, 1.42), PAINT, "chest", segs=14, sy=1.15, caps=False, rot=(0, 0.35 * sx, 0))
        for k in range(3):
            a = (k - 1) * 0.5
            c.cone(0.04, 0.0, 0.16, (0.66 * sx + math.sin(a) * 0.05, math.sin(a) * 0.15, 1.6), "bone", "chest", segs=6, rot=(a * 0.6, -0.3 * sx, 0))
        bh.tube(c, [(0.4 * sx, -0.25, 1.35), (0.55 * sx, -0.3, 1.25)], [0.025, 0.025], "leather", "chest", segs=5, shade=LTH)
    c.lathe([(0.47, 0.84), (0.51, 0.9), (0.51, 1.0), (0.47, 1.06)], (0, 0.02, 0), "leather", "hips", segs=20, sy=0.82, shade=LTH)
    c.box((0.24, 0.07, 0.18), (0, -0.43, 0.95), "gold", "hips")
    c.box((0.12, 0.08, 0.09), (0, -0.45, 0.95), "leather", "hips", shade=(0.5, 0.4, 0.3))
    for sx in (-1, 1):
        c.tbox((0.16, 0.1), (0.15, 0.09), 0.16, (0.4 * sx, -0.25, 0.76), "leather", "hips", rot=(0, 0, 0.45 * sx), shade=(0.55, 0.42, 0.32))
        c.box((0.165, 0.105, 0.05), (0.4 * sx, -0.255, 0.92), "leather", "hips", rot=(0, 0, 0.45 * sx), shade=LTH)
    for k, x in enumerate((-0.25, 0.22, 0.32)):
        bh.tube(c, [(x, -0.4, 0.88), (x + 0.01, -0.42, 0.74)], [0.008, 0.008], "leather", "hips", segs=4, shade=LTH)
        c.lathe_ab([(0.02, 0.0), (0.03, 0.15), (0.015, 0.5), (0.03, 0.85), (0.02, 1.0)], (x + 0.01, -0.42, 0.74), (x + 0.02, -0.44, 0.6), "bone", "hips", segs=6, shade=TOOTH)
    bh.folded(c, [(0.46, 0.9), (0.52, 0.72), (0.6, 0.5)], (0, 0.02, 0), "hair", "hips", segs=22, folds=9, amp=0.06, sy=0.78, shade=FUR_D)
    flap = [[(x, -0.47 - 0.05 * (0.9 - z), z) for x in (-0.18, -0.06, 0.06, 0.18)] for z in (0.9, 0.62, 0.36)]
    flap[-1] = [(x, y, z - (0.05 if k in (1, 2) else 0.0)) for k, (x, y, z) in enumerate(flap[-1])]
    bh.sheet(c, flap, TEAM, "hips", thick=0.02)
    bh.tube(c, flap[-1], [0.014] * 4, "gold", "hips", segs=5)

    for side, sx in (("R", -1), ("L", 1)):
        a0, a1 = (0.6 * sx, 0, 1.44), (0.7 * sx, -0.01, 1.02)
        mid = ((a0[0] + a1[0]) / 2 + 0.03 * sx, -0.04, (a0[2] + a1[2]) / 2)
        bh.tube(c, [a0, mid, a1], [0.17, 0.2, 0.15], OG, f"arm_{side}", segs=10)
        c.ico(0.15, a1, OG, f"forearm_{side}", sub=2)
        f0, f1 = (0.7 * sx, -0.01, 1.04), (0.72 * sx, -0.06, 0.66)
        bh.tube(c, [f0, ((f0[0] + f1[0]) / 2, -0.04, 0.86), f1], [0.15, 0.165, 0.14], OG, f"forearm_{side}", segs=10)
        c.lathe([(0.17, 0.0), (0.195, 0.05), (0.2, 0.2), (0.175, 0.25)], (0.715 * sx, -0.045, 0.66), IRON, f"forearm_{side}", segs=14)
        for k in range(4):
            a = -math.pi / 2 + (k - 1.5) * 0.7
            c.cone(0.03, 0.0, 0.1, (0.715 * sx + math.cos(a) * 0.2, -0.045 + math.sin(a) * 0.2, 0.8), "bone", f"forearm_{side}", segs=5, rot=(math.sin(a) * 1.5, -math.cos(a) * 1.5, 0))
        c.ico(0.17, (0.72 * sx, -0.08, 0.56), OG, f"hand_{side}", sub=2, scale=(1.0, 1.05, 1.0))
        for k in range(4):
            fx = 0.72 * sx + (k - 1.5) * 0.065
            bh.tube(c, [(fx, -0.18, 0.56), (fx, -0.26, 0.5), (fx, -0.24, 0.42)], [0.045, 0.04, 0.03], OG, f"hand_{side}", segs=6)
        bh.tube(c, [(0.72 * sx - 0.14 * sx, -0.14, 0.6), (0.72 * sx - 0.16 * sx, -0.24, 0.56), (0.72 * sx - 0.12 * sx, -0.28, 0.5)], [0.05, 0.042, 0.03], OG, f"hand_{side}", segs=6)
        t0, t1 = (0.22 * sx, 0, 0.84), (0.23 * sx, -0.01, 0.48)
        bh.tube(c, [t0, ((t0[0] + t1[0]) / 2, -0.02, 0.66), t1], [0.19, 0.2, 0.16], OG, f"thigh_{side}", segs=10)
        for k in range(3):
            bh.ring(c, 0.19, 0.03, (0.23 * sx, -0.02, 0.3 + k * 0.09), "hair", f"shin_{side}", segs=14, tsegs=5, shade=FUR_D if k % 2 else FUR)
        c.lathe([(0.19, 0.0), (0.205, 0.12), (0.2, 0.24)], (0.23 * sx, -0.02, 0.06), "leather", f"shin_{side}", segs=14, shade=LTH)
        c.tbox((0.3, 0.46), (0.26, 0.3), 0.16, (0.23 * sx, -0.1, 0.0), "leather", f"shin_{side}", shift=(0, 0.06), shade=(0.8, 0.7, 0.65))
        c.tbox((0.31, 0.47), (0.3, 0.46), 0.03, (0.23 * sx, -0.1, -0.01), "leather", f"shin_{side}", shade=(0.35, 0.28, 0.22))
        for k in range(2):
            c.box((0.32, 0.05, 0.035), (0.23 * sx, -0.14 + k * 0.12, 0.12), "leather", f"shin_{side}", shade=(0.45, 0.35, 0.28))
        for k in range(3):
            c.cone(0.03, 0.0, 0.06, (0.23 * sx + (k - 1) * 0.08, -0.34, 0.04), "bone", f"shin_{side}", segs=5, rot=(-1.4, 0, 0), shade=TOOTH)

    hx, hy, hz = -0.72, -0.1, 0.55
    base = Vector((hx, hy - 0.06, hz - 0.02))
    top = Vector((hx, hy + 0.05, hz + 0.2))
    tip = Vector((hx - 0.05, hy - 0.62, hz - 0.62))
    c.lathe_ab([(0.055, 0.0), (0.06, 1.0)], tuple(top), tuple(base), "wood", "hand_R", segs=8)
    for k in range(4):
        bh.ring(c, 0.063, 0.012, tuple(top + (base - top) * (0.15 + k * 0.22)), "leather", "hand_R", segs=10, rot=(0.6, 0, 0), shade=LTH)
    c.lathe_ab([(0.07, 0.0), (0.09, 0.15), (0.12, 0.3), (0.15, 0.48), (0.19, 0.66), (0.21, 0.8), (0.19, 0.92), (0.12, 0.98), (0.0, 1.0)], tuple(base), tuple(tip), "wood", "hand_R", segs=12)
    axis = (tip - base).normalized()
    ref = Vector((1, 0, 0))
    perp1 = axis.cross(ref).normalized()
    perp2 = axis.cross(perp1).normalized()
    L = (tip - base).length
    for t, r in ((0.42, 0.135), (0.78, 0.205)):
        p = base + axis * (t * L)
        pts = [tuple(p + (perp1 * math.cos(i / 16 * math.tau) + perp2 * math.sin(i / 16 * math.tau)) * (r + 0.01)) for i in range(17)]
        bh.tube(c, pts, [0.022] * 17, IRON, "hand_R", segs=5, cap=False)
    for k, t in enumerate((0.55, 0.68, 0.88)):
        for i in range(6):
            a = i / 6 * math.tau + k * 0.5
            d = perp1 * math.cos(a) + perp2 * math.sin(a)
            r = (0.17, 0.2, 0.19)[k]
            p = base + axis * (t * L)
            c.lathe_ab([(0.035, 0.0), (0.025, 0.5), (0.0, 1.0)], tuple(p + d * (r - 0.02)), tuple(p + d * (r + 0.13)), IRON, "hand_R", segs=6)
    for k in range(4):
        p = base + axis * ((0.25 + k * 0.17) * L) + perp2 * 0.11
        c.ico(0.035, tuple(p), "wood", "hand_R", sub=1, shade=(0.75, 0.65, 0.55))
    return c


def clips():
    run_len = 16
    ph = [0, 4, 8, 12, 16]

    def cyc(a, b):
        return [(ph[0], a), (ph[2], b), (ph[4], a)]

    return {
        "idle": {
            "bones": {
                "spine": [(0, (0, 0, 0)), (12, (3, 0, 0)), (24, (0, 0, 0))],
                "chest": [(0, (0, 0, 0)), (12, (-2, 0, 0)), (24, (0, 0, 0))],
                "head": [(0, (0, 0, 0)), (12, (4, 0, 2)), (24, (0, 0, 0))],
                "arm_R": [(0, (0, 0, 6)), (12, (-4, 0, 9)), (24, (0, 0, 6))],
                "arm_L": [(0, (0, 0, -6)), (12, (-4, 0, -9)), (24, (0, 0, -6))],
                "forearm_R": [(0, (-20, 0, 0)), (12, (-26, 0, 0)), (24, (-20, 0, 0))],
                "forearm_L": [(0, (-10, 0, 0)), (12, (-16, 0, 0)), (24, (-10, 0, 0))],
            },
            "loc": {"hips": [(0, (0, 0, 0)), (12, (0, -0.03, 0)), (24, (0, 0, 0))]},
        },
        "run": {
            "bones": {
                "thigh_R": cyc((-40, 0, 0), (35, 0, 0)),
                "thigh_L": cyc((35, 0, 0), (-40, 0, 0)),
                "shin_R": [(0, (10, 0, 0)), (4, (60, 0, 0)), (8, (20, 0, 0)), (12, (5, 0, 0)), (16, (10, 0, 0))],
                "shin_L": [(0, (20, 0, 0)), (4, (5, 0, 0)), (8, (10, 0, 0)), (12, (60, 0, 0)), (16, (20, 0, 0))],
                "arm_R": cyc((30, 0, 10), (-35, 0, 10)),
                "arm_L": cyc((-35, 0, -10), (30, 0, -10)),
                "forearm_R": cyc((-35, 0, 0), (-15, 0, 0)),
                "forearm_L": cyc((-15, 0, 0), (-45, 0, 0)),
                "spine": [(0, (14, 0, -5)), (8, (14, 0, 5)), (16, (14, 0, -5))],
                "head": [(0, (-10, 0, 4)), (8, (-10, 0, -4)), (16, (-10, 0, 4))],
            },
            "loc": {"hips": [(0, (0, 0, 0)), (4, (0, 0.07, 0)), (8, (0, 0, 0)), (12, (0, 0.07, 0)), (16, (0, 0, 0))]},
        },
        "attack_a": {
            "bones": {
                "arm_R": [(0, (0, 0, 6)), (4, (-160, 0, 15)), (7, (-70, 0, 5)), (14, (0, 0, 6))],
                "forearm_R": [(0, (-20, 0, 0)), (4, (-60, 0, 0)), (7, (-5, 0, 0)), (14, (-20, 0, 0))],
                "spine": [(0, (0, 0, 0)), (4, (-10, 0, 20)), (7, (25, 0, -15)), (14, (0, 0, 0))],
            },
        },
    }


def main():
    coll_name = "Hero_" + NAME
    coll = bpy.data.collections.get(coll_name)
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new(coll_name)
        bpy.context.scene.collection.children.link(coll)
    for store in (bpy.data.meshes, bpy.data.armatures):
        for d in list(store):
            if d.users == 0:
                store.remove(d)
    images = texgen.build_all(os.path.join(ROOT, "assets", "textures"))
    ch = build(images)
    tris = ch.tri_count()
    mesh, arm = ch.build(BONES, coll)
    mesh.location.x = 0
    charkit.animate(arm, anims.hero_clips(1.2))
    charkit.bake_ao([mesh])
    size = charkit.export([mesh, arm], os.path.join(ROOT, "assets", "heroes", NAME + ".glb"))
    return {"tris": tris, "bytes": size, "bones": len(BONES)}


RESULT = main()
