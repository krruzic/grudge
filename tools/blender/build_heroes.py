"""The rest of the launch roster: Engineer, Raider, Summoner, Duelist, Warden.

Run inside Blender (MCP): exec(open(".../tools/blender/build_heroes.py").read(), {"__name__": "__main__"})
Optional global HEROES = ["raider", ...] limits the build. Exports assets/heroes/<name>.glb.
All share the Warlord bone names so clip definitions carry over.
"""
import importlib
import math
import os
import sys

import bpy

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
    c.lathe([(0.0, 1.14), (0.28, 1.16), (0.34, 1.28), (0.35, 1.42), (0.3, 1.56), (0.0, 1.6)], (0, -0.04, 0), "flesh", "head", segs=8, sx=1.05)
    c.decal((0, -0.39, 1.4), 0.5, 0.34, "face_dwarf", "head", curve=0.07)
    c.ico(0.08, (0, -0.42, 1.34), "flesh", "head", scale=(1.0, 1.0, 0.9), shade=(1.0, 0.85, 0.8))
    c.lathe([(0.3, 1.3), (0.36, 1.18), (0.3, 1.0), (0.14, 0.86), (0.0, 0.8)], (0, -0.2, 0), "hair", "head", segs=7, sy=0.55)
    for sx in (-1, 1):
        c.limb((0.03 * sx, -0.43, 1.3), (0.16 * sx, -0.44, 1.26), 0.045, 0.02, "hair", "head", segs=4)
    c.lathe([(0.0, 1.46), (0.37, 1.46), (0.37, 1.54), (0.33, 1.64), (0.2, 1.7), (0.0, 1.72)], (0, -0.04, 0), "leather", "head", segs=8, sx=1.05, shade=(0.95, 0.8, 0.7))
    c.tbox((0.46, 0.2), (0.4, 0.14), 0.04, (0, -0.33, 1.46), "leather", "head", shade=(0.7, 0.6, 0.5))
    c.box((0.72, 0.05, 0.06), (0, -0.2, 1.53), "leather", "head", shade=(0.4, 0.35, 0.3))
    for sx in (-1, 1):
        c.lathe([(0.09, 0.0), (0.1, 0.02), (0.1, 0.08), (0.08, 0.1)], (0.12 * sx, -0.34, 1.56), "gold", "head", segs=8, rot=(math.pi / 2, 0, 0))
        c.lathe([(0.0, -0.01), (0.075, 0.0), (0.0, 0.03)], (0.12 * sx, -0.42, 1.56), "plain", "head", segs=8, rot=(math.pi / 2, 0, 0), shade=(0.55, 0.85, 1.0))
    c.lathe([(0.3, 0.6), (0.4, 0.72), (0.44, 0.9), (0.42, 1.06), (0.3, 1.18), (0.0, 1.2)], (0, 0.01, 0), "cloth", "spine", segs=8, sy=0.85, shade=YEL)
    c.tbox((0.5, 0.06), (0.38, 0.06), 0.55, (0, -0.37, 0.5), "cloth", "spine", rot=(-0.08, 0, 0), shade=YEL)
    for sx in (-1, 1):
        c.box((0.04, 0.03, 0.4), (0.17 * sx, -0.4, 0.98), "leather", "chest", rot=(0, 0.2 * sx, 0), shade=(0.6, 0.5, 0.4))
    c.lathe([(0.43, 0.64), (0.45, 0.68), (0.45, 0.76), (0.43, 0.8)], (0, 0.01, 0), "leather", "hips", segs=8, sy=0.88, shade=(0.6, 0.45, 0.35))
    c.box((0.14, 0.06, 0.12), (0, -0.42, 0.72), "gold", "hips")
    for sx, sz in ((-1, 0.14), (1, 0.12)):
        c.box((0.14, 0.1, sz), (0.3 * sx, -0.34, 0.66), "leather", "hips", rot=(0, 0, 0.3 * sx), shade=(0.75, 0.6, 0.45))
    c.limb((0.26, -0.38, 0.68), (0.26, -0.45, 0.88), 0.02, 0.02, "iron", "hips", segs=4)
    c.box((0.08, 0.04, 0.06), (0.26, -0.46, 0.9), "iron", "hips")
    c.tbox((0.44, 0.3), (0.4, 0.26), 0.44, (0, 0.34, 0.72), "wood", "chest")
    c.lathe([(0.07, 0.0), (0.08, 0.3), (0.05, 0.36)], (0.12, 0.36, 1.14), "iron", "chest", segs=6)
    c.lathe([(0.04, 0.0), (0.0, 0.02)], (0.12, 0.36, 1.5), "iron", "chest", segs=6)
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.ico(0.15, a0, TEAM, f"arm_{side}", scale=(1.15, 1.15, 1.0))
        c.limb(a0, a1, 0.11, 0.1, "flesh", f"arm_{side}", segs=6)
        c.lathe([(0.11, 0.0), (0.16, 0.1), (0.16, 0.24), (0.13, 0.3)], (f1[0], f1[1], f1[2] - 0.02), "leather", f"forearm_{side}", segs=7, shade=(0.8, 0.6, 0.45))
        c.limb(f0, f1, 0.1, 0.1, "flesh", f"forearm_{side}", segs=6)
        c.ico(0.15, hand_pos(B, side), "leather", f"hand_{side}", scale=(1.0, 1.1, 1.0), shade=(0.8, 0.6, 0.45))
        c.limb(t0, t1, 0.13, 0.12, "cloth", f"thigh_{side}", segs=6, shade=YEL_D)
        c.limb(s0, s1, 0.12, 0.12, "cloth", f"shin_{side}", segs=6, shade=YEL_D)
        c.lathe([(0.15, 0.0), (0.16, 0.14), (0.14, 0.2)], (s1[0], -0.02, 0.04), "iron", f"shin_{side}", segs=7)
        c.tbox((0.26, 0.4), (0.22, 0.26), 0.14, (s1[0], -0.08, 0.0), "leather", f"shin_{side}", shift=(0, 0.06), shade=(0.6, 0.45, 0.35))
    hx, hy, hz = hand_pos(B)
    lo = (hx, hy + 0.02, hz - 0.12)
    hi = (hx + 0.08, hy + 0.22, hz + 0.95)
    c.limb(lo, hi, 0.045, 0.045, "iron", "hand_R", segs=5)
    c.box((0.3, 0.1, 0.12), (hi[0], hi[1], hi[2] + 0.04), "gold", "hand_R")
    for sx in (-1, 1):
        c.box((0.08, 0.1, 0.22), (hi[0] + 0.12 * sx, hi[1], hi[2] + 0.16), "gold", "hand_R")
    return c, B


