"""Turn an AI-generated (Tripo) unit mesh into a Grudge unit on the 8-bone unit rig from build_units.py.

Run headless: blender -b --python tools/blender/build_tripo_unit.py -- <unit> [preview_dir]
The source mesh lives in assets/source/<unit>_tripo.glb, props in assets/source/<unit>_<prop>_tripo.glb.
Reuses the hero pipeline (build_tripo_hero.py) for import, weights and texture baking.
CLIP=attack FRAMES=0,4,6 (with a preview dir) renders posed frames instead of exporting.
"""
import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import anims  # noqa: E402
import build_tripo_hero as th  # noqa: E402
import charkit  # noqa: E402

UNITS = {
    "ogre": {
        "yaw": -90,
        "height": 1.97,
        "weight": 1.5,
        "tex": 1024,
        "vivid": {"hue": (55, 150), "to": 100, "pull": 0.35, "sat": 1.7, "val": 1.15},
        "decimate": 0.82,
        "clips": "ogre_clips",
        "joints": {
            "hip": 0.74,
            "neck": 1.42,
            "top": 1.97,
            "head_y": -0.05,
            "shoulder": (0.44, 1.38),
            "hand": (0.57, 0.6),
            "leg_x": 0.21,
            "foot": 0.05,
        },
        "islands": [
            {"bone": "chest", "box": ((-0.6, -0.3, 1.4), (-0.15, 0.45, 1.75))},
            {"bone": "skin", "box": ((-0.2, -0.5, 1.1), (0.2, 0.5, 1.4))},
            {"bone": "hips", "box": ((-0.25, -0.5, 0.3), (0.25, 0.5, 0.97))},
        ],
        "arm_cut": (0.4, 1.32, 0.3, 0.05, 1.0),
        "props": [{"name": "club", "src": "ogre_club_tripo.glb", "bone": "arm_R", "tex": 256, "decimate": 0.5, "rot": 90, "grip": (0.3, 0.0, 0.0), "length": 1.4, "at": 0.97, "axis": (-0.12, -1.0, -0.12), "side": (0, 0, 1)}],
    },
    "grunt": {
        "dye": True,
        "yaw": -90,
        "height": 1.42,
        "tex": 256,
        "decimate": 0.75,
        "team_hue": (195, 245),
        "joints": {
            "hip": 0.42,
            "neck": 0.93,
            "top": 1.42,
            "head_y": 0.0,
            "shoulder": (0.19, 0.86),
            "hand": (0.35, 0.42),
            "leg_x": 0.13,
            "foot": 0.05,
        },
        "islands": [
            {"bone": "chest", "box": ((0.05, -0.2, 0.7), (0.35, 0.25, 1.0))},
            {"bone": "head", "box": ((-0.2, -0.2, 0.9), (0.2, 0.1, 1.2))},
        ],
        "arm_cut": (0.22, 0.84, 0.15, 0.03, 0.7),
        "props": [
            {"name": "spear", "src": "grunt_spear_tripo.glb", "bone": "arm_R", "tex": 256, "decimate": 0.5, "pre": (("Y", -90),), "grip": (0.25, 0.0, 0.0), "length": 1.25, "at": 0.95, "axis": (0.0, -0.2, 1.0), "side": (1, 0, 0)},
            {"name": "shield", "src": "grunt_shield_tripo.glb", "bone": "arm_L", "tex": 256, "decimate": 0.5, "team_hue": (195, 245), "grip": (-0.12, 0.0, 0.0), "length": 0.5, "at": 0.85, "axis": (-1.0, 0.35, 0.0), "side": (0, 0, 1)},
        ],
    },
    "ranged": {
        "dye": True,
        "yaw": -90,
        "height": 1.6,
        "tex": 256,
        "decimate": 0.8,
        "team_hue": (195, 245),
        "clips": "ranged_clips",
        "joints": {
            "hip": 0.45,
            "neck": 1.0,
            "top": 1.6,
            "head_y": -0.05,
            "shoulder": (0.2, 0.93),
            "hand": (0.38, 0.47),
            "leg_x": 0.14,
            "foot": 0.05,
        },
        "islands": [{"bone": "chest", "box": ((-0.45, 0.12, 0.5), (0.35, 0.45, 1.6)), "shift": (0.0, -0.13, 0.0)}],
        "arm_cut": (0.24, 0.9, 0.17, 0.03, 0.75),
        "props": [
            {"name": "bow", "src": "ranged_bow_tripo.glb", "bone": "arm_L", "tex": 256, "decimate": 0.6, "string": ((0.0, -0.118, 0.47), (0.0, -0.118, -0.47), 0.006), "pre": (("Y", -90),), "grip": (0.0, 0.05, 0.0), "length": 1.0, "at": 0.97, "axis": (0.0, -0.7, 0.7), "side": (0, 1, 0)},
        ],
    },
    "heavy": {
        "dye": True,
        "yaw": -90,
        "height": 1.85,
        "weight": 1.3,
        "tex": 256,
        "decimate": 0.75,
        "team_hue": (195, 245),
        "joints": {
            "hip": 0.68,
            "neck": 1.42,
            "top": 1.85,
            "head_y": 0.0,
            "shoulder": (0.42, 1.3),
            "hand": (0.6, 0.45),
            "leg_x": 0.23,
            "foot": 0.05,
        },
        "islands": [
            {"bone": "chest", "box": ((-0.7, -0.45, 1.05), (-0.15, 0.45, 1.65))},
            {"bone": "chest", "box": ((0.15, -0.45, 1.05), (0.7, 0.45, 1.65))},
        ],
        "arm_cut": (0.42, 1.2, 0.32, 0.04, 1.0),
        "props": [
            {"name": "hammer", "src": "heavy_hammer_tripo.glb", "bone": "arm_R", "tex": 256, "decimate": 0.5, "team_hue": (195, 245), "pre": (("Y", -90),), "grip": (0.3, 0.0, 0.0), "length": 1.0, "at": 0.95, "axis": (-0.15, -1.0, 0.35), "side": (0, 0, 1)},
        ],
    },
}


