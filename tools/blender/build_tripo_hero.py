"""Turn an AI-generated (Tripo) hero mesh into a Grudge hero: the shared humanoid rig, clips and team dye.

Run headless: blender -b --python tools/blender/build_tripo_hero.py -- <hero> [preview_dir]
The source mesh lives in assets/source/<hero>_tripo.glb. Joint landmarks are in the A-pose of the source,
the arms are then swung down so the clips from anims.py play the same as on the procedural heroes.
"""
import colorsys
import importlib
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import anims  # noqa: E402
import charkit  # noqa: E402
import texgen  # noqa: E402

importlib.reload(anims)
importlib.reload(charkit)

HEROES = {
    "marksman": {
        "yaw": -90,
        "height": 1.9,
        "weight": 0.85,
        "tex": 1024,
        "joints": {
            "hip": 0.95,
            "chest": 1.2,
            "neck": 1.42,
            "head_top": 1.85,
            "head_y": -0.03,
            "shoulder": (0.2, 1.28),
            "elbow": (0.42, 1.09),
            "wrist": (0.545, 0.97),
            "finger": (0.64, 0.815),
            "leg_x": 0.165,
            "knee": 0.43,
            "ankle": 0.12,
        },
        "rigid": [
            {"bone": "chest", "box": ((0.13, -0.2, 1.42), (0.42, 0.25, 1.95)), "hue": (330, 20), "sat": 0.4},
            {"bone": "chest", "box": ((0.23, -0.2, 1.45), (0.45, 0.25, 1.95))},
            {"bone": "chest", "box": ((-0.6, -0.05, 1.35), (-0.21, 0.5, 2.0))},
        ],
        "team_hue": (195, 250),
        "extras": "marksman_extras",
    },
    "engineer": {
        "yaw": -90,
        "height": 1.68,
        "weight": 1.0,
        "tex": 1024,
        "joints": {
            "hip": 0.7,
            "chest": 1.0,
            "neck": 1.33,
            "head_top": 1.68,
            "head_y": -0.03,
            "shoulder": (0.25, 1.21),
            "elbow": (0.39, 1.04),
            "wrist": (0.45, 0.84),
            "finger": (0.52, 0.57),
            "leg_x": 0.23,
            "knee": 0.34,
            "ankle": 0.1,
        },
        "rigid": [{"bone": "chest", "box": ((-0.36, 0.2, 0.75), (0.36, 0.7, 1.8))}],
        "team_hue": (195, 250),
        "team_box": ((-0.6, -0.6, 0.9), (0.6, 0.6, 1.42)),
        "extras": "engineer_extras",
    },
}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_source(name, cfg):
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", f"{name}_tripo.glb"))
    src = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
    for o in list(bpy.context.scene.objects):
        if o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    src.parent = None
    me = src.data
    me.transform(src.matrix_world)
    src.matrix_world = Matrix.Identity(4)
    me.transform(Matrix.Rotation(math.radians(cfg["yaw"]), 4, "Z"))
    zs = [v.co.z for v in me.vertices]
    s = cfg["height"] / (max(zs) - min(zs))
    me.transform(Matrix.Scale(s, 4))
    z0 = min(v.co.z for v in me.vertices)
    me.transform(Matrix.Translation((0, 0, -z0)))
    src.name = name
    me.name = name
    return src


