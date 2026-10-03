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

HEROES = {}
HERO_DIR = os.path.join(ROOT, "tools", "blender", "tripo_heroes")


def load_configs():
    """Each tools/blender/tripo_heroes/<hero>.py defines CFG plus any functions CFG names (extras, clips, attach)."""
    import build_tripo_hero as th_mod
    for f in sorted(os.listdir(HERO_DIR)):
        if not f.endswith(".py") or f.startswith("_"):
            continue
        ns = {"__name__": "tripo_" + f[:-3], "th": th_mod, "bpy": bpy, "math": math, "np": np, "Vector": Vector, "Matrix": Matrix, "os": os, "ROOT": ROOT}
        exec(open(os.path.join(HERO_DIR, f)).read(), ns)
        cfg = dict(ns["CFG"])
        cfg["ns"] = ns
        HEROES[f[:-3]] = cfg


def fn(cfg, name):
    return cfg["ns"].get(name) or globals()[name]


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_source(name, cfg):
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "source", cfg.get("src", f"{name}_tripo.glb")))
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


def mesh_islands(me):
    par = list(range(len(me.vertices)))

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x
    for e in me.edges:
        par[find(e.vertices[0])] = find(e.vertices[1])
    at = {}
    for v in me.vertices:
        k = tuple(round(c, 4) for c in v.co)
        if k in at:
            par[find(v.index)] = find(at[k])
        else:
            at[k] = v.index
    out = {}
    for v in me.vertices:
        out.setdefault(find(v.index), []).append(v.index)
    return list(out.values())


def rigid_parts(src, cfg, cols):
    me = src.data
    isl = None
    for r in cfg.get("rigid", []):
        (x0, y0, z0), (x1, y1, z1) = r["box"]
        if r.get("whole"):
            isl = isl or mesh_islands(me)
            inb = lambda c: x0 <= c.x <= x1 and y0 <= c.y <= y1 and z0 <= c.z <= z1
            idx = [i for part in isl if all(inb(me.vertices[i].co) for i in part) for i in part]
            for g in src.vertex_groups:
                g.remove(idx)
            src.vertex_groups[r["bone"]].add(idx, 1.0, "REPLACE")
            continue
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


def vivid(rgb, v):
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    d = np.maximum(mx - mn, 1e-5)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    hue = (np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60) % 360
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    lo, hi = v["hue"]
    inside = (hue >= lo) & (hue <= hi) & (sat > v.get("min_sat", 0.08))
    tgt = v.get("to", (lo + hi) / 2)
    hue = np.where(inside, hue + (tgt - hue) * v.get("pull", 0.5), hue)
    sat = np.where(inside, np.clip(sat * v.get("sat", 1.5), 0, 1), sat)
    val = np.where(inside, np.clip(mx * v.get("val", 1.1), 0, 1), mx)
    h6 = hue / 60.0
    i = np.floor(h6).astype(int) % 6
    f = h6 - np.floor(h6)
    p = val * (1 - sat)
    q = val * (1 - sat * f)
    t = val * (1 - sat * (1 - f))
    out = np.zeros_like(rgb)
    for k, (a, bb, c) in enumerate(((val, t, p), (q, val, p), (p, val, t), (p, q, val), (t, p, val), (val, p, q))):
        m = i == k
        out[:, :, 0] = np.where(m, a, out[:, :, 0])
        out[:, :, 1] = np.where(m, bb, out[:, :, 1])
        out[:, :, 2] = np.where(m, c, out[:, :, 2])
    return out


def bake_material(name, src, cfg, img, px, cols):
    size = cfg["tex"]
    team_hue = cfg.get("team_hue")
    flags = team_faces(src, cfg, cols)
    h, w = px.shape[:2]
    out = px.copy()
    if cfg.get("warm"):
        tint = np.array(cfg["warm"]["tint"], dtype=np.float32)
        rgb = out[:, :, :3]
        mx = rgb.max(axis=2)
        mn = rgb.min(axis=2)
        sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
        lum = 0.3 * rgb[:, :, 0] + 0.59 * rgb[:, :, 1] + 0.11 * rgb[:, :, 2]
        wgt = np.clip((cfg["warm"].get("below", 0.3) - sat) / cfg["warm"].get("below", 0.3), 0, 1) * cfg["warm"]["amount"]
        for k in range(3):
            out[:, :, k] = np.clip(rgb[:, :, k] * (1 - wgt) + lum * tint[k] * wgt, 0, 1)
    if cfg.get("vivid"):
        out[:, :, :3] = vivid(out[:, :, :3], cfg["vivid"])
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


