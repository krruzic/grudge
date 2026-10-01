"""Army units: grunt, ranged, heavy. 8-bone rigid rigs, idle / walk / attack clips.

Run inside Blender (MCP): exec(open(".../tools/blender/build_units.py").read(), {"__name__": "__main__"})
Exports assets/units/<type>.glb.
"""
import importlib
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import anims  # noqa: E402
import charkit  # noqa: E402
import texgen  # noqa: E402

importlib.reload(texgen)
importlib.reload(charkit)
importlib.reload(anims)

T = "team_paint"
C = "team_cloth"


def rig(hip, neck, top, sh_x, leg_x, hand_z):
    return {
        "root": ((0, 0, 0), (0, 0, 0.2), None),
        "hips": ((0, 0, hip), (0, 0, (hip + neck) / 2), "root"),
        "chest": ((0, 0, (hip + neck) / 2), (0, 0, neck), "hips"),
        "head": ((0, 0, neck), (0, 0, top), "chest"),
        "arm_R": ((-sh_x, 0, neck - 0.05), (-sh_x - 0.04, -0.03, hand_z), "chest"),
        "arm_L": ((sh_x, 0, neck - 0.05), (sh_x + 0.04, -0.03, hand_z), "chest"),
        "thigh_R": ((-leg_x, 0, hip), (-leg_x, 0, 0.05), "hips"),
        "thigh_L": ((leg_x, 0, hip), (leg_x, 0, 0.05), "hips"),
    }


def feet(c, B, mat, shade, w=0.12, l=0.24):
    for side in ("R", "L"):
        t0, t1, _ = B[f"thigh_{side}"]
        c.tbox((w, l), (w * 0.8, l * 0.6), 0.09, (t1[0], -0.06, 0.0), mat, f"thigh_{side}", shift=(0, 0.04), shade=shade)


def _bh():
    import build_heroes as bh
    importlib.reload(bh)
    return bh


def goblin_head(c, bh, zc, cy=-0.02, r=0.25):
    GB = "goblin"
    c.lathe([(0.0, zc - 0.19), (0.14, zc - 0.18), (0.21, zc - 0.13), (0.25, zc - 0.04), (0.255, zc + 0.04), (0.24, zc + 0.11), (0.19, zc + 0.17), (0.1, zc + 0.2), (0.0, zc + 0.21)],
            (0, cy, 0), GB, "head", segs=12, sx=1.1)
    c.decal((0, cy - 0.272, zc - 0.01), 0.42, 0.3, "face_goblin", "head", curve=0.06, cols=4)
    c.lathe_ab([(0.045, 0.0), (0.04, 0.4), (0.03, 0.75), (0.0, 1.0)], (0, cy - 0.26, zc - 0.02), (0, cy - 0.37, zc - 0.08), GB, "head", segs=6)
    for sx in (-1, 1):
        c.lathe([(0.0, 0.0), (0.07, 0.04), (0.075, 0.12), (0.055, 0.24), (0.0, 0.34)], (0.22 * sx, cy + 0.02, zc + 0.02), GB, "head", segs=6, sy=0.35, rot=(0.1, 1.3 * sx, 0.0))
        c.lathe([(0.0, 0.03), (0.045, 0.07), (0.045, 0.14), (0.03, 0.22), (0.0, 0.28)], (0.22 * sx, cy + 0.005, zc + 0.02), GB, "head", segs=6, sy=0.2, rot=(0.1, 1.3 * sx, 0.0), shade=(0.6, 0.45, 0.45))