def a_pose_bones(J):
    hip, chest, neck, top, hy = J["hip"], J["chest"], J["neck"], J["head_top"], J["head_y"]
    b = {
        "root": ((0, 0, 0), (0, 0, 0.3), None),
        "hips": ((0, 0, hip), (0, 0, hip + (chest - hip) * 0.4), "root"),
        "spine": ((0, 0, hip + (chest - hip) * 0.4), (0, 0, chest), "hips"),
        "chest": ((0, 0, chest), (0, 0, neck), "spine"),
        "head": ((0, hy, neck + 0.04), (0, hy, top), "chest"),
    }
    for side, sx in (("R", -1), ("L", 1)):
        S = (J["shoulder"][0] * sx, 0, J["shoulder"][1])
        E = (J["elbow"][0] * sx, 0, J["elbow"][1])
        W = (J["wrist"][0] * sx, 0, J["wrist"][1])
        F = (J["finger"][0] * sx, 0, J["finger"][1])
        b[f"arm_{side}"] = (S, E, "chest")
        b[f"forearm_{side}"] = (E, W, f"arm_{side}")
        b[f"hand_{side}"] = (W, F, f"forearm_{side}")
        lx = J["leg_x"] * sx
        b[f"thigh_{side}"] = ((lx, 0, hip), (lx, -0.01, J["knee"]), "hips")
        b[f"shin_{side}"] = ((lx, -0.01, J["knee"]), (lx, 0, J["ankle"]), f"thigh_{side}")
    return b


