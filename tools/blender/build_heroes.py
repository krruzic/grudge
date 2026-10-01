"""The rest of the launch roster: Engineer, Raider, Summoner, Duelist, Warden.

Run inside Blender (MCP): exec(open(".../tools/blender/build_heroes.py").read(), {"__name__": "__main__"})
Optional global HEROES = ["raider", ...] limits the build. Exports assets/heroes/<name>.glb.
All share the Warlord bone names so clip definitions carry over.
"""
import importlib
import math
import os
import sys

import bmesh
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

TEAM = "team_cloth"
PAINT = "team_paint"
CRYSTAL = "team_crystal"


def rig(hip, chest, neck, head_top, sh_x, hand_z, leg_x, head_y=-0.02):
    b = {
        "root": ((0, 0, 0), (0, 0, 0.3), None),
        "hips": ((0, 0, hip), (0, 0, hip + (chest - hip) * 0.4), "root"),
        "spine": ((0, 0, hip + (chest - hip) * 0.4), (0, 0, chest), "hips"),
        "chest": ((0, 0, chest), (0, 0, neck), "spine"),
        "head": ((0, head_y, neck + 0.04), (0, head_y, head_top), "chest"),
    }
    sh_z = neck - 0.06
    elbow_z = (sh_z + hand_z) / 2 + 0.04
    for side, sx in (("R", -1), ("L", 1)):
        b[f"arm_{side}"] = ((sh_x * sx, 0, sh_z), ((sh_x + 0.06) * sx, -0.01, elbow_z), "chest")
        b[f"forearm_{side}"] = (((sh_x + 0.06) * sx, -0.01, elbow_z), ((sh_x + 0.08) * sx, -0.05, hand_z + 0.1), f"arm_{side}")
        b[f"hand_{side}"] = (((sh_x + 0.08) * sx, -0.05, hand_z + 0.1), ((sh_x + 0.08) * sx, -0.06, hand_z - 0.05), f"forearm_{side}")
        b[f"thigh_{side}"] = ((leg_x * sx, 0, hip), (leg_x * sx, -0.01, hip * 0.55), "hips")
        b[f"shin_{side}"] = ((leg_x * sx, -0.01, hip * 0.55), (leg_x * sx, 0, 0.1), f"thigh_{side}")
    return b