def bridge(obj, a, b, r, px, uv_pick):
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-3:
        side = d.cross(Vector((0, 1, 0)))
    side.normalize()
    up = side.cross(d)
    segs = 10
    rings = []
    for e in (a, b):
        rings.append([bm.verts.new(e + (side * np.cos(k / segs * 2 * np.pi) + up * np.sin(k / segs * 2 * np.pi)) * r) for k in range(segs)])
    faces = []
    for k in range(segs):
        faces.append(bm.faces.new((rings[0][k], rings[0][(k + 1) % segs], rings[1][(k + 1) % segs], rings[1][k])))
    faces.append(bm.faces.new(list(reversed(rings[0]))))
    faces.append(bm.faces.new(rings[1]))
    for f in faces:
        f.smooth = True
        for i, l in enumerate(f.loops):
            l[uvl].uv = (uv_pick[0] + 0.002 * (i % 2), uv_pick[1] + 0.002 * (i // 2 % 2))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()


def load_wrench(name, src_path, tex=512):
    bpy.ops.import_scene.gltf(filepath=src_path)
    w = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    for o in list(bpy.context.selected_objects):
        if o is not w:
            bpy.data.objects.remove(o, do_unlink=True)
    w.parent = None
    w.data.transform(w.matrix_world)
    w.matrix_world = Matrix.Identity(4)
    img, px = tex_lookup(w)
    cols = face_colors(w, px)
    uv = w.data.uv_layers.active.data
    pick = None
    for p, c in zip(w.data.polygons, cols):
        if p.center.x > 0.44 and hue_in(c, (30, 60), 0.35):
            pick = (sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total, sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total)
            break
    bridge(w, (-0.06, 0.055, 0.01), (0.17, 0.058, 0.01), 0.036, px, pick)
    bake_material(name, w, {"tex": tex}, img, px, face_colors(w, px))
    return w


WRENCH_LEN = 1.25


def import_prop(name, src_path, tex=512, team_hue=None):
    """Import a Tripo prop mesh in its own coordinates with a baked material, ready for place_on_bone."""
    bpy.ops.import_scene.gltf(filepath=src_path)
    w = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    for o in list(bpy.context.selected_objects):
        if o is not w:
            bpy.data.objects.remove(o, do_unlink=True)
    w.parent = None
    w.data.transform(w.matrix_world)
    w.matrix_world = Matrix.Identity(4)
    img, px = tex_lookup(w)
    bake_material(name, w, {"tex": tex, "team_hue": team_hue}, img, px, face_colors(w, px))
    return w


def place_on_bone(w, arm, bone, grip, axis, length, at=0.55, side=(1, 0, 0)):
    """Rigidly bind prop w to bone. grip: point on the prop (source coords) held at `at` along the bone.
    The prop's long axis is source -X (from grip end to business end) and is pointed along `axis` (armature space);
    source -Y goes toward `side`. length: scale factor applied to the source (Tripo props are ~1 unit long)."""
    hb = arm.data.bones[bone]
    g = hb.head_local + (hb.tail_local - hb.head_local) * at
    d = Vector(axis).normalized()
    sx = Vector(side)
    sx = (sx - d * sx.dot(d)).normalized()
    R = Matrix((-d, -sx, (-d).cross(-sx))).transposed().to_4x4()
    w.data.transform(Matrix.Translation(g) @ R @ Matrix.Scale(length, 4) @ Matrix.Translation(-Vector(grip)))
    vg = w.vertex_groups.new(name=bone)
    vg.add(list(range(len(w.data.vertices))), 1.0, "REPLACE")
    w.parent = arm
    m = w.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    return w


def attach_wrench(name, arm, src_path):
    w = load_wrench(name + "_wrench", src_path)
    hb = arm.data.bones["hand_R"]
    g = hb.head_local + (hb.tail_local - hb.head_local) * 0.55
    d = Vector((0.0, -0.8, 0.6)).normalized()
    sx = Vector((1, 0, 0))
    sx = (sx - d * sx.dot(d)).normalized()
    R = Matrix((-d, -sx, (-d).cross(-sx))).transposed().to_4x4()
    sc = WRENCH_LEN
    grip = Vector((0.32, 0.06, 0.01))
    w.data.transform(Matrix.Translation(g) @ R @ Matrix.Scale(sc, 4) @ Matrix.Translation(-grip))
    w.name = name + "_wrench"
    vg = w.vertex_groups.new(name="hand_R")
    vg.add(list(range(len(w.data.vertices))), 1.0, "REPLACE")
    w.parent = arm
    m = w.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    return w


def preview_clip(src, arm, path, clip, frames, extra=(), angles=(0, 45, 90)):
    act = bpy.data.actions.get(clip + "_" + arm.name)
    for t in arm.animation_data.nla_tracks:
        t.mute = True
    arm.animation_data.action = act
    files = []
    for f in frames:
        bpy.context.scene.frame_set(f)
        files += render(src, arm, f"{path}_{clip}_{f}", extra=extra, angles=angles)
    arm.animation_data.action = None
    for t in arm.animation_data.nla_tracks:
        t.mute = False
    return files


def build(key, preview=None):
    cfg = HEROES[key]
    name = cfg.get("name", key)
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
        gear = fn(cfg, cfg["extras"])(name, arm, images)
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
    for f, srcf in cfg.get("attach", []):
        objs.append(fn(cfg, f)(name, arm, os.path.join(ROOT, "assets", "source", srcf)))
    clips = anims.hero_clips(cfg.get("weight", 1.0))
    if cfg.get("clips"):
        clips = fn(cfg, cfg["clips"])(clips)
    charkit.animate(arm, clips)
    if preview and os.environ.get("CLIP"):
        for c in os.environ["CLIP"].split(","):
            preview_clip(src, arm, os.path.join(preview, name), c, [int(x) for x in os.environ.get("FRAMES", "0,3,5,7").split(",")], extra=objs[2:])
        return {}
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
    size = charkit.export(objs, os.path.join(ROOT, "assets", "heroes", cfg.get("out", name) + ".glb"))
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
        el = math.radians(float(os.environ.get("ELEV", "0")))
        d = Vector((math.sin(r) * math.cos(el), -math.cos(r) * math.cos(el), math.sin(el)))
        cam.location = Vector((0, 0, 0.98)) + d * 5
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = f"{path}_{k}.png"
        bpy.ops.render.render(write_still=True)
        files.append(sc.render.filepath)
    for o in tmp:
        bpy.data.objects.remove(o, do_unlink=True)
    return files


if __name__ == "__main__":
    load_configs()
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    who = argv[0] if argv else "marksman"
    prev = argv[1] if len(argv) > 1 else None
    if prev:
        os.makedirs(prev, exist_ok=True)
    print("RESULT", build(who, prev))