def ogre_clips(clips):
    clips["death"]["bones"]["arm_R"] = [(0, (0, 0, 0)), (6, (-35, 0, 25)), (18, (-15, 80, 40))]
    clips["death"]["bones"]["arm_L"] = [(0, (0, 0, 0)), (6, (-35, 0, -25)), (18, (-15, 0, -40))]
    return clips


def ranged_clips(clips):
    clips["attack"] = {"bones": {
        "arm_L": [(0, (0, 0, 0)), (3, (-85, 0, -10)), (9, (-85, 0, -10)), (12, (0, 0, 0))],
        "arm_R": [(0, (0, 0, 0)), (3, (-80, 0, 20)), (8, (-70, 0, -10)), (12, (0, 0, 0))],
    }}
    return clips


def decimate(obj, ratio):
    if ratio >= 1:
        return
    m = obj.modifiers.new("dec", "DECIMATE")
    m.ratio = ratio
    m.use_collapse_triangulate = True
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=m.name)


def unit_bones(J):
    hip, neck, top = J["hip"], J["neck"], J["top"]
    mid = (hip + neck) / 2
    b = {
        "root": ((0, 0, 0), (0, 0, 0.2), None),
        "hips": ((0, 0, hip), (0, 0, mid), "root"),
        "chest": ((0, 0, mid), (0, 0, neck), "hips"),
        "head": ((0, J["head_y"], neck), (0, J["head_y"], top), "chest"),
    }
    for side, sx in (("R", -1), ("L", 1)):
        b[f"arm_{side}"] = ((J["shoulder"][0] * sx, 0, J["shoulder"][1]), (J["hand"][0] * sx, 0, J["hand"][1]), "chest")
        b[f"thigh_{side}"] = ((J["leg_x"] * sx, 0, hip), (J["leg_x"] * sx, 0, J["foot"]), "hips")
    return b


def fit_depth(src, bones):
    co = np.array([v.co[:] for v in src.data.vertices])
    out = {}
    for n, (h, t, p) in bones.items():
        if not n.startswith(("arm", "thigh")):
            out[n] = (h, t, p)
            continue

        def mid(pt):
            m = (np.abs(co[:, 0] - pt[0]) < 0.08) & (np.abs(co[:, 2] - pt[2]) < 0.08)
            if m.sum() < 8:
                return pt[1]
            ys = co[m, 1]
            return float((ys.min() + ys.max()) / 2)
        out[n] = ((h[0], mid(h), h[2]), (t[0], mid(t), t[2]), p)
    return out


def islands(me):
    n = len(me.vertices)
    par = np.arange(n)

    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            par[ra] = rb
    for e in me.edges:
        union(e.vertices[0], e.vertices[1])
    co = np.array([v.co[:] for v in me.vertices])
    keys = {}
    for i, k in enumerate(map(tuple, np.round(co / 0.002).astype(np.int64))):
        if k in keys:
            union(i, keys[k])
        else:
            keys[k] = i
    roots = np.array([find(i) for i in range(n)])
    groups = {}
    for i, r in enumerate(roots):
        groups.setdefault(r, []).append(i)
    return sorted(groups.values(), key=len, reverse=True), co


def set_weights(src, idx, weights):
    for g in src.vertex_groups:
        g.remove(idx)
    for bone, w in weights.items():
        if w > 1e-4:
            src.vertex_groups[bone].add(idx, w, "REPLACE")