def make_armature(name, bones):
    data = bpy.data.armatures.new(name + "_rig")
    arm = bpy.data.objects.new(name + "_rig", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for n, (h, t, p) in bones.items():
        eb = data.edit_bones.new(n)
        eb.head = Vector(h)
        eb.tail = Vector(t)
        eb.roll = 0.0
        if p:
            eb.parent = data.edit_bones[p]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def fit_joint_depth(src, bones):
    co = np.array([v.co[:] for v in src.data.vertices])
    out = {}
    for n, (h, t, p) in bones.items():
        def mid(pt):
            m = (np.abs(co[:, 0] - pt[0]) < 0.04) & (np.abs(co[:, 2] - pt[2]) < 0.04)
            if n.startswith(("hips", "spine", "chest", "root", "head")) or m.sum() < 8:
                return pt[1]
            ys = co[m, 1]
            return float((ys.min() + ys.max()) / 2)
        out[n] = ((h[0], mid(h), h[2]), (t[0], mid(t), t[2]), p)
    for side in ("R", "L"):
        for a, b in ((f"arm_{side}", f"forearm_{side}"), (f"forearm_{side}", f"hand_{side}"), (f"thigh_{side}", f"shin_{side}")):
            h, t, p = out[b]
            out[b] = (out[a][1], t, p)
    return out


def weld_copy(src):
    me = src.data.copy()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(src.name + "_weld", me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def auto_weights(src, arm):
    proxy = weld_copy(src)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    proxy.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    used = {g.group for v in proxy.data.vertices for g in v.groups if g.weight > 0.01}
    empty = [g.name for g in proxy.vertex_groups if g.index not in used]
    for b in arm.data.bones:
        if b.name not in src.vertex_groups:
            src.vertex_groups.new(name=b.name)
    dt = src.modifiers.new("dt", "DATA_TRANSFER")
    dt.object = proxy
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "NEAREST"
    dt.layers_vgroup_select_src = "ALL"
    dt.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.modifier_apply(modifier=dt.name)
    bpy.data.objects.remove(proxy, do_unlink=True)
    return empty


def tex_lookup(src):
    mat = src.data.materials[0]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    img = bsdf.inputs["Base Color"].links[0].from_node.image
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    return img, px


def face_colors(src, px):
    me = src.data
    h, w = px.shape[:2]
    uv = me.uv_layers.active.data
    cols = []
    for p in me.polygons:
        u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total
        v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
        x = min(w - 1, max(0, int((u % 1.0) * w)))
        y = min(h - 1, max(0, int((v % 1.0) * h)))
        cols.append(px[y, x, :3])
    return cols


def hue_in(rgb, rng, sat):
    hh, ss, vv = colorsys.rgb_to_hsv(*[float(c) for c in rgb])
    deg = hh * 360
    lo, hi = rng
    inside = lo <= deg <= hi if lo <= hi else (deg >= lo or deg <= hi)
    return inside and ss >= sat and vv > 0.08


def fill_unweighted(src, arm):
    segs = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones if b.name != "root"]
    names = {g.index: g.name for g in src.vertex_groups}
    for v in src.data.vertices:
        if sum(g.weight for g in v.groups if names[g.group] in arm.data.bones) > 0.01:
            continue
        best, bd = None, 1e9
        for n, h, t in segs:
            d = t - h
            u = max(0.0, min(1.0, (v.co - h).dot(d) / max(d.length_squared, 1e-9)))
            dist = (v.co - (h + d * u)).length
            if dist < bd:
                best, bd = n, dist
        src.vertex_groups[best].add([v.index], 1.0, "REPLACE")


def rigid_parts(src, cfg, cols):
    me = src.data
    for r in cfg.get("rigid", []):
        (x0, y0, z0), (x1, y1, z1) = r["box"]
        seed = set()
        for p, c in zip(me.polygons, cols):
            ctr = p.center
            if x0 <= ctr.x <= x1 and y0 <= ctr.y <= y1 and z0 <= ctr.z <= z1 and ("hue" not in r or hue_in(c, r["hue"], r["sat"])):
                seed.update(p.vertices)
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        keep = set(seed)
        todo = list(seed)
        while todo:
            v = bm.verts[todo.pop()]
            for e in v.link_edges:
                o = e.other_vert(v)
                c = o.co
                if o.index not in keep and x0 <= c.x <= x1 and y0 <= c.y <= y1 and z0 <= c.z <= z1:
                    keep.add(o.index)
                    todo.append(o.index)
        bm.free()
        idx = list(keep)
        for g in src.vertex_groups:
            g.remove(idx)
        src.vertex_groups[r["bone"]].add(idx, 1.0, "REPLACE")


def swing_arms_down(src, arm):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for side, sx in (("R", -1), ("L", 1)):
        for bn, target in ((f"arm_{side}", Vector((0.2 * sx, 0.0, -1))), (f"forearm_{side}", Vector((0.12 * sx, -0.12, -1))), (f"hand_{side}", Vector((0.05 * sx, -0.1, -1)))):
            pb = arm.pose.bones[bn]
            bpy.context.view_layer.update()
            cur = (pb.tail - pb.head).normalized()
            q = cur.rotation_difference(target.normalized())
            M = pb.matrix.copy()
            loc = M.to_translation()
            R = q.to_matrix().to_4x4() @ Matrix.Translation(-loc)
            pb.matrix = Matrix.Translation(loc) @ R @ M
            bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = src
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    src.select_set(True)
    mod = next(m for m in src.modifiers if m.type == "ARMATURE")
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in arm.data.edit_bones:
        eb.roll = 0.0
    bpy.ops.object.mode_set(mode="OBJECT")
    m = src.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    src.parent = arm
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"


def team_faces(src, cfg, cols):
    team_hue = cfg.get("team_hue")
    if not team_hue:
        return []
    (x0, y0, z0), (x1, y1, z1) = cfg.get("team_box", ((-9, -9, -9), (9, 9, 9)))
    return [hue_in(c, team_hue, 0.25) and x0 <= p.center.x <= x1 and y0 <= p.center.y <= y1 and z0 <= p.center.z <= z1 for p, c in zip(src.data.polygons, cols)]


def uv_mask(src, flags, h, w):
    mask = np.zeros((h, w), dtype=bool)
    uv = src.data.uv_layers.active.data
    for p, f in zip(src.data.polygons, flags):
        if not f:
            continue
        pts = np.array([(uv[i].uv.x * w, uv[i].uv.y * h) for i in p.loop_indices])
        for k in range(1, len(pts) - 1):
            a, b, c = pts[0], pts[k], pts[k + 1]
            xa, xb = int(max(0, np.floor(min(a[0], b[0], c[0])) - 1)), int(min(w - 1, np.ceil(max(a[0], b[0], c[0])) + 1))
            ya, yb = int(max(0, np.floor(min(a[1], b[1], c[1])) - 1)), int(min(h - 1, np.ceil(max(a[1], b[1], c[1])) + 1))
            if xb < xa or yb < ya:
                continue
            gx, gy = np.meshgrid(np.arange(xa, xb + 1) + 0.5, np.arange(ya, yb + 1) + 0.5)
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-9:
                continue
            l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / d
            l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
            l3 = 1 - l1 - l2
            e = -0.15
            inside = (l1 >= e) & (l2 >= e) & (l3 >= e)
            mask[ya:yb + 1, xa:xb + 1] |= inside
    return mask


def bake_material(name, src, cfg, img, px, cols):
    size = cfg["tex"]
    team_hue = cfg.get("team_hue")
    flags = team_faces(src, cfg, cols)
    h, w = px.shape[:2]
    out = px.copy()
    if team_hue:
        rgb = out[:, :, :3]
        mx = rgb.max(axis=2)
        mn = rgb.min(axis=2)
        sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
        r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
        hue = np.zeros_like(mx)
        d = np.maximum(mx - mn, 1e-5)
        hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
        mask = (hue >= team_hue[0] - 15) & (hue <= team_hue[1] + 15) & (sat > 0.15) & (mx > 0.05) & uv_mask(src, flags, h, w)
        lum = (0.3 * r + 0.59 * g + 0.11 * b)
        grey = np.clip(lum * 1.9 + 0.12, 0, 1)
        for k in range(3):
            out[:, :, k] = np.where(mask, grey, out[:, :, k])
    tex = bpy.data.images.new(name + "_tex", w, h, alpha=False)
    tex.pixels.foreach_set(out.ravel())
    tex.scale(size, size)
    tex.file_format = "JPEG"
    path = os.path.join("/tmp", name + "_tex.jpg")
    tex.filepath_raw = path
    tex.save()
    tex = bpy.data.images.load(path, check_existing=False)
    tex.pack()

    def mk(mname):
        m = bpy.data.materials.new(mname)
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
        return m

    me = src.data
    me.materials.clear()
    me.materials.append(mk(name + "_skin"))
    if team_hue:
        me.materials.append(mk("team_" + name))
        idx = [1 if f else 0 for f in flags]
        me.polygons.foreach_set("material_index", idx)
    for layer in list(me.color_attributes):
        me.color_attributes.remove(layer)
    col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    col.data.foreach_set("color", [1.0] * (len(col.data) * 4))
    me.color_attributes.active_color = col
    for p in me.polygons:
        p.use_smooth = True


def marksman_extras(name, arm, images):
    B = {b.name: (tuple(b.head_local), tuple(b.tail_local), b.parent.name if b.parent else None) for b in arm.data.bones}
    c = charkit.Char(name + "_gear", images)
    import build_heroes as bh
    WOOD = (0.75, 0.5, 0.3)
    LTH_DK = (0.36, 0.24, 0.16)
    CREAM = (1.15, 1.05, 0.88)
    h0, h1, _ = B["hand_L"]
    g = Vector(h0) + (Vector(h1) - Vector(h0)) * 0.45
    gx, gy, gz = g.x, g.y, g.z
    n = 24
    pts, rad = [], []
    for k in range(n + 1):
        t = k / n * 2 - 1
        bulge = 0.2 * (1 - t * t)
        recurve = 0.07 * max(0.0, abs(t) - 0.78) / 0.22
        pts.append((gx, gy - 0.02 - bulge + recurve * 2.2 + 0.2, gz + 0.16 + 0.86 * t))
        rad.append(0.026 - 0.016 * abs(t) ** 1.3 + (0.008 if abs(t) < 0.1 else 0.0))
    bh.tube(c, pts, rad, "wood", "hand_L", segs=7, shade=WOOD, cap=True)
    for t in (-0.09, -0.03, 0.03, 0.09):
        bh.ring(c, 0.032, 0.006, (gx, gy, gz + 0.16 + 0.86 * t), "leather", "hand_L", segs=8, shade=LTH_DK)
    for sgn in (-1, 1):
        tp = Vector(pts[0 if sgn < 0 else -1])
        c.cone(0.014, 0.0, 0.07, tuple(tp + Vector((0, -0.01, 0.03 * sgn))), "bone", "hand_L", segs=5, rot=(0 if sgn > 0 else math.pi, 0, 0), shade=CREAM)
        bh.ring(c, 0.016, 0.005, tuple(Vector(pts[2 if sgn < 0 else -3])), "gold", "hand_L", segs=8)
    c.limb(tuple(Vector(pts[1])), tuple(Vector(pts[-2])), 0.0035, 0.0035, "plain", "hand_L", segs=4, shade=(1.1, 1.05, 0.95))
    q0, q1 = Vector((-0.19, 0.2, 1.36)), Vector((-0.31, 0.165, 1.63))
    for k in range(5):
        a = k / 5 * math.tau
        off = Vector((math.cos(a) * 0.022, math.sin(a) * 0.022, math.sin(a) * 0.015))
        c.limb(tuple(q0 + off), tuple(q1 + off * 1.3 + Vector((0, 0, 0.01 * (k % 2)))), 0.008, 0.008, "wood", "chest", segs=4, shade=WOOD)
    return c


def engineer_extras(name, arm, images):
    c = charkit.Char(name + "_gear", images)
    import build_heroes as bh
    LTH_D = (0.36, 0.24, 0.16)
    h0, h1, _ = (tuple(arm.data.bones["hand_R"].head_local), tuple(arm.data.bones["hand_R"].tail_local), None)
    g = Vector(h0) + (Vector(h1) - Vector(h0)) * 0.55
    hx, hy, hz = g.x, g.y, g.z
    lo = (hx, hy + 0.02, hz - 0.14)
    hi = (hx + 0.08, hy + 0.22, hz + 0.95)
    c.lathe_ab([(0.045, 0.0), (0.045, 1.0)], lo, hi, "gold", "hand_R", segs=10)
    for k in range(5):
        t = 0.05 + k * 0.05
        p = Vector(lo) + (Vector(hi) - Vector(lo)) * t
        bh.ring(c, 0.05, 0.012, tuple(p), "leather", "hand_R", segs=10, rot=(0.23, 0.08, 0), shade=LTH_D)
    c.ico(0.055, lo, "gold", "hand_R", sub=1)
    c.box((0.3, 0.1, 0.12), (hi[0], hi[1], hi[2] + 0.04), "gold", "hand_R")
    for sx in (-1, 1):
        c.box((0.08, 0.1, 0.23), (hi[0] + 0.11 * sx, hi[1], hi[2] + 0.17), "gold", "hand_R")
        c.box((0.045, 0.105, 0.055), (hi[0] + 0.085 * sx, hi[1], hi[2] + 0.26), "gold", "hand_R")
    c.lathe_ab([(0.036, 0.0), (0.036, 1.0)], (hi[0] - 0.11, hi[1], hi[2] - 0.04), (hi[0] + 0.11, hi[1], hi[2] - 0.04), "iron", "hand_R", segs=10)
    for k in range(5):
        bh.ring(c, 0.038, 0.007, (hi[0] - 0.09 + k * 0.045, hi[1], hi[2] - 0.04), "iron", "hand_R", segs=8, rot=(0, math.pi / 2, 0))
    return c


def build(name, preview=None):
    cfg = HEROES[name]
    clear_scene()
    src = import_source(name, cfg)
    img, px = tex_lookup(src)
    cols = face_colors(src, px)
    bones = fit_joint_depth(src, a_pose_bones(cfg["joints"]))
    arm = make_armature(name, bones)
    if preview:
        render(src, arm, os.path.join(preview, f"{name}_apose"), markers=bones)
    empty = auto_weights(src, arm)
    for o in list(bpy.context.scene.objects):
        if o.type == "MESH" and o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    src.parent = None
    fill_unweighted(src, arm)
    rigid_parts(src, cfg, cols)
    if not any(m.type == "ARMATURE" for m in src.modifiers):
        m = src.modifiers.new("Armature", "ARMATURE")
        m.object = arm
    swing_arms_down(src, arm)
    bake_material(name, src, cfg, img, px, cols)
    objs = [src, arm]
    if cfg.get("extras"):
        images = texgen.build_all(os.path.join(ROOT, "assets", "textures"))
        gear = globals()[cfg["extras"]](name, arm, images)
        coll = bpy.context.scene.collection
        B = {bn.name: (tuple(bn.head_local), tuple(bn.tail_local), bn.parent.name if bn.parent else None) for bn in arm.data.bones}
        gobj, garm = gear.build(B, coll)
        gobj.name = name + "_gear"
        gobj.modifiers.clear()
        bpy.data.objects.remove(garm, do_unlink=True)
        gobj.parent = arm
        m = gobj.modifiers.new("Armature", "ARMATURE")
        m.object = arm
        charkit.bake_ao([gobj], samples=16)
        objs.append(gobj)
    charkit.animate(arm, anims.hero_clips(cfg.get("weight", 1.0)))
    if preview:
        for t in arm.animation_data.nla_tracks:
            t.mute = True
        bpy.context.scene.frame_set(0)
        render(src, arm, os.path.join(preview, f"{name}_rest"), extra=objs[2:])
        for clip, fr in (("idle", 0), ("run", 4), ("attack_a", 6), ("shoot", 6)):
            tr = arm.animation_data.nla_tracks.get(clip)
            if not tr:
                continue
            for t in arm.animation_data.nla_tracks:
                t.mute = t is not tr
            bpy.context.scene.frame_set(fr)
            render(src, arm, os.path.join(preview, f"{name}_{clip}"), extra=objs[2:], angles=(0, 60))
        for t in arm.animation_data.nla_tracks:
            t.mute = False
        bpy.context.scene.frame_set(0)
    size = charkit.export(objs, os.path.join(ROOT, "assets", "heroes", name + ".glb"))
    tris = sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)
    return {"tris": tris, "bytes": size, "empty_groups": empty}


