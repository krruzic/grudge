"""Pad structures: damage / control / support towers and barracks / range / foundry.

Each exports assets/structures/<type>.glb with up to three nodes:
  <type>        static body
  spin_<type>   part the game rotates or bobs (origin at its pivot)
  level2_<type> upgrade trim, hidden until level 2
Run inside Blender (MCP): exec(open(".../tools/blender/build_structures.py").read(), {"__name__": "__main__"})
"""
import importlib
import math
import os
import sys

import bpy

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import charkit  # noqa: E402
import texgen  # noqa: E402

importlib.reload(texgen)
importlib.reload(charkit)

T = "team_paint"
C = "team_cloth"
X = "team_crystal"


def plinth(c):
    c.cone(1.45, 1.55, 0.3, (0, 0, 0.15), "cobble", "root", segs=8, meters=1.0)


def banner(c, x, y, z, h=1.0, rot=0.0):
    c.limb((x, y, z - 0.2), (x, y, z + h + 0.3), 0.04, 0.04, "wood", "root", segs=4)
    c.box((0.45, 0.04, h * 0.7), (x + 0.26 * math.cos(rot), y + 0.26 * math.sin(rot), z + h * 0.62), C, "root", rot=(0, 0, rot))


def level2_trim(c, r=1.35, z=0.4):
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        x, y = math.cos(a) * r, math.sin(a) * r
        c.cone(0.1, 0.0, 0.35, (x, y, z + 0.1), "gold", "root", segs=4)
    banner(c, -1.25, -0.9, 0.5, 1.4)
    banner(c, 1.25, -0.9, 0.5, 1.4)


def damage(images):
    b = charkit.Char("damage", images)
    plinth(b)
    b.cone(0.95, 0.75, 2.6, (0, 0, 1.6), "brick", "root", segs=6, meters=1.0)
    b.cone(1.0, 1.0, 0.35, (0, 0, 3.05), "cliff", "root", segs=6, meters=1.0)
    for i in range(6):
        a = i / 6 * math.tau
        b.box((0.3, 0.3, 0.35), (math.cos(a) * 0.86, math.sin(a) * 0.86, 3.4), "brick", "root", rot=(0, 0, a))
    b.box((0.22, 0.06, 0.45), (0, -0.83, 2.2), "iron", "root")
    b.box((0.5, 0.05, 0.75), (0, -0.88, 1.2), C, "root")
    b.cone(0.15, 0.2, 0.6, (0, 0, 3.5), "gold", "root", segs=6)
    s = charkit.Char("spin_damage", images)
    s.cone(0.38, 0.0, 0.8, (0, 0, 0.4), X, "root", segs=4)
    s.cone(0.38, 0.0, 0.45, (0, 0, -0.22), X, "root", segs=4, rot=(math.pi, 0, 0))
    return b, (s, (0, 0, 4.2))


def control(images):
    b = charkit.Char("control", images)
    plinth(b)
    b.cone(1.2, 1.05, 1.3, (0, 0, 0.95), "cliff", "root", segs=8, meters=1.0)
    b.cone(0.55, 0.4, 0.9, (0, 0, 2.0), "brick", "root", segs=6, meters=1.0)
    for i in range(4):
        a = i / 4 * math.tau
        b.limb((math.cos(a) * 0.95, math.sin(a) * 0.95, 1.5), (math.cos(a) * 0.55, math.sin(a) * 0.55, 2.7), 0.1, 0.06, "iron", "root", segs=4)
    b.ico(0.3, (0, 0, 2.75), X, "root")
    s = charkit.Char("spin_control", images)
    for i in range(8):
        a = i / 8 * math.tau
        s.box((0.55, 0.14, 0.14), (math.cos(a) * 1.05, math.sin(a) * 1.05, 0), T, "root", rot=(0, 0, a + math.pi / 2))
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 8
        s.ico(0.14, (math.cos(a) * 1.05, math.sin(a) * 1.05, 0), "gold", "root", sub=0)
    return b, (s, (0, 0, 2.55))


def support(images):
    b = charkit.Char("support", images)
    plinth(b)
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        x, y = math.cos(a) * 0.95, math.sin(a) * 0.95
        b.cone(0.18, 0.15, 2.2, (x, y, 1.4), "brick", "root", segs=5, meters=1.0)
        b.box((0.36, 0.36, 0.14), (x, y, 2.55), "cliff", "root")
    b.cone(1.45, 1.45, 0.2, (0, 0, 2.72), T, "root", segs=4, rot=(0, 0, math.pi / 4))
    b.cone(1.25, 0.0, 0.8, (0, 0, 3.22), "roof", "root", segs=4, rot=(0, 0, math.pi / 4))
    b.cone(0.55, 0.6, 0.25, (0, 0, 0.42), "gold", "root", segs=8)
    s = charkit.Char("spin_support", images)
    s.ico(0.32, (0, 0, 0), X, "root")
    for i in range(3):
        a = i / 3 * math.tau
        s.box((0.1, 0.1, 0.1), (math.cos(a) * 0.55, math.sin(a) * 0.55, 0), "gold", "root")
    return b, (s, (0, 0, 1.4))