def torso_blend(z, J):
    mid = (J["hip"] + J["neck"]) / 2
    t = min(1.0, max(0.0, (z - (mid - 0.08)) / 0.16))
    return {"hips": 1 - t, "chest": t}


def fix_weights(src, arm, cfg):
    J = cfg["joints"]
    me = src.data
    names = {g.index: g.name for g in src.vertex_groups}
    parts, co = islands(me)
    skin = []
    for k, isl in enumerate(parts[1:]):
        c = co[isl].mean(axis=0)
        rule = next((r for r in cfg.get("islands", []) if all(r["box"][0][i] <= c[i] <= r["box"][1][i] for i in range(3))), None)
        if rule and rule["bone"] == "skin":
            skin += isl
            continue
        if rule:
            set_weights(src, isl, {rule["bone"]: 1.0})
            if rule.get("shift"):
                for i in isl:
                    me.vertices[i].co += Vector(rule["shift"])
            continue
        tot = {}
        for i in isl:
            for g in me.vertices[i].groups:
                tot[names[g.group]] = tot.get(names[g.group], 0.0) + g.weight
        tot.pop("root", None)
        set_weights(src, isl, {max(tot, key=tot.get): 1.0})
    ax, az, bx, ramp, rz = cfg["arm_cut"]
    for i in parts[0]:
        x, z = abs(co[i][0]), co[i][2]
        side = "R" if co[i][0] < 0 else "L"
        v = me.vertices[i]
        ws = {names[g.group]: g.weight for g in v.groups}
        if z < cfg.get("leg_z", 0.45):
            continue
        if z < az:
            a = min(1.0, max(0.0, (x - ax + ramp) / (2 * ramp))) if z > rz else float(x > ax)
        elif x < bx:
            a = 0.0
        else:
            continue
        ws = {b: w for b, w in ws.items() if not b.startswith("arm")}
        s = sum(ws.values())
        rest = {b: w / s for b, w in ws.items()} if s > 0.05 else torso_blend(z, J) if z > J["hip"] - 0.05 else {f"thigh_{side}": 1.0}
        out = {b: w * (1 - a) for b, w in rest.items()}
        out[f"arm_{side}"] = a
        set_weights(src, [i], out)
    if skin:
        kd = KDTree(len(parts[0]))
        for i in parts[0]:
            kd.insert(Vector(co[i]), i)
        kd.balance()
        for i in skin:
            near = [j for _, j, _ in kd.find_n(Vector(co[i]), 6)]
            tot = {}
            for j in near:
                for g in me.vertices[j].groups:
                    b = names[g.group]
                    if not b.startswith("arm") and b != "root":
                        tot[b] = tot.get(b, 0.0) + g.weight
            s = sum(tot.values())
            set_weights(src, [i], {b: w / s for b, w in tot.items()} if s > 0 else torso_blend(co[i][2], J))
    for r in cfg.get("rigid", []):
        lo, hi = r["box"]
        idx = [i for i in range(len(co)) if all(lo[k] <= co[i][k] <= hi[k] for k in range(3))]
        if idx:
            set_weights(src, idx, {r["bone"]: 1.0})


