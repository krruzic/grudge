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


def outpost(images):
    b = charkit.Char("outpost", images)
    plinth(b)
    b.box((1.7, 1.5, 1.2), (-0.2, 0.25, 0.9), "wood", "root", meters=1.0)
    b.box((1.8, 1.6, 0.18), (-0.2, 0.25, 1.55), T, "root")
    b.box((1.25, 1.7, 0.1), (-0.62, 0.25, 1.95), "roof", "root", rot=(0, -0.72, 0), meters=1.0)
    b.box((1.25, 1.7, 0.1), (0.22, 0.25, 1.95), "roof", "root", rot=(0, 0.72, 0), meters=1.0)
    b.box((0.55, 0.08, 0.85), (-0.2, -0.52, 0.72), "wood", "root")
    b.box((0.24, 0.24, 0.24), (-0.2, -0.55, 1.3), "gold", "root", rot=(0, math.pi / 4, 0))
    b.cone(0.24, 0.2, 1.4, (0.35, 0.65, 2.3), "brick", "root", segs=6, meters=1.0)
    b.cone(0.3, 0.3, 0.16, (0.35, 0.65, 3.0), "iron", "root", segs=6)
    b.cone(0.46, 0.46, 0.08, (1.0, -0.75, 0.95), "cloth", "root", segs=8, rot=(math.pi / 2, 0, 0))
    b.cone(0.3, 0.3, 0.1, (1.0, -0.77, 0.95), T, "root", segs=8, rot=(math.pi / 2, 0, 0))
    b.cone(0.11, 0.11, 0.12, (1.0, -0.79, 0.95), "gold", "root", segs=6, rot=(math.pi / 2, 0, 0))
    for sx in (-1, 1):
        b.limb((1.0 + 0.25 * sx, -0.65, 0.3), (1.0 + 0.1 * sx, -0.7, 0.9), 0.035, 0.035, "wood", "root", segs=4)
    b.box((0.45, 0.28, 0.22), (1.05, 0.55, 0.42), "iron", "root")
    b.box((0.2, 0.2, 0.25), (1.05, 0.55, 0.22), "iron", "root")
    b.box((0.4, 0.4, 0.4), (-1.15, -0.6, 0.5), "wood", "root", rot=(0, 0.3, 0))
    for i in range(3):
        b.limb((-1.2 + i * 0.1, -0.15, 0.3), (-1.25 + i * 0.1, -0.2, 1.2), 0.02, 0.02, "wood", "root", segs=3)
    s = charkit.Char("spin_outpost", images)
    s.box((0.5, 0.04, 0.34), (0.26, 0, 0), C, "root")
    b.limb((-1.15, 0.85, 0.3), (-1.15, 0.85, 2.6), 0.04, 0.04, "wood", "root", segs=4)
    return b, (s, (-1.15, 0.85, 2.4))



def l2_damage(c):
    for z in (1.15, 2.25):
        c.cone(0.99, 0.99, 0.12, (0, 0, z), "iron", "root", segs=6)
    for i in range(6):
        a = i / 6 * math.tau + math.pi / 6
        x, y = math.cos(a) * 1.12, math.sin(a) * 1.12
        c.box((0.62, 0.14, 0.42), (x, y, 2.95), "wood", "root", rot=(0, 0, a + math.pi / 2))
        c.limb((x * 0.95, y * 0.95, 2.72), (x * 0.82, y * 0.82, 2.45), 0.035, 0.035, "wood", "root", segs=4)
    for i in range(6):
        a = i / 6 * math.tau
        c.cone(0.09, 0.0, 0.3, (math.cos(a) * 0.86, math.sin(a) * 0.86, 3.72), "gold", "root", segs=4)
    for sx in (-1, 1):
        c.box((0.42, 0.04, 1.1), (0.55 * sx, -0.86, 2.2), C, "root", rot=(0, 0, -0.5 * sx))
        c.cone(0.05, 0.0, 0.18, (0.55 * sx, -0.9, 1.55), "gold", "root", segs=4, rot=(math.pi, 0, 0))