def build_raider(images):
    B = rig(hip=0.84, chest=1.2, neck=1.36, head_top=1.8, sh_x=0.28, hand_z=0.74, leg_x=0.13)
    c = charkit.Char("raider", images)
    GB = "goblin"
    HOOD = (0.035, 0.035, 0.045)
    DK = (0.07, 0.07, 0.08)
    c.lathe([(0.0, 1.32), (0.2, 1.34), (0.29, 1.46), (0.3, 1.6), (0.25, 1.72), (0.0, 1.76)], (0, -0.03, 0), GB, "head", segs=8, sx=1.1)
    c.decal((0, -0.33, 1.52), 0.5, 0.36, "face_goblin", "head", curve=0.08)
    c.tbox((0.08, 0.1), (0.02, 0.03), 0.2, (0, -0.33, 1.47), GB, "head", rot=(1.1, 0, 0))
    for sx in (-1, 1):
        c.lathe([(0.0, 0.0), (0.09, 0.05), (0.07, 0.3), (0.0, 0.5)], (0.26 * sx, 0.0, 1.56), GB, "head", segs=4, sy=0.35,
                rot=(0.0, 1.25 * sx, 0.0))
    c.lathe([(0.0, 1.92), (0.12, 1.82), (0.28, 1.68), (0.33, 1.52), (0.32, 1.36), (0.28, 1.28)], (0, 0.12, 0), "cloth", "head", segs=8, sx=1.1, shade=HOOD)
    c.lathe([(0.3, 1.68), (0.33, 1.72), (0.29, 1.78)], (0, 0.02, 0), "cloth", "head", segs=8, sx=1.12, shade=HOOD)
    c.lathe([(0.24, 1.2), (0.3, 1.26), (0.3, 1.34), (0.22, 1.4)], (0, -0.02, 0), TEAM, "chest", segs=8)
    c.limb((0.08, -0.22, 1.28), (0.16, -0.3, 1.0), 0.06, 0.04, TEAM, "chest", segs=4)
    c.lathe([(0.17, 0.9), (0.22, 1.02), (0.24, 1.18), (0.2, 1.3)], (0, 0, 0), GB, "chest", segs=7, sy=0.8)
    c.lathe([(0.2, 0.96), (0.25, 1.06), (0.26, 1.18), (0.22, 1.24)], (0, 0, 0), "cloth", "chest", segs=7, sy=0.82, shade=DK)
    c.limb((-0.18, -0.2, 1.22), (0.18, -0.2, 0.96), 0.03, 0.03, "leather", "chest", segs=4, shade=(0.5, 0.4, 0.3))
    c.tbox((0.62, 0.12), (0.4, 0.1), 0.72, (0, 0.24, 0.58), "cloth", "chest", rot=(-0.12, 0, 0), shade=HOOD)
    c.lathe([(0.2, 0.78), (0.22, 0.86), (0.22, 0.94), (0.2, 0.98)], (0, 0, 0), "leather", "hips", segs=7, sy=0.85, shade=(0.55, 0.4, 0.3))
    c.box((0.1, 0.05, 0.08), (0, -0.2, 0.88), "gold", "hips")
    c.lathe([(0.21, 0.82), (0.25, 0.66), (0.26, 0.58)], (0, 0, 0), "cloth", "hips", segs=7, sy=0.8, shade=DK)
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.limb(a0, a1, 0.065, 0.055, GB, f"arm_{side}", segs=5)
        c.limb(f0, f1, 0.055, 0.05, GB, f"forearm_{side}", segs=5)
        c.lathe([(0.07, 0.0), (0.08, 0.16), (0.065, 0.2)], (f1[0], f1[1], f1[2]), "leather", f"forearm_{side}", segs=6, shade=(0.6, 0.45, 0.35))
        c.ico(0.08, hand_pos(B, side), GB, f"hand_{side}", scale=(1.0, 1.1, 1.0))
        c.limb(t0, t1, 0.08, 0.065, "cloth", f"thigh_{side}", segs=5, shade=DK)
        c.limb(s0, s1, 0.065, 0.055, GB, f"shin_{side}", segs=5)
        c.lathe([(0.08, 0.0), (0.085, 0.2), (0.07, 0.26)], (s1[0], -0.01, 0.06), "leather", f"shin_{side}", segs=6, shade=(0.55, 0.4, 0.32))
        c.tbox((0.14, 0.32), (0.1, 0.16), 0.1, (s1[0], -0.1, 0.0), "leather", f"shin_{side}", shift=(0, 0.06), shade=(0.5, 0.36, 0.28))
        c.cone(0.03, 0.0, 0.12, (s1[0], -0.28, 0.06), "leather", f"shin_{side}", segs=4, rot=(-1.4, 0, 0), shade=(0.5, 0.36, 0.28))
        hx, hy, hz = hand_pos(B, side)
        c.box((0.05, 0.05, 0.14), (hx, hy, hz + 0.02), "leather", f"hand_{side}", shade=(0.4, 0.3, 0.25))
        c.box((0.16, 0.05, 0.04), (hx, hy - 0.02, hz - 0.06), "gold", f"hand_{side}")
        pts = [(hx, hy - 0.02, hz - 0.08), (hx, hy - 0.1, hz - 0.32), (hx, hy - 0.26, hz - 0.5), (hx, hy - 0.44, hz - 0.56)]
        for (p0, p1), r0, r1 in zip(zip(pts, pts[1:]), (0.05, 0.045, 0.03), (0.045, 0.03, 0.0)):
            c.limb(p0, p1, r0, max(r1, 0.006), "iron", f"hand_{side}", segs=3, shade=(1.3, 1.3, 1.4))
    return c, B