def render(src, arm, path, markers=None, extra=(), angles=(0, 90, 180, 270)):
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_WORKBENCH"
    except TypeError:
        pass
    sc.display.shading.light = "FLAT"
    sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x = 420
    sc.render.resolution_y = 640
    tmp = []
    if markers:
        for n, (h, t, p) in markers.items():
            for q in (h, t):
                bpy.ops.mesh.primitive_uv_sphere_add(radius=0.025, location=q, segments=8, ring_count=6)
                o = bpy.context.active_object
                o.show_in_front = True
                tmp.append(o)
    cam = bpy.data.objects.get("pcam")
    if not cam:
        cd = bpy.data.cameras.new("pcam")
        cd.type = "ORTHO"
        cd.ortho_scale = 2.3
        cam = bpy.data.objects.new("pcam", cd)
        sc.collection.objects.link(cam)
    sc.camera = cam
    if not sc.world:
        sc.world = bpy.data.worlds.new("w")
    files = []
    for k, a in enumerate(angles):
        r = math.radians(a)
        d = Vector((math.sin(r), -math.cos(r), 0))
        cam.location = Vector((0, 0, 0.98)) + d * 5
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = f"{path}_{k}.png"
        bpy.ops.render.render(write_still=True)
        files.append(sc.render.filepath)
    for o in tmp:
        bpy.data.objects.remove(o, do_unlink=True)
    return files


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    who = argv[0] if argv else "marksman"
    prev = argv[1] if len(argv) > 1 else None
    if prev:
        os.makedirs(prev, exist_ok=True)
    print("RESULT", build(who, prev))