def limbs(c, B, arm_mat, fore_mat, hand_mat, thigh_mat, shin_mat, boot_mat, arm_r=(0.1, 0.09), leg_r=(0.13, 0.11), boot=(0.2, 0.3, 0.16)):
    for side in ("R", "L"):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        h0, h1, _ = B[f"hand_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.limb(a0, a1, arm_r[0], arm_r[1], arm_mat, f"arm_{side}")
        c.limb(f0, f1, arm_r[1], arm_r[1] * 0.9, fore_mat, f"forearm_{side}")
        c.box((arm_r[1] * 1.7,) * 3, h0[:2] + (h0[2] - 0.08,), hand_mat, f"hand_{side}")
        c.limb(t0, t1, leg_r[0], leg_r[1], thigh_mat, f"thigh_{side}")
        c.limb(s0, s1, leg_r[1], leg_r[1] * 0.9, shin_mat, f"shin_{side}")
        c.box(boot, (s1[0], -0.05, 0.08), boot_mat, f"shin_{side}")


def hand_pos(B, side="R"):
    h0 = B[f"hand_{side}"][0]
    return (h0[0], h0[1], h0[2] - 0.1)


def build_engineer(images):
    B = rig(hip=0.62, chest=1.0, neck=1.18, head_top=1.62, sh_x=0.44, hand_z=0.55, leg_x=0.2)
    c = charkit.Char("engineer", images)
    YEL = (1.1, 0.72, 0.04)
    YEL_D = (0.8, 0.48, 0.03)
    BEARD = (1.25, 1.22, 1.18)
    CAP = (0.95, 0.8, 0.7)
    LTH = (0.8, 0.6, 0.45)
    LTH_D = (0.5, 0.38, 0.28)
    GLOVE = (0.75, 0.55, 0.4)

    hc = Vector((0, -0.04, 1.37))
    hf = human_head(w=0.335, d=0.3, h=0.24, face=0.255, jaw=0.15, chin=0.0)
    c.ico(1.0, tuple(hc), "flesh", "head", sub=3, deform=hf)

    def surf(xr, zr, out=0.0):
        y = -math.sqrt(max(0.0, 1 - xr * xr - zr * zr))
        return hc + hf(Vector((xr, y, zr))) + Vector((0, -out, 0))

    c.limb(tuple(surf(-0.5, 0.17, 0.0)), tuple(surf(0.5, 0.17, 0.0)), 0.02, 0.02, "flesh", "head", segs=6)
    for sx in (-1, 1):
        e = surf(0.3 * sx, 0.04, 0.0)
        c.ico(1.0, tuple(e), "plain", "head", sub=2, scale=(0.03, 0.01, 0.017), shade=(1.2, 1.17, 1.1))
        c.ico(1.0, tuple(e + Vector((0.004 * -sx, -0.008, 0.0))), "plain", "head", sub=1, scale=(0.011, 0.004, 0.012), shade=(0.25, 0.45, 0.85))
        c.ico(1.0, tuple(e + Vector((0.004 * -sx, -0.0115, 0.0))), "plain", "head", sub=1, scale=(0.0055, 0.002, 0.006), shade=(0.02, 0.02, 0.02))
        c.ico(0.0025, tuple(e + Vector((0.002 * -sx, -0.013, 0.006))), "plain", "head", sub=1, shade=(1.6, 1.6, 1.6))
        lid = [e + Vector((-0.032 * sx * k, -0.004 - 0.005 * (1 - abs(k)), 0.012 + 0.006 * (1 - abs(k)))) for k in (-1, -0.5, 0, 0.5, 1)]
        tube(c, lid, [0.005, 0.008, 0.009, 0.008, 0.005], "flesh", "head", segs=5, shade=(0.85, 0.68, 0.62), cap=False)
        low = [e + Vector((-0.03 * sx * k, -0.003, -0.014 - 0.003 * (1 - abs(k)))) for k in (-1, 0, 1)]
        tube(c, low, [0.004, 0.006, 0.004], "flesh", "head", segs=5, shade=(0.9, 0.72, 0.66), cap=False)
        brow = [surf(0.1 * sx, 0.2, 0.03), surf(0.24 * sx, 0.25, 0.035), surf(0.4 * sx, 0.23, 0.03), surf(0.52 * sx, 0.16, 0.02)]
        tube(c, brow, [0.022, 0.028, 0.024, 0.012], "hair", "head", segs=7, shade=BEARD)
        for k in range(3):
            q = surf((0.2 + k * 0.12) * sx, 0.24, 0.045)
            c.cone(0.012, 0.0, 0.05, tuple(q), "hair", "head", segs=5, rot=(0.3, 0.6 * sx, 0.0), shade=BEARD)
        c.ico(0.06, tuple(Vector((0.33 * sx, -0.06, 1.37))), "flesh", "head", scale=(0.45, 0.8, 1.0), sub=2)
    c.ico(1.0, tuple(surf(0.0, -0.06, 0.06)), "flesh", "head", sub=2, scale=(0.055, 0.05, 0.05), shade=(1.0, 0.82, 0.76))
    c.ico(1.0, tuple(surf(0.0, -0.2, 0.09)), "flesh", "head", sub=2, scale=(0.075, 0.065, 0.065), shade=(1.05, 0.72, 0.66))
    for sx in (-1, 1):
        c.ico(1.0, tuple(surf(0.11 * sx, -0.27, 0.06)), "flesh", "head", sub=2, scale=(0.035, 0.03, 0.03), shade=(1.0, 0.72, 0.66))
        curl(c, (0.06 * sx, -0.4, 1.47), [(0.07 * sx, -0.01, 0.02), (0.06 * sx, 0.0, 0.0), (0.03 * sx, 0.01, -0.02)], 0.03, "hair", "head", shade=BEARD, taper=0.85) if False else None
    folded(c, [(0.3, 1.32), (0.355, 1.22), (0.36, 1.08), (0.3, 0.96), (0.2, 0.88), (0.0, 0.84)], (0, -0.2, 0), "hair", "head", segs=16, folds=8, amp=0.06, sy=0.55, shade=BEARD)
    for sx in (-1, 0, 1):
        x = 0.1 * sx
        top = (x, -0.32, 0.92)
        for k in range(4):
            c.ico(0.042 - k * 0.004, (x, -0.33 - k * 0.005, 0.88 - k * 0.07), "hair", "head", scale=(1.0, 0.9, 1.25), sub=1, shade=BEARD)
        ring(c, 0.032, 0.012, (x, -0.35, 0.6), "gold", "head", segs=10)
        c.cone(0.03, 0.0, 0.07, (x, -0.35, 0.55), "hair", "head", segs=6, rot=(math.pi, 0, 0), shade=BEARD)
    for sx in (-1, 1):
        curl(c, (0.04 * sx, -0.44, 1.3), [(0.08 * sx, -0.01, -0.02), (0.07 * sx, 0.0, -0.05), (0.02 * sx, 0.0, -0.06)], 0.035, "hair", "head", shade=BEARD, taper=0.82)

    c.lathe([(0.0, 1.44), (0.36, 1.44), (0.375, 1.5), (0.37, 1.56), (0.34, 1.63), (0.25, 1.69), (0.12, 1.72), (0.0, 1.73)], (0, -0.04, 0), "leather", "head", segs=16, sx=1.05, shade=CAP)
    for k in range(5):
        a = math.radians(30 + k * 30)
        c.limb((math.cos(a) * 0.05, -0.04 - math.sin(a) * 0.05, 1.73), (math.cos(a) * 0.37, -0.04 + math.sin(a) * 0.37 * 0 - math.sin(a) * 0.0, 1.5), 0.008, 0.008, "leather", "head", segs=4, shade=LTH_D) if False else None
    c.lathe([(0.366, 1.45), (0.378, 1.47), (0.378, 1.5), (0.366, 1.51)], (0, -0.04, 0), "leather", "head", segs=16, sx=1.05, caps=False, shade=LTH_D)
    for k in range(10):
        a = k / 10 * math.tau
        c.ico(0.012, (math.cos(a) * 0.392, -0.04 + math.sin(a) * 0.373, 1.485), "iron", "head", sub=1)
    for sx in (-1, 1):
        flap = [[(0.36 * sx + 0.03 * sx * t, -0.12 + 0.18 * u, 1.46 - 0.24 * t) for u in (0.0, 0.5, 1.0)] for t in (0.0, 0.5, 1.0)]
        sheet(c, flap, "leather", "head", thick=0.02, shade=CAP)
        c.limb((0.385 * sx, -0.02, 1.22), (0.25 * sx, -0.15, 1.12), 0.01, 0.01, "leather", "head", segs=4, shade=LTH_D)
    c.tbox((0.46, 0.2), (0.4, 0.14), 0.04, (0, -0.33, 1.46), "leather", "head", shade=(0.7, 0.6, 0.5))
    c.lathe([(0.375, 1.53), (0.385, 1.55), (0.385, 1.59), (0.375, 1.61)], (0, -0.04, 0), "leather", "head", segs=16, sx=1.05, caps=False, shade=(0.4, 0.35, 0.3))
    for sx in (-1, 1):
        g = (0.12 * sx, -0.36, 1.57)
        c.lathe([(0.075, 0.0), (0.095, 0.01), (0.1, 0.05), (0.1, 0.09), (0.085, 0.11), (0.07, 0.09)], g, "gold", "head", segs=14, rot=(math.pi / 2, 0, 0))
        c.lathe([(0.0, 0.08), (0.078, 0.085), (0.0, 0.1)], g, "plain", "head", segs=14, rot=(math.pi / 2, 0, 0), shade=(0.55, 0.85, 1.0))
        for k in range(4):
            a = k / 4 * math.tau + 0.4
            c.ico(0.01, (g[0] + math.cos(a) * 0.098, g[1] - 0.09, g[2] + math.sin(a) * 0.098), "iron", "head", sub=1)
    c.limb((-0.03, -0.46, 1.57), (0.03, -0.46, 1.57), 0.012, 0.012, "gold", "head", segs=5)

    folded(c, [(0.3, 0.6), (0.4, 0.72), (0.44, 0.88), (0.43, 1.0), (0.38, 1.1), (0.3, 1.18), (0.0, 1.2)], (0, 0.01, 0), "cloth", "spine", segs=18, folds=6, amp=0.025, sy=0.85, shade=YEL)
    c.tbox((0.5, 0.06), (0.38, 0.06), 0.55, (0, -0.37, 0.5), "cloth", "spine", rot=(-0.08, 0, 0), shade=YEL)
    c.tbox((0.2, 0.03), (0.2, 0.03), 0.14, (0.08, -0.405, 0.78), "cloth", "spine", rot=(-0.08, 0, 0), shade=YEL_D)
    c.limb((0.04, -0.42, 0.88), (0.04, -0.43, 0.98), 0.01, 0.01, "iron", "spine", segs=4)
    c.tbox((0.03, 0.03), (0.01, 0.01), 0.12, (0.1, -0.42, 0.87), "wood", "spine", shade=(1.2, 0.3, 0.2))
    c.limb((0.15, -0.42, 0.86), (0.15, -0.43, 0.98), 0.012, 0.012, "wood", "spine", segs=4)
    c.box((0.06, 0.03, 0.03), (0.15, -0.43, 0.99), "iron", "spine")
    for sx in (-1, 1):
        strap = [(0.16 * sx, -0.395, 1.0), (0.2 * sx, -0.36, 1.1), (0.24 * sx, -0.25, 1.18), (0.25 * sx, 0.0, 1.22), (0.22 * sx, 0.25, 1.12)]
        tube(c, strap, [0.026] * 5, "cloth", "chest", segs=6, shade=YEL_D)
        c.ico(0.028, (0.16 * sx, -0.405, 0.99), "gold", "chest", sub=1)
    c.lathe([(0.43, 0.64), (0.455, 0.67), (0.455, 0.77), (0.43, 0.8)], (0, 0.01, 0), "leather", "hips", segs=18, sy=0.88, shade=(0.6, 0.45, 0.35))
    c.box((0.15, 0.06, 0.13), (0, -0.42, 0.72), "gold", "hips")
    c.box((0.08, 0.065, 0.07), (0, -0.425, 0.72), "leather", "hips", shade=LTH_D)
    for sx, sz in ((-1, 0.14), (1, 0.12)):
        c.tbox((0.14, 0.1), (0.13, 0.09), sz, (0.3 * sx, -0.34, 0.59), "leather", "hips", rot=(0, 0, 0.3 * sx), shade=(0.75, 0.6, 0.45))
        c.box((0.145, 0.105, 0.04), (0.3 * sx, -0.345, 0.59 + sz), "leather", "hips", rot=(0, 0, 0.3 * sx), shade=LTH_D)
    c.limb((0.26, -0.38, 0.68), (0.26, -0.45, 0.88), 0.018, 0.018, "wood", "hips", segs=6)
    c.tbox((0.12, 0.05), (0.12, 0.05), 0.06, (0.26, -0.455, 0.88), "iron", "hips")
    c.lathe([(0.0, 0.0), (0.06, 0.0), (0.065, 0.08), (0.04, 0.12), (0.015, 0.14), (0.01, 0.22), (0.0, 0.22)], (-0.36, -0.1, 0.62), "iron", "hips", segs=10, rot=(0, 0.3, 0), shade=(0.9, 0.8, 0.5))

    c.tbox((0.46, 0.32), (0.42, 0.28), 0.46, (0, 0.34, 0.7), "wood", "chest")
    for cx in (-1, 1):
        for cz in (0.7, 1.16):
            c.box((0.07, 0.07, 0.07), (0.22 * cx, 0.48, cz), "gold", "chest")
        c.box((0.04, 0.33, 0.47), (0.12 * cx, 0.34, 0.93), "leather", "chest", shade=LTH_D)
        c.limb((0.2 * cx, 0.18, 1.12), (0.25 * cx, -0.05, 1.18), 0.025, 0.025, "leather", "chest", segs=4, shade=LTH_D)
    c.lathe([(0.075, 0.0), (0.08, 0.3), (0.07, 0.34), (0.09, 0.4), (0.09, 0.48), (0.06, 0.5)], (0.12, 0.38, 1.12), "iron", "chest", segs=10)
    c.lathe([(0.0, 0.0), (0.12, 0.0), (0.0, 0.05)], (0.12, 0.38, 1.66), "iron", "chest", segs=10)
    c.lathe([(0.0, -0.02), (0.07, -0.02), (0.075, 0.0), (0.07, 0.02), (0.0, 0.025)], (-0.12, 0.5, 1.02), "gold", "chest", segs=12, rot=(-math.pi / 2, 0, 0))
    c.lathe([(0.0, 0.0), (0.06, 0.0), (0.0, 0.004)], (-0.12, 0.525, 1.02), "plain", "chest", segs=12, rot=(-math.pi / 2, 0, 0), shade=(1.3, 1.25, 1.15))
    c.box((0.008, 0.01, 0.05), (-0.11, 0.53, 1.03), "plain", "chest", rot=(0, 0.6, 0), shade=(0.8, 0.1, 0.1))
    coil = [(-0.24 + 0.03 * math.sin(k * 0.9), 0.34 + 0.08 * math.cos(k * 1.2), 0.75 + k * 0.05) for k in range(9)]
    for p0, p1 in zip(coil, coil[1:]):
        c.limb(p0, p1, 0.018, 0.018, "gold", "chest", segs=6)
    c.lathe([(0.0, -0.02), (0.09, -0.02), (0.1, 0.0), (0.09, 0.02), (0.0, 0.02)], (0.25, 0.32, 0.85), "iron", "chest", segs=12, rot=(0, math.pi / 2, 0))
    for k in range(8):
        a = k / 8 * math.tau
        c.box((0.03, 0.035, 0.03), (0.27, 0.32 + math.cos(a) * 0.1, 0.85 + math.sin(a) * 0.1), "iron", "chest", rot=(a, 0, 0))

    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.ico(0.155, a0, TEAM, f"arm_{side}", scale=(1.15, 1.15, 1.0), sub=2)
        for k in range(5):
            a = k / 5 * math.pi + 0.3
            c.ico(0.014, (a0[0] + math.cos(a) * 0.17 * sx, a0[1] + math.sin(a) * 0.0 - 0.05, a0[2] + math.sin(a) * 0.15), "iron", f"arm_{side}", sub=1)
        c.lathe_ab([(0.11, 0.0), (0.12, 0.4), (0.105, 1.0)], a0, a1, "flesh", f"arm_{side}", segs=10)
        c.lathe_ab([(0.1, 0.0), (0.105, 0.5), (0.1, 1.0)], f0, f1, "flesh", f"forearm_{side}", segs=10)
        c.lathe([(0.11, 0.0), (0.16, 0.08), (0.17, 0.2), (0.16, 0.26), (0.13, 0.3)], (f1[0], f1[1], f1[2] - 0.02), "leather", f"forearm_{side}", segs=12, shade=GLOVE)
        ring(c, 0.165, 0.012, (f1[0], f1[1], f1[2] + 0.12), "leather", f"forearm_{side}", segs=12, shade=LTH_D)
        hx, hy, hz = hand_pos(B, side)
        c.ico(0.13, (hx, hy, hz + 0.02), "leather", f"hand_{side}", scale=(1.0, 1.1, 1.0), sub=2, shade=GLOVE)
        for k in range(4):
            fx = hx + (k - 1.5) * 0.05
            c.lathe_ab([(0.035, 0.0), (0.032, 0.6), (0.0, 1.0)], (fx, hy - 0.08, hz - 0.03), (fx, hy - 0.12, hz - 0.12), "leather", f"hand_{side}", segs=6, shade=GLOVE)
        c.lathe_ab([(0.038, 0.0), (0.032, 0.6), (0.0, 1.0)], (hx - 0.1 * sx, hy - 0.05, hz + 0.04), (hx - 0.1 * sx, hy - 0.12, hz - 0.03), "leather", f"hand_{side}", segs=6, shade=GLOVE)
        c.lathe_ab([(0.13, 0.0), (0.14, 0.4), (0.125, 1.0)], t0, t1, "cloth", f"thigh_{side}", segs=10, shade=YEL_D)
        c.lathe_ab([(0.122, 0.0), (0.125, 0.5), (0.12, 1.0)], s0, s1, "cloth", f"shin_{side}", segs=10, shade=YEL_D)
        c.ico(0.11, s0, "leather", f"shin_{side}", scale=(1.1, 1.0, 0.8), sub=2, shade=LTH_D)
        c.lathe([(0.15, 0.0), (0.165, 0.08), (0.165, 0.16), (0.145, 0.21)], (s1[0], -0.02, 0.04), "iron", f"shin_{side}", segs=12)
        c.tbox((0.26, 0.4), (0.22, 0.26), 0.14, (s1[0], -0.08, 0.0), "leather", f"shin_{side}", shift=(0, 0.06), shade=(0.6, 0.45, 0.35))
        c.lathe([(0.0, 0.0), (0.13, 0.0), (0.14, 0.05), (0.12, 0.1), (0.0, 0.12)], (s1[0], -0.2, 0.0), "iron", f"shin_{side}", segs=12, sx=1.0, sy=0.8)
        c.tbox((0.27, 0.42), (0.26, 0.41), 0.03, (s1[0], -0.08, -0.01), "leather", f"shin_{side}", shade=(0.25, 0.18, 0.14))
        c.box((0.28, 0.04, 0.03), (s1[0], -0.14, 0.11), "leather", f"shin_{side}", shade=LTH_D)
    hx, hy, hz = hand_pos(B)
    lo = (hx, hy + 0.02, hz - 0.14)
    hi = (hx + 0.08, hy + 0.22, hz + 0.95)
    c.lathe_ab([(0.05, 0.0), (0.05, 1.0)], lo, hi, "gold", "hand_R", segs=10)
    for k in range(5):
        t = 0.05 + k * 0.05
        p = Vector(lo) + (Vector(hi) - Vector(lo)) * t
        ring(c, 0.055, 0.012, tuple(p), "leather", "hand_R", segs=10, rot=(0.23, 0.08, 0), shade=LTH_D)
    c.ico(0.06, lo, "gold", "hand_R", sub=1)
    c.box((0.34, 0.11, 0.13), (hi[0], hi[1], hi[2] + 0.04), "gold", "hand_R")
    for sx in (-1, 1):
        c.box((0.09, 0.11, 0.25), (hi[0] + 0.13 * sx, hi[1], hi[2] + 0.18), "gold", "hand_R")
        c.box((0.05, 0.115, 0.06), (hi[0] + 0.1 * sx, hi[1], hi[2] + 0.28), "gold", "hand_R")
    c.lathe_ab([(0.04, 0.0), (0.04, 1.0)], (hi[0] - 0.12, hi[1], hi[2] - 0.04), (hi[0] + 0.12, hi[1], hi[2] - 0.04), "iron", "hand_R", segs=10)
    for k in range(5):
        x = hi[0] - 0.1 + k * 0.05
        ring(c, 0.042, 0.007, (x, hi[1], hi[2] - 0.04), "iron", "hand_R", segs=8, rot=(0, math.pi / 2, 0))
    return c, B


def ring(c, r, t, loc, mat, bone, rot=(0, 0, 0), segs=10, tsegs=4, **kw):
    prof = [(r + math.cos(k / tsegs * math.tau) * t, math.sin(k / tsegs * math.tau) * t) for k in range(tsegs + 1)]
    c.lathe(prof, loc, mat, bone, segs=segs, rot=rot, caps=False, **kw)


def sheet(c, rows, mat, bone, thick=0.02, shade=(1, 1, 1)):
    bm = bmesh.new()
    n = len(rows[0])
    outer = [[bm.verts.new(p) for p in row] for row in rows]
    inner = []
    for ri, row in enumerate(rows):
        line = []
        for k, p in enumerate(row):
            a = Vector(row[max(0, k - 1)])
            b = Vector(row[min(n - 1, k + 1)])
            up = Vector(rows[max(0, ri - 1)][k]) - Vector(rows[min(len(rows) - 1, ri + 1)][k])
            nrm = (b - a).cross(up)
            if nrm.length < 1e-6:
                nrm = Vector((0, 1, 0))
            nrm.normalize()
            line.append(bm.verts.new(Vector(p) - nrm * thick))
        inner.append(line)
    for r in range(len(rows) - 1):
        for k in range(n - 1):
            bm.faces.new((outer[r][k], outer[r + 1][k], outer[r + 1][k + 1], outer[r][k + 1]))
            bm.faces.new((inner[r][k + 1], inner[r + 1][k + 1], inner[r + 1][k], inner[r][k]))
    for r in range(len(rows) - 1):
        for k in (0, n - 1):
            bm.faces.new((outer[r][k], outer[r + 1][k], inner[r + 1][k], inner[r][k]))
    for k in range(n - 1):
        for r in (0, len(rows) - 1):
            bm.faces.new((outer[r][k], outer[r][k + 1], inner[r][k + 1], inner[r][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    c.add_bm(bm, mat, bone, shade=shade)


def blade(c, pts, widths, mat, bone, thick=0.012, side=(1, 0, 0), shade=(1, 1, 1)):
    bm = bmesh.new()
    sx = Vector(side).normalized()
    secs = []
    for k, p in enumerate(pts):
        p = Vector(p)
        a = Vector(pts[max(0, k - 1)])
        b = Vector(pts[min(len(pts) - 1, k + 1)])
        d = (b - a).normalized()
        wv = d.cross(sx).normalized()
        w = widths[k]
        secs.append([bm.verts.new(p + wv * w), bm.verts.new(p + sx * thick), bm.verts.new(p - wv * w * 0.35), bm.verts.new(p - sx * thick)])
    for a, b in zip(secs, secs[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(list(reversed(secs[0])))
    bm.faces.new(secs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    c.add_bm(bm, mat, bone, shade=shade)


def cloak_rows(z0, z1, r0, r1, a0, a1, cols, rows, cy=0.0, tatter=0.0, flare=0.0, seed=1):
    import random
    rnd = random.Random(seed)
    out = []
    for ri in range(rows + 1):
        t = ri / rows
        z = z0 + (z1 - z0) * t
        r = r0 + (r1 - r0) * t
        line = []
        for k in range(cols + 1):
            u = k / cols
            a = a0 + (a1 - a0) * u
            rr = r + flare * t * math.sin(u * math.pi * 3) * 0.3
            zz = z
            if ri == rows and tatter:
                zz += (rnd.random() * 0.6 + (0.5 if k % 2 else 0)) * tatter
            line.append((math.cos(a) * rr, cy + math.sin(a) * rr, zz))
        out.append(line)
    return out


def build_raider(images):
    B = rig(hip=0.84, chest=1.2, neck=1.36, head_top=1.8, sh_x=0.28, hand_z=0.74, leg_x=0.13)
    c = charkit.Char("raider", images)
    GB = "goblin"
    HOOD = (0.035, 0.035, 0.045)
    HOOD_IN = (0.015, 0.015, 0.02)
    DK = (0.07, 0.07, 0.08)
    LTH = (0.55, 0.4, 0.3)
    LTH_DK = (0.38, 0.27, 0.2)
    GBD = (0.72, 0.8, 0.7)
    TUSK = (1.0, 0.95, 0.8)

    c.lathe([(0.0, 1.3), (0.15, 1.31), (0.23, 1.35), (0.28, 1.42), (0.3, 1.5), (0.305, 1.58), (0.29, 1.66), (0.25, 1.72), (0.15, 1.765), (0.0, 1.775)],
            (0, -0.03, 0), GB, "head", segs=16, sx=1.1)
    c.decal((0, -0.333, 1.52), 0.5, 0.36, "face_goblin", "head", curve=0.08, cols=5)
    c.limb((-0.2, -0.3, 1.655), (0.2, -0.3, 1.655), 0.032, 0.032, GB, "head", segs=6, shade=GBD)
    for sx in (-1, 1):
        c.ico(0.075, (0.17 * sx, -0.25, 1.44), GB, "head", scale=(1.0, 0.7, 0.75), sub=2)
        c.cone(0.022, 0.0, 0.07, (0.075 * sx, -0.31, 1.385), "bone", "head", segs=6, rot=(-0.2, 0.15 * sx, 0), shade=TUSK)
    c.lathe_ab([(0.06, 0.0), (0.055, 0.25), (0.045, 0.55), (0.028, 0.85), (0.0, 1.0)], (0, -0.31, 1.52), (0, -0.47, 1.41), GB, "head", segs=8)
    for sx in (-1, 1):
        c.lathe([(0.0, 0.0), (0.06, 0.03), (0.095, 0.1), (0.09, 0.2), (0.07, 0.3), (0.04, 0.42), (0.0, 0.52)], (0.27 * sx, 0.01, 1.56), GB, "head",
                segs=8, sy=0.32, rot=(0.12, 1.2 * sx, 0.0))
        c.lathe([(0.0, 0.03), (0.04, 0.07), (0.06, 0.15), (0.05, 0.26), (0.02, 0.36), (0.0, 0.42)], (0.27 * sx, -0.014, 1.56), GB, "head",
                segs=8, sy=0.18, rot=(0.12, 1.2 * sx, 0.0), shade=(0.55, 0.42, 0.42))
    ring(c, 0.032, 0.008, (0.4, -0.02, 1.49), "gold", "head", rot=(1.57, 0, 0), segs=10)

    c.lathe([(0.0, 1.93), (0.08, 1.9), (0.16, 1.82), (0.25, 1.73), (0.31, 1.62), (0.335, 1.5), (0.33, 1.4), (0.3, 1.31), (0.27, 1.27)],
            (0, 0.12, 0), "cloth", "head", segs=16, sx=1.12, shade=HOOD)
    c.lathe([(0.29, 1.63), (0.33, 1.69), (0.315, 1.76), (0.25, 1.81), (0.13, 1.84), (0.0, 1.85)], (0, -0.005, 0), "cloth", "head", segs=16, sx=1.12, shade=HOOD)
    c.lathe([(0.3, 1.64), (0.335, 1.68), (0.33, 1.71), (0.3, 1.69)], (0, -0.005, 0), "cloth", "head", segs=16, sx=1.12, shade=HOOD_IN)
    c.lathe_ab([(0.08, 0.0), (0.07, 0.3), (0.05, 0.6), (0.025, 0.85), (0.0, 1.0)], (0, 0.18, 1.86), (0, 0.4, 1.95), "cloth", "head", segs=8, shade=HOOD)
    c.lathe_ab([(0.03, 0.0), (0.02, 0.7), (0.0, 1.0)], (0, 0.4, 1.95), (0, 0.5, 1.82), "cloth", "head", segs=6, shade=HOOD)

    c.lathe([(0.23, 1.2), (0.3, 1.25), (0.315, 1.31), (0.3, 1.37), (0.22, 1.41)], (0, -0.02, 0), TEAM, "chest", segs=16)
    c.ico(0.06, (0.12, -0.3, 1.28), TEAM, "chest", scale=(1.2, 0.8, 1.0), sub=2)
    c.lathe_ab([(0.05, 0.0), (0.045, 0.5), (0.035, 0.9), (0.0, 1.0)], (0.13, -0.32, 1.26), (0.2, -0.34, 1.0), TEAM, "chest", segs=6)
    c.lathe_ab([(0.045, 0.0), (0.04, 0.5), (0.03, 0.9), (0.0, 1.0)], (0.1, -0.31, 1.26), (0.07, -0.33, 1.04), TEAM, "chest", segs=6)

    c.lathe([(0.17, 0.9), (0.21, 0.98), (0.235, 1.08), (0.24, 1.18), (0.2, 1.3)], (0, 0, 0), GB, "chest", segs=14, sy=0.8)
    c.lathe([(0.2, 0.94), (0.245, 1.02), (0.262, 1.1), (0.26, 1.2), (0.22, 1.25)], (0, 0, 0), "cloth", "chest", segs=14, sy=0.82, shade=DK)
    c.lathe([(0.205, 1.0), (0.25, 1.06), (0.262, 1.13), (0.24, 1.2)], (0, 0.0, 0), "leather", "chest", segs=14, sy=0.86, shade=LTH_DK)
    c.limb((-0.22, -0.2, 1.22), (0.18, -0.21, 0.96), 0.028, 0.028, "leather", "chest", segs=6, shade=LTH)
    c.limb((-0.22, 0.18, 1.22), (0.18, 0.19, 0.96), 0.028, 0.028, "leather", "chest", segs=6, shade=LTH)
    for k in range(3):
        t = 0.25 + k * 0.25
        x = -0.22 + 0.4 * t
        z = 1.22 - 0.26 * t
        c.box((0.05, 0.03, 0.06), (x, -0.225, z), "leather", "chest", rot=(0, 0.55, 0), shade=LTH_DK)
        c.tbox((0.03, 0.006), (0.0, 0.004), 0.13, (x + 0.01, -0.235, z + 0.02), "steel", "chest", rot=(0, 0.55, 0), shade=(1.2, 1.2, 1.3))
    c.box((0.06, 0.02, 0.05), (-0.18, -0.215, 1.19), "gold", "chest")

    rows = cloak_rows(1.3, 0.5, 0.25, 0.42, math.radians(20), math.radians(160), 10, 5, cy=0.02, tatter=0.09, flare=0.06, seed=7)
    sheet(c, rows, "cloth", "chest", thick=0.018, shade=HOOD)
    c.lathe([(0.25, 1.26), (0.29, 1.3), (0.26, 1.34)], (0, 0.03, 0), "cloth", "chest", segs=14, sy=0.9, shade=HOOD)

    c.lathe([(0.2, 0.78), (0.225, 0.84), (0.228, 0.9), (0.22, 0.96), (0.2, 0.99)], (0, 0, 0), "leather", "hips", segs=14, sy=0.85, shade=LTH)
    c.box((0.11, 0.04, 0.09), (0, -0.2, 0.88), "gold", "hips")
    c.box((0.06, 0.045, 0.05), (0, -0.205, 0.88), "leather", "hips", shade=LTH_DK)
    for sx, sz in ((-1, 1.0), (1, 0.8)):
        c.tbox((0.12, 0.07), (0.11, 0.06), 0.12, (0.17 * sx, -0.14, 0.76), "leather", "hips", rot=(0, 0, 0.35 * sx), shade=LTH_DK)
        c.box((0.125, 0.075, 0.04), (0.17 * sx, -0.145, 0.88), "leather", "hips", rot=(0, 0, 0.35 * sx), shade=LTH)
        c.ico(0.012, (0.17 * sx, -0.19, 0.86), "gold", "hips", sub=1)
    c.lathe([(0.0, 0.0), (0.04, 0.01), (0.045, 0.06), (0.03, 0.1), (0.015, 0.12), (0.015, 0.15), (0.0, 0.155)], (0.21, 0.08, 0.74), "plain", "hips", segs=8, shade=(0.3, 0.55, 0.3))
    c.lathe([(0.21, 0.82), (0.245, 0.72), (0.262, 0.62), (0.265, 0.57)], (0, 0, 0), "cloth", "hips", segs=14, sy=0.8, shade=DK)
    for fy, rot in ((-1, 0.08), (1, -0.08)):
        rows = [[(x, fy * 0.2 + (0.02 if fy > 0 else -0.02), z) for x in (-0.11, -0.04, 0.04, 0.11)] for z in (0.8, 0.66, 0.52)]
        rows[-1] = [(x, y, z - (0.04 if k % 2 else 0.0)) for k, (x, y, z) in enumerate(rows[-1])]
        sheet(c, rows, TEAM, "hips", thick=0.015)

    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.ico(0.075, a0, "cloth", f"arm_{side}", scale=(1.0, 1.0, 0.85), sub=2, shade=DK)
        c.limb(a0, a1, 0.065, 0.055, GB, f"arm_{side}", segs=8)
        c.ico(0.055, a1, GB, f"forearm_{side}", sub=1)
        c.limb(f0, f1, 0.055, 0.05, GB, f"forearm_{side}", segs=8)
        c.lathe([(0.066, 0.0), (0.075, 0.04), (0.078, 0.12), (0.072, 0.18), (0.064, 0.21)], (f1[0], f1[1], f1[2]), "leather", f"forearm_{side}", segs=10, shade=LTH)
        for zz in (0.05, 0.15):
            ring(c, 0.077, 0.008, (f1[0], f1[1], f1[2] + zz), "leather", f"forearm_{side}", segs=10, shade=LTH_DK)
        for k in range(3):
            a = -math.pi / 2 + (k - 1) * 0.6
            c.ico(0.011, (f1[0] + math.cos(a) * 0.079, f1[1] + math.sin(a) * 0.079, f1[2] + 0.1), "iron", f"forearm_{side}", sub=1)
        hx, hy, hz = hand_pos(B, side)
        c.ico(0.072, (hx, hy, hz + 0.02), GB, f"hand_{side}", scale=(0.9, 1.05, 1.1), sub=2)
        for k in range(3):
            fz = hz + 0.05 - k * 0.04
            c.lathe_ab([(0.022, 0.0), (0.02, 0.6), (0.0, 1.0)], (hx + 0.04 * sx, hy - 0.04, fz), (hx + 0.01 * sx, hy - 0.08, fz - 0.01), GB, f"hand_{side}", segs=5)
            c.lathe_ab([(0.02, 0.0), (0.016, 0.6), (0.0, 1.0)], (hx + 0.01 * sx, hy - 0.08, fz - 0.01), (hx - 0.04 * sx, hy - 0.07, fz - 0.02), GB, f"hand_{side}", segs=5)
        c.lathe_ab([(0.024, 0.0), (0.02, 0.6), (0.0, 1.0)], (hx - 0.05 * sx, hy - 0.03, hz + 0.06), (hx - 0.03 * sx, hy - 0.08, hz + 0.02), GB, f"hand_{side}", segs=5)
        for k in range(4):
            ring(c, 0.028, 0.008, (hx, hy - 0.02, hz + 0.08 - k * 0.04), "leather", f"hand_{side}", segs=8, shade=(0.4, 0.3, 0.25))
        c.ico(0.03, (hx, hy - 0.02, hz + 0.13), "gold", f"hand_{side}", sub=1)
        c.tbox((0.18, 0.04), (0.13, 0.035), 0.035, (hx, hy - 0.02, hz - 0.085), "gold", f"hand_{side}")
        pts = [(hx, hy - 0.02, hz - 0.08), (hx, hy - 0.06, hz - 0.2), (hx, hy - 0.12, hz - 0.32), (hx, hy - 0.2, hz - 0.42), (hx, hy - 0.3, hz - 0.5), (hx, hy - 0.4, hz - 0.55), (hx, hy - 0.48, hz - 0.565)]
        blade(c, pts, [0.05, 0.052, 0.05, 0.045, 0.038, 0.025, 0.004], "steel", f"hand_{side}", thick=0.012, side=(1, 0, 0), shade=(1.25, 1.25, 1.35))

        c.limb(t0, t1, 0.085, 0.07, "cloth", f"thigh_{side}", segs=8, shade=DK)
        c.ico(0.072, s0, "leather", f"shin_{side}", scale=(1.05, 1.0, 0.8), sub=2, shade=LTH_DK)
        c.limb(s0, s1, 0.065, 0.055, GB, f"shin_{side}", segs=8)
        for zz in (0.1, 0.17, 0.24):
            ring(c, 0.07, 0.01, (s1[0], -0.01, s1[2] + zz - 0.1 + 0.08), "cloth", f"shin_{side}", segs=10, shade=(0.45, 0.4, 0.35))
        c.lathe([(0.08, 0.0), (0.088, 0.08), (0.085, 0.18), (0.075, 0.24), (0.09, 0.27)], (s1[0], -0.01, 0.05), "leather", f"shin_{side}", segs=10, shade=LTH)
        c.tbox((0.15, 0.3), (0.12, 0.2), 0.08, (s1[0], -0.08, 0.0), "leather", f"shin_{side}", shift=(0, 0.04), shade=LTH)
        c.tbox((0.16, 0.31), (0.15, 0.3), 0.025, (s1[0], -0.08, -0.005), "leather", f"shin_{side}", shade=(0.25, 0.18, 0.14))
        c.lathe_ab([(0.075, 0.0), (0.07, 0.3), (0.05, 0.6), (0.03, 0.85), (0.02, 1.0)], (s1[0], -0.1, 0.055), (s1[0], -0.33, 0.07), "leather", f"shin_{side}", segs=8, shade=LTH)
        c.lathe_ab([(0.022, 0.0), (0.015, 0.6), (0.0, 1.0)], (s1[0], -0.33, 0.07), (s1[0], -0.37, 0.15), "leather", f"shin_{side}", segs=6, shade=LTH)
    return c, B


def folded(c, profile, loc, mat, bone, segs=20, folds=6, amp=0.06, sx=1.0, sy=1.0, phase=0.0, caps=True, rot=(0, 0, 0), shade=(1, 1, 1), grow=0.0):
    bm = bmesh.new()
    rings = []
    zs = [z for _, z in profile]
    zlo, zhi = min(zs), max(zs)
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
            continue
        k = 1.0 if zhi == zlo else (zhi - z) / (zhi - zlo)
        a = amp * (1.0 + grow * k)
        line = []
        for i in range(segs):
            t = phase + i / segs * math.tau
            rr = r * (1.0 + a * math.sin(t * folds))
            line.append(bm.verts.new((math.cos(t) * rr * sx, math.sin(t) * rr * sy, z)))
        rings.append(line)
    for a_, b_ in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            if len(a_) == 1:
                bm.faces.new((a_[0], b_[i], b_[j]))
            elif len(b_) == 1:
                bm.faces.new((a_[j], a_[i], b_[0]))
            else:
                bm.faces.new((a_[i], a_[j], b_[j], b_[i]))
    if caps and len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if caps and len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    c.add_bm(bm, mat, bone, c.xform(loc, rot), shade=shade, uv_mode="cyl")


def skull(c, r, loc, bone, rot=(0, 0, 0), shade=(1.0, 0.95, 0.85)):
    x, y, z = loc
    c.ico(r, (x, y, z + r * 0.15), "bone", bone, scale=(0.95, 1.0, 1.0), sub=2, shade=shade)
    c.tbox((r * 1.1, r * 0.9), (r * 1.2, r * 1.0), r * 0.7, (x, y - r * 0.15, z - r * 0.85), "bone", bone, shade=shade)
    for sx in (-1, 1):
        c.ico(r * 0.28, (x + r * 0.38 * sx, y - r * 0.85, z + r * 0.1), "plain", bone, sub=1, shade=(0.05, 0.03, 0.04))
    c.ico(r * 0.14, (x, y - r * 0.92, z - r * 0.25), "plain", bone, sub=1, shade=(0.05, 0.03, 0.04))


def build_summoner(images):
    B = rig(hip=0.85, chest=1.22, neck=1.42, head_top=1.78, sh_x=0.32, hand_z=0.8, leg_x=0.14)
    c = charkit.Char("summoner", images)
    ROBE = (0.46, 0.16, 0.62)
    ROBE_DK = (0.3, 0.1, 0.42)
    ROBE_IN = (0.16, 0.06, 0.22)
    DARK = (0.12, 0.08, 0.14)
    VOID = (0.03, 0.02, 0.05)
    TWINE = (0.62, 0.5, 0.36)

    c.lathe([(0.0, 1.42), (0.19, 1.44), (0.24, 1.52), (0.25, 1.6), (0.23, 1.7), (0.12, 1.77), (0.0, 1.79)], (0, 0.02, 0), "plain", "head", segs=14, shade=VOID)
    for sx in (-1, 1):
        c.ico(0.035, (0.08 * sx, -0.22, 1.6), "eye", "head", scale=(1.3, 0.6, 0.8), sub=2, rot=(0, 0, -0.25 * sx))
        c.box((0.07, 0.015, 0.012), (0.085 * sx, -0.225, 1.645), "plain", "head", rot=(0, 0, -0.35 * sx), shade=VOID)
    c.tbox((0.15, 0.08), (0.17, 0.09), 0.06, (0, -0.17, 1.44), "bone", "head", shade=(0.75, 0.72, 0.62))
    for k in range(5):
        c.box((0.018, 0.012, 0.025), (-0.05 + k * 0.025, -0.21, 1.49), "bone", "head", shade=(0.95, 0.92, 0.82))

    op = math.radians(52)
    a0 = -math.pi / 2 + op
    a1 = 1.5 * math.pi - op
    hood = cloak_rows(1.36, 1.78, 0.37, 0.335, a0, a1, 18, 4, cy=0.07)
    sheet(c, hood, "plain", "head", thick=0.03, shade=ROBE)
    lin = cloak_rows(1.38, 1.77, 0.33, 0.3, a0 + 0.06, a1 - 0.06, 16, 3, cy=0.07)
    sheet(c, lin, "plain", "head", thick=0.01, shade=ROBE_IN)
    folded(c, [(0.335, 1.72), (0.33, 1.8), (0.28, 1.9), (0.21, 2.0), (0.15, 2.08), (0.09, 2.17), (0.0, 2.24)],
           (0, 0.07, 0), "plain", "head", segs=18, folds=5, amp=0.035, shade=ROBE)
    c.lathe_ab([(0.075, 0.0), (0.06, 0.35), (0.045, 0.65), (0.025, 0.9), (0.0, 1.0)], (0, 0.09, 2.18), (0.02, 0.33, 2.2), "plain", "head", segs=8, shade=ROBE)
    c.lathe_ab([(0.028, 0.0), (0.018, 0.6), (0.0, 1.0)], (0.02, 0.33, 2.2), (0.06, 0.43, 2.07), "plain", "head", segs=6, shade=ROBE)
    c.ico(0.03, (0.06, 0.43, 2.06), "gold", "head", sub=1)
    edge = []
    for k in range(9):
        t = op * (k / 8 * 2 - 1)
        rr = 0.35 if abs(t) < op * 0.99 else 0.35
        z = 1.66 + 0.18 * (1 - abs(t) / op) ** 0.7
        edge.append((math.cos(-math.pi / 2 + t) * rr, 0.07 + math.sin(-math.pi / 2 + t) * rr, z))
    for x, y, _ in (edge[0], edge[-1]):
        pass
    sides = [(math.cos(a) * 0.36, 0.07 + math.sin(a) * 0.36) for a in (a0, a1)]
    for (x, y), e in zip(sides, (edge[0], edge[-1])):
        c.limb((x * 1.03, y, 1.37), (x, y, 1.66), 0.022, 0.022, PAINT, "head", segs=6)
        c.limb((x, y, 1.66), e, 0.022, 0.022, PAINT, "head", segs=6)
    for p0, p1 in zip(edge, edge[1:]):
        c.limb(p0, p1, 0.022, 0.022, PAINT, "head", segs=6)
    for k in range(1, 8):
        x, y, z = edge[k]
        top = 1.78 + 0.002
        if z < top:
            continue
    fill = [[(math.cos(-math.pi / 2 + t) * 0.338, 0.07 + math.sin(-math.pi / 2 + t) * 0.338, zz) for t in [op * (k / 8 * 2 - 1) for k in range(9)]] for zz in (1.9, 1.78)]
    fill.append([(x, y + 0.005, z) for x, y, z in edge])
    sheet(c, fill, "plain", "head", thick=0.025, shade=ROBE)

    rows = cloak_rows(1.42, 1.08, 0.24, 0.42, 0.0, math.tau, 22, 3, cy=0.01, tatter=0.06, flare=0.0, seed=11)
    sheet(c, rows, "plain", "chest", thick=0.02, shade=ROBE_DK)
    ring(c, 0.255, 0.025, (0, 0.01, 1.4), PAINT, "chest", segs=18)
    folded(c, [(0.27, 1.06), (0.31, 1.16), (0.33, 1.28), (0.31, 1.38), (0.24, 1.44)], (0, 0, 0), "plain", "chest", segs=16, folds=4, amp=0.03, sy=0.85, shade=ROBE)
    ring(c, 0.045, 0.012, (0, -0.31, 1.26), "gold", "chest", rot=(1.57, 0, 0), segs=12)
    c.ico(0.055, (0, -0.32, 1.26), CRYSTAL, "chest", sub=2, scale=(1.0, 0.7, 1.25))
    for k in range(4):
        a = k / 4 * math.tau + math.pi / 4
        c.cone(0.012, 0.0, 0.05, (math.cos(a) * 0.05, -0.31, 1.26 + math.sin(a) * 0.06), "gold", "chest", segs=4, rot=(1.57, 0, -a))

    folded(c, [(0.46, 0.04), (0.45, 0.2), (0.41, 0.42), (0.36, 0.64), (0.31, 0.86), (0.28, 1.08)], (0, 0.02, 0), "plain", "hips",
           segs=24, folds=7, amp=0.05, grow=1.2, sy=0.9, shade=ROBE)
    rows = cloak_rows(0.24, 0.0, 0.445, 0.48, 0.0, math.tau, 28, 2, cy=0.02, tatter=0.05, seed=5)
    sheet(c, rows, "plain", "hips", thick=0.015, shade=ROBE_DK)
    ring(c, 0.45, 0.022, (0, 0.02, 0.22), PAINT, "hips", segs=24)
    rows = [[(x, -0.385 + 0.12 * (1.02 - z), z) for x in (-0.07, -0.025, 0.025, 0.07)] for z in (1.02, 0.7, 0.38, 0.06)]
    sheet(c, rows, PAINT, "hips", thick=0.012)
    for zz in (0.95, 0.63, 0.31):
        c.ico(0.022, (0, -0.39 + 0.12 * (1.02 - zz), zz), "gold", "hips", sub=1)
    ring(c, 0.305, 0.03, (0, 0.02, 0.95), "leather", "hips", segs=18, tsegs=6, shade=TWINE)
    c.ico(0.045, (0.17, -0.25, 0.94), "leather", "hips", sub=1, shade=TWINE)
    for k, (x, ln) in enumerate(((0.15, 0.16), (0.2, 0.24))):
        c.limb((x, -0.26, 0.92), (x + 0.01, -0.27, 0.92 - ln), 0.012, 0.012, "leather", "hips", segs=4, shade=TWINE)
        skull(c, 0.045, (x + 0.01, -0.28, 0.92 - ln - 0.05), "hips")
    c.limb((-0.24, -0.12, 0.92), (-0.3, -0.1, 0.72), 0.008, 0.008, "iron", "hips", segs=4)
    c.tbox((0.17, 0.06), (0.17, 0.06), 0.22, (-0.32, -0.08, 0.5), "leather", "hips", rot=(0, 0, 0.12), shade=(0.4, 0.15, 0.18))
    c.tbox((0.15, 0.065), (0.15, 0.065), 0.2, (-0.32, -0.08, 0.51), "plain", "hips", rot=(0, 0, 0.12), shade=(0.92, 0.88, 0.75))
    for cx in (-1, 1):
        for cz in (0.52, 0.7):
            c.box((0.03, 0.07, 0.03), (-0.32 + cx * 0.075, -0.08, cz), "gold", "hips")
    for sx in (-1, 1):
        c.lathe_ab([(0.06, 0.0), (0.05, 0.5), (0.025, 0.85), (0.0, 1.0)], (0.12 * sx, -0.3, 0.04), (0.14 * sx, -0.52, 0.06), "leather", "hips", segs=8, shade=DARK)

    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        c.ico(0.14, a0, "plain", f"arm_{side}", scale=(1.1, 1.0, 0.9), sub=2, shade=ROBE)
        c.lathe_ab([(0.1, 0.0), (0.11, 0.5), (0.115, 1.0)], a0, a1, "plain", f"arm_{side}", segs=10, shade=ROBE)
        c.lathe_ab([(0.11, 0.0), (0.125, 0.3), (0.16, 0.65), (0.21, 0.92), (0.22, 1.0)], f0, f1, "plain", f"forearm_{side}", segs=14, shade=ROBE)
        c.lathe_ab([(0.195, 0.88), (0.205, 0.96), (0.2, 1.0)], f0, f1, "plain", f"forearm_{side}", segs=14, shade=ROBE_IN, caps=False)
        c.lathe_ab([(0.215, 0.88), (0.232, 0.94), (0.225, 1.0), (0.21, 0.95)], f0, f1, PAINT, f"forearm_{side}", segs=14, caps=False)
        hx, hy, hz = hand_pos(B, side)
        c.ico(0.055, (hx, hy, hz + 0.03), "bone", f"hand_{side}", scale=(1.0, 0.75, 1.1), sub=2)
        for k in range(4):
            fx = hx + (k - 1.5) * 0.028
            p0 = (fx, hy - 0.02, hz - 0.01)
            p1 = (fx + (k - 1.5) * 0.012, hy - 0.06, hz - 0.08)
            p2 = (fx + (k - 1.5) * 0.02, hy - 0.08, hz - 0.15)
            c.limb(p0, p1, 0.013, 0.011, "bone", f"hand_{side}", segs=5)
            c.ico(0.013, p1, "bone", f"hand_{side}", sub=1)
            c.limb(p1, p2, 0.011, 0.005, "bone", f"hand_{side}", segs=5)
        c.limb((hx - 0.05 * sx, hy - 0.02, hz + 0.02), (hx - 0.07 * sx, hy - 0.07, hz - 0.05), 0.014, 0.006, "bone", f"hand_{side}", segs=5)
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.limb(t0, t1, 0.08, 0.07, "plain", f"thigh_{side}", segs=8, shade=DARK)
        c.limb(s0, s1, 0.07, 0.06, "plain", f"shin_{side}", segs=8, shade=DARK)
    hx, hy, hz = hand_pos(B)
    pts = [(hx, hy, hz - 0.78), (hx + 0.025, hy, hz - 0.4), (hx + 0.02, hy, hz), (hx - 0.03, hy - 0.02, hz + 0.4), (hx - 0.02, hy - 0.02, hz + 0.75),
           (hx + 0.04, hy - 0.02, hz + 1.05), (hx - 0.01, hy - 0.02, hz + 1.25), (hx - 0.12, hy - 0.02, hz + 1.35), (hx - 0.21, hy - 0.02, hz + 1.29), (hx - 0.23, hy - 0.02, hz + 1.16)]
    for k, (p0, p1) in enumerate(zip(pts, pts[1:])):
        c.limb(p0, p1, 0.042 - k * 0.002, 0.04 - k * 0.002, "wood", "hand_R", segs=8)
        c.ico(0.042 - k * 0.002, p1, "wood", "hand_R", sub=1)
    for zz in (0.12, 0.2, 0.28):
        ring(c, 0.045, 0.009, (hx + 0.02, hy, hz + zz), "leather", "hand_R", segs=10, shade=TWINE)
    for k in range(3):
        c.ico(0.02, (hx + 0.022 + (k % 2) * 0.012, hy - 0.04, hz + 0.55 + k * 0.17), "wood", "hand_R", sub=1, shade=(0.8, 0.75, 0.7))
    cx, cy, cz = hx - 0.08, hy - 0.02, hz + 1.12
    c.ico(0.11, (cx, cy, cz), CRYSTAL, "hand_R", scale=(0.85, 0.85, 1.3), sub=2)
    for k in range(3):
        a = k / 3 * math.tau
        p0 = (cx + math.cos(a) * 0.07, cy + math.sin(a) * 0.07, cz - 0.16)
        p1 = (cx + math.cos(a) * 0.12, cy + math.sin(a) * 0.12, cz)
        p2 = (cx + math.cos(a) * 0.07, cy + math.sin(a) * 0.07, cz + 0.13)
        c.limb((cx, cy, cz - 0.2), p0, 0.018, 0.016, "wood", "hand_R", segs=6)
        c.limb(p0, p1, 0.016, 0.013, "wood", "hand_R", segs=6)
        c.limb(p1, p2, 0.013, 0.004, "wood", "hand_R", segs=6)
    c.limb((cx - 0.13, cy, cz + 0.06), (cx - 0.13, cy, cz - 0.12), 0.006, 0.006, "leather", "hand_R", segs=4, shade=TWINE)
    skull(c, 0.04, (cx - 0.13, cy, cz - 0.16), "hand_R")
    c.limb((cx - 0.13, cy - 0.02, cz - 0.2), (cx - 0.11, cy - 0.04, cz - 0.34), 0.018, 0.0, "plain", "hand_R", segs=4, shade=(0.2, 0.55, 0.3))
    return c, B


def curl(c, start, dirs, r0, mat, bone, segs=6, shade=(1, 1, 1), taper=0.85):
    p = Vector(start)
    r = r0
    for d in dirs:
        q = p + Vector(d)
        c.limb(tuple(p), tuple(q), r, r * taper, mat, bone, segs=segs, shade=shade)
        c.ico(r * taper, tuple(q), mat, bone, sub=1, shade=shade)
        p = q
        r *= taper


def tube(c, pts, radii, mat, bone, segs=6, shade=(1, 1, 1), cap=True):
    bm = bmesh.new()
    pts = [Vector(p) for p in pts]
    rings = []
    t0 = (pts[1] - pts[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    n = t0.cross(ref).normalized()
    for k, p in enumerate(pts):
        a = pts[max(0, k - 1)]
        b = pts[min(len(pts) - 1, k + 1)]
        t = (b - a).normalized()
        n = (n - t * n.dot(t))
        if n.length < 1e-6:
            n = t.cross(ref)
        n.normalize()
        bn = t.cross(n)
        r = radii[k]
        rings.append([bm.verts.new(p + (n * math.cos(i / segs * math.tau) + bn * math.sin(i / segs * math.tau)) * r) for i in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1])
        for i in range(segs):
            bm.faces.new((rings[-1][i], rings[-1][(i + 1) % segs], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    c.add_bm(bm, mat, bone, shade=shade, uv_mode="cyl")


def human_head(w=0.215, d=0.24, h=0.225, face=0.2, jaw=0.32, chin=0.02):
    def f(v):
        x, y, z = v.x, v.y, v.z
        if z < 0:
            k = -z
            x *= 1 - jaw * k ** 1.6
            if y < 0:
                y *= 1 - 0.1 * k
        if z > 0.2 and y > 0:
            y *= 1.08
        X, Y, Z = x * w, y * d, z * h
        if z < -0.55 and y < 0:
            Y -= chin * (-z - 0.55) / 0.45
        if Y < -face:
            Y = -face + (Y + face) * 0.35
        if abs(x) > 0.55 and -0.3 < z < 0.25 and y < -0.3:
            X *= 1.04
        return Vector((X, Y, Z))
    return f


def build_duelist(images):
    B = rig(hip=0.9, chest=1.26, neck=1.44, head_top=1.84, sh_x=0.3, hand_z=0.8, leg_x=0.14)
    c = charkit.Char("duelist", images)
    HAT = (1.05, 0.92, 0.68)
    WH = (1.2, 1.17, 1.08)
    LACE = (1.35, 1.33, 1.28)
    BLK = (0.045, 0.045, 0.05)
    HAIR = (0.18, 0.12, 0.1)
    LTH = (0.55, 0.38, 0.28)
    BOOT = (0.3, 0.22, 0.18)

    hc = Vector((0, -0.01, 1.615))
    hf = human_head(w=0.185, d=0.225, h=0.245, face=0.19, jaw=0.4, chin=0.025)
    c.ico(1.0, tuple(hc), "flesh", "head", sub=3, deform=hf)

    def surf(xr, zr, out=0.0):
        y = -math.sqrt(max(0.0, 1 - xr * xr - zr * zr))
        q = hc + hf(Vector((xr, y, zr)))
        return q + Vector((0, -out, 0))

    SKIN_D = (0.82, 0.68, 0.62)
    LIP = (0.78, 0.46, 0.4)
    for sx in (-1, 1):
        e = surf(0.36 * sx, 0.13, 0.0)
        c.ico(1.0, tuple(e), "plain", "head", sub=2, scale=(0.031, 0.01, 0.0145), shade=(1.2, 1.17, 1.1))
        c.ico(1.0, tuple(e + Vector((0.003 * -sx, -0.0085, 0.0))), "plain", "head", sub=1, scale=(0.011, 0.0045, 0.0128), shade=(0.32, 0.2, 0.1))
        c.ico(1.0, tuple(e + Vector((0.003 * -sx, -0.0125, 0.0))), "plain", "head", sub=1, scale=(0.0055, 0.0022, 0.0064), shade=(0.02, 0.02, 0.02))
        c.ico(0.0026, tuple(e + Vector((0.0015 * -sx, -0.014, 0.006))), "plain", "head", sub=1, shade=(1.6, 1.6, 1.6))
        lid = [e + Vector((-0.033 * sx * k, -0.004 - 0.004 * (1 - abs(k)), 0.011 + 0.005 * (1 - abs(k)))) for k in (-1, -0.5, 0, 0.5, 1)]
        tube(c, lid, [0.004, 0.006, 0.007, 0.006, 0.004], "flesh", "head", segs=5, shade=SKIN_D, cap=False)
        brow = [surf(0.17 * sx, 0.32, 0.02), surf(0.34 * sx, 0.37, 0.022), surf(0.52 * sx, 0.33, 0.016)]
        tube(c, brow, [0.009, 0.011, 0.006], "hair", "head", segs=5, shade=HAIR)
    bridge = surf(0.0, 0.16, 0.002)
    tip = surf(0.0, -0.2, 0.032)
    c.lathe_ab([(0.011, 0.0), (0.012, 0.35), (0.015, 0.7), (0.0, 1.0)], tuple(bridge), tuple(tip), "flesh", "head", segs=8, sx=0.8)
    c.ico(1.0, tuple(tip), "flesh", "head", sub=2, scale=(0.017, 0.016, 0.015))
    for sx in (-1, 1):
        c.ico(1.0, tuple(tip + Vector((0.016 * sx, 0.012, -0.007))), "flesh", "head", sub=2, scale=(0.012, 0.012, 0.01), shade=(0.94, 0.82, 0.76))
        c.ico(1.0, tuple(tip + Vector((0.008 * sx, 0.004, -0.015))), "plain", "head", sub=1, scale=(0.0055, 0.006, 0.0025), shade=(0.12, 0.06, 0.05))
    mz = -0.5
    up = [surf(-0.27, mz + 0.0, 0.006), surf(-0.12, mz + 0.03, 0.012), surf(0.0, mz + 0.025, 0.014), surf(0.12, mz + 0.03, 0.012), surf(0.27, mz + 0.0, 0.006)]
    tube(c, up, [0.004, 0.007, 0.007, 0.007, 0.004], "flesh", "head", segs=6, shade=(0.72, 0.46, 0.42))
    lo = [surf(-0.22, mz - 0.005, 0.006), surf(-0.1, mz - 0.03, 0.012), surf(0.0, mz - 0.035, 0.014), surf(0.1, mz - 0.03, 0.012), surf(0.22, mz - 0.005, 0.006)]
    tube(c, lo, [0.004, 0.008, 0.009, 0.008, 0.004], "flesh", "head", segs=6, shade=(0.84, 0.58, 0.52))
    c.ico(1.0, tuple(surf(0.0, -0.84, 0.004)), "flesh", "head", sub=2, scale=(0.045, 0.02, 0.03))
    for sx in (-1, 1):
        must = [surf(0.02 * sx, mz + 0.12, 0.02), surf(0.16 * sx, mz + 0.1, 0.019), surf(0.3 * sx, mz + 0.06, 0.014), surf(0.4 * sx, mz + 0.14, 0.008), surf(0.38 * sx, mz + 0.22, 0.006)]
        tube(c, must, [0.012, 0.014, 0.01, 0.006, 0.002], "hair", "head", segs=6, shade=HAIR)
        c.ico(0.06, (0.19 * sx, -0.01, 1.6), "flesh", "head", scale=(0.32, 0.6, 0.95), sub=2)
    c.lathe([(0.19, 1.735), (0.2, 1.77), (0.17, 1.82), (0.1, 1.855), (0.0, 1.865)], (0, 0.02, 0), "hair", "head", segs=16, sy=1.12, shade=HAIR)
    back = cloak_rows(1.78, 1.4, 0.2, 0.235, math.radians(5), math.radians(175), 12, 3, cy=0.02)
    sheet(c, back, "hair", "head", thick=0.04, shade=HAIR)
    shell = cloak_rows(1.79, 1.6, 0.2, 0.215, math.radians(-50), math.radians(230), 16, 3, cy=0.02)
    sheet(c, shell, "hair", "head", thick=0.035, shade=HAIR)
    for row, (rad, z0, ln, cnt, a0, a1) in enumerate(((0.205, 1.76, 0.5, 11, -42, 222), (0.225, 1.7, 0.42, 8, -25, 205))):
        for k in range(cnt):
            a = math.radians(a0 + (a1 - a0) * k / (cnt - 1))
            dx, dy = math.cos(a), math.sin(a)
            top = Vector((dx * rad, 0.03 + dy * rad, z0))
            l = ln * (0.85 + 0.15 * math.sin(k * 2.1 + row))
            bot = Vector((dx * (rad + 0.06), 0.03 + dy * (rad + 0.06), z0 - l))
            ph = k * 1.7 + row
            turns = 5.5
            n = 34
            pts = []
            rad_t = []
            for i in range(n + 1):
                t = i / n
                hr = 0.017 * (0.4 + 0.6 * min(1.0, t * 4))
                ang = ph + t * turns * math.tau
                pts.append(top + (bot - top) * t + Vector((math.cos(ang) * hr, math.sin(ang) * hr, 0)))
                rad_t.append((0.027 - row * 0.003) * (1 - 0.35 * t))
            tube(c, pts, rad_t, "hair", "head", segs=5, shade=HAIR)
            tube(c, [top, (top + bot) / 2, bot], [(0.024 - row * 0.003), (0.02 - row * 0.002), 0.012], "hair", "head", segs=6, shade=(HAIR[0] * 0.8, HAIR[1] * 0.8, HAIR[2] * 0.8))
    tilt = (-0.12, 0.0, -0.1)
    c.lathe([(0.0, 0.0), (0.27, 0.0), (0.45, 0.01), (0.48, 0.04), (0.44, 0.05), (0.27, 0.06), (0.26, 0.14), (0.25, 0.22), (0.2, 0.28), (0.1, 0.3), (0.0, 0.3)],
            (0, 0.04, 1.75), "cloth", "head", segs=20, sy=0.9, shade=HAT, rot=tilt)
    c.lathe([(0.262, 0.06), (0.268, 0.09), (0.268, 0.12), (0.262, 0.13)], (0, 0.04, 1.75), "cloth", "head", segs=20, sy=0.9, caps=False, rot=tilt, shade=BLK)
    flap = []
    for ti in range(4):
        t = ti / 3
        r = 0.26 + 0.2 * t
        row = []
        for ui in range(9):
            u = (ui / 8 * 2 - 1) * 0.95
            lift = 0.26 * t ** 1.4 * math.cos(u / 0.95 * math.pi / 2) ** 0.6
            row.append((math.cos(u) * r, 0.04 + math.sin(u) * r * 0.9, 1.775 + lift))
        flap.append(row)
    sheet(c, flap, "cloth", "head", thick=0.02, shade=HAT)
    c.ico(0.035, (0.29, -0.03, 1.86), "gold", "head", sub=2)
    c.ico(0.02, (0.29, -0.065, 1.86), CRYSTAL, "head", sub=1)
    for k, (shade, ln, side) in enumerate(((1.25, 1.0, 0.0), (1.12, 0.85, 0.07), (1.0, 0.72, -0.06), (1.18, 0.6, 0.12))):
        base = Vector((0.2 + side * 0.3, 0.1, 1.96))
        pts = []
        for t in range(9):
            u = t / 8
            pts.append(tuple(base + Vector((0.12 * u + side * u, 0.58 * ln * u, 0.22 * ln * math.sin(u * math.pi * 0.85) - 0.18 * ln * u * u))))
        blade(c, pts, [0.015, 0.045, 0.07, 0.082, 0.08, 0.07, 0.052, 0.03, 0.004], "feather", "head", thick=0.007, side=(0.15, 0, 1), shade=(shade, shade * 0.98, shade * 0.95))
    c.lathe_ab([(0.02, 0.0), (0.015, 1.0)], (0.2, 0.1, 1.96), (0.22, 0.2, 2.02), "gold", "head", segs=6)

    folded(c, [(0.18, 0.92), (0.235, 1.02), (0.265, 1.14), (0.27, 1.26), (0.255, 1.36), (0.18, 1.44)], (0, 0, 0), "cloth", "chest", segs=16, folds=6, amp=0.02, sy=0.82, shade=WH)
    c.limb((0, -0.225, 0.98), (0, -0.215, 1.38), 0.018, 0.018, "cloth", "chest", segs=6, shade=(0.9, 0.86, 0.78))
    for k in range(6):
        c.ico(0.016, (0, -0.235, 1.0 + k * 0.07), "gold", "chest", sub=1)
    rows = cloak_rows(1.45, 1.3, 0.13, 0.27, 0.0, math.tau, 24, 2, cy=0.0, tatter=0.0)
    rows[-1] = [(x, y, z + (0.015 if k % 2 else -0.015)) for k, (x, y, z) in enumerate(rows[-1])]
    sheet(c, rows, "plain", "chest", thick=0.012, shade=LACE)
    for k in range(12):
        a = k / 12 * math.tau
        c.ico(0.018, (math.cos(a) * 0.265, math.sin(a) * 0.265, 1.3), "plain", "chest", sub=1, shade=LACE)
    c.limb((-0.24, -0.2, 1.38), (0.2, -0.18, 0.88), 0.035, 0.035, TEAM, "chest", segs=6)
    c.limb((-0.24, 0.2, 1.38), (0.2, 0.18, 0.88), 0.035, 0.035, TEAM, "chest", segs=6)
    for t in (0.0, 1.0):
        c.limb((-0.24, -0.2 + 0.0 * t, 1.38), (-0.24, 0.2, 1.38), 0.034, 0.034, TEAM, "chest", segs=6)
    c.box((0.06, 0.03, 0.06), (-0.02, -0.21, 1.13), "gold", "chest", rot=(0, 0.85, 0))
    rows = cloak_rows(1.42, 0.82, 0.25, 0.38, math.radians(50), math.radians(185), 10, 4, cy=0.05, tatter=0.0, flare=0.04)
    rows = [[(x + 0.04, y, z) for x, y, z in r] for r in rows]
    sheet(c, rows, TEAM, "chest", thick=0.018)
    edge = [r[0] for r in rows] + list(reversed(rows[-1]))[:0]
    for p0, p1 in zip([r[0] for r in rows], [r[0] for r in rows][1:]):
        c.limb(p0, p1, 0.016, 0.016, "gold", "chest", segs=5)
    for p0, p1 in zip(rows[-1], rows[-1][1:]):
        c.limb(p0, p1, 0.016, 0.016, "gold", "chest", segs=5)
    c.ico(0.04, (0.28, -0.04, 1.4), "gold", "chest", sub=2)

    c.lathe([(0.22, 0.86), (0.245, 0.9), (0.245, 0.98), (0.22, 1.0)], (0, 0, 0), "leather", "hips", segs=16, sy=0.85, shade=LTH)
    c.box((0.12, 0.05, 0.1), (0, -0.22, 0.93), "gold", "hips")
    c.box((0.07, 0.055, 0.05), (0, -0.225, 0.93), "leather", "hips", shade=LTH)
    folded(c, [(0.22, 0.9), (0.27, 0.8), (0.28, 0.72), (0.26, 0.66)], (0, 0, 0), "cloth", "hips", segs=16, folds=6, amp=0.04, sy=0.85, shade=BLK)
    c.lathe_ab([(0.035, 0.0), (0.035, 0.9), (0.02, 1.0)], (-0.26, -0.02, 0.92), (-0.38, 0.38, 0.32), "leather", "hips", segs=8, shade=(0.3, 0.2, 0.16))
    c.lathe_ab([(0.04, 0.0), (0.04, 1.0)], (-0.36, 0.32, 0.4), (-0.38, 0.38, 0.32), "gold", "hips", segs=8)
    ring(c, 0.045, 0.01, (-0.27, 0.0, 0.9), "gold", "hips", rot=(0.6, -0.3, 0), segs=10)

    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        folded(c, [(0.0, -0.1), (0.1, -0.08), (0.135, 0.0), (0.12, 0.08), (0.0, 0.11)], a0, TEAM, f"arm_{side}", segs=12, folds=4, amp=0.12)
        for k in range(4):
            a = k / 4 * math.tau + 0.4
            c.limb((a0[0] + math.cos(a) * 0.125, a0[1] + math.sin(a) * 0.125, a0[2] + 0.06), (a0[0] + math.cos(a) * 0.125, a0[1] + math.sin(a) * 0.125, a0[2] - 0.07), 0.025, 0.025, "cloth", f"arm_{side}", segs=4, shade=WH)
        folded(c, [(0.08, 0.0), (0.095, 0.4), (0.09, 0.8), (0.075, 1.0)], (0, 0, 0), "cloth", f"arm_{side}", segs=10, folds=4, amp=0.05, shade=WH) if False else c.lathe_ab([(0.078, 0.0), (0.092, 0.4), (0.085, 0.8), (0.072, 1.0)], a0, a1, "cloth", f"arm_{side}", segs=10, shade=WH)
        c.lathe_ab([(0.07, 0.0), (0.075, 0.5), (0.065, 1.0)], f0, f1, "cloth", f"forearm_{side}", segs=10, shade=WH)
        c.lathe_ab([(0.068, 0.45), (0.1, 0.75), (0.125, 0.95), (0.12, 1.0)], f0, f1, "leather", f"forearm_{side}", segs=12, shade=LTH, caps=False)
        c.lathe_ab([(0.126, 0.94), (0.135, 0.98), (0.128, 1.0)], f0, f1, "gold", f"forearm_{side}", segs=12, caps=False)
        hx, hy, hz = hand_pos(B, side)
        c.ico(0.065, (hx, hy, hz + 0.02), "leather", f"hand_{side}", scale=(0.9, 1.0, 1.1), sub=2, shade=LTH)
        for k in range(4):
            fx = hx + (k - 1.5) * 0.024
            c.lathe_ab([(0.016, 0.0), (0.014, 0.6), (0.0, 1.0)], (fx, hy - 0.04, hz + 0.0), (fx, hy - 0.08, hz - 0.06), "leather", f"hand_{side}", segs=5, shade=LTH)
        c.lathe_ab([(0.018, 0.0), (0.015, 0.6), (0.0, 1.0)], (hx - 0.05 * sx, hy - 0.02, hz + 0.04), (hx - 0.04 * sx, hy - 0.07, hz - 0.01), "leather", f"hand_{side}", segs=5, shade=LTH)

        folded(c, [(0.095, 0.0), (0.11, 0.3), (0.105, 0.7), (0.085, 1.0)], (0, 0, 0), "cloth", f"thigh_{side}", segs=10, folds=3, amp=0.04, shade=BLK) if False else c.lathe_ab([(0.095, 0.0), (0.112, 0.35), (0.105, 0.7), (0.085, 1.0)], t0, t1, "cloth", f"thigh_{side}", segs=10, shade=BLK)
        c.lathe([(0.1, 0.0), (0.108, 0.1), (0.112, 0.25), (0.118, 0.36), (0.124, 0.42)], (s1[0], -0.01, 0.04), "leather", f"shin_{side}", segs=14, shade=BOOT)
        c.lathe([(0.124, 0.38), (0.16, 0.42), (0.185, 0.5), (0.19, 0.56), (0.17, 0.58), (0.15, 0.5), (0.128, 0.44)], (s1[0], -0.01, 0.04), "leather", f"shin_{side}", segs=16, shade=(0.4, 0.28, 0.22))
        c.lathe_ab([(0.095, 0.0), (0.1, 0.3), (0.09, 0.62), (0.06, 0.88), (0.0, 1.0)], (s1[0], 0.02, 0.07), (s1[0], -0.27, 0.06), "leather", f"shin_{side}", segs=12, shade=BOOT)
        c.tbox((0.17, 0.3), (0.165, 0.29), 0.025, (s1[0], -0.12, -0.005), "leather", f"shin_{side}", shade=(0.2, 0.15, 0.12))
        c.tbox((0.11, 0.09), (0.1, 0.08), 0.06, (s1[0], 0.06, -0.005), "leather", f"shin_{side}", shade=(0.2, 0.15, 0.12))
        c.limb((s1[0] - 0.1, -0.12, 0.09), (s1[0] + 0.1, -0.12, 0.09), 0.012, 0.012, "leather", f"shin_{side}", segs=5, shade=(0.25, 0.18, 0.14))
        c.limb((s1[0], 0.06, 0.08), (s1[0], 0.13, 0.08), 0.008, 0.008, "gold", f"shin_{side}", segs=4)
        ring(c, 0.02, 0.006, (s1[0], 0.14, 0.08), "gold", f"shin_{side}", rot=(0, 1.57, 0), segs=8)

    hx, hy, hz = hand_pos(B)
    gy = hy - 0.02
    c.lathe([(0.0, -0.06), (0.06, -0.05), (0.09, -0.02), (0.085, 0.0), (0.0, 0.01)], (hx, gy, hz - 0.08), "gold", "hand_R", segs=12)
    c.limb((hx - 0.13, gy, hz - 0.085), (hx + 0.13, gy, hz - 0.085), 0.014, 0.014, "gold", "hand_R", segs=6)
    for sx in (-1, 1):
        c.ico(0.022, (hx + 0.135 * sx, gy, hz - 0.085), "gold", "hand_R", sub=1)
    ring(c, 0.05, 0.008, (hx, gy - 0.035, hz - 0.12), "gold", "hand_R", rot=(0, 1.57, 0), segs=10)
    ring(c, 0.04, 0.007, (hx, gy + 0.035, hz - 0.12), "gold", "hand_R", rot=(0, 1.57, 0), segs=10)
    bow = [(hx, gy - 0.02, hz - 0.08), (hx + 0.05, gy - 0.06, hz - 0.02), (hx + 0.07, gy - 0.07, hz + 0.06), (hx + 0.05, gy - 0.05, hz + 0.13), (hx, gy - 0.02, hz + 0.16)]
    for p0, p1 in zip(bow, bow[1:]):
        c.limb(p0, p1, 0.01, 0.01, "gold", "hand_R", segs=5)
    c.lathe_ab([(0.026, 0.0), (0.028, 0.5), (0.026, 1.0)], (hx, gy + 0.0, hz - 0.07), (hx, gy + 0.02, hz + 0.12), "leather", "hand_R", segs=8, shade=(0.4, 0.25, 0.2))
    for k in range(4):
        ring(c, 0.028, 0.005, (hx, gy + 0.004 + k * 0.004, hz - 0.04 + k * 0.045), "gold", "hand_R", segs=8)
    c.ico(0.035, (hx, gy + 0.022, hz + 0.15), "gold", "hand_R", sub=2)
    tip = Vector((hx, hy - 0.5, hz - 0.95))
    base = Vector((hx, gy, hz - 0.12))
    pts = [tuple(base + (tip - base) * (k / 6)) for k in range(7)]
    blade(c, pts, [0.022, 0.02, 0.018, 0.015, 0.012, 0.008, 0.002], "steel", "hand_R", thick=0.009, side=(1, 0, 0), shade=(1.4, 1.4, 1.5))
    return c, B


def branch(c, start, dirs, r0, mat, bone, shade=(1, 1, 1), taper=0.75, segs=6):
    pts = [Vector(start)]
    for d in dirs:
        pts.append(pts[-1] + Vector(d))
    radii = [r0 * taper ** k for k in range(len(pts))]
    tube(c, pts, radii, mat, bone, segs=segs, shade=shade)
    return pts


def build_warden(images):
    B = rig(hip=0.88, chest=1.3, neck=1.52, head_top=1.92, sh_x=0.5, hand_z=0.66, leg_x=0.22)
    c = charkit.Char("warden", images)
    BK = "moss_bark"
    GRN = (0.8, 1.2, 0.62)
    BARK = (0.9, 0.85, 0.75)
    LEAF = (0.75, 1.35, 0.45)
    LEAF2 = (0.95, 1.2, 0.4)
    MOSS = (0.55, 1.1, 0.35)
    VOID = (0.04, 0.03, 0.02)

    folded(c, [(0.0, 1.26), (0.2, 1.27), (0.23, 1.36), (0.235, 1.5), (0.22, 1.64), (0.2, 1.74), (0.17, 1.82), (0.0, 1.84)], (0, -0.02, 0), BK, "head",
           segs=18, folds=9, amp=0.06, sy=0.95, shade=GRN)
    c.limb((-0.17, -0.205, 1.69), (0.17, -0.205, 1.69), 0.045, 0.045, BK, "head", segs=7, shade=(0.6, 0.9, 0.47))
    for sx in (-1, 1):
        c.ico(1.0, (0.09 * sx, -0.2, 1.62), "plain", "head", sub=2, scale=(0.055, 0.03, 0.04), shade=VOID)
        c.ico(1.0, (0.09 * sx, -0.225, 1.62), "plain", "head", sub=2, scale=(0.03, 0.012, 0.018), shade=(0.6, 1.6, 0.3))
        c.ico(0.06, (0.17 * sx, -0.16, 1.47), BK, "head", sub=1, scale=(0.9, 0.7, 1.0), shade=GRN)
    c.ico(0.05, (0.0, -0.225, 1.56), BK, "head", sub=1, scale=(0.8, 0.9, 1.2), shade=(0.7, 1.0, 0.55))
    crack = [(-0.08, -0.215, 1.45), (-0.03, -0.225, 1.43), (0.02, -0.222, 1.445), (0.08, -0.212, 1.43)]
    tube(c, crack, [0.012, 0.016, 0.014, 0.01], "plain", "head", segs=5, shade=VOID, cap=False)
    for k in range(9):
        a = math.radians(200 + k * 17.5)
        x = math.cos(a) * 0.2
        y = -0.02 + math.sin(a) * 0.19
        ln = 0.18 + 0.12 * ((k * 7) % 5) / 4
        branch(c, (x, y, 1.39), [(x * 0.08, -0.01, -ln * 0.5), (x * 0.05 + 0.01 * math.sin(k), -0.01, -ln * 0.5)], 0.025, "plain", "head", shade=MOSS, taper=0.6, segs=5)
    for sx in (-1, 1):
        p = branch(c, (0.12 * sx, 0.0, 1.8), [(0.14 * sx, 0.02, 0.12), (0.14 * sx, -0.01, 0.1), (0.1 * sx, -0.02, 0.1), (0.05 * sx, 0.0, 0.08)], 0.045, "bark", "head", shade=BARK, taper=0.78)
        q1 = branch(c, tuple(p[1]), [(0.02 * sx, 0.02, 0.14), (-0.02 * sx, 0.01, 0.1)], 0.03, "bark", "head", shade=BARK, taper=0.7)
        q2 = branch(c, tuple(p[2]), [(0.06 * sx, 0.04, 0.12), (0.02 * sx, 0.02, 0.08)], 0.025, "bark", "head", shade=BARK, taper=0.7)
        q3 = branch(c, tuple(p[3]), [(0.1 * sx, 0.02, -0.04), (0.06 * sx, 0.0, 0.02)], 0.02, "bark", "head", shade=BARK, taper=0.7)
        for q, sc in ((q1[-1], 0.85), (q2[-1], 0.8), (p[4], 0.75), (q3[-1], 0.6), (p[2] + Vector((0.0, -0.05, 0.03)), 0.55)):
            c.ico(0.11 * sc, tuple(q), "leaves", "head", sub=2, scale=(1.3, 1.1, 0.8), shade=LEAF if sc > 0.7 else LEAF2)
    c.ico(0.15, (0, 0.06, 1.86), "leaves_fall", "head", scale=(1.4, 1.1, 0.7), sub=2, shade=(1.0, 0.95, 0.95))
    c.lathe([(0.0, 0.0), (0.012, 0.0), (0.012, 0.05), (0.04, 0.06), (0.045, 0.08), (0.0, 0.1)], (0.13, -0.12, 1.79), "plain", "head", segs=8, shade=(1.3, 0.35, 0.25))
    for k in range(3):
        c.ico(0.012, (0.13 + (k - 1) * 0.015, -0.16, 1.87 + (k % 2) * 0.01), "plain", "head", sub=1, shade=(1.4, 1.4, 1.3))

    folded(c, [(0.31, 0.86), (0.4, 0.96), (0.45, 1.12), (0.48, 1.3), (0.46, 1.46), (0.38, 1.56), (0.22, 1.62), (0.0, 1.63)], (0, 0.0, 0), BK, "chest",
           segs=24, folds=11, amp=0.05, sy=0.62, shade=GRN)
    for (x, z, r) in ((0.2, 1.1, 0.12), (-0.25, 1.35, 0.1), (0.05, 0.95, 0.08), (-0.1, 1.5, 0.09)):
        c.ico(r, (x, -0.27, z), "leaves", "chest", sub=1, scale=(1.0, 0.35, 0.8), shade=MOSS)
    vine = [(math.cos(t * 3.4) * 0.44, math.sin(t * 3.4) * 0.29, 0.9 + t * 0.62) for t in [k / 20 for k in range(21)]]
    tube(c, vine, [0.02] * 21, "plain", "chest", segs=5, shade=(0.35, 0.75, 0.25))
    for k in range(0, 21, 4):
        x, y, z = vine[k]
        c.ico(0.04, (x * 1.06, y * 1.1, z + 0.02), "leaves", "chest", sub=1, scale=(1.3, 0.5, 0.8), shade=LEAF2)
    sash = [(-0.44, -0.24, 1.55), (-0.15, -0.31, 1.35), (0.15, -0.3, 1.1), (0.42, -0.24, 0.92)]
    tube(c, sash, [0.06] * 4, TEAM, "chest", segs=6)
    back = [(-0.44, 0.24, 1.55), (-0.15, 0.31, 1.35), (0.15, 0.3, 1.1), (0.42, 0.24, 0.92)]
    tube(c, back, [0.06] * 4, TEAM, "chest", segs=6, shade=(0.8, 0.8, 0.8))
    c.ico(0.06, (-0.05, -0.33, 1.27), "leaves", "chest", sub=2, scale=(1.0, 0.5, 1.0), shade=LEAF)
    c.ico(0.03, (-0.05, -0.36, 1.27), "gold", "chest", sub=1)
    for sx in (-1, 1):
        c.ico(0.26, (0.5 * sx, 0.0, 1.55), "leaves", "chest", sub=2, scale=(1.3, 1.2, 0.85), shade=LEAF)
        c.ico(0.16, (0.62 * sx, -0.12, 1.47), "leaves_fall", "chest", sub=2, scale=(1.0, 1.0, 0.8), shade=(1.0, 0.9, 0.9) if sx > 0 else (1.15, 1.15, 1.0))
        for k in range(3):
            branch(c, (0.48 * sx, 0.05 - k * 0.08, 1.62), [(0.12 * sx, 0.02, 0.12 + k * 0.03), (0.05 * sx, 0.0, 0.08)], 0.03, "bark", "chest", shade=BARK, taper=0.6, segs=5)
    folded(c, [(0.29, 0.72), (0.33, 0.78), (0.34, 0.86), (0.31, 0.92)], (0, 0.0, 0), BK, "hips", segs=18, folds=7, amp=0.06, sy=0.7, shade=(0.68, 1.02, 0.527))
    for k in range(7):
        a = math.radians(-90 + (k - 3) * 25)
        branch(c, (math.cos(a) * 0.3, math.sin(a) * 0.21, 0.76), [(math.cos(a) * 0.04, math.sin(a) * 0.03, -0.12), (0.0, 0.0, -0.08)], 0.03, "plain", "hips", shade=MOSS, taper=0.6, segs=5)

    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        mid = (Vector(a0) + Vector(a1)) / 2 + Vector((0.03 * sx, 0.02, 0))
        tube(c, [a0, tuple(mid), a1], [0.14, 0.12, 0.12], BK, f"arm_{side}", segs=9, shade=GRN)
        c.ico(0.06, tuple(mid + Vector((0.09 * sx, -0.05, 0.0))), BK, f"arm_{side}", sub=1, shade=(0.7, 1.0, 0.55))
        c.ico(0.12, a1, BK, f"forearm_{side}", sub=1, shade=GRN)
        midf = (Vector(f0) + Vector(f1)) / 2 + Vector((0.02 * sx, -0.02, 0))
        tube(c, [f0, tuple(midf), f1], [0.12, 0.13, 0.15], BK, f"forearm_{side}", segs=9, shade=GRN)
        c.ico(0.07, tuple(midf + Vector((0.0, 0.1, 0.02))), "leaves", f"forearm_{side}", sub=1, scale=(1.2, 0.6, 0.8), shade=MOSS)
        hx, hy, hz = hand_pos(B, side)
        c.ico(0.14, (hx, hy, hz), BK, f"hand_{side}", sub=2, scale=(1.0, 0.95, 1.0), shade=GRN)
        for k in range(4):
            fx = (k - 1.5) * 0.06
            branch(c, (hx + fx, hy - 0.06, hz - 0.06), [(fx * 0.4, -0.04, -0.12), (fx * 0.3, -0.02, -0.1), (0.0, 0.03, -0.06)], 0.03, "bark", f"hand_{side}", shade=BARK, taper=0.72, segs=5)
        branch(c, (hx - 0.1 * sx, hy - 0.06, hz), [(-0.06 * sx, -0.06, -0.08), (0.0, -0.02, -0.08)], 0.03, "bark", f"hand_{side}", shade=BARK, taper=0.7, segs=5)
        midt = (Vector(t0) + Vector(t1)) / 2 + Vector((0.02 * sx, 0.0, 0))
        tube(c, [t0, tuple(midt), t1], [0.17, 0.16, 0.15], BK, f"thigh_{side}", segs=9, shade=GRN)
        c.ico(0.14, t1, BK, f"shin_{side}", sub=1, shade=GRN)
        tube(c, [s0, tuple((Vector(s0) + Vector(s1)) / 2), s1], [0.15, 0.16, 0.19], BK, f"shin_{side}", segs=9, shade=GRN)
        c.ico(0.19, (s1[0], -0.02, 0.12), BK, f"shin_{side}", sub=2, scale=(1.0, 1.1, 0.7), shade=(0.64, 0.96, 0.496))
        for k in range(5):
            a = math.radians(-90 + (k - 2) * 38)
            branch(c, (s1[0] + math.cos(a) * 0.12, -0.02 + math.sin(a) * 0.12, 0.1), [(math.cos(a) * 0.1, math.sin(a) * 0.1, -0.06), (math.cos(a) * 0.08, math.sin(a) * 0.08, -0.04)],
                   0.045, "bark", f"shin_{side}", shade=BARK, taper=0.62, segs=6)
    import random
    rnd = random.Random(42)
    FALL = [(1.0, 0.45, 0.1), (0.85, 0.2, 0.08), (1.05, 0.75, 0.12), (0.6, 0.3, 0.1), (0.95, 0.58, 0.1)]

    def leaf(p, n, size, col):
        p = Vector(p)
        n = Vector(n).normalized()
        t = n.cross(Vector((0, 0, 1)))
        if t.length < 1e-3:
            t = Vector((1, 0, 0))
        t.normalize()
        a = rnd.uniform(0, math.tau)
        d = (t * math.cos(a) + n.cross(t) * math.sin(a)).normalized()
        pts = [tuple(p + n * 0.012 + d * size * (u - 0.5) + n * size * 0.12 * math.sin(u * math.pi)) for u in (0.0, 0.25, 0.5, 0.75, 1.0)]
        blade(c, pts, [0.0, size * 0.32, size * 0.38, size * 0.25, 0.0], "plain", bone_of[0], thick=0.004, side=tuple(n), shade=col)

    bone_of = ["chest"]
    prof = [(0.86, 0.31), (0.96, 0.4), (1.12, 0.45), (1.3, 0.48), (1.46, 0.46), (1.56, 0.38)]

    def trunk_r(z):
        for (z0, r0), (z1, r1) in zip(prof, prof[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return prof[-1][1]

    for k in range(38):
        z = rnd.uniform(0.92, 1.52)
        a = rnd.uniform(0, math.tau)
        rr = trunk_r(z) * 1.07
        x, y = math.cos(a) * rr, math.sin(a) * rr * 0.62
        leaf((x, y, z), (math.cos(a), math.sin(a) * 1.6, 0.15), rnd.uniform(0.1, 0.15), FALL[k % 5])
    for k in range(10):
        a = rnd.uniform(0, math.tau)
        z = rnd.uniform(0.95, 1.5)
        c.box((0.12, 0.03, rnd.uniform(0.14, 0.26)), (math.cos(a) * 0.47, math.sin(a) * 0.3, z), "bark", "chest", rot=(0, rnd.uniform(-0.2, 0.2), a + math.pi / 2), shade=(0.55, 0.5, 0.42))
    for k in range(9):
        a = k / 9 * math.tau + 0.2
        pts = [(math.cos(a) * 0.475, math.sin(a) * 0.3, z) for z in (0.92, 1.12, 1.32, 1.48)]
        tube(c, pts, [0.012] * 4, "plain", "chest", segs=4, shade=(0.12, 0.09, 0.06), cap=False)
    for (x, y, z) in ((0.22, -0.27, 1.22), (-0.3, 0.25, 1.05), (0.38, 0.18, 1.4)):
        ring(c, 0.045, 0.018, (x, y, z), "bark", "chest", rot=(1.57, 0, math.atan2(y, x) - 1.57), segs=10, shade=(0.55, 0.48, 0.4))
        c.ico(0.035, (x * 1.02, y * 1.02, z), "plain", "chest", sub=1, scale=(1.0, 0.5, 1.0), shade=(0.08, 0.06, 0.04))
    for k in range(6):
        a = rnd.uniform(0, math.tau)
        z = rnd.uniform(0.95, 1.5)
        c.ico(rnd.uniform(0.06, 0.09), (math.cos(a) * trunk_r(z) * 1.03, math.sin(a) * trunk_r(z) * 0.64, z), "plain", "chest", sub=1, scale=(1.0, 0.35, 0.8), shade=(0.62, 0.78, 0.42))
    for side, sx in (("R", -1), ("L", 1)):
        for part, (p0, p1, r) in (("arm", (B[f"arm_{side}"][0], B[f"arm_{side}"][1], 0.13)), ("forearm", (B[f"forearm_{side}"][0], B[f"forearm_{side}"][1], 0.14)),
                                  ("thigh", (B[f"thigh_{side}"][0], B[f"thigh_{side}"][1], 0.16)), ("shin", (B[f"shin_{side}"][0], B[f"shin_{side}"][1], 0.17))):
            bone_of[0] = f"{part}_{side}"
            p0 = Vector(p0)
            p1 = Vector(p1)
            ax = (p1 - p0).normalized()
            ref = Vector((1, 0, 0)) if abs(ax.x) < 0.9 else Vector((0, 1, 0))
            u = ax.cross(ref).normalized()
            v = ax.cross(u)
            for k in range(4):
                t = rnd.uniform(0.15, 0.85)
                a = rnd.uniform(0, math.tau)
                n = u * math.cos(a) + v * math.sin(a)
                leaf(tuple(p0 + (p1 - p0) * t + n * (r + 0.03)), tuple(n), rnd.uniform(0.09, 0.12), FALL[(k + len(part)) % 5])
            a = rnd.uniform(0, math.tau)
            n = u * math.cos(a) + v * math.sin(a)
            c.box((0.09, 0.03, 0.18), tuple(p0 + (p1 - p0) * 0.5 + n * r), "bark", bone_of[0], rot=(0, 0, math.atan2(n.y, n.x) + math.pi / 2), shade=(0.55, 0.5, 0.42))
    bone_of[0] = "head"
    for k in range(5):
        a = rnd.uniform(math.pi * 0.1, math.pi * 0.9)
        leaf((math.cos(a) * 0.22, -0.02 + math.sin(a) * 0.21, rnd.uniform(1.5, 1.75)), (math.cos(a), math.sin(a), 0.2), rnd.uniform(0.05, 0.07), FALL[k % 5])
    for sx in (-1, 1):
        c.ico(0.14, (0.38 * sx, -0.08, 1.7), "leaves_fall", "chest", sub=2, scale=(1.1, 1.0, 0.8), shade=(0.95, 0.7, 0.7) if sx > 0 else (1.1, 1.0, 0.9))
        c.ico(0.11, (0.66 * sx, 0.1, 1.42), "leaves_fall", "chest", sub=2, scale=(1.0, 1.0, 0.8), shade=(1.2, 1.2, 1.05))
    c.ico(0.1, (0.12, 0.14, 1.92), "leaves", "head", sub=2, scale=(1.2, 1.0, 0.8), shade=(1.35, 0.45, 0.12))
    lx, ly, lz = hand_pos(B, "L")
    sc = Vector((lx + 0.16, ly, lz + 0.22))
    R = 0.5
    rot = (0, math.pi / 2, 0)
    for k in range(7):
        y = (k - 3) * 0.14
        edge = abs(y) + 0.07
        h = 2 * math.sqrt(max(0.0, R * R - edge * edge)) if edge < R else 0.1
        h = max(h, 2 * math.sqrt(max(0.0, R * R - y * y)) * 0.86)
        c.box((0.07, 0.138, h), (sc.x, sc.y + y, sc.z), "wood", "hand_L", shade=(0.95 - 0.07 * (k % 2),) * 3)
    ring(c, R, 0.035, tuple(sc), "iron", "hand_L", rot=rot, segs=24, tsegs=5)
    c.lathe([(0.0, 0.0), (0.12, 0.0), (0.11, 0.05), (0.06, 0.09), (0.0, 0.1)], (sc.x - 0.04, sc.y, sc.z), "iron", "hand_L", segs=14, rot=(0, -math.pi / 2, 0))
    c.lathe([(0.2, 0.0), (0.21, 0.01), (0.2, 0.02), (0.13, 0.02), (0.12, 0.01), (0.13, 0.0)], (sc.x - 0.04, sc.y, sc.z), TEAM, "hand_L", segs=20, rot=(0, -math.pi / 2, 0))
    vine = [(sc.x - 0.05, sc.y + math.cos(t * 5.2) * R * 0.95, sc.z + math.sin(t * 5.2) * R * 0.95) for t in [k / 14 * 0.9 + 0.1 for k in range(15)]]
    tube(c, vine, [0.018] * 15, "plain", "hand_L", segs=5, shade=(0.35, 0.75, 0.25))
    for k in range(0, 15, 3):
        x, y, z = vine[k]
        c.ico(0.045, (x - 0.01, y, z), "leaves", "hand_L", sub=1, scale=(0.5, 1.2, 0.9), shade=LEAF2)
    return c, B


def build_herald(images):
    B = rig(hip=0.86, chest=1.24, neck=1.44, head_top=1.84, sh_x=0.33, hand_z=0.78, leg_x=0.15)
    c = charkit.Char("herald", images)
    ST = (1.0, 1.0, 1.05)
    ST_D = (0.72, 0.72, 0.78)
    VOID = (0.04, 0.04, 0.06)
    LTH = (0.5, 0.35, 0.25)
    PLUME = (1.15, 0.95, 0.35)

    c.lathe([(0.0, 1.38), (0.16, 1.385), (0.225, 1.42), (0.25, 1.52), (0.26, 1.64), (0.25, 1.74), (0.22, 1.82), (0.14, 1.88), (0.0, 1.9)], (0, -0.02, 0), "steel", "head", segs=18, sy=1.08, shade=ST)
    c.lathe([(0.258, 1.6), (0.268, 1.62), (0.268, 1.68), (0.258, 1.7)], (0, -0.02, 0), "gold", "head", segs=18, sy=1.08, caps=False)
    c.tbox((0.32, 0.05), (0.32, 0.05), 0.035, (0, -0.29, 1.63), "plain", "head", shade=VOID)
    c.tbox((0.035, 0.05), (0.035, 0.05), 0.16, (0, -0.29, 1.47), "plain", "head", shade=VOID)
    for sx in (-1, 1):
        for k in range(3):
            for r in range(2):
                c.ico(0.008, (0.07 * sx + 0.03 * k * sx, -0.285 + 0.01 * k, 1.5 - r * 0.035), "plain", "head", sub=1, shade=VOID)
    c.lathe_ab([(0.02, 0.0), (0.025, 0.5), (0.02, 1.0)], (0, -0.285, 1.42), (0, -0.2, 1.9), "gold", "head", segs=6) if False else None
    crest = [(0, -0.27, 1.72), (0, -0.2, 1.86), (0, -0.05, 1.93), (0, 0.12, 1.9), (0, 0.24, 1.78)]
    tube(c, crest, [0.022, 0.026, 0.026, 0.024, 0.018], "gold", "head", segs=6)
    for k in range(5):
        base = Vector((0.0, -0.02 + k * 0.025, 1.92))
        side = (k - 2) * 0.05
        pts = [tuple(base + Vector((side * u, 0.32 * u, 0.22 * math.sin(u * 2.4) - 0.1 * u * u))) for u in [t / 6 for t in range(7)]]
        blade(c, pts, [0.015, 0.04, 0.055, 0.055, 0.045, 0.028, 0.004], "feather", "head", thick=0.006, side=(1, 0, 0.2), shade=PLUME if k % 2 == 0 else (1.2, 1.2, 1.15))
    ring(c, 0.2, 0.03, (0, -0.01, 1.42), "steel", "chest", segs=16, tsegs=5, shade=ST_D)
    ring(c, 0.18, 0.025, (0, -0.01, 1.46), "steel", "chest", segs=16, tsegs=5, shade=ST)

    folded(c, [(0.2, 0.96), (0.26, 1.06), (0.3, 1.22), (0.3, 1.34), (0.26, 1.42), (0.18, 1.48)], (0, 0, 0), "steel", "chest", segs=18, folds=1, amp=0.04, phase=-math.pi, sy=0.8, shade=ST)
    c.limb((0, -0.255, 0.98), (0, -0.25, 1.38), 0.015, 0.015, "steel", "chest", segs=5, shade=(1.2, 1.2, 1.25))
    for k in range(6):
        a = math.radians(-90 + (k - 2.5) * 22)
        c.ico(0.012, (math.cos(a) * 0.3, math.sin(a) * 0.24, 1.36), "gold", "chest", sub=1)
    front = [[(x, -0.265 - 0.02 * (1 - z), z) for x in (-0.17, -0.06, 0.06, 0.17)] for z in (1.36, 1.0, 0.7, 0.42)]
    front[-1] = [(x, y, z - (0.06 if k in (1, 2) else 0.0)) for k, (x, y, z) in enumerate(front[-1])]
    sheet(c, front, TEAM, "chest", thick=0.015)
    for col in (0, -1):
        tube(c, [r[col] for r in front], [0.012] * len(front), "gold", "chest", segs=5)
    tube(c, front[-1], [0.012] * 4, "gold", "chest", segs=5)
    crest_pts = [(0, -0.3, 1.18), (0.07, -0.3, 1.16), (0.07, -0.3, 1.02), (0, -0.3, 0.94), (-0.07, -0.3, 1.02), (-0.07, -0.3, 1.16)]
    tube(c, crest_pts + [crest_pts[0]], [0.012] * 7, "gold", "chest", segs=5, cap=False)
    c.ico(0.035, (0, -0.305, 1.07), "gold", "chest", sub=2, scale=(1.0, 0.5, 1.2))
    back = [[(x, 0.25 + 0.02 * (1 - z), z) for x in (-0.24, -0.08, 0.08, 0.24)] for z in (1.36, 1.0, 0.6, 0.3)]
    back[-1] = [(x, y, z - (0.08 if k in (1, 2) else 0.0)) for k, (x, y, z) in enumerate(back[-1])]
    sheet(c, back, TEAM, "chest", thick=0.015, shade=(0.8, 0.8, 0.8))
    for sx in (-1, 1):
        for k, (r, z) in enumerate(((0.18, 1.44), (0.165, 1.37), (0.15, 1.3))):
            c.lathe([(0.0, 0.06), (r * 0.6, 0.05), (r, 0.0), (r * 0.95, -0.03), (r * 0.6, -0.02)], (0.37 * sx, 0.0, z), "steel", "chest", segs=12, sx=1.1, rot=(0, 0.35 * sx, 0), shade=ST if k == 0 else ST_D)
            c.lathe([(r * 1.0, -0.005), (r * 1.03, -0.02), (r * 0.98, -0.035)], (0.37 * sx, 0.0, z), "gold", "chest", segs=12, sx=1.1, caps=False, rot=(0, 0.35 * sx, 0))

    c.lathe([(0.24, 0.9), (0.265, 0.94), (0.265, 1.0), (0.24, 1.02)], (0, 0, 0), "leather", "hips", segs=16, sy=0.85, shade=LTH)
    c.box((0.12, 0.05, 0.1), (0, -0.25, 0.95), "gold", "hips")
    c.tbox((0.1, 0.06), (0.09, 0.05), 0.11, (0.2, -0.17, 0.85), "leather", "hips", rot=(0, 0, 0.3), shade=LTH)
    for k in range(3):
        z = 0.88 - k * 0.07
        c.lathe([(0.25 + k * 0.012, 0.0), (0.27 + k * 0.012, -0.07)], (0, 0, z), "steel", "hips", segs=16, sy=0.85, caps=False, shade=ST if k % 2 == 0 else ST_D)

    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.lathe_ab([(0.08, 0.0), (0.085, 0.5), (0.078, 1.0)], a0, a1, "steel", f"arm_{side}", segs=10, shade=ST)
        c.ico(0.075, a1, "steel", f"forearm_{side}", sub=2, shade=ST_D)
        c.cone(0.07, 0.0, 0.08, (a1[0], a1[1] + 0.06, a1[2]), "steel", f"forearm_{side}", segs=8, rot=(-1.57, 0, 0), shade=ST)
        c.lathe_ab([(0.072, 0.0), (0.078, 0.55), (0.1, 0.85), (0.105, 1.0)], f0, f1, "steel", f"forearm_{side}", segs=10, shade=ST)
        c.lathe_ab([(0.105, 0.95), (0.11, 1.0)], f0, f1, "gold", f"forearm_{side}", segs=10, caps=False)
        hx, hy, hz = hand_pos(B, side)
        c.ico(0.075, (hx, hy, hz + 0.02), "steel", f"hand_{side}", sub=2, scale=(0.95, 1.0, 1.1), shade=ST_D)
        for k in range(4):
            fx = hx + (k - 1.5) * 0.026
            tube(c, [(fx, hy - 0.04, hz + 0.01), (fx, hy - 0.08, hz - 0.03), (fx + (k - 1.5) * 0.005, hy - 0.07, hz - 0.09)], [0.016, 0.014, 0.01], "steel", f"hand_{side}", segs=5, shade=ST)
        tube(c, [(hx - 0.05 * sx, hy - 0.02, hz + 0.04), (hx - 0.06 * sx, hy - 0.07, hz), (hx - 0.04 * sx, hy - 0.08, hz - 0.03)], [0.017, 0.014, 0.01], "steel", f"hand_{side}", segs=5, shade=ST)
        c.lathe_ab([(0.1, 0.0), (0.105, 0.5), (0.092, 1.0)], t0, t1, "steel", f"thigh_{side}", segs=10, shade=ST)
        c.ico(0.085, t1, "steel", f"shin_{side}", sub=2, shade=ST)
        c.lathe([(0.0, 0.0), (0.07, 0.0), (0.06, 0.06), (0.0, 0.07)], (t1[0], t1[1] - 0.06, t1[2]), "steel", f"shin_{side}", segs=10, rot=(1.57, 0, 0), shade=ST_D)
        c.lathe([(0.088, 0.0), (0.098, 0.12), (0.104, 0.3), (0.095, 0.44), (0.09, 0.5)], (s1[0], -0.01, 0.04), "steel", f"shin_{side}", segs=12, shade=ST)
        c.limb((s1[0], -0.11, 0.1), (s1[0], -0.1, 0.48), 0.012, 0.012, "steel", f"shin_{side}", segs=5, shade=(1.2, 1.2, 1.25))
        for k in range(4):
            c.tbox((0.15 - k * 0.006, 0.1), (0.14 - k * 0.006, 0.09), 0.06, (s1[0], -0.04 - k * 0.07, 0.0 + k * 0.004), "steel", f"shin_{side}", rot=(0.15, 0, 0), shade=ST if k % 2 == 0 else ST_D)
        c.cone(0.06, 0.0, 0.1, (s1[0], -0.3, 0.035), "steel", f"shin_{side}", segs=8, rot=(1.57, 0, 0), shade=ST)

    px, py = 0.3, 0.3
    c.lathe_ab([(0.035, 0.0), (0.035, 1.0)], (px, py, 0.3), (px, py, 3.0), "wood", "chest", segs=8)
    for z in (1.0, 1.3):
        ring(c, 0.045, 0.012, (px, py, z), "leather", "chest", segs=10, shade=LTH)
    tube(c, [(px, py - 0.05, 1.3), (0.1, 0.22, 1.42), (-0.2, -0.1, 1.42), (-0.25, -0.24, 1.2)], [0.02] * 4, "leather", "chest", segs=5, shade=LTH)
    c.lathe([(0.0, 0.0), (0.05, 0.02), (0.06, 0.06), (0.03, 0.18), (0.0, 0.28)], (px, py, 3.0), "gold", "chest", segs=8)
    c.lathe_ab([(0.02, 0.0), (0.02, 1.0)], (px - 0.36, py, 2.9), (px + 0.36, py, 2.9), "gold", "chest", segs=8)
    for sx in (-1, 1):
        c.ico(0.035, (px + 0.37 * sx, py, 2.9), "gold", "chest", sub=1)
    rows = []
    for zi in range(7):
        t = zi / 6
        z = 2.88 - t * 0.85
        row = []
        for xi in range(5):
            u = xi / 4
            x = px - 0.32 + u * 0.64
            y = py + 0.015 * math.sin(u * math.pi * 2 + t * 3)
            if zi == 6:
                z2 = z + (0.22 if xi == 2 else 0.11 if xi in (1, 3) else 0.0)
            else:
                z2 = z
            row.append((x, y, z2))
        rows.append(row)
    sheet(c, rows, TEAM, "chest", thick=0.012)
    for k in range(9):
        x = px - 0.32 + k * 0.08
        c.limb((x, py - 0.012, 2.06 + (0.22 - abs(k - 4) * 0.055 if 2 <= k <= 6 else 0.0) - 0.01), (x, py - 0.012, 2.0 + (0.22 - abs(k - 4) * 0.055 if 2 <= k <= 6 else 0.0) - 0.01), 0.008, 0.004, "gold", "chest", segs=4) if False else None
    tube(c, rows[-1], [0.012] * 5, "gold", "chest", segs=5)
    tube(c, [r[0] for r in rows], [0.012] * 7, "gold", "chest", segs=5)
    tube(c, [r[-1] for r in rows], [0.012] * 7, "gold", "chest", segs=5)
    crest_b = [(px, py - 0.02, 2.66), (px + 0.1, py - 0.02, 2.62), (px + 0.1, py - 0.02, 2.44), (px, py - 0.02, 2.36), (px - 0.1, py - 0.02, 2.44), (px - 0.1, py - 0.02, 2.62)]
    tube(c, crest_b + [crest_b[0]], [0.014] * 7, "gold", "chest", segs=5, cap=False)
    c.ico(0.05, (px, py - 0.025, 2.52), "gold", "chest", sub=2, scale=(1.0, 0.4, 1.2))

    hx, hy, hz = hand_pos(B)
    gy = hy - 0.02
    c.lathe_ab([(0.02, 0.0), (0.024, 0.5), (0.02, 1.0)], (hx - 0.12, gy, hz - 0.075), (hx + 0.12, gy, hz - 0.075), "gold", "hand_R", segs=8)
    for sx in (-1, 1):
        c.ico(0.025, (hx + 0.125 * sx, gy, hz - 0.075), "gold", "hand_R", sub=1)
    c.lathe_ab([(0.024, 0.0), (0.026, 0.5), (0.024, 1.0)], (hx, gy + 0.01, hz - 0.06), (hx, gy + 0.03, hz + 0.1), "leather", "hand_R", segs=8, shade=LTH)
    c.ico(0.035, (hx, gy + 0.035, hz + 0.13), "gold", "hand_R", sub=2)
    tip = Vector((hx, hy - 0.35, hz - 0.72))
    base = Vector((hx, gy, hz - 0.09))
    pts = [tuple(base + (tip - base) * (k / 6)) for k in range(7)]
    blade(c, pts, [0.038, 0.037, 0.036, 0.034, 0.03, 0.02, 0.003], "steel", "hand_R", thick=0.01, side=(1, 0, 0), shade=(1.4, 1.4, 1.5))
    return c, B


def clips():
    ph = [0, 4, 8, 12, 16]

    def cyc(a, b):
        return [(ph[0], a), (ph[2], b), (ph[4], a)]

    return {
        "idle": {
            "bones": {
                "spine": [(0, (0, 0, 0)), (12, (3, 0, 0)), (24, (0, 0, 0))],
                "head": [(0, (0, 0, 0)), (12, (4, 0, 2)), (24, (0, 0, 0))],
                "arm_R": [(0, (0, 0, 6)), (12, (-4, 0, 9)), (24, (0, 0, 6))],
                "arm_L": [(0, (0, 0, -6)), (12, (-4, 0, -9)), (24, (0, 0, -6))],
                "forearm_R": [(0, (-25, 0, 0)), (12, (-30, 0, 0)), (24, (-25, 0, 0))],
                "forearm_L": [(0, (-15, 0, 0)), (12, (-20, 0, 0)), (24, (-15, 0, 0))],
            },
            "loc": {"hips": [(0, (0, 0, 0)), (12, (0, -0.02, 0)), (24, (0, 0, 0))]},
        },
        "run": {
            "bones": {
                "thigh_R": cyc((-45, 0, 0), (38, 0, 0)),
                "thigh_L": cyc((38, 0, 0), (-45, 0, 0)),
                "shin_R": [(0, (10, 0, 0)), (4, (70, 0, 0)), (8, (20, 0, 0)), (12, (5, 0, 0)), (16, (10, 0, 0))],
                "shin_L": [(0, (20, 0, 0)), (4, (5, 0, 0)), (8, (10, 0, 0)), (12, (70, 0, 0)), (16, (20, 0, 0))],
                "arm_R": cyc((35, 0, 8), (-40, 0, 8)),
                "arm_L": cyc((-40, 0, -8), (35, 0, -8)),
                "forearm_R": cyc((-40, 0, 0), (-20, 0, 0)),
                "forearm_L": cyc((-20, 0, 0), (-50, 0, 0)),
                "spine": [(0, (16, 0, -5)), (8, (16, 0, 5)), (16, (16, 0, -5))],
                "head": [(0, (-12, 0, 4)), (8, (-12, 0, -4)), (16, (-12, 0, 4))],
            },
            "loc": {"hips": [(0, (0, 0, 0)), (4, (0, 0.06, 0)), (8, (0, 0, 0)), (12, (0, 0.06, 0)), (16, (0, 0, 0))]},
        },
        "attack_a": {
            "bones": {
                "arm_R": [(0, (0, 0, 6)), (4, (-150, 0, 15)), (7, (-60, 0, 5)), (14, (0, 0, 6))],
                "forearm_R": [(0, (-25, 0, 0)), (4, (-60, 0, 0)), (7, (-5, 0, 0)), (14, (-25, 0, 0))],
                "arm_L": [(0, (0, 0, -6)), (4, (20, 0, -20)), (7, (-30, 0, -10)), (14, (0, 0, -6))],
                "spine": [(0, (0, 0, 0)), (4, (-10, 0, 20)), (7, (25, 0, -15)), (14, (0, 0, 0))],
            },
        },
    }


WEIGHT = {"raider": 0.8, "duelist": 0.85, "warden": 1.15, "engineer": 1.0, "summoner": 1.0, "herald": 0.9}

BUILDERS = {
    "engineer": build_engineer,
    "raider": build_raider,
    "summoner": build_summoner,
    "duelist": build_duelist,
    "warden": build_warden,
    "herald": build_herald,
}


def build_one(name, images):
    coll_name = "Hero_" + name
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
    charkit.animate(arm, anims.hero_clips(WEIGHT.get(name, 1.0)))
    charkit.bake_ao([mesh], samples=32)
    size = charkit.export([mesh, arm], os.path.join(ROOT, "assets", "heroes", name + ".glb"))
    coll.hide_viewport = True
    coll.hide_render = True
    return {"tris": tris, "bytes": size}


def main():
    for store in (bpy.data.meshes, bpy.data.armatures):
        for d in list(store):
            if d.users == 0:
                store.remove(d)
    images = texgen.build_all(os.path.join(ROOT, "assets", "textures"))
    names = globals().get("HEROES") or list(BUILDERS)
    return {n: build_one(n, images) for n in names}


if __name__ == "__main__":
    RESULT = main()
