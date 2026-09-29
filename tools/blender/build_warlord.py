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
    c = charkit.Char(NAME, images)
    OG = "ogre"
    FUR = (1.25, 0.4, 0.05)
    FUR_D = (0.85, 0.24, 0.03)

    c.lathe([(0.0, 1.48), (0.32, 1.5), (0.41, 1.62), (0.42, 1.78), (0.36, 1.92), (0.0, 1.96)], (0, -0.08, 0), OG, "head", segs=8, sx=1.1, sy=1.0)
    c.tbox((0.5, 0.3), (0.62, 0.34), 0.2, (0, -0.2, 1.46), OG, "head", shade=(0.92, 0.92, 0.92))
    c.decal((0, -0.52, 1.68), 0.66, 0.44, "face_ogre", "head", curve=0.1)
    c.tbox((0.12, 0.1), (0.08, 0.05), 0.12, (0, -0.52, 1.61), OG, "head", rot=(0.5, 0, 0))
    for sx in (-1, 1):
        c.cone(0.03, 0.0, 0.14, (0.15 * sx, -0.44, 1.56), "bone", "head", segs=4, rot=(0.15, -0.2 * sx, 0))
        c.ico(0.09, (0.4 * sx, -0.06, 1.7), OG, "head", scale=(0.6, 1.0, 1.3))
    c.lathe([(0.0, 1.86), (0.45, 1.86), (0.46, 1.94), (0.4, 2.06), (0.22, 2.14), (0.0, 2.16)], (0, -0.08, 0), IRON, "head", segs=8, sx=1.1)
    c.lathe([(0.47, 1.84), (0.49, 1.89), (0.47, 1.94)], (0, -0.08, 0), PAINT, "head", segs=8, sx=1.1)
    for sx in (-1, 1):
        pts = [(0.42 * sx, -0.08, 2.0), (0.62 * sx, -0.1, 2.1), (0.74 * sx, -0.12, 2.3), (0.7 * sx, -0.14, 2.44)]
        rads = [0.09, 0.07, 0.045, 0.0]
        for (p0, p1), r0, r1 in zip(zip(pts, pts[1:]), rads, rads[1:]):
            c.limb(p0, p1, r0, max(r1, 0.012), "bone", "head", segs=5)

    c.lathe([(0.4, 0.96), (0.5, 1.1), (0.56, 1.3), (0.54, 1.46), (0.34, 1.56), (0.0, 1.58)], (0, 0.02, 0), "hair", "chest", segs=8, sy=0.78, shade=FUR)
    c.lathe([(0.38, 0.92), (0.44, 1.0), (0.48, 1.12)], (0, 0.02, 0), "hair", "spine", segs=8, sy=0.8, shade=FUR_D)
    c.box((1.0, 0.08, 0.16), (0, -0.36, 1.26), TEAM, "chest", rot=(0, 0.62, 0))
    c.box((1.0, 0.08, 0.16), (0, 0.36, 1.26), TEAM, "chest", rot=(0, 0.62, 0), shade=(0.8, 0.8, 0.8))
    c.ico(0.07, (0.02, -0.41, 1.28), "gold", "chest")
    for sx in (-1, 1):
        c.tbox((0.44, 0.5), (0.3, 0.4), 0.2, (0.58 * sx, 0.0, 1.42), IRON, "chest", rot=(0, 0.35 * sx, 0))
        c.tbox((0.46, 0.52), (0.46, 0.52), 0.05, (0.6 * sx, 0.0, 1.4), PAINT, "chest", rot=(0, 0.35 * sx, 0))
        c.cone(0.05, 0.0, 0.16, (0.66 * sx, 0.0, 1.66), "bone", "chest", segs=4, rot=(0, -0.3 * sx, 0))
    c.lathe([(0.47, 0.86), (0.5, 0.92), (0.5, 1.0), (0.47, 1.04)], (0, 0.02, 0), "leather", "hips", segs=8, sy=0.82, shade=(0.7, 0.6, 0.55))
    c.box((0.2, 0.06, 0.16), (0, -0.42, 0.95), "gold", "hips")
    c.box((0.1, 0.07, 0.08), (0, -0.44, 0.95), "leather", "hips", shade=(0.5, 0.4, 0.3))
    c.lathe([(0.46, 0.9), (0.52, 0.72), (0.6, 0.5)], (0, 0.02, 0), "hair", "hips", segs=10, sy=0.78, shade=FUR_D)
    c.tbox((0.36, 0.05), (0.3, 0.05), 0.5, (0, -0.46, 0.44), TEAM, "hips", rot=(-0.12, 0, 0))

    for side, sx in (("R", -1), ("L", 1)):
        c.limb((0.6 * sx, 0, 1.44), (0.7 * sx, -0.01, 1.02), 0.17, 0.15, OG, f"arm_{side}", segs=7)
        c.limb((0.7 * sx, -0.01, 1.04), (0.72 * sx, -0.06, 0.66), 0.15, 0.14, OG, f"forearm_{side}", segs=7)
        c.lathe([(0.17, 0.0), (0.19, 0.05), (0.19, 0.2), (0.17, 0.24)], (0.715 * sx, -0.045, 0.66), IRON, f"forearm_{side}", segs=7)
        c.ico(0.17, (0.72 * sx, -0.08, 0.56), OG, f"hand_{side}", scale=(1.0, 1.05, 1.0))
        c.tbox((0.16, 0.08), (0.14, 0.08), 0.12, (0.72 * sx - 0.06 * sx, -0.22, 0.52), OG, f"hand_{side}", shade=(0.9, 0.9, 0.9))
        c.limb((0.22 * sx, 0, 0.84), (0.23 * sx, -0.01, 0.48), 0.19, 0.16, OG, f"thigh_{side}", segs=7)
        c.lathe([(0.19, 0.0), (0.2, 0.34), (0.18, 0.4)], (0.23 * sx, -0.02, 0.06), "leather", f"shin_{side}", segs=7)
        c.lathe([(0.21, 0.28), (0.22, 0.36), (0.21, 0.44)], (0.23 * sx, -0.02, 0.06), IRON, f"shin_{side}", segs=7)
        c.tbox((0.3, 0.46), (0.26, 0.3), 0.16, (0.23 * sx, -0.1, 0.0), "leather", f"shin_{side}", shift=(0, 0.06), shade=(0.8, 0.7, 0.65))

    hx, hy, hz = -0.72, -0.1, 0.55
    base = (hx, hy - 0.06, hz - 0.02)
    c.limb((hx, hy + 0.05, hz + 0.2), base, 0.055, 0.06, "wood", "hand_R", segs=5)
    tip = (hx - 0.05, hy - 0.62, hz - 0.62)
    c.lathe_ab([(0.07, 0.0), (0.11, 0.28), (0.18, 0.66), (0.2, 0.86), (0.14, 0.97), (0.0, 1.0)], base, tip, "wood", "hand_R", segs=6)
    import mathutils
    axis = (mathutils.Vector(tip) - mathutils.Vector(base)).normalized()
    ref = mathutils.Vector((1, 0, 0))
    perp1 = axis.cross(ref).normalized()
    perp2 = axis.cross(perp1).normalized()
    for k, t in enumerate((0.55, 0.72, 0.88)):
        for i in range(5):
            a = i / 5 * math.tau + k * 0.6
            d = perp1 * math.cos(a) + perp2 * math.sin(a)
            r = (0.16, 0.19, 0.18)[k]
            p = mathutils.Vector(base) + axis * (t * (mathutils.Vector(tip) - mathutils.Vector(base)).length)
            c.limb(tuple(p + d * (r - 0.02)), tuple(p + d * (r + 0.12)), 0.035, 0.0, IRON, "hand_R", segs=4)
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
