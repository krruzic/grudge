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