def l2_control(c):
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        x, y = math.cos(a) * 1.32, math.sin(a) * 1.32
        c.limb((x, y, 0.25), (x * 0.95, y * 0.95, 2.2), 0.1, 0.07, "iron", "root", segs=5)
        c.ico(0.2, (x * 0.95, y * 0.95, 2.3), X, "root", sub=0)
        c.limb((x * 0.95, y * 0.95, 2.2), (x * 0.3, y * 0.3, 3.35), 0.05, 0.04, "iron", "root", segs=4)
    for i in range(5):
        a = i / 5 * math.tau
        c.cone(0.08, 0.0, 0.45, (math.cos(a) * 0.3, math.sin(a) * 0.3, 3.35), "gold", "root", segs=4)
    c.cone(0.42, 0.36, 0.14, (0, 0, 3.15), "gold", "root", segs=8)
    c.cone(1.24, 1.24, 0.12, (0, 0, 1.62), "gold", "root", segs=8)
    for sx in (-1, 1):
        banner(c, 1.05 * sx, -1.05, 0.3, 1.6)


def l2_support(c):
    c.cone(0.4, 0.0, 0.7, (0, 0, 3.95), "gold", "root", segs=4, rot=(0, 0, math.pi / 4))
    for i in range(4):
        a = i / 4 * math.tau
        x, y = math.cos(a) * 1.15, math.sin(a) * 1.15
        c.limb((x, y, 2.62), (x, y, 2.25), 0.02, 0.02, "iron", "root", segs=3)
        c.cone(0.12, 0.09, 0.22, (x, y, 2.12), "gold", "root", segs=6)
        c.ico(0.07, (x, y, 1.98), X, "root", sub=0)


def l2_barracks(c):
    c.cone(0.42, 0.36, 3.0, (1.15, 0.85, 1.8), "brick", "root", segs=6, meters=1.0)
    c.cone(0.5, 0.5, 0.2, (1.15, 0.85, 3.35), "wood", "root", segs=6)
    c.cone(0.6, 0.0, 0.75, (1.15, 0.85, 3.8), "roof", "root", segs=6)
    c.cone(0.04, 0.0, 0.3, (1.15, 0.85, 4.3), "gold", "root", segs=4)
    c.box((0.62, 0.1, 0.5), (-0.6, -1.0, 0.65), "wood", "root")
    for i in range(4):
        c.limb((-0.82 + i * 0.15, -1.05, 0.4), (-0.82 + i * 0.15, -1.05, 1.15), 0.02, 0.02, "iron", "root", segs=3)
        c.cone(0.04, 0.0, 0.12, (-0.82 + i * 0.15, -1.05, 1.21), "iron", "root", segs=4)
    banner(c, -1.25, -0.75, 0.4, 1.3)
    c.box((2.5, 0.12, 0.1), (0, -0.83, 1.72), "gold", "root")


def l2_range(c):
    c.cone(0.5, 0.5, 0.08, (-0.1, -0.7, 0.7), "cloth", "root", segs=8, rot=(math.pi / 2, 0, 0))
    c.cone(0.33, 0.33, 0.1, (-0.1, -0.72, 0.7), T, "root", segs=8, rot=(math.pi / 2, 0, 0))
    for sx in (-1, 1):
        c.limb((-0.1 + 0.28 * sx, -0.62, 0.25), (-0.1 + 0.12 * sx, -0.66, 0.7), 0.035, 0.035, "wood", "root", segs=4)
    for sx in (-1, 1):
        c.limb((0.75 + 0.75 * sx, -1.0, 0.2), (0.75 + 0.75 * sx, -1.0, 1.9), 0.04, 0.04, "wood", "root", segs=4)
    c.box((1.6, 0.9, 0.06), (0.75, -0.65, 1.95), T, "root", rot=(0.35, 0, 0))
    c.box((1.7, 0.12, 0.1), (-0.45, -0.32, 1.32), "gold", "root")
    c.limb((-1.2, 0.9, 2.7), (-1.2, 0.9, 3.6), 0.035, 0.035, "wood", "root", segs=4)
    c.box((0.5, 0.04, 0.35), (-0.95, 0.9, 3.45), C, "root")
    c.box((0.3, 0.3, 0.6), (0.9, 0.7, 0.55), "leather", "root")
    for i in range(4):
        c.limb((0.82 + i * 0.05, 0.68, 0.8), (0.84 + i * 0.05, 0.66, 1.25), 0.015, 0.015, "wood", "root", segs=3)
    banner(c, 1.3, 0.5, 0.4, 1.2)