def grunt(images):
    bh = _bh()
    B = rig(0.46, 0.84, 1.3, 0.26, 0.11, 0.48)
    c = charkit.Char("grunt", images)
    GB = "goblin"
    LTH = (0.8, 0.6, 0.45)
    LTH_D = (0.5, 0.36, 0.28)
    goblin_head(c, bh, 1.01)
    c.lathe([(0.0, 1.06), (0.27, 1.06), (0.285, 1.1), (0.27, 1.16), (0.23, 1.24), (0.14, 1.32), (0.0, 1.35)], (0, -0.02, 0), T, "head", segs=12, sx=1.1)
    c.lathe([(0.285, 1.05), (0.3, 1.075), (0.285, 1.1)], (0, -0.02, 0), "iron", "head", segs=12, sx=1.1, caps=False)
    bh.tube(c, [(0, -0.3, 1.1), (0, -0.2, 1.27), (0, 0.0, 1.35), (0, 0.2, 1.27)], [0.02] * 4, "iron", "head", segs=5)
    c.cone(0.03, 0.0, 0.12, (0, -0.02, 1.4), "iron", "head", segs=6)
    c.tbox((0.05, 0.03), (0.035, 0.03), 0.16, (0, -0.31, 0.94), "iron", "head")
    bh.folded(c, [(0.17, 0.5), (0.21, 0.56), (0.225, 0.66), (0.215, 0.76), (0.16, 0.86)], (0, 0, 0), "leather", "chest", segs=12, folds=4, amp=0.04, sy=0.85, shade=LTH)
    front = [[(x, -0.205 - 0.02 * (0.82 - z), z) for x in (-0.13, 0.0, 0.13)] for z in (0.82, 0.55, 0.3)]
    front[-1] = [(x, y, z - (0.04 if k2 == 1 else 0.0)) for k2, (x, y, z) in enumerate(front[-1])]
    bh.sheet(c, front, C, "chest", thick=0.015)
    back = [[(x, 0.205 + 0.02 * (0.82 - z), z) for x in (-0.13, 0.0, 0.13)] for z in (0.82, 0.55, 0.34)]
    bh.sheet(c, back, T, "chest", thick=0.015)
    c.lathe([(0.19, 0.46), (0.215, 0.49), (0.215, 0.53), (0.2, 0.56)], (0, 0, 0), "leather", "hips", segs=12, sy=0.85, shade=LTH_D)
    c.box((0.06, 0.03, 0.05), (0, -0.19, 0.51), "gold", "hips")
    c.tbox((0.07, 0.05), (0.065, 0.045), 0.08, (0.15, -0.12, 0.45), "leather", "hips", rot=(0, 0, 0.4), shade=LTH_D)
    c.lathe([(0.0, 0.08), (0.11, 0.06), (0.13, 0.0), (0.1, -0.04)], (0.27, 0.0, 0.8), "leather", "chest", segs=8, rot=(0, 0.4, 0), shade=LTH_D)
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        c.lathe_ab([(0.06, 0.0), (0.055, 0.5), (0.05, 1.0)], a0, a1, GB, f"arm_{side}", segs=7)
        c.ico(0.065, (a1[0], a1[1], a1[2] - 0.02), GB, f"arm_{side}", sub=2)
        c.lathe([(0.062, 0.0), (0.07, 0.06), (0.07, 0.12), (0.06, 0.15)], (a1[0], a1[1], a1[2] + 0.04), "leather", f"arm_{side}", segs=7, shade=(0.6, 0.45, 0.35))
        bh.ring(c, 0.07, 0.008, (a1[0], a1[1], a1[2] + 0.1), "leather", f"arm_{side}", segs=7, shade=LTH_D)
        c.lathe_ab([(0.075, 0.0), (0.07, 0.5), (0.06, 1.0)], t0, t1, "leather", f"thigh_{side}", segs=7, shade=(0.6, 0.45, 0.35))
        for zz in (0.16, 0.24):
            bh.ring(c, 0.065, 0.01, (t1[0], 0.0, zz), "cloth", f"thigh_{side}", segs=7, shade=(0.45, 0.4, 0.35))
        c.tbox((0.12, 0.24), (0.1, 0.15), 0.08, (t1[0], -0.06, 0.0), "leather", f"thigh_{side}", shift=(0, 0.04), shade=LTH_D)
        bh.tube(c, [(t1[0], -0.16, 0.04), (t1[0], -0.24, 0.05), (t1[0], -0.27, 0.1)], [0.035, 0.02, 0.0], "leather", f"thigh_{side}", segs=5, shade=LTH_D)
    hx, hy, hz = B["arm_R"][1]
    c.lathe_ab([(0.022, 0.0), (0.022, 1.0)], (hx, hy + 0.1, hz - 0.45), (hx, hy - 0.12, hz + 0.72), "wood", "arm_R", segs=6)
    for kk in range(3):
        bh.ring(c, 0.026, 0.006, (hx, hy - 0.01 - kk * 0.012, hz + 0.08 + kk * 0.05), "leather", "arm_R", segs=6, rot=(-0.18, 0, 0), shade=LTH_D)
    tip = Vector((hx, hy - 0.16, hz + 0.95))
    base = Vector((hx, hy - 0.12, hz + 0.72))
    pts = [tuple(base + (tip - base) * (k2 / 5)) for k2 in range(6)]
    bh.blade(c, pts, [0.02, 0.05, 0.055, 0.045, 0.025, 0.0], "iron", "arm_R", thick=0.01, side=(1, 0, 0), shade=(1.3, 1.3, 1.35))
    bh.ring(c, 0.027, 0.007, tuple(base), "leather", "arm_R", segs=6, rot=(-0.18, 0, 0), shade=LTH_D)
    lx, ly, lz = B["arm_L"][1]
    sc = (lx + 0.09, ly - 0.02, lz + 0.06)
    c.lathe([(0.0, -0.02), (0.2, -0.01), (0.22, 0.01), (0.22, 0.04), (0.0, 0.05)], sc, "wood", "arm_L", segs=14, rot=(0, math.pi / 2, 0))
    bh.ring(c, 0.22, 0.014, (sc[0] + 0.015, sc[1], sc[2]), "iron", "arm_L", rot=(0, math.pi / 2, 0), segs=14, tsegs=4)
    c.lathe([(0.15, 0.0), (0.16, 0.005), (0.15, 0.01), (0.08, 0.01), (0.07, 0.005), (0.08, 0.0)], (sc[0] + 0.05, sc[1], sc[2]), T, "arm_L", segs=14, rot=(0, math.pi / 2, 0))
    c.lathe([(0.0, 0.0), (0.06, 0.0), (0.055, 0.03), (0.03, 0.05), (0.0, 0.055)], (sc[0] + 0.05, sc[1], sc[2]), "iron", "arm_L", segs=10, rot=(0, math.pi / 2, 0))
    return c, B