def barracks(images):
    b = charkit.Char("barracks", images)
    plinth(b)
    b.box((2.3, 1.8, 1.4), (0, 0.1, 1.0), "brick", "root", meters=1.0)
    for sx in (-1, 1):
        b.box((0.08, 2.0, 1.4), (1.1 * sx, 0.1, 2.35), T, "root", rot=(0, 0.6 * sx, 0))
    b.box((2.4, 2.0, 0.1), (0, 0.1, 1.72), "wood", "root")
    b.box((1.62, 2.1, 0.1), (-0.58, 0.1, 2.25), "roof", "root", rot=(0, -0.72, 0), meters=1.0)
    b.box((1.62, 2.1, 0.1), (0.58, 0.1, 2.25), "roof", "root", rot=(0, 0.72, 0), meters=1.0)
    b.box((0.7, 0.08, 1.0), (0, -0.82, 0.8), "wood", "root")
    b.box((0.3, 0.3, 0.3), (0, -0.85, 1.45), "gold", "root", rot=(0, math.pi / 4, 0))
    for sx in (-1, 1):
        b.box((0.28, 0.06, 0.28), (0.7 * sx, -0.82, 1.1), "iron", "root")
    s = charkit.Char("spin_barracks", images)
    s.box((0.55, 0.04, 0.4), (0.28, 0, 0), C, "root")
    b.limb((1.35, -0.9, 0.3), (1.35, -0.9, 2.4), 0.04, 0.04, "wood", "root", segs=4)
    return b, (s, (1.35, -0.9, 2.15))


def range_(images):
    b = charkit.Char("range", images)
    plinth(b)
    b.box((1.5, 1.3, 1.0), (-0.45, 0.35, 0.8), "wood", "root", meters=1.0)
    b.cone(1.2, 0.0, 0.9, (-0.45, 0.35, 1.75), "roof", "root", segs=4, rot=(0, 0, math.pi / 4))
    b.cone(0.62, 0.62, 0.1, (0.75, -0.55, 1.05), "cloth", "root", segs=8, rot=(math.pi / 2, 0, 0))
    b.cone(0.42, 0.42, 0.12, (0.75, -0.57, 1.05), T, "root", segs=8, rot=(math.pi / 2, 0, 0))
    b.cone(0.16, 0.16, 0.14, (0.75, -0.59, 1.05), "gold", "root", segs=6, rot=(math.pi / 2, 0, 0))
    for sx in (-1, 1):
        b.limb((0.75 + 0.35 * sx, -0.45, 0.3), (0.75 + 0.15 * sx, -0.5, 1.0), 0.04, 0.04, "wood", "root", segs=4)
    for i in range(3):
        b.limb((-1.2 + i * 0.12, -0.4, 0.35), (-1.25 + i * 0.12, -0.45, 1.3), 0.02, 0.02, "wood", "root", segs=3)
    b.box((0.5, 0.2, 0.5), (-1.1, -0.5, 0.55), "leather", "root")
    s = charkit.Char("spin_range", images)
    s.box((0.4, 0.04, 0.28), (0.22, 0, 0), C, "root")
    b.limb((-1.2, 0.9, 1.2), (-1.2, 0.9, 2.8), 0.035, 0.035, "wood", "root", segs=4)
    return b, (s, (-1.2, 0.9, 2.6))


def foundry(images):
    b = charkit.Char("foundry", images)
    plinth(b)
    b.box((2.2, 1.9, 1.5), (0, 0.1, 1.05), "cliff", "root", meters=1.0)
    b.box((2.35, 2.05, 0.25), (0, 0.1, 1.9), T, "root")
    b.cone(0.32, 0.25, 1.7, (0.6, 0.4, 2.6), "brick", "root", segs=6, meters=1.0)
    b.cone(0.38, 0.38, 0.2, (0.6, 0.4, 3.45), "iron", "root", segs=6)
    b.box((0.9, 0.08, 0.7), (0, -0.86, 0.75), X, "root")
    b.box((1.1, 0.1, 0.12), (0, -0.88, 1.15), "iron", "root")
    b.box((0.55, 0.3, 0.25), (-0.95, -1.05, 0.45), "iron", "root")
    b.box((0.25, 0.25, 0.3), (-0.95, -1.05, 0.25), "iron", "root")
    s = charkit.Char("spin_foundry", images)
    for i in range(4):
        a = i / 4 * math.tau
        s.box((0.14, 0.5, 0.14), (math.cos(a) * 0.2, 0, math.sin(a) * 0.2), "iron", "root", rot=(0, a, 0))
    s.cone(0.12, 0.12, 0.2, (0, 0, 0), "gold", "root", segs=6, rot=(math.pi / 2, 0, 0))
    return b, (s, (-0.6, -1.0, 1.55))


BUILDERS = {"damage": damage, "control": control, "support": support, "barracks": barracks, "range": range_, "foundry": foundry}


def build_one(name, images):
    coll_name = "Struct_" + name
    coll = bpy.data.collections.get(coll_name)
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new(coll_name)
        bpy.context.scene.collection.children.link(coll)
    coll.hide_viewport = False
    coll.hide_render = False
    body, (spin, pivot) = BUILDERS[name](images)
    trim = charkit.Char("level2_" + name, images)
    level2_trim(trim)
    tris = body.tri_count() + spin.tri_count() + trim.tri_count()
    bo, _ = body.build(None, coll)
    so, _ = spin.build(None, coll)
    so.location = pivot
    to, _ = trim.build(None, coll)
    charkit.bake_ao([bo, to], samples=32)
    size = charkit.export([bo, so, to], os.path.join(ROOT, "assets", "structures", name + ".glb"))
    coll.hide_viewport = True
    coll.hide_render = True
    return {"tris": tris, "bytes": size}


def main():
    for store in (bpy.data.meshes,):
        for d in list(store):
            if d.users == 0:
                store.remove(d)
    images = texgen.build_all(os.path.join(ROOT, "assets", "textures"))
    names = globals().get("STRUCTURES") or list(BUILDERS)
    return {n: build_one(n, images) for n in names}


if __name__ == "__main__":
    RESULT = main()