def l2_foundry(c):
    c.cone(0.28, 0.22, 1.5, (-0.55, 0.55, 2.45), "brick", "root", segs=6, meters=1.0)
    c.cone(0.34, 0.34, 0.18, (-0.55, 0.55, 3.2), "iron", "root", segs=6)
    c.box((0.5, 0.3, 0.22), (1.05, -0.95, 0.55), "iron", "root")
    c.box((0.22, 0.2, 0.3), (1.05, -0.95, 0.3), "iron", "root")
    c.limb((-1.15, 0.9, 0.3), (-1.15, 0.9, 2.6), 0.06, 0.06, "wood", "root", segs=4)
    c.limb((-1.15, 0.9, 2.55), (-0.2, 0.2, 2.75), 0.05, 0.05, "wood", "root", segs=4)
    c.limb((-0.3, 0.28, 2.7), (-0.3, 0.28, 2.2), 0.015, 0.015, "iron", "root", segs=3)
    c.box((0.2, 0.2, 0.2), (-0.3, 0.28, 2.1), "iron", "root")
    c.box((2.4, 0.1, 0.1), (0, -0.9, 1.75), "gold", "root")


def l2_outpost(c):
    for i in range(9):
        t = i / 8
        x = -1.3 + t * 2.6
        c.limb((x, 1.25, 0.2), (x, 1.25, 0.95 + 0.12 * (i % 2)), 0.06, 0.04, "wood", "root", segs=4)
        c.cone(0.06, 0.0, 0.18, (x, 1.25, 1.02 + 0.12 * (i % 2)), "wood", "root", segs=4)
    c.box((2.7, 0.06, 0.12), (0, 1.25, 0.7), "wood", "root")
    for sx in (-1, 1):
        for sy in (-1, 1):
            c.limb((1.15 + 0.3 * sx, 0.55 + 0.3 * sy, 0.2), (1.15 + 0.25 * sx, 0.55 + 0.25 * sy, 2.75), 0.04, 0.04, "wood", "root", segs=4)
    c.box((0.75, 0.75, 0.1), (1.15, 0.55, 2.4), "wood", "root")
    for sx in (-1, 1):
        c.box((0.75, 0.05, 0.3), (1.15, 0.55 + 0.36 * sx, 2.58), "wood", "root")
    c.cone(0.6, 0.0, 0.5, (1.15, 0.55, 3.0), "roof", "root", segs=4, rot=(0, 0, math.pi / 4))
    banner(c, 1.35, -0.2, 0.4, 1.3)


LEVEL2 = {"damage": l2_damage, "control": l2_control, "support": l2_support, "barracks": l2_barracks, "range": l2_range, "foundry": l2_foundry, "outpost": l2_outpost}


def l3_ballista(c):
    c.cone(0.85, 0.9, 0.25, (0, 0, 3.64), "wood", "root", segs=8)
    c.box((0.42, 1.3, 0.3), (0, -0.1, 3.95), "wood", "root")
    c.box((0.6, 0.42, 0.45), (0, 0.5, 4.0), "iron", "root")
    for sx in (-1, 1):
        c.limb((0.12 * sx, -0.7, 4.05), (1.45 * sx, -0.3, 4.25), 0.1, 0.05, "wood", "root", segs=6)
        c.cone(0.09, 0.0, 0.25, (1.5 * sx, -0.28, 4.27), "iron", "root", segs=4, rot=(0, math.pi / 2 * sx, 0))
        c.limb((1.45 * sx, -0.3, 4.25), (0.12 * sx, 0.45, 4.1), 0.02, 0.02, "leather", "root", segs=3)
        c.box((0.22, 0.22, 0.22), (0.12 * sx, -0.7, 4.05), "iron", "root")
        c.limb((0.3 * sx, 0.6, 3.75), (0.5 * sx, 0.9, 3.6), 0.05, 0.05, "wood", "root", segs=4)
    c.limb((0, 0.55, 4.18), (0, -1.75, 4.18), 0.07, 0.07, "wood", "root", segs=6)
    c.cone(0.18, 0.0, 0.55, (0, -2.0, 4.18), "iron", "root", segs=4, rot=(math.pi / 2, 0, 0))
    for sx in (-1, 1):
        c.box((0.05, 0.3, 0.24), (0.1 * sx, 0.42, 4.18), C, "root")
    for i in range(6):
        a = i / 6 * math.tau
        c.box((0.36, 0.36, 0.1), (math.cos(a) * 0.86, math.sin(a) * 0.86, 3.6), "iron", "root", rot=(0, 0, a))