def ranged(images):
    bh = _bh()
    B = rig(0.5, 0.88, 1.32, 0.24, 0.1, 0.52)
    c = charkit.Char("ranged", images)
    GB = "goblin"
    LTH = (0.82, 0.6, 0.42)
    LTH_D = (0.45, 0.32, 0.25)
    goblin_head(c, bh, 1.05)
    bh.folded(c, [(0.31, 0.86), (0.325, 0.98), (0.31, 1.12), (0.24, 1.28), (0.15, 1.44), (0.06, 1.56), (0.0, 1.6)], (0, 0.08, 0), T, "head", segs=14, folds=4, amp=0.04, sx=1.1)
    bh.tube(c, [(0, 0.14, 1.56), (0.0, 0.26, 1.52), (0.03, 0.36, 1.42), (0.05, 0.4, 1.3)], [0.045, 0.035, 0.022, 0.0], T, "head", segs=6)
    bh.folded(c, [(0.17, 0.52), (0.215, 0.62), (0.22, 0.78), (0.17, 0.9)], (0, 0, 0), "leather", "chest", segs=12, folds=4, amp=0.035, sy=0.85, shade=LTH)
    c.lathe([(0.2, 0.84), (0.235, 0.88), (0.23, 0.93), (0.18, 0.96)], (0, -0.01, 0), C, "chest", segs=12, sy=0.9)
    bh.tube(c, [(0.08, -0.21, 0.88), (0.11, -0.23, 0.75), (0.1, -0.22, 0.66)], [0.03, 0.025, 0.015], C, "chest", segs=5)
    bh.folded(c, [(0.2, 0.36), (0.24, 0.5), (0.23, 0.58)], (0, 0, 0), "leather", "hips", segs=12, folds=5, amp=0.05, sy=0.85, shade=(0.72, 0.52, 0.38))
    c.lathe([(0.23, 0.56), (0.24, 0.59), (0.24, 0.62), (0.23, 0.65)], (0, 0, 0), "leather", "hips", segs=12, sy=0.85, shade=LTH_D)
    c.box((0.08, 0.04, 0.06), (0, -0.21, 0.6), "gold", "hips")
    c.lathe_ab([(0.012, 0.0), (0.012, 1.0)], (-0.17, -0.12, 0.6), (-0.19, -0.13, 0.46), "leather", "hips", segs=5, shade=LTH_D)
    c.tbox((0.03, 0.008), (0.0, 0.005), 0.1, (-0.19, -0.13, 0.36), "iron", "hips")
    q = (0.08, 0.22, 0.56)
    c.lathe([(0.065, 0.0), (0.075, 0.05), (0.08, 0.38), (0.085, 0.42), (0.075, 0.44)], q, "leather", "chest", segs=10, rot=(0.25, 0.35, 0), shade=(0.55, 0.38, 0.28))
    bh.tube(c, [(-0.2, -0.2, 0.86), (0.0, -0.24, 0.7), (0.2, -0.14, 0.55)], [0.016] * 3, "leather", "chest", segs=5, shade=LTH_D)
    for k2 in range(4):
        x0 = 0.05 + k2 * 0.035
        top = Vector((x0 + 0.05, 0.31 + k2 * 0.01, 1.1))
        c.lathe_ab([(0.009, 0.0), (0.009, 1.0)], (x0, 0.25, 0.96), tuple(top), "wood", "chest", segs=4)
        pts = [tuple(top + Vector((0.0, 0.006 * u, 0.02 * u))) for u in range(4)]
        bh.blade(c, pts, [0.018, 0.022, 0.018, 0.004], "feather", "chest", thick=0.004, side=(1, 0, 0), shade=(1.0, 0.3, 0.2) if k2 % 2 else (1.1, 1.1, 1.05))
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        c.lathe_ab([(0.055, 0.0), (0.05, 0.5), (0.048, 1.0)], a0, a1, GB, f"arm_{side}", segs=7)
        c.ico(0.06, (a1[0], a1[1], a1[2] - 0.02), GB, f"arm_{side}", sub=2)
        if side == "L":
            c.lathe([(0.06, 0.0), (0.068, 0.04), (0.068, 0.14), (0.058, 0.17)], (a1[0], a1[1], a1[2] + 0.04), "leather", f"arm_{side}", segs=7, shade=(0.6, 0.45, 0.35))
        c.lathe_ab([(0.065, 0.0), (0.06, 0.5), (0.055, 1.0)], t0, t1, GB, f"thigh_{side}", segs=7)
        c.lathe([(0.065, 0.0), (0.07, 0.14), (0.062, 0.18)], (t1[0], 0.0, 0.05), "leather", f"thigh_{side}", segs=7, shade=LTH_D)
        c.tbox((0.12, 0.24), (0.1, 0.15), 0.08, (t1[0], -0.06, 0.0), "leather", f"thigh_{side}", shift=(0, 0.04), shade=LTH_D)
        bh.tube(c, [(t1[0], -0.16, 0.04), (t1[0], -0.24, 0.05), (t1[0], -0.27, 0.1)], [0.035, 0.02, 0.0], "leather", f"thigh_{side}", segs=5, shade=LTH_D)
    lx, ly, lz = B["arm_L"][1]
    bx = lx + 0.03
    bow = [(bx, ly - 0.02, lz - 0.48), (bx, ly - 0.1, lz - 0.36), (bx, ly - 0.14, lz - 0.18), (bx, ly - 0.06, lz), (bx, ly - 0.14, lz + 0.18), (bx, ly - 0.1, lz + 0.36), (bx, ly - 0.02, lz + 0.48)]
    bh.tube(c, bow, [0.012, 0.02, 0.024, 0.028, 0.024, 0.02, 0.012], "wood", "arm_L", segs=6)
    c.lathe_ab([(0.032, 0.0), (0.032, 1.0)], (bx, ly - 0.06, lz - 0.06), (bx, ly - 0.06, lz + 0.06), "leather", "arm_L", segs=6, shade=LTH_D)
    c.limb(bow[0], bow[-1], 0.004, 0.004, "plain", "arm_L", segs=3, shade=(1.2, 1.2, 1.1))
    return c, B


