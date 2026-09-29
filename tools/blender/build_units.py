"""Army units: grunt, ranged, heavy. 8-bone rigid rigs, idle / walk / attack clips.

Run inside Blender (MCP): exec(open(".../tools/blender/build_units.py").read(), {"__name__": "__main__"})
Exports assets/units/<type>.glb.
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


def grunt(images):
    B = rig(0.46, 0.84, 1.3, 0.26, 0.11, 0.48)
    c = charkit.Char("grunt", images)
    GB = "goblin"
    c.lathe([(0.0, 0.82), (0.2, 0.84), (0.25, 0.96), (0.25, 1.08), (0.2, 1.18), (0.0, 1.2)], (0, -0.02, 0), GB, "head", segs=7, sx=1.1)
    c.decal((0, -0.29, 1.0), 0.42, 0.3, "face_goblin", "head", curve=0.06)
    for sx in (-1, 1):
        c.lathe([(0.0, 0.0), (0.07, 0.04), (0.05, 0.22), (0.0, 0.34)], (0.22 * sx, 0.0, 1.02), GB, "head", segs=4, sy=0.35, rot=(0.0, 1.3 * sx, 0.0))
    c.lathe([(0.0, 1.06), (0.27, 1.06), (0.28, 1.12), (0.22, 1.24), (0.1, 1.36), (0.0, 1.42)], (0, -0.02, 0), "iron", "head", segs=7, sx=1.1)
    c.tbox((0.06, 0.04), (0.04, 0.04), 0.2, (0, -0.29, 0.94), "iron", "head")
    c.lathe([(0.17, 0.5), (0.22, 0.6), (0.22, 0.74), (0.16, 0.86)], (0, 0, 0), "leather", "chest", segs=7, sy=0.85, shade=(0.8, 0.6, 0.45))
    c.tbox((0.3, 0.04), (0.26, 0.04), 0.46, (0, -0.2, 0.32), C, "chest", rot=(0.05, 0, 0))
    c.tbox((0.3, 0.04), (0.26, 0.04), 0.42, (0, 0.2, 0.36), T, "chest", rot=(-0.05, 0, 0))
    c.lathe([(0.19, 0.46), (0.21, 0.5), (0.2, 0.56)], (0, 0, 0), "leather", "hips", segs=7, sy=0.85, shade=(0.5, 0.36, 0.28))
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        c.limb(a0, a1, 0.06, 0.05, GB, f"arm_{side}", segs=5)
        c.ico(0.07, (a1[0], a1[1], a1[2] - 0.02), GB, f"arm_{side}")
        c.lathe([(0.065, 0.0), (0.07, 0.12), (0.06, 0.14)], (a1[0], a1[1], a1[2] + 0.04), "leather", f"arm_{side}", segs=5, shade=(0.6, 0.45, 0.35))
        c.limb(t0, t1, 0.07, 0.06, "leather", f"thigh_{side}", segs=5, shade=(0.6, 0.45, 0.35))
    feet(c, B, "leather", (0.5, 0.36, 0.28))
    hx, hy, hz = B["arm_R"][1]
    c.limb((hx, hy + 0.1, hz - 0.45), (hx, hy - 0.12, hz + 0.72), 0.025, 0.025, "wood", "arm_R", segs=4)
    c.lathe([(0.0, 0.0), (0.06, 0.04), (0.0, 0.2)], (hx, hy - 0.13, hz + 0.72), "iron", "arm_R", segs=4, sy=0.4, rot=(-0.18, 0, 0))
    lx, ly, lz = B["arm_L"][1]
    c.lathe([(0.0, -0.02), (0.22, 0.0), (0.22, 0.04), (0.0, 0.06)], (lx + 0.08, ly - 0.02, lz + 0.06), "wood", "arm_L", segs=8, rot=(0, math.pi / 2, 0))
    c.lathe([(0.225, 0.0), (0.23, 0.05)], (lx + 0.08, ly - 0.02, lz + 0.06), "iron", "arm_L", segs=8, rot=(0, math.pi / 2, 0), caps=False)
    c.ico(0.06, (lx + 0.15, ly - 0.02, lz + 0.06), "iron", "arm_L")
    return c, B


def ranged(images):
    B = rig(0.5, 0.88, 1.32, 0.24, 0.1, 0.52)
    c = charkit.Char("ranged", images)
    GB = "goblin"
    c.lathe([(0.0, 0.86), (0.2, 0.88), (0.25, 1.0), (0.25, 1.12), (0.2, 1.22), (0.0, 1.24)], (0, -0.02, 0), GB, "head", segs=7, sx=1.1)
    c.decal((0, -0.29, 1.04), 0.42, 0.3, "face_goblin", "head", curve=0.06)
    for sx in (-1, 1):
        c.lathe([(0.0, 0.0), (0.07, 0.04), (0.05, 0.22), (0.0, 0.34)], (0.22 * sx, 0.02, 1.06), GB, "head", segs=4, sy=0.35, rot=(0.0, 1.3 * sx, 0.0))
    c.lathe([(0.3, 0.86), (0.32, 0.98), (0.3, 1.12), (0.22, 1.28), (0.12, 1.46), (0.04, 1.6), (0.0, 1.64)], (0, 0.08, 0), T, "head", segs=7, sx=1.1)
    c.limb((0, 0.14, 1.58), (0.0, 0.34, 1.46), 0.04, 0.01, T, "head", segs=4)
    c.lathe([(0.17, 0.52), (0.22, 0.62), (0.22, 0.78), (0.17, 0.9)], (0, 0, 0), "leather", "chest", segs=7, sy=0.85, shade=(0.82, 0.6, 0.42))
    c.lathe([(0.2, 0.36), (0.24, 0.5), (0.23, 0.58)], (0, 0, 0), "leather", "hips", segs=7, sy=0.85, shade=(0.72, 0.52, 0.38))
    c.lathe([(0.23, 0.56), (0.235, 0.6), (0.23, 0.64)], (0, 0, 0), "leather", "hips", segs=7, sy=0.85, shade=(0.45, 0.32, 0.25))
    c.box((0.08, 0.04, 0.06), (0, -0.21, 0.6), "gold", "hips")
    c.lathe([(0.07, 0.0), (0.08, 0.4), (0.07, 0.44)], (0.08, 0.22, 0.56), "leather", "chest", segs=6, rot=(0.25, 0.35, 0), shade=(0.55, 0.38, 0.28))
    for k in range(3):
        c.limb((0.06 + k * 0.04, 0.26, 0.98), (0.1 + k * 0.05, 0.32, 1.1), 0.012, 0.012, "wood", "chest", segs=3)
        c.cone(0.035, 0.0, 0.06, (0.1 + k * 0.05, 0.32, 1.12), "feather", "chest", segs=3, shade=(1.0, 0.3, 0.2))
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        c.limb(a0, a1, 0.055, 0.05, GB, f"arm_{side}", segs=5)
        c.ico(0.065, (a1[0], a1[1], a1[2] - 0.02), GB, f"arm_{side}")
        c.limb(t0, t1, 0.065, 0.055, GB, f"thigh_{side}", segs=5)
    feet(c, B, "leather", (0.5, 0.36, 0.28))
    lx, ly, lz = B["arm_L"][1]
    pts = [(lx + 0.02, ly - 0.06, lz - 0.46), (lx + 0.02, ly - 0.16, lz - 0.2), (lx + 0.02, ly - 0.06, lz), (lx + 0.02, ly - 0.16, lz + 0.2), (lx + 0.02, ly - 0.06, lz + 0.46)]
    for p0, p1 in zip(pts, pts[1:]):
        c.limb(p0, p1, 0.025, 0.025, "wood", "arm_L", segs=4)
    c.limb(pts[0], pts[-1], 0.006, 0.006, "plain", "arm_L", segs=3)
    return c, B


def heavy(images):
    B = rig(0.72, 1.3, 1.7, 0.56, 0.24, 0.6)
    c = charkit.Char("heavy", images)
    OG = "grey_ogre"
    c.lathe([(0.0, 1.28), (0.26, 1.3), (0.3, 1.42), (0.28, 1.56), (0.0, 1.6)], (0, -0.2, 0), OG, "head", segs=7, sx=1.1)
    c.decal((0, -0.52, 1.4), 0.46, 0.3, "face_ogre", "head", curve=0.06)
    c.lathe([(0.31, 1.5), (0.32, 1.68), (0.29, 1.74), (0.0, 1.76)], (0, -0.2, 0), "iron", "head", segs=7, sx=1.1, shade=(0.9, 0.6, 0.45))
    c.lathe([(0.36, 0.72), (0.5, 0.9), (0.58, 1.1), (0.56, 1.3), (0.34, 1.42), (0.0, 1.44)], (0, 0.04, 0), OG, "chest", segs=8, sy=0.8)
    for sx in (-1, 1):
        c.tbox((0.34, 0.06), (0.36, 0.06), 0.3, (0.18 * sx, -0.44, 1.02), "iron", "chest", rot=(0.15, 0, 0))
    c.box((1.2, 0.08, 0.1), (0, -0.36, 1.18), "leather", "chest", rot=(0, 0.72, 0), shade=(0.5, 0.35, 0.25))
    c.box((1.2, 0.08, 0.1), (0, -0.36, 1.18), "leather", "chest", rot=(0, -0.72, 0), shade=(0.5, 0.35, 0.25))
    c.tbox((0.44, 0.52), (0.28, 0.4), 0.18, (0.58, 0.02, 1.34), T, "chest", rot=(0, 0.35, 0))
    c.lathe([(0.4, 0.62), (0.44, 0.7), (0.43, 0.8)], (0, 0.04, 0), "leather", "hips", segs=8, sy=0.82, shade=(0.45, 0.32, 0.25))
    c.tbox((0.36, 0.06), (0.3, 0.06), 0.4, (0, -0.36, 0.3), C, "hips", rot=(-0.08, 0, 0))
    c.tbox((0.4, 0.06), (0.34, 0.06), 0.36, (0, 0.38, 0.34), T, "hips", rot=(0.08, 0, 0))
    for side, sx in (("R", -1), ("L", 1)):
        a0, a1, _ = B[f"arm_{side}"]
        t0, t1, _ = B[f"thigh_{side}"]
        c.limb(a0, a1, 0.16, 0.13, OG, f"arm_{side}", segs=6)
        c.lathe([(0.15, 0.0), (0.16, 0.16), (0.14, 0.2)], (a1[0], a1[1], a1[2] + 0.08), "iron", f"arm_{side}", segs=6)
        c.ico(0.15, (a1[0], a1[1] - 0.02, a1[2] - 0.02), OG, f"arm_{side}")
        c.limb(t0, t1, 0.16, 0.14, OG, f"thigh_{side}", segs=6)
        c.lathe([(0.15, 0.0), (0.16, 0.22), (0.14, 0.26)], (t1[0], 0.0, 0.08), "leather", f"thigh_{side}", segs=6, shade=(0.55, 0.38, 0.28))
    feet(c, B, "leather", (0.5, 0.36, 0.28), w=0.26, l=0.4)
    hx, hy, hz = B["arm_R"][1]
    c.limb((hx, hy + 0.2, hz - 0.1), (hx, hy - 0.9, hz + 0.1), 0.04, 0.04, "wood", "arm_R", segs=5)
    c.tbox((0.3, 0.3), (0.3, 0.3), 0.44, (hx, hy - 0.95, hz - 0.12), "stone", "arm_R", rot=(math.pi / 2, 0, 0))
    c.box((0.34, 0.06, 0.34), (hx, hy - 0.72, hz + 0.1), "iron", "arm_R")
    return c, B


def clips(heavy_unit=False):
    s = 0.7 if heavy_unit else 1.0
    return {
        "idle": {"bones": {
            "chest": [(0, (0, 0, 0)), (12, (3, 0, 0)), (24, (0, 0, 0))],
            "head": [(0, (0, 0, 0)), (12, (-3, 0, 3)), (24, (0, 0, 0))],
        }},
        "walk": {
            "bones": {
                "thigh_R": [(0, (-35 * s, 0, 0)), (6, (35 * s, 0, 0)), (12, (-35 * s, 0, 0))],
                "thigh_L": [(0, (35 * s, 0, 0)), (6, (-35 * s, 0, 0)), (12, (35 * s, 0, 0))],
                "arm_R": [(0, (25 * s, 0, 0)), (6, (-25 * s, 0, 0)), (12, (25 * s, 0, 0))],
                "arm_L": [(0, (-25 * s, 0, 0)), (6, (25 * s, 0, 0)), (12, (-25 * s, 0, 0))],
                "chest": [(0, (8, 0, -4)), (6, (8, 0, 4)), (12, (8, 0, -4))],
            },
            "loc": {"hips": [(0, (0, 0, 0)), (3, (0, 0.04, 0)), (6, (0, 0, 0)), (9, (0, 0.04, 0)), (12, (0, 0, 0))]},
        },
        "attack": {"bones": {
            "arm_R": [(0, (0, 0, 0)), (4, (-130, 0, -10)), (7, (-20, 0, 0)), (12, (0, 0, 0))],
            "chest": [(0, (0, 0, 0)), (4, (-8, 0, 15)), (7, (15, 0, -10)), (12, (0, 0, 0))],
            "arm_L": [(0, (0, 0, 0)), (4, (-60, 0, 0)), (7, (-60, 0, 0)), (12, (0, 0, 0))],
        }},
    }


BUILDERS = {"grunt": grunt, "ranged": ranged, "heavy": heavy}


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
    cl = anims.unit_clips(1.3 if name == "heavy" else 1.0)
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