def l3_firepot(c):
    c.cone(0.62, 0.38, 0.45, (0, 0, 3.78), "iron", "root", segs=8)
    c.cone(0.66, 0.66, 0.08, (0, 0, 4.0), "gold", "root", segs=8)
    for i in range(5):
        a = i / 5 * math.tau
        c.ico(0.17, (math.cos(a) * 0.3, math.sin(a) * 0.3, 4.05), "brick", "root", sub=1, shade=(1.0, 0.55, 0.2))
    c.ico(0.2, (0, 0, 4.1), "brick", "root", sub=1, shade=(1.0, 0.75, 0.3))
    c.limb((-0.75, 0.45, 3.6), (0.25, -0.75, 4.55), 0.05, 0.045, "wood", "root", segs=5)
    c.cone(0.17, 0.2, 0.14, (0.25, -0.75, 4.6), "iron", "root", segs=6)
    c.ico(0.14, (0.25, -0.75, 4.75), "brick", "root", sub=1, shade=(0.75, 0.38, 0.2))
    for i in range(4):
        a = i / 4 * math.tau + 0.4
        c.ico(0.16, (math.cos(a) * 1.15, math.sin(a) * 1.15, 3.55), "brick", "root", sub=1, scale=(1, 1, 0.9), shade=(0.7, 0.36, 0.2))
        c.cone(0.06, 0.08, 0.1, (math.cos(a) * 1.15, math.sin(a) * 1.15, 3.73), "brick", "root", segs=6, shade=(0.7, 0.36, 0.2))
    for z in (2.6, 3.3):
        c.cone(1.0, 1.0, 0.07, (0, 0, z), "iron", "root", segs=6, shade=(0.35, 0.3, 0.28))


def l3_volley(c):
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        x, y = math.cos(a) * 1.18, math.sin(a) * 1.18
        c.cone(0.3, 0.34, 0.7, (x, y, 3.2), "brick", "root", segs=6, meters=1.0)
        c.cone(0.42, 0.0, 0.55, (x, y, 3.82), "roof", "root", segs=6)
        c.cone(0.04, 0.0, 0.25, (x, y, 4.2), "gold", "root", segs=4)
        c.box((0.1, 0.04, 0.24), (x * 1.28, y * 1.28, 3.25), "iron", "root", rot=(0, 0, a + math.pi / 2))
    for sx in (-1, 1):
        c.box((0.24, 0.24, 0.45), (0.42 * sx, 0.6, 3.75), "leather", "root")
        for k in range(4):
            c.limb((0.36 * sx + k * 0.04, 0.6, 3.9), (0.37 * sx + k * 0.04, 0.62, 4.3), 0.012, 0.012, "wood", "root", segs=3)
            c.box((0.06, 0.01, 0.08), (0.37 * sx + k * 0.04, 0.62, 4.3), "feather", "root")
    c.box((0.5, 0.04, 1.2), (0, -0.9, 2.35), C, "root")


def l3_frost(c):
    for i in range(7):
        a = i / 7 * math.tau
        r = 0.42 + 0.08 * (i % 2)
        h = 0.9 + 0.4 * ((i * 3) % 3) / 2
        c.cone(0.22, 0.0, h * 1.5, (math.cos(a) * r * 1.3, math.sin(a) * r * 1.3, 2.85 + h * 0.75), "plain", "root", segs=5, rot=(math.sin(a) * 0.45, -math.cos(a) * 0.45, 0), shade=(0.55, 0.8, 1.0))
    c.cone(0.3, 0.0, 2.3, (0, 0, 3.95), "plain", "root", segs=5, shade=(0.7, 0.9, 1.0))
    for i in range(9):
        a = i / 9 * math.tau + 0.2
        r = 1.35 + 0.1 * (i % 3)
        h = 0.45 + 0.25 * (i % 3)
        c.cone(0.18, 0.0, h * 1.6, (math.cos(a) * r, math.sin(a) * r, 0.25 + h * 0.8), "plain", "root", segs=5, rot=(math.sin(a) * 0.3, -math.cos(a) * 0.3, 0), shade=(0.55, 0.8, 1.0))
    c.cone(1.22, 1.08, 0.12, (0, 0, 1.62), "plain", "root", segs=8, shade=(0.82, 0.94, 1.0))
    for i in range(8):
        a = i / 8 * math.tau
        c.cone(0.06, 0.0, 0.3, (math.cos(a) * 1.12, math.sin(a) * 1.12, 1.45), "plain", "root", segs=4, rot=(math.pi, 0, 0), shade=(0.8, 0.94, 1.0))