def build_summoner(images):
    B = rig(hip=0.85, chest=1.22, neck=1.42, head_top=1.78, sh_x=0.32, hand_z=0.8, leg_x=0.14)
    c = charkit.Char("summoner", images)
    ROBE = (0.46, 0.16, 0.62)
    DARK = (0.12, 0.08, 0.14)
    c.lathe([(0.0, 1.42), (0.2, 1.44), (0.25, 1.56), (0.24, 1.7), (0.0, 1.78)], (0, 0.0, 0), "plain", "head", segs=7, shade=DARK)
    for sx in (-1, 1):
        c.box((0.09, 0.03, 0.05), (0.08 * sx, -0.25, 1.6), "eye", "head", rot=(0, 0, -0.25 * sx))
    c.lathe([(0.33, 1.4), (0.36, 1.5), (0.34, 1.68), (0.26, 1.86), (0.14, 2.06), (0.06, 2.24), (0.0, 2.3)], (0, 0.08, 0), "plain", "head", segs=8, shade=ROBE)
    c.lathe([(0.35, 1.42), (0.38, 1.5), (0.36, 1.58)], (0, 0.04, 0), PAINT, "head", segs=8, caps=False)
    c.limb((0, 0.14, 2.24), (0.05, 0.32, 2.14), 0.05, 0.01, "plain", "head", segs=4, shade=ROBE)
    c.lathe([(0.28, 1.1), (0.32, 1.22), (0.34, 1.36), (0.24, 1.44)], (0, 0, 0), "plain", "chest", segs=8, sy=0.85, shade=ROBE)
    c.lathe([(0.46, 0.02), (0.44, 0.3), (0.36, 0.62), (0.3, 0.9), (0.28, 1.1)], (0, 0.02, 0), "plain", "hips", segs=10, sy=0.9, shade=ROBE)
    c.lathe([(0.47, 0.0), (0.475, 0.06), (0.46, 0.12)], (0, 0.02, 0), PAINT, "hips", segs=10, sy=0.9, caps=False)
    c.tbox((0.12, 0.04), (0.12, 0.04), 1.3, (0, -0.33, 0.0), PAINT, "hips", rot=(0.12, 0, 0))
    c.lathe([(0.31, 0.88), (0.33, 0.92), (0.33, 1.0), (0.31, 1.04)], (0, 0.02, 0), PAINT, "hips", segs=8, sy=0.9)
    c.ico(0.07, (0, -0.34, 1.26), CRYSTAL, "chest")
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        c.ico(0.14, a0, "plain", f"arm_{side}", scale=(1.1, 1.0, 0.9), shade=ROBE)
        c.limb(a0, a1, 0.1, 0.11, "plain", f"arm_{side}", segs=6, shade=ROBE)
        c.lathe_ab([(0.11, 0.0), (0.13, 0.4), (0.18, 0.85), (0.2, 1.0)], f0, f1, "plain", f"forearm_{side}", segs=7, shade=ROBE)
        c.lathe_ab([(0.205, 0.9), (0.21, 1.0)], f0, f1, PAINT, f"forearm_{side}", segs=7, caps=False)
        hx, hy, hz = hand_pos(B, side)
        c.ico(0.07, (hx, hy, hz + 0.02), "bone", f"hand_{side}")
        for k in range(3):
            c.limb((hx + (k - 1) * 0.035, hy - 0.03, hz), (hx + (k - 1) * 0.05, hy - 0.08, hz - 0.14), 0.02, 0.008, "bone", f"hand_{side}", segs=3)
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.limb(t0, t1, 0.08, 0.07, "plain", f"thigh_{side}", segs=5, shade=DARK)
        c.limb(s0, s1, 0.07, 0.06, "plain", f"shin_{side}", segs=5, shade=DARK)
        c.tbox((0.14, 0.3), (0.1, 0.14), 0.1, (s1[0], -0.1, 0.0), "leather", f"shin_{side}", shift=(0, 0.06), shade=(0.5, 0.35, 0.3))
    hx, hy, hz = hand_pos(B)
    pts = [(hx, hy, hz - 0.78), (hx + 0.02, hy, hz), (hx - 0.03, hy - 0.02, hz + 0.6), (hx + 0.04, hy - 0.02, hz + 1.1),
           (hx - 0.06, hy - 0.02, hz + 1.32), (hx - 0.2, hy - 0.02, hz + 1.3), (hx - 0.22, hy - 0.02, hz + 1.16)]
    for p0, p1 in zip(pts, pts[1:]):
        c.limb(p0, p1, 0.04, 0.036, "wood", "hand_R", segs=5)
    c.ico(0.12, (hx - 0.08, hy - 0.02, hz + 1.12), CRYSTAL, "hand_R", scale=(0.85, 0.85, 1.25), sub=1)
    return c, B