def bake_dye(name, obj, px, size, hue, sat=0.3):
    """Single material `dye_<name>`: texels of the team hue are greyed and get alpha 0.75, the game dyes them per texel."""
    h, w = px.shape[:2]
    rgb = px[:, :, :3]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    d = np.maximum(mx - mn, 1e-5)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    hh = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    out = px.copy()
    out[:, :, 3] = 1.0
    if hue:
        mask = (hh >= hue[0]) & (hh <= hue[1]) & (s > sat) & (mx > 0.1)
        grey = np.clip((0.3 * r + 0.59 * g + 0.11 * b) * 1.9 + 0.12, 0, 1)
        for k in range(3):
            out[:, :, k] = np.where(mask, grey, out[:, :, k])
        out[:, :, 3] = np.where(mask, 0.75, 1.0)
    k = max(1, h // size)
    out = out[: size * k, : size * k].reshape(size, k, size, k, 4).mean(axis=(1, 3))
    tex = bpy.data.images.new(name + "_dye", size, size, alpha=True)
    tex.pixels.foreach_set(out.astype(np.float32).ravel())
    tex.file_format = "PNG"
    path = os.path.join(tempfile.gettempdir(), name + "_dye.png")
    tex.filepath_raw = path
    tex.save()
    tex = bpy.data.images.load(path, check_existing=False)
    tex.pack()
    m = bpy.data.materials.new("dye_" + name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bs.inputs["Roughness"].default_value = 1.0
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = tex
    nt.links.new(t.outputs["Color"], bs.inputs["Base Color"])
    nt.links.new(bs.outputs[0], o.inputs["Surface"])
    me = obj.data
    me.materials.clear()
    me.materials.append(m)
    for layer in list(me.color_attributes):
        me.color_attributes.remove(layer)
    col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    col.data.foreach_set("color", [1.0] * (len(col.data) * 4))
    me.color_attributes.active_color = col
    for p in me.polygons:
        p.use_smooth = True


def import_dye_prop(name, path, size, hue):
    bpy.ops.import_scene.gltf(filepath=path)
    w = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    for o in list(bpy.context.selected_objects):
        if o is not w:
            bpy.data.objects.remove(o, do_unlink=True)
    w.parent = None
    w.data.transform(w.matrix_world)
    w.matrix_world = Matrix.Identity(4)
    img, px = th.tex_lookup(w)
    bake_dye(name, w, px, size, hue)
    return w


def attach_prop(name, arm, pc, dye=False):
    path = os.path.join(ROOT, "assets", "source", pc["src"])
    if dye:
        w = import_dye_prop(f"{name}_{pc['name']}", path, pc["tex"], pc.get("team_hue"))
    else:
        w = th.import_prop(f"{name}_{pc['name']}", path, tex=pc["tex"], team_hue=pc.get("team_hue"))
    decimate(w, pc.get("decimate", 1.0))
    if pc.get("string"):
        a, b, r = pc["string"]
        uv = w.data.uv_layers.active.data
        p = min(w.data.polygons, key=lambda p: (p.center - Vector(a)).length)
        pick = (sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total, sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total)
        th.bridge(w, a, b, r, None, pick)
    for ax, deg in pc.get("pre", ()):
        w.data.transform(Matrix.Rotation(math.radians(deg), 4, ax))
    w.data.transform(Matrix.Rotation(math.radians(pc.get("rot", 0)), 4, "Z"))
    th.place_on_bone(w, arm, pc["bone"], pc["grip"], pc["axis"], pc["length"], pc["at"], pc["side"])
    w.name = f"{name}_{pc['name']}"
    w.data.name = w.name
    for p in w.data.polygons:
        p.use_smooth = True
    return w


def preview(objs, arm, path, clip, frames, angles=(0, 60)):
    for t in arm.animation_data.nla_tracks:
        t.mute = t.name != clip
    for f in frames:
        bpy.context.scene.frame_set(f)
        th.render(objs[0], arm, f"{path}_{clip}_{f}", extra=objs[1:], angles=angles)
    for t in arm.animation_data.nla_tracks:
        t.mute = False


def build(name, prev=None):
    cfg = UNITS[name]
    th.clear_scene()
    src = th.import_source(name, cfg)
    decimate(src, cfg.get("decimate", 1.0))
    img, px = th.tex_lookup(src)
    cols = th.face_colors(src, px)
    bones = fit_depth(src, unit_bones(cfg["joints"]))
    arm = th.make_armature(name, bones)
    if prev:
        th.render(src, arm, os.path.join(prev, f"{name}_bones"), markers=bones)
    empty = th.auto_weights(src, arm)
    for o in list(bpy.context.scene.objects):
        if o.type == "MESH" and o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    src.parent = None
    th.fill_unweighted(src, arm)
    fix_weights(src, arm, cfg)
    src.parent = arm
    m = src.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    if cfg.get("dye"):
        bake_dye(name, src, px, cfg["tex"], cfg.get("team_hue"))
    else:
        th.bake_material(name, src, cfg, img, px, cols)
    objs = [src] + [attach_prop(name, arm, pc, cfg.get("dye", False)) for pc in cfg.get("props", [])]
    clips = anims.unit_clips(cfg.get("weight", 1.0))
    if cfg.get("clips"):
        clips = globals()[cfg["clips"]](clips)
    charkit.animate(arm, clips)
    if prev and os.environ.get("CLIP"):
        for c in os.environ["CLIP"].split(","):
            preview(objs, arm, os.path.join(prev, name), c, [int(x) for x in os.environ.get("FRAMES", "0,4,6").split(",")])
        return {}
    if prev:
        for t in arm.animation_data.nla_tracks:
            t.mute = True
        bpy.context.scene.frame_set(0)
        th.render(src, arm, os.path.join(prev, f"{name}_rest"), extra=objs[1:])
        for t in arm.animation_data.nla_tracks:
            t.mute = False
    size = charkit.export(objs + [arm], os.path.join(ROOT, "assets", "units", name + ".glb"))
    tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
    return {"tris": tris, "bytes": size, "empty_groups": empty}


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    who = argv[0] if argv else "ogre"
    out = argv[1] if len(argv) > 1 else None
    if out:
        os.makedirs(out, exist_ok=True)
    print("RESULT", build(who, out))
