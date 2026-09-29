"""Grudge core: a house heart-crystal held in gold claws on a stone altar.

The crystal is a separate object ("crystal") so the game can spin and bob it.
Materials prefixed team_ are tinted with the team color in game.
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


def build_base(images):
    c = charkit.Char("core_base", images)
    c.cone(1.5, 1.35, 0.5, (0, 0, 0.25), "brick", "root", segs=8, meters=1.0)
    c.cone(1.1, 1.0, 0.4, (0, 0, 0.7), "cobble", "root", segs=8, meters=1.0)
    c.cone(0.75, 0.9, 0.2, (0, 0, 1.0), "gold", "root", segs=8)
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        x, y = math.cos(a), math.sin(a)
        c.limb((x * 0.7, y * 0.7, 1.05), (x * 0.85, y * 0.85, 1.9), 0.13, 0.09, "gold", "root", segs=4)
        c.limb((x * 0.85, y * 0.85, 1.9), (x * 0.45, y * 0.45, 2.6), 0.09, 0.0, "gold", "root", segs=4)
        c.box((0.35, 0.35, 0.9), (x * 1.25, y * 1.25, 0.6), "brick", "root", rot=(0, 0, a))
        c.cone(0.12, 0.12, 0.25, (x * 1.25, y * 1.25, 1.18), "team_cloth", "root", segs=6)
    return c


def build_crystal(images):
    c = charkit.Char("crystal", images)
    c.cone(0.55, 0.0, 1.1, (0, 0, 0.55), "team_crystal", "root", segs=6)
    c.cone(0.55, 0.0, 0.7, (0, 0, -0.35), "team_crystal", "root", segs=6, rot=(math.pi, 0, 0))
    return c


def main():
    coll_name = "Struct_core"
    coll = bpy.data.collections.get(coll_name)
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new(coll_name)
        bpy.context.scene.collection.children.link(coll)
    images = texgen.build_all(os.path.join(ROOT, "assets", "textures"))
    base = build_base(images)
    crystal = build_crystal(images)
    tris = base.tri_count() + crystal.tri_count()
    base_obj, _ = base.build(None, coll)
    cry_obj, _ = crystal.build(None, coll)
    cry_obj.location = (0, 0, 2.2)
    charkit.bake_ao([base_obj])
    size = charkit.export([base_obj, cry_obj], os.path.join(ROOT, "assets", "structures", "core.glb"))
    return {"tris": tris, "bytes": size}


RESULT = main()