def ogre_face(c, bh, hc, w, d, h, OG, small=False):
    hf = bh.human_head(w=w, d=d, h=h, face=d * 0.85, jaw=-0.2, chin=0.05)
    c.ico(1.0, tuple(hc), OG, "head", sub=3 if not small else 2, deform=hf)

    def surf(xr, zr, out=0.0):
        y = -math.sqrt(max(0.0, 1 - xr * xr - zr * zr))
        return hc + hf(Vector((xr, y, zr))) + Vector((0, -out, 0))

    bh.tube(c, [surf(-0.6, 0.2, 0.015), surf(0.0, 0.25, 0.03), surf(0.6, 0.2, 0.015)], [w * 0.07, w * 0.1, w * 0.07], OG, "head", segs=6, shade=(0.85, 0.88, 0.85))
    for sx in (-1, 1):
        e = surf(0.3 * sx, 0.06, 0.0)
        c.ico(1.0, tuple(e), "plain", "head", sub=1, scale=(w * 0.08, w * 0.03, w * 0.05), shade=(1.1, 1.05, 0.7))
        c.ico(1.0, tuple(e + Vector((0.0, -w * 0.025, 0.0))), "plain", "head", sub=1, scale=(w * 0.025, w * 0.01, w * 0.035), shade=(0.06, 0.04, 0.03))
        t0 = surf(0.28 * sx, -0.55, 0.05)
        bh.tube(c, [t0, t0 + Vector((0.005 * sx, -0.01, h * 0.25)), t0 + Vector((0.01 * sx, -0.005, h * 0.45))], [w * 0.07, w * 0.05, 0.0], "bone", "head", segs=6, shade=(1.0, 0.95, 0.8))
        c.ico(w * 0.22, tuple(hc + Vector((w * 1.0 * sx, d * 0.05, 0.0))), OG, "head", sub=1, scale=(0.5, 1.0, 1.3))
    c.ico(1.0, tuple(surf(0.0, -0.12, 0.05)), OG, "head", sub=2, scale=(w * 0.22, w * 0.17, w * 0.15), shade=(0.92, 0.94, 0.88))
    bh.tube(c, [surf(-0.4, -0.42, 0.02), surf(0.0, -0.48, 0.05), surf(0.4, -0.42, 0.02)], [w * 0.03, w * 0.05, w * 0.03], "plain", "head", segs=5, shade=(0.06, 0.03, 0.03), cap=False)
    c.ico(1.0, tuple(surf(0.0, -0.7, 0.04)), OG, "head", sub=2, scale=(w * 0.65, w * 0.25, w * 0.25))
    return surf