def l3_storm(c):
    for sx in (-1, 1):
        c.limb((0.55 * sx, 0.0, 2.5), (0.4 * sx, 0.0, 4.0), 0.06, 0.05, "iron", "root", segs=5)
    c.limb((-0.45, 0, 3.95), (0.45, 0, 3.95), 0.06, 0.06, "iron", "root", segs=5)
    c.lathe([(0.02, 0.0), (0.22, -0.05), (0.32, -0.3), (0.42, -0.65), (0.5, -0.78), (0.0, -0.78)], (0, 0, 3.92), "gold", "root", segs=10)
    c.ico(0.08, (0, 0, 3.08), "iron", "root", sub=0)
    c.limb((0, 0, 4.0), (0, 0, 5.0), 0.035, 0.015, "iron", "root", segs=4)
    for k in range(5):
        c.cone(0.08, 0.08, 0.04, (0, 0, 4.15 + k * 0.15), "gold", "root", segs=6, shade=(1.0, 0.6, 0.35))
    c.ico(0.09, (0, 0, 5.05), X, "root", sub=0)
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        x, y = math.cos(a) * 1.3, math.sin(a) * 1.3
        c.limb((x, y, 0.25), (x, y, 2.3), 0.05, 0.03, "iron", "root", segs=4)
        c.cone(0.07, 0.0, 0.3, (x, y, 2.45), "gold", "root", segs=4)
        c.limb((x, y, 2.2), (0.3 * x / 1.3, 0.3 * y / 1.3, 3.0), 0.012, 0.012, "gold", "root", segs=3, shade=(1.0, 0.6, 0.35))


def l3_well(c):
    c.ico(0.62, (0, 0, 3.7), "iron", "root", sub=1, shade=(0.22, 0.12, 0.32))
    c.cone(1.05, 1.05, 0.07, (0, 0, 3.7), X, "root", segs=14, rot=(0.35, 0, 0))
    c.cone(0.85, 0.85, 0.06, (0, 0, 3.7), X, "root", segs=14, rot=(-0.3, 0.4, 0))
    for i in range(7):
        a = i / 7 * math.tau
        r = 1.1 + 0.15 * (i % 2)
        z = 2.4 + 0.6 * ((i * 2) % 3) / 2
        c.ico(0.3 + 0.07 * (i % 3), (math.cos(a) * r * 1.15, math.sin(a) * r * 1.15, z + 0.3), "cliff", "root", sub=0, rot=(i, i * 2, 0), shade=(0.45, 0.35, 0.55))
    for i in range(6):
        a = i / 6 * math.tau + 0.3
        x, y = math.cos(a) * 1.35, math.sin(a) * 1.35
        c.box((0.3, 0.22, 0.5), (x, y, 0.4), "cliff", "root", rot=(0.2, 0.1, a), shade=(0.4, 0.32, 0.5))
        c.ico(0.06, (x, y, 0.72), X, "root", sub=0)
    c.cone(1.25, 1.1, 0.08, (0, 0, 1.62), "iron", "root", segs=8, shade=(0.3, 0.2, 0.4))


LEVEL3 = {"damage": {"ballista": l3_ballista, "firepot": l3_firepot, "volley": l3_volley}, "control": {"frost": l3_frost, "storm": l3_storm, "well": l3_well}}


BUILDERS = {"damage": damage, "control": control, "support": support, "barracks": barracks, "range": range_, "foundry": foundry, "outpost": outpost}


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
    LEVEL2[name](trim)
    tops = []
    for spec, fn in LEVEL3.get(name, {}).items():
        t3 = charkit.Char("level3_" + spec, images)
        fn(t3)
        tops.append(t3)
    tris = body.tri_count() + spin.tri_count() + trim.tri_count() + sum(t.tri_count() for t in tops)
    bo, _ = body.build(None, coll)
    so, _ = spin.build(None, coll)
    so.location = pivot
    to, _ = trim.build(None, coll)
    t3o = [t.build(None, coll)[0] for t in tops]
    charkit.bake_ao([bo, to, *t3o], samples=32)
    size = charkit.export([bo, so, to, *t3o], os.path.join(ROOT, "assets", "structures", name + ".glb"))
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