def build_duelist(images):
    B = rig(hip=0.9, chest=1.26, neck=1.44, head_top=1.84, sh_x=0.3, hand_z=0.8, leg_x=0.14)
    c = charkit.Char("duelist", images)
    HAT = (1.05, 0.92, 0.68)
    WH = (1.2, 1.17, 1.08)
    BLK = (0.045, 0.045, 0.05)
    HAIR = (0.18, 0.12, 0.1)
    c.lathe([(0.0, 1.4), (0.17, 1.42), (0.24, 1.54), (0.25, 1.66), (0.21, 1.78), (0.0, 1.82)], (0, -0.02, 0), "flesh", "head", segs=8, sy=1.05)
    c.decal((0, -0.31, 1.6), 0.42, 0.32, "face_human", "head", curve=0.07)
    c.tbox((0.07, 0.08), (0.04, 0.04), 0.12, (0, -0.3, 1.55), "flesh", "head", rot=(0.5, 0, 0))
    c.lathe([(0.26, 1.36), (0.28, 1.5), (0.27, 1.66), (0.24, 1.78)], (0, 0.06, 0), "hair", "head", segs=8, shade=HAIR, caps=False)
    c.tbox((0.4, 0.1), (0.44, 0.12), 0.3, (0, 0.2, 1.3), "hair", "head", shade=HAIR)
    c.lathe([(0.0, 0.0), (0.42, 0.0), (0.44, 0.04), (0.27, 0.06), (0.25, 0.2), (0.19, 0.26), (0.0, 0.26)], (0, 0.04, 1.75), "cloth", "head", segs=10, sy=0.9, shade=HAT, rot=(-0.12, 0.0, -0.1))
    c.lathe([(0.26, 0.06), (0.265, 0.12)], (0, 0.04, 1.75), "cloth", "head", segs=10, sy=0.9, caps=False, rot=(-0.12, 0, -0.1), shade=BLK)
    for k in range(3):
        c.limb((0.16, 0.18, 1.9), (0.28 + k * 0.05, 0.46 + k * 0.06, 2.12 - k * 0.1), 0.05 - k * 0.01, 0.01, "feather", "head", segs=4, shade=(1.1 - k * 0.05, 1.08 - k * 0.05, 1.0 - k * 0.05))
    c.lathe([(0.18, 0.92), (0.24, 1.04), (0.27, 1.22), (0.26, 1.36), (0.18, 1.44)], (0, 0, 0), "cloth", "chest", segs=8, sy=0.82, shade=WH)
    c.lathe([(0.19, 0.96), (0.22, 1.05)], (0, 0, 0), "leather", "spine", segs=8, sy=0.82)
    for k in range(4):
        c.box((0.05, 0.03, 0.04), (0, -0.23, 1.02 + k * 0.1), "gold", "chest")
    c.box((0.04, 0.03, 0.44), (0, -0.22, 1.18), "gold", "chest", shade=(0.8, 0.8, 0.8))
    c.lathe([(0.2, 1.38), (0.2, 1.46), (0.14, 1.5)], (0, 0, 0), "plain", "chest", segs=8, caps=False)
    c.tbox((0.42, 0.05), (0.34, 0.06), 0.5, (0.04, 0.2, 0.92), TEAM, "chest", rot=(-0.12, 0, 0.05))
    c.lathe([(0.22, 0.86), (0.24, 0.9), (0.24, 0.98), (0.22, 1.0)], (0, 0, 0), "leather", "hips", segs=8, sy=0.85, shade=(0.5, 0.35, 0.25))
    c.box((0.12, 0.05, 0.1), (0, -0.22, 0.93), "gold", "hips")
    c.lathe([(0.22, 0.9), (0.26, 0.76), (0.26, 0.7)], (0, 0, 0), "cloth", "hips", segs=8, sy=0.85, shade=BLK)
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.ico(0.1, a0, TEAM, f"arm_{side}", scale=(1.2, 1.1, 0.9))
        c.limb(a0, a1, 0.075, 0.07, "cloth", f"arm_{side}", segs=6, shade=WH)
        c.limb(f0, f1, 0.07, 0.06, "cloth", f"forearm_{side}", segs=6, shade=WH)
        c.lathe_ab([(0.07, 0.5), (0.1, 0.9), (0.11, 1.0)], f0, f1, "leather", f"forearm_{side}", segs=6, shade=(0.55, 0.38, 0.28))
        c.ico(0.08, hand_pos(B, side), "leather", f"hand_{side}", shade=(0.55, 0.38, 0.28))
        c.limb(t0, t1, 0.09, 0.08, "cloth", f"thigh_{side}", segs=6, shade=BLK)
        c.lathe([(0.085, 0.0), (0.09, 0.3), (0.12, 0.44), (0.12, 0.5)], (s1[0], -0.01, 0.04), "leather", f"shin_{side}", segs=7, shade=(0.3, 0.22, 0.18))
        c.tbox((0.15, 0.32), (0.11, 0.16), 0.1, (s1[0], -0.1, 0.0), "leather", f"shin_{side}", shift=(0, 0.06), shade=(0.45, 0.3, 0.22))
    hx, hy, hz = hand_pos(B)
    c.lathe([(0.0, -0.02), (0.1, 0.0), (0.06, 0.05)], (hx, hy - 0.02, hz - 0.06), "gold", "hand_R", segs=8)
    c.box((0.2, 0.04, 0.04), (hx, hy - 0.02, hz - 0.08), "gold", "hand_R")
    c.limb((hx, hy + 0.02, hz + 0.08), (hx, hy - 0.02, hz - 0.08), 0.025, 0.025, "leather", "hand_R", segs=4, shade=(0.4, 0.25, 0.2))
    tip = (hx, hy - 0.5, hz - 0.95)
    c.lathe_ab([(0.03, 0.0), (0.028, 0.85), (0.0, 1.0)], (hx, hy - 0.02, hz - 0.1), tip, "iron", "hand_R", segs=4, sy=0.35, shade=(1.5, 1.5, 1.6))
    return c, B


