"""Turn an AI-generated (Tripo) unit mesh into a Grudge unit on the 8-bone unit rig from build_units.py.

Run headless: blender -b --python tools/blender/build_tripo_unit.py -- <unit> [preview_dir]
The source mesh lives in assets/source/<unit>_tripo.glb, props in assets/source/<unit>_<prop>_tripo.glb.
Reuses the hero pipeline (build_tripo_hero.py) for import, weights and texture baking.
CLIP=attack FRAMES=0,4,6 (with a preview dir) renders posed frames instead of exporting.
"""
import math
import os
import sys

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
}


def ogre_clips(clips):
    clips["death"]["bones"]["arm_R"] = [(0, (0, 0, 0)), (6, (-35, 0, 25)), (18, (-15, 80, 40))]
    clips["death"]["bones"]["arm_L"] = [(0, (0, 0, 0)), (6, (-35, 0, -25)), (18, (-15, 0, -40))]
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
        if z < 0.45:
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


def attach_prop(name, arm, pc):
    w = th.import_prop(f"{name}_{pc['name']}", os.path.join(ROOT, "assets", "source", pc["src"]), tex=pc["tex"])
    decimate(w, pc.get("decimate", 1.0))
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
    th.bake_material(name, src, cfg, img, px, cols)
    objs = [src] + [attach_prop(name, arm, pc) for pc in cfg.get("props", [])]
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
