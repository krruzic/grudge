"""The Grudge relic: a horned bronze bull idol (Poly Haven bull_head, CC0) reduced to N64 budget.

Needs the Poly Haven glTF unpacked at SRC (bull_head_1k.gltf + bull_head.bin + textures/).
Bakes the high-poly form and a painted key light into a 128px texture on a ~900 tri mesh,
then adds a stone altar built from the shared texture kit.
Exports assets/structures/grudge.glb with nodes: relic, altar.
"""
import importlib
import math
import os
import sys

import bpy

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
SRC = globals().get("SRC", "/tmp/opencode/ph/bull")
TRIS = globals().get("TRIS", 900)
TEX = globals().get("TEX", 128)
HEIGHT = globals().get("HEIGHT", 1.1)
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import charkit  # noqa: E402
import texgen  # noqa: E402

importlib.reload(texgen)
importlib.reload(charkit)


def clear_scene():
    for o in list(bpy.context.scene.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def import_high():
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, "bull_head_1k.gltf"))
    meshes = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    for o in bpy.context.scene.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    hi = bpy.context.view_layer.objects.active
    hi.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    zs = [(hi.matrix_world @ v.co).z for v in hi.data.vertices]
    xs = [(hi.matrix_world @ v.co).x for v in hi.data.vertices]
    ys = [(hi.matrix_world @ v.co).y for v in hi.data.vertices]
    k = HEIGHT / (max(zs) - min(zs))
    hi.location = (-(max(xs) + min(xs)) / 2 * k, -(max(ys) + min(ys)) / 2 * k, -min(zs) * k)
    hi.scale = (k, k, k)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    hi.name = "relic_hi"
    return hi


def recolor(hi):
    mat = hi.data.materials[0]
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and "diff" in n.image.name)
    for l in list(bsdf.inputs["Base Color"].links):
        nt.links.remove(l)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    stops = [(0.0, (0.16, 0.07, 0.03)), (0.02, (0.48, 0.24, 0.08)), (0.06, (0.78, 0.50, 0.16)), (0.2, (0.98, 0.76, 0.30)), (0.6, (1.0, 0.92, 0.55))]
    cr.elements[0].position = stops[0][0]
    cr.elements[0].color = (*stops[0][1], 1)
    cr.elements[1].position = stops[-1][0]
    cr.elements[1].color = (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        cr.elements.new(pos).color = (*col, 1)
    nt.links.new(tex.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 1.0
    for l in list(bsdf.inputs["Normal"].links):
        nt.links.remove(l)


def make_low(hi):
    lo = hi.copy()
    lo.data = hi.data.copy()
    bpy.context.scene.collection.objects.link(lo)
    lo.name = "relic"
    mod = lo.modifiers.new("dec", "DECIMATE")
    mod.ratio = TRIS / max(1, sum(len(p.vertices) - 2 for p in hi.data.polygons))
    mod.use_collapse_triangulate = True
    for o in bpy.context.scene.objects:
        o.select_set(o == lo)
    bpy.context.view_layer.objects.active = lo
    bpy.ops.object.modifier_apply(modifier="dec")
    for p in lo.data.polygons:
        p.use_smooth = True
    return lo


def bake_lit(hi, lo):
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
    except TypeError:
        pass
    scene.cycles.samples = 48
    world = scene.world or bpy.data.worlds.new("relic_world")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.7, 0.62, 0.55, 1)
    bg.inputs["Strength"].default_value = 0.9
    sun_d = bpy.data.lights.get("relic_sun") or bpy.data.lights.new("relic_sun", "SUN")
    sun_d.energy = 3.2
    sun_d.angle = math.radians(20)
    sun = bpy.data.objects.new("relic_sun", sun_d)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(40), 0, math.radians(-25))
    old = bpy.data.images.get("grudge_tex")
    if old:
        bpy.data.images.remove(old)
    img = bpy.data.images.new("grudge_tex", TEX * 4, TEX * 4)
    oldm = bpy.data.materials.get("grudge")
    if oldm:
        bpy.data.materials.remove(oldm)
    lm = bpy.data.materials.new("grudge")
    lm.use_nodes = True
    nt = lm.node_tree
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = img
    tn.interpolation = "Closest"
    nt.nodes.active = tn
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    lo.data.materials.clear()
    lo.data.materials.append(lm)
    for o in scene.objects:
        o.select_set(o in (hi, lo))
    bpy.context.view_layer.objects.active = lo
    bake = scene.render.bake
    bake.use_selected_to_active = True
    bake.cage_extrusion = 0.03
    bake.max_ray_distance = 0.08
    bake.margin = 4
    bake.use_pass_direct = True
    bake.use_pass_indirect = True
    bake.use_pass_color = True
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT", "COLOR"})
    img.scale(TEX, TEX)
    px = list(img.pixels)
    for i in range(0, len(px), 4):
        for c in range(3):
            v = min(1.0, px[i + c] * 1.25) ** 0.9
            px[i + c] = round(v * 31) / 31
    img.pixels = px
    path = "/tmp/grudge_tex.png"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.pack()
    bake.use_selected_to_active = False
    bpy.data.objects.remove(sun, do_unlink=True)
    return path


def altar(images):
    a = charkit.Char("altar", images)
    a.cone(1.2, 1.3, 0.22, (0, 0, 0.11), "cobble", "root", segs=8, meters=1.0)
    a.cone(0.78, 0.9, 0.34, (0, 0, 0.39), "cliff", "root", segs=8, meters=1.0)
    a.cone(0.62, 0.62, 0.06, (0, 0, 0.59), "iron", "root", segs=8)
    for i in range(4):
        ang = i / 4 * math.tau + math.pi / 4
        x, y = math.cos(ang) * 1.02, math.sin(ang) * 1.02
        a.box((0.24, 0.24, 0.5), (x, y, 0.47), "brick", "root", rot=(0, 0, ang), meters=1.0)
        a.cone(0.16, 0.16, 0.06, (x, y, 0.75), "iron", "root", segs=4, rot=(0, 0, ang + math.pi / 4))
        a.cone(0.13, 0.0, 0.2, (x, y, 0.88), "gold", "root", segs=4, rot=(0, 0, ang + math.pi / 4))
    return a


def main():
    clear_scene()
    hi = import_high()
    recolor(hi)
    lo = make_low(hi)
    tex = bake_lit(hi, lo)
    bpy.data.objects.remove(hi, do_unlink=True)
    images = texgen.build_all(os.path.join(ROOT, "assets", "textures"))
    coll = bpy.context.scene.collection
    ao, _ = altar(images).build(None, coll)
    charkit.bake_ao([ao], samples=32)
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in (lo, ao)}
    size = charkit.export([lo, ao], os.path.join(ROOT, "assets", "structures", "grudge.glb"))
    return {"tris": tris, "bytes": size, "tex": tex}


if __name__ == "__main__":
    RESULT = main()