def build_warden(images):
    B = rig(hip=0.88, chest=1.3, neck=1.52, head_top=1.92, sh_x=0.5, hand_z=0.66, leg_x=0.22)
    c = charkit.Char("warden", images)
    BK = "moss_bark"
    GRN = (0.8, 1.2, 0.62)
    LEAF = (0.75, 1.35, 0.45)
    c.tbox((0.44, 0.4), (0.4, 0.36), 0.44, (0, -0.02, 1.48), BK, "head", shade=GRN)
    c.tbox((0.3, 0.08), (0.36, 0.08), 0.12, (0, -0.22, 1.72), BK, "head", rot=(0.2, 0, 0), shade=(0.56, 0.84, 0.434))
    for sx in (-1, 1):
        c.box((0.09, 0.04, 0.06), (0.1 * sx, -0.23, 1.66), "plain", "head", shade=(0.55, 1.0, 0.25))
    c.box((0.14, 0.04, 0.06), (0, -0.23, 1.54), "plain", "head", shade=(0.08, 0.05, 0.03))
    for sx in (-1, 1):
        pts = [(0.14 * sx, 0.0, 1.9), (0.3 * sx, 0.02, 2.08), (0.36 * sx, 0.0, 2.3), (0.34 * sx, -0.02, 2.46)]
        for p0, p1 in zip(pts, pts[1:]):
            c.limb(p0, p1, 0.045, 0.035, "bark", "head", segs=4)
        c.limb((0.3 * sx, 0.02, 2.08), (0.5 * sx, 0.0, 2.2), 0.035, 0.015, "bark", "head", segs=4)
        c.limb((0.35 * sx, 0.0, 2.26), (0.24 * sx, 0.04, 2.42), 0.03, 0.01, "bark", "head", segs=4)
    c.tbox((0.62, 0.44), (0.9, 0.56), 0.6, (0, 0.0, 0.96), BK, "chest", shade=GRN)
    c.tbox((0.9, 0.56), (0.7, 0.46), 0.1, (0, 0.0, 1.56), BK, "chest", shade=(0.64, 1.08, 0.434))
    for sx in (-1, 1):
        c.ico(0.26, (0.5 * sx, 0.0, 1.52), "leaves", "chest", scale=(1.3, 1.2, 0.85), shade=LEAF)
        c.ico(0.16, (0.28 * sx, 0.12, 2.0), "leaves", "head", scale=(1.2, 1.0, 0.8), shade=LEAF)
        c.ico(0.14, (0.4 * sx, 0.0, 2.3), "leaves", "head", scale=(1.1, 1.0, 0.8), shade=LEAF)
    c.ico(0.2, (0, 0.06, 1.98), "leaves", "head", scale=(1.3, 1.1, 0.7), shade=LEAF)
    c.ico(0.22, (0, 0.34, 1.2), "leaves", "chest", scale=(1.4, 0.8, 1.2), shade=LEAF)
    c.box((1.05, 0.1, 0.16), (0, -0.28, 1.26), TEAM, "chest", rot=(0, 0.66, 0))
    c.box((1.05, 0.1, 0.16), (0, 0.28, 1.26), TEAM, "chest", rot=(0, 0.66, 0), shade=(0.8, 0.8, 0.8))
    c.tbox((0.56, 0.4), (0.62, 0.44), 0.2, (0, 0.0, 0.8), BK, "hips", shade=(0.68, 1.02, 0.527))
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.limb(a0, a1, 0.14, 0.12, BK, f"arm_{side}", segs=5, shade=GRN)
        c.limb(f0, f1, 0.13, 0.15, BK, f"forearm_{side}", segs=5, shade=GRN)
        hx, hy, hz = hand_pos(B, side)
        c.tbox((0.2, 0.18), (0.24, 0.2), 0.2, (hx, hy, hz - 0.08), BK, f"hand_{side}", shade=GRN)
        for k in range(3):
            c.limb((hx + (k - 1) * 0.07, hy - 0.06, hz - 0.08), (hx + (k - 1) * 0.09, hy - 0.1, hz - 0.26), 0.035, 0.015, "bark", f"hand_{side}", segs=4)
        c.limb(t0, t1, 0.17, 0.15, BK, f"thigh_{side}", segs=5, shade=GRN)
        c.limb(s0, s1, 0.15, 0.18, BK, f"shin_{side}", segs=5, shade=GRN)
        c.tbox((0.34, 0.38), (0.28, 0.3), 0.14, (s1[0], -0.04, 0.0), BK, f"shin_{side}", shade=(0.64, 0.96, 0.496))
        for k in range(3):
            c.cone(0.04, 0.0, 0.12, (s1[0] + (k - 1) * 0.1, -0.22, 0.04), "bark", f"shin_{side}", segs=4, rot=(-1.3, 0, 0))
    lx, ly, lz = hand_pos(B, "L")
    for k in range(5):
        c.box((0.07, 0.15, 1.1 - abs(k - 2) * 0.06), (lx + 0.14, ly - 0.3 + k * 0.15, lz + 0.22), "wood", "hand_L", shade=(0.9 - 0.05 * (k % 2),) * 3)
    for z in (-0.14, 0.52):
        c.box((0.1, 0.8, 0.07), (lx + 0.18, ly, lz + 0.22 + z), "iron", "hand_L")
    c.box((0.1, 0.16, 0.16), (lx + 0.2, ly, lz + 0.22), TEAM, "hand_L")
    return c, B