def heavy(images):
    bh = _bh()
    B = rig(0.72, 1.3, 1.7, 0.56, 0.24, 0.6)
    c = charkit.Char("heavy", images)
    SK = "grey_ogre"
    IR = (1.0, 1.0, 1.05)
    IR_D = (0.62, 0.62, 0.68)
    RIV = (1.35, 1.35, 1.4)
    LTH = (0.45, 0.32, 0.25)
    VOID = (0.03, 0.03, 0.04)
    hy = -0.16
    c.lathe([(0.0, 1.26), (0.2, 1.27), (0.24, 1.32), (0.25, 1.46), (0.245, 1.56), (0.22, 1.62), (0.12, 1.66), (0.0, 1.67)], (0, hy, 0), "iron", "head", segs=16, shade=IR)
    for z in (1.33, 1.58):
        c.lathe([(0.248, z - 0.02), (0.258, z), (0.248, z + 0.02)], (0, hy, 0), T, "head", segs=16, caps=False)
    c.tbox((0.3, 0.06), (0.3, 0.06), 0.045, (0, hy - 0.225, 1.46), "plain", "head", shade=VOID)
    for sx in (-1, 1):
        c.ico(1.0, (0.07 * sx, hy - 0.235, 1.483), "plain", "head", sub=1, scale=(0.03, 0.01, 0.014), shade=(1.6, 0.8, 0.15))
    for k in range(5):
        c.box((0.022, 0.02, 0.1), ((k - 2) * 0.05, hy - 0.24, 1.38), "iron", "head", shade=IR_D)
    for k in range(6):
        a = k / 6 * math.tau
        c.ico(0.012, (math.cos(a) * 0.255, hy + math.sin(a) * 0.255, 1.33), "iron", "head", sub=1, shade=RIV)
    fin = [[(0.0, hy - 0.2 + 0.44 * (k / 6), 1.6 + 0.04 * math.sin(k / 6 * math.pi) + dz * (0.06 + 0.12 * math.sin(k / 6 * math.pi))) for k in range(7)] for dz in (0.0, 1.0)]
    bh.sheet(c, fin, T, "head", thick=0.03)
    bh.tube(c, fin[1], [0.018] * 7, "iron", "head", segs=5, shade=RIV)
    for sx in (-1, 1):
        bh.tube(c, [(0.24 * sx, hy, 1.5), (0.33 * sx, hy - 0.05, 1.54), (0.38 * sx, hy - 0.15, 1.6), (0.36 * sx, hy - 0.26, 1.62)], [0.05, 0.04, 0.025, 0.0], "iron", "head", segs=7, shade=IR_D)
    c.lathe([(0.27, 1.22), (0.34, 1.26), (0.36, 1.34), (0.3, 1.4)], (0, hy + 0.04, 0), "iron", "chest", segs=16, shade=IR_D)
    c.lathe([(0.36, 0.72), (0.5, 0.86), (0.6, 1.04), (0.62, 1.2), (0.56, 1.32), (0.36, 1.4), (0.0, 1.42)], (0, 0.06, 0), "iron", "chest", segs=14, sy=0.82, shade=IR)
    for z in (0.86, 1.04, 1.22):
        r = {0.86: 0.5, 1.04: 0.6, 1.22: 0.615}[z]
        c.lathe([(r + 0.005, z - 0.03), (r + 0.02, z), (r + 0.005, z + 0.03)], (0, 0.06, 0), T, "chest", segs=14, sy=0.82, caps=False)
        for k in range(8):
            a = k / 8 * math.tau
            c.ico(0.016, (math.cos(a) * (r + 0.02), 0.06 + math.sin(a) * (r + 0.02) * 0.82, z), "iron", "chest", sub=1, shade=RIV)
    c.lathe([(0.0, 0.0), (0.16, 0.0), (0.17, 0.02), (0.15, 0.05), (0.0, 0.06)], (0, -0.43, 1.06), "iron", "chest", segs=16, rot=(math.pi / 2, 0, 0), shade=IR_D)
    c.lathe([(0.11, 0.0), (0.12, 0.01), (0.11, 0.02), (0.05, 0.02), (0.04, 0.01), (0.05, 0.0)], (0, -0.49, 1.06), T, "chest", segs=16, rot=(math.pi / 2, 0, 0))
    c.cone(0.05, 0.0, 0.1, (0, -0.52, 1.06), "iron", "chest", segs=8, rot=(math.pi / 2, 0, 0), shade=RIV)
    for sx in (-1, 1):
        for k, (r, z) in enumerate(((0.34, 1.42), (0.31, 1.33), (0.27, 1.24))):
            c.lathe([(0.0, 0.1), (r * 0.6, 0.08), (r, 0.0), (r * 0.96, -0.05), (r * 0.6, -0.03)], (0.6 * sx, 0.04, z), "iron", "chest", segs=12, sy=1.1, rot=(0, 0.3 * sx, 0), shade=IR if k == 0 else IR_D)
            c.lathe([(r, -0.01), (r * 1.03, -0.03), (r * 0.98, -0.055)], (0.6 * sx, 0.04, z), T, "chest", segs=12, sy=1.1, caps=False, rot=(0, 0.3 * sx, 0))
        for k in range(3):
            a = (k - 1) * 0.55
            c.lathe_ab([(0.05, 0.0), (0.035, 0.5), (0.0, 1.0)], (0.62 * sx + math.sin(a) * 0.1, 0.04 + math.cos(a) * 0.0 + (k - 1) * 0.14, 1.5), (0.7 * sx + math.sin(a) * 0.12, 0.04 + (k - 1) * 0.18, 1.72), "iron", "chest", segs=7, shade=IR)
    chain = [(0.5, -0.38, 1.24), (0.2, -0.5, 0.98), (-0.2, -0.48, 0.86), (-0.48, -0.36, 0.84)]
    for k in range(9):
        t = k / 8
        seg = min(2, int(t * 3))
        lt = t * 3 - seg
        p = Vector(chain[seg]) + (Vector(chain[seg + 1]) - Vector(chain[seg])) * lt
        bh.ring(c, 0.028, 0.008, tuple(p), "iron", "chest", rot=(0, (k % 2) * 1.57, 0.5), segs=8, shade=IR_D)
    c.lathe([(0.42, 0.62), (0.47, 0.66), (0.47, 0.76), (0.44, 0.8)], (0, 0.04, 0), "leather", "hips", segs=18, sy=0.82, shade=LTH)
    c.box((0.18, 0.06, 0.14), (0, -0.37, 0.71), "iron", "hips", shade=IR_D)
    c.ico(0.035, (0, -0.4, 0.71), "gold", "hips", sub=1)
    for k in range(7):
        a = math.radians(-90 + (k - 3) * 26)
        x, y = math.cos(a) * 0.48, 0.04 + math.sin(a) * 0.4
        c.tbox((0.17, 0.03), (0.2, 0.03), 0.26, (x, y, 0.38), "iron", "hips", rot=(0, 0, a + math.pi / 2), shade=IR if k % 2 == 0 else IR_D)
    rows = [[(x, -0.43 - 0.03 * (0.64 - z), z) for x in (-0.13, -0.04, 0.04, 0.13)] for z in (0.64, 0.42, 0.2)]
    rows[-1] = [(x, y, z - (0.05 if k in (1, 2) else 0.0)) for k, (x, y, z) in enumerate(rows[-1])]
    bh.sheet(c, rows, C, "hips", thick=0.02)
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        mid = ((a0[0] + a1[0]) / 2 + 0.03 * sx, -0.02, (a0[2] + a1[2]) / 2)
        bh.tube(c, [a0, mid, a1], [0.15, 0.16, 0.13], SK, f"arm_{side}", segs=10, shade=(0.75, 0.85, 1.0))
        c.lathe([(0.15, 0.0), (0.185, 0.04), (0.19, 0.24), (0.165, 0.3)], (a1[0], a1[1], a1[2] + 0.06), "iron", f"arm_{side}", segs=14, shade=IR)
        c.lathe([(0.19, 0.22), (0.2, 0.25), (0.19, 0.28)], (a1[0], a1[1], a1[2] + 0.06), T, f"arm_{side}", segs=14, caps=False)
        c.ico(0.16, (a1[0], a1[1] - 0.02, a1[2] - 0.03), "iron", f"arm_{side}", sub=2, scale=(1.0, 1.05, 0.9), shade=IR_D)
        for k in range(4):
            fx = a1[0] + (k - 1.5) * 0.06
            c.box((0.05, 0.06, 0.05), (fx, a1[1] - 0.15, a1[2] - 0.01), "iron", f"arm_{side}", shade=IR)
            c.cone(0.018, 0.0, 0.05, (fx, a1[1] - 0.2, a1[2] - 0.01), "iron", f"arm_{side}", segs=5, rot=(math.pi / 2, 0, 0), shade=RIV)
        mt = ((t0[0] + t1[0]) / 2, -0.01, (t0[2] + t1[2]) / 2)
        bh.tube(c, [t0, mt, t1], [0.16, 0.16, 0.14], SK, f"thigh_{side}", segs=9, shade=(0.75, 0.85, 1.0))
        c.lathe([(0.16, 0.0), (0.18, 0.06), (0.18, 0.3), (0.17, 0.36), (0.19, 0.4), (0.17, 0.44)], (t1[0], 0.0, 0.06), "iron", f"thigh_{side}", segs=14, shade=IR)
        c.ico(0.1, (t1[0], -0.16, 0.42), "iron", f"thigh_{side}", sub=2, scale=(1.0, 0.6, 1.0), shade=IR_D)
        c.tbox((0.3, 0.46), (0.26, 0.32), 0.12, (t1[0], -0.08, 0.0), "iron", f"thigh_{side}", shift=(0, 0.06), shade=IR_D)
        for k in range(3):
            c.tbox((0.28 - k * 0.02, 0.08), (0.26 - k * 0.02, 0.07), 0.05, (t1[0], -0.26 + k * 0.08, 0.08 + k * 0.01), "iron", f"thigh_{side}", rot=(0.2, 0, 0), shade=IR)
    hx, hyy, hz = B["arm_R"][1]
    top = Vector((hx, hyy + 0.1, hz + 0.12))
    end = Vector((hx - 0.25, hyy - 0.55, hz - 0.62))
    c.lathe_ab([(0.045, 0.0), (0.045, 1.0)], tuple(top), tuple(end), "wood", "arm_R", segs=8)
    for k in range(4):
        bh.ring(c, 0.05, 0.011, tuple(top + (end - top) * (0.05 + k * 0.06)), "leather", "arm_R", segs=8, rot=(1.4, 0, 0), shade=LTH)
    c.ico(0.06, tuple(top), "iron", "arm_R", sub=1, shade=IR_D)
    hc = end + (end - top).normalized() * 0.05
    c.box((0.42, 0.3, 0.3), tuple(hc), "iron", "arm_R", shade=IR)
    for dy in (-0.16, 0.16):
        c.box((0.46, 0.04, 0.34), tuple(hc + Vector((0, dy, 0))), T, "arm_R", shade=(0.7, 0.7, 0.7))
    for sx in (-1, 1):
        c.lathe([(0.0, 0.0), (0.17, 0.0), (0.17, 0.03), (0.0, 0.035)], tuple(hc + Vector((0.21 * sx, 0, 0))), "iron", "arm_R", segs=12, rot=(0, math.pi / 2 * sx, 0), shade=IR_D)
        c.cone(0.06, 0.0, 0.14, tuple(hc + Vector((0.28 * sx, 0, 0))), "iron", "arm_R", segs=8, rot=(0, math.pi / 2 * sx, 0), shade=RIV)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        c.cone(0.035, 0.0, 0.1, tuple(hc + Vector((0, math.cos(a) * 0.17, math.sin(a) * 0.17))), "iron", "arm_R", segs=6, rot=(-math.sin(a) * 1.57 if False else (math.atan2(math.cos(a), math.sin(a)) * -1), 0, 0), shade=RIV)
    return c, B


def ogre(images):
    bh = _bh()
    B = rig(0.74, 1.4, 1.9, 0.6, 0.26, 0.5)
    c = charkit.Char("ogre", images)
    OG = "ogre"
    LTH = (0.5, 0.35, 0.25)
    surf = ogre_face(c, bh, Vector((0, -0.32, 1.56)), 0.34, 0.33, 0.21, OG)
    bh.tube(c, [(0, -0.26, 1.76), (0.0, -0.24, 1.86), (0.02, -0.2, 1.94), (0.05, -0.14, 1.96)], [0.07, 0.06, 0.045, 0.0], "hair", "head", segs=7, shade=(0.3, 0.2, 0.15))
    bh.ring(c, 0.06, 0.015, (0, -0.25, 1.82), "bone", "head", segs=8, shade=(1.0, 0.95, 0.8))
    bh.folded(c, [(0.4, 0.7), (0.56, 0.9), (0.64, 1.1), (0.6, 1.28), (0.36, 1.4), (0.0, 1.42)], (0, 0.06, 0), OG, "chest", segs=18, folds=3, amp=0.025, sy=0.82)
    c.lathe([(0.3, 0.64), (0.5, 0.78), (0.53, 0.88), (0.5, 0.96), (0.0, 0.99)], (0, -0.12, 0), OG, "chest", segs=14, sy=0.8, shade=(0.92, 0.9, 0.85))
    c.ico(0.025, (0, -0.55, 0.82), "plain", "chest", sub=1, shade=(0.3, 0.25, 0.2))
    neck = [(math.sin(a) * 0.4, -0.38 + abs(math.sin(a)) * 0.12, 1.3 - abs(a) * 0.08) for a in [(k2 - 4) * 0.25 for k2 in range(9)]]
    bh.tube(c, neck, [0.015] * 9, "leather", "chest", segs=5, shade=LTH, cap=False)
    for k2, (x, y, z) in enumerate(neck[1:-1]):
        a = (k2 - 3) * 0.25
        c.cone(0.04, 0.0, 0.16, (x, y - 0.02, z - 0.08), "bone", "chest", segs=6, rot=(math.pi * 0.95, 0, a), shade=(1.0, 0.95, 0.8))
    c.tbox((0.5, 0.5), (0.34, 0.4), 0.2, (-0.6, 0.02, 1.34), "moss_bark", "chest", rot=(0, -0.35, 0))
    for k2 in range(3):
        c.cone(0.04, 0.0, 0.14, (-0.6 + (k2 - 1) * 0.12, 0.02, 1.56), "bark", "chest", segs=5)
    bh.tube(c, [(-0.6, -0.3, 1.3), (-0.2, -0.45, 1.05), (0.3, -0.42, 0.85)], [0.035] * 3, "leather", "chest", segs=6, shade=LTH)
    c.lathe([(0.44, 0.6), (0.485, 0.66), (0.485, 0.74), (0.46, 0.8)], (0, 0.04, 0), "leather", "hips", segs=16, sy=0.82, shade=(0.45, 0.32, 0.25))
    for fy in (-1, 1):
        rows = [[(x, fy * (0.4 + 0.04 * (0.62 - z)), z) for x in (-0.22, -0.07, 0.07, 0.22)] for z in (0.62, 0.42, 0.2)]
        rows[-1] = [(x, y, z - (0.07 if k2 in (1, 2) else 0.02)) for k2, (x, y, z) in enumerate(rows[-1])]
        bh.sheet(c, rows, "leather", "hips", thick=0.025, shade=(0.62, 0.45, 0.32))
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        mid = ((a0[0] + a1[0]) / 2 + 0.04 * sx, -0.02, (a0[2] + a1[2]) / 2)
        bh.tube(c, [a0, mid, a1], [0.2, 0.2, 0.15], OG, f"arm_{side}", segs=10)
        c.ico(0.2, (a0[0] + 0.04 * sx, a0[1], a0[2] + 0.02), OG, f"arm_{side}", sub=2)
        c.lathe([(0.16, 0.0), (0.185, 0.05), (0.185, 0.16), (0.15, 0.2)], (a1[0], a1[1], a1[2] + 0.1), "leather", f"arm_{side}", segs=10, shade=(0.55, 0.4, 0.3))
        c.ico(0.17, (a1[0], a1[1] - 0.02, a1[2] - 0.04), OG, f"arm_{side}", sub=2)
        for k2 in range(3):
            fx = a1[0] + (k2 - 1) * 0.07
            bh.tube(c, [(fx, a1[1] - 0.14, a1[2] - 0.04), (fx, a1[1] - 0.2, a1[2] - 0.1)], [0.05, 0.035], OG, f"arm_{side}", segs=5)
        mt = ((t0[0] + t1[0]) / 2, -0.01, (t0[2] + t1[2]) / 2)
        bh.tube(c, [t0, mt, t1], [0.19, 0.18, 0.15], OG, f"thigh_{side}", segs=10)
    feet(c, B, OG, (0.8, 0.8, 0.75), w=0.3, l=0.44)
    for side, sx in (("R", -1), ("L", 1)):
        t1 = B[f"thigh_{side}"][1]
        for k2 in range(3):
            c.ico(0.035, (t1[0] + (k2 - 1) * 0.09, -0.27, 0.05), "bone", f"thigh_{side}", sub=1, scale=(1.0, 1.0, 0.6), shade=(0.9, 0.85, 0.7))
    hx, hy, hz = B["arm_R"][1]
    c.lathe([(0.07, 0.0), (0.085, 0.15), (0.1, 0.4), (0.13, 0.65), (0.17, 0.85), (0.2, 1.05), (0.19, 1.18), (0.12, 1.27), (0.0, 1.3)], (hx, hy + 0.25, hz - 0.1), "moss_bark", "arm_R", segs=12, rot=(math.pi / 2, 0, 0))
    for k2 in range(7):
        a = k2 * 0.9
        yy = hy - 0.55 - (k2 % 3) * 0.12
        r = 0.16 + (k2 % 3) * 0.02
        c.lathe_ab([(0.035, 0.0), (0.025, 0.5), (0.0, 1.0)], (hx + math.cos(a) * r * 0.85, yy, hz - 0.1 + math.sin(a) * r * 0.85), (hx + math.cos(a) * (r + 0.14), yy, hz - 0.1 + math.sin(a) * (r + 0.14)), "iron", "arm_R", segs=6)
    for k2 in range(3):
        bh.ring(c, 0.1 + k2 * 0.005, 0.012, (hx, hy + 0.1 - k2 * 0.08, hz - 0.1), "leather", "arm_R", segs=10, rot=(1.57, 0, 0), shade=LTH)
    return c, B