def build_herald(images):
    B = rig(hip=0.86, chest=1.24, neck=1.44, head_top=1.84, sh_x=0.33, hand_z=0.78, leg_x=0.15)
    c = charkit.Char("herald", images)
    PL = (1.35, 1.35, 1.45)
    c.lathe([(0.0, 1.38), (0.2, 1.4), (0.25, 1.52), (0.26, 1.66), (0.23, 1.8), (0.12, 1.88), (0.0, 1.9)], (0, -0.02, 0), "steel", "head", segs=8, sy=1.08)
    c.box((0.34, 0.04, 0.05), (0, -0.29, 1.64), "plain", "head", shade=(0.05, 0.05, 0.08))
    c.box((0.04, 0.04, 0.2), (0, -0.29, 1.56), "plain", "head", shade=(0.05, 0.05, 0.08))
    c.tbox((0.06, 0.3), (0.04, 0.34), 0.08, (0, -0.02, 1.86), "gold", "head")
    for k in range(4):
        c.limb((0, 0.0 + k * 0.02, 1.9), (0.0, 0.2 + k * 0.1, 2.14 - k * 0.12), 0.08 - k * 0.012, 0.02, "feather", "head", segs=4, shade=(1.0, 0.85, 0.3))
    c.lathe([(0.2, 0.96), (0.26, 1.08), (0.3, 1.26), (0.29, 1.38), (0.2, 1.48)], (0, 0, 0), "steel", "chest", segs=8, sy=0.8)
    for sx in (-1, 1):
        c.lathe([(0.0, -0.1), (0.14, -0.06), (0.17, 0.04), (0.12, 0.12), (0.0, 0.14)], (0.36 * sx, 0.0, 1.4), "steel", "chest", segs=7, sx=1.1, rot=(0, 0.3 * sx, 0))
        c.lathe([(0.175, 0.0), (0.18, 0.04)], (0.36 * sx, 0.0, 1.4), "gold", "chest", segs=7, sx=1.1, caps=False, rot=(0, 0.3 * sx, 0))
    c.tbox((0.36, 0.05), (0.3, 0.05), 1.02, (0, -0.27, 0.36), TEAM, "chest", rot=(0.06, 0, 0))
    c.tbox((0.76, 0.08), (0.48, 0.1), 1.1, (0, 0.26, 0.28), TEAM, "chest", rot=(-0.14, 0, 0), shade=(0.8, 0.8, 0.8))
    c.lathe([(0.24, 0.9), (0.26, 0.94), (0.26, 1.0), (0.24, 1.02)], (0, 0, 0), "leather", "hips", segs=8, sy=0.85, shade=(0.5, 0.35, 0.25))
    c.box((0.12, 0.05, 0.1), (0, -0.25, 0.95), "gold", "hips")
    c.lathe([(0.24, 0.92), (0.28, 0.76), (0.29, 0.68)], (0, 0, 0), "steel", "hips", segs=8, sy=0.85)
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        f0, f1, _ = B[f"forearm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        s0, s1, _ = B[f"shin_{side}"]
        c.limb(a0, a1, 0.08, 0.075, "steel", f"arm_{side}", segs=6)
        c.ico(0.08, a1, "steel", f"forearm_{side}")
        c.lathe_ab([(0.07, 0.0), (0.08, 0.6), (0.1, 0.9), (0.1, 1.0)], f0, f1, "steel", f"forearm_{side}", segs=6)
        c.ico(0.085, hand_pos(B, side), "steel", f"hand_{side}")
        c.limb(t0, t1, 0.1, 0.09, "steel", f"thigh_{side}", segs=6)
        c.ico(0.09, t1, "steel", f"shin_{side}")
        c.lathe([(0.09, 0.0), (0.1, 0.3), (0.09, 0.44)], (s1[0], -0.01, 0.04), "steel", f"shin_{side}", segs=7)
        c.tbox((0.16, 0.32), (0.12, 0.16), 0.1, (s1[0], -0.1, 0.0), "steel", f"shin_{side}", shift=(0, 0.06))
    c.limb((0.3, 0.3, 0.3), (0.3, 0.3, 3.0), 0.035, 0.035, "wood", "chest", segs=5)
    c.cone(0.07, 0.0, 0.2, (0.3, 0.3, 3.08), "gold", "chest", segs=4)
    c.box((0.7, 0.04, 0.05), (0.3, 0.3, 2.9), "gold", "chest")
    c.box((0.64, 0.03, 0.78), (0.3, 0.3, 2.5), TEAM, "chest")
    hx, hy, hz = hand_pos(B)
    c.box((0.2, 0.05, 0.05), (hx, hy - 0.02, hz - 0.06), "gold", "hand_R")
    c.lathe_ab([(0.035, 0.0), (0.03, 0.85), (0.0, 1.0)], (hx, hy - 0.02, hz - 0.08), (hx, hy - 0.35, hz - 0.72), "steel", "hand_R", segs=4, sy=0.4)
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