BUILDERS = {"grunt": grunt, "ranged": ranged, "heavy": heavy, "ogre": ogre}


def build_one(name, images):
    coll_name = "Unit_" + name
    coll = bpy.data.collections.get(coll_name)
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new(coll_name)
        bpy.context.scene.collection.children.link(coll)
    coll.hide_viewport = False
    coll.hide_render = False
    ch, bones = BUILDERS[name](images)
    tris = ch.tri_count()
    mesh, arm = ch.build(bones, coll)
    cl = anims.unit_clips(1.5 if name == "ogre" else 1.3 if name == "heavy" else 1.0)
    if name == "ranged":
        cl["attack"] = {"bones": {
            "arm_L": [(0, (0, 0, 0)), (3, (-85, 0, -10)), (9, (-85, 0, -10)), (12, (0, 0, 0))],
            "arm_R": [(0, (0, 0, 0)), (3, (-80, 0, 20)), (8, (-70, 0, -10)), (12, (0, 0, 0))],
        }}
    charkit.animate(arm, cl)
    charkit.bake_ao([mesh], samples=32)
    size = charkit.export([mesh, arm], os.path.join(ROOT, "assets", "units", name + ".glb"))
    coll.hide_viewport = True
    coll.hide_render = True
    return {"tris": tris, "bytes": size}


def main():
    images = texgen.build_all(os.path.join(ROOT, "assets", "textures"))
    return {n: build_one(n, images) for n in BUILDERS}


if __name__ == "__main__":
    RESULT = main()
