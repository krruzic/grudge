"""Split the four-prop Tripo mesh of BROTHER CELADON into separate sources, each rebaked onto its own texture.

blender -b --python tools/costume/friar_celadon_split.py
"""
import os
import sys

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

ROOT = os.environ.get("GRUDGE_ROOT", "/home/krruzic/Projects/grudge")
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import build_tripo_props as tp  # noqa: E402

SRC = os.path.join(ROOT, "assets", "source", "friar_celadon_props_tripo.glb")
def surface_bake(dst, src, T=512, remap=None):
    """Bake src's painted texture onto dst (fresh smart-project UVs): each texel casts a ray inward along dst's normal
    from just outside, so it picks the visible outer surface of src, falling back to the nearest point."""
    from mathutils.bvhtree import BVHTree
    from mathutils.interpolate import poly_3d_calc
    me = src.data
    img, px = tp.th.tex_lookup(src)
    H, W = px.shape[:2]
    uvd = me.uv_layers.active.data
    verts = [v.co.copy() for v in me.vertices]
    polys = [list(p.vertices) for p in me.polygons]
    loops = [list(p.loop_indices) for p in me.polygons]
    luv = np.array([uvd[i].uv[:] for i in range(len(uvd))])
    bvh = BVHTree.FromPolygons(verts, polys)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = dst
    dst.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")
    nm = dst.data
    span = max(dst.dimensions)
    out = np.zeros((T, T, 3), np.float32)
    got = np.zeros((T, T), bool)
    nuv = nm.uv_layers.active.data
    nm.calc_loop_triangles()
    for lt in nm.loop_triangles:
        P = [nm.vertices[v].co for v in lt.vertices]
        N = [nm.vertices[v].normal for v in lt.vertices]
        U = np.array([nuv[i].uv[:] for i in lt.loops]) * T
        x0, x1 = int(max(0, U[:, 0].min() - 1)), int(min(T - 1, U[:, 0].max() + 1))
        y0, y1 = int(max(0, U[:, 1].min() - 1)), int(min(T - 1, U[:, 1].max() + 1))
        a, b, c = U
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-9:
            continue
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                gx, gy = x + 0.5, y + 0.5
                l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
                l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
                l3 = 1 - l1 - l2
                if min(l1, l2, l3) < -0.03:
                    continue
                q = P[0] * l1 + P[1] * l2 + P[2] * l3
                n = (N[0] * l1 + N[1] * l2 + N[2] * l3).normalized()
                if remap:
                    q, n = remap(q, n)
                loc, nrm, idx, dist = bvh.ray_cast(q + n * span * 0.08, -n, span * 0.4)
                if loc is None:
                    loc, nrm, idx, dist = bvh.find_nearest(q)
                if loc is None:
                    continue
                ws = poly_3d_calc([verts[v] for v in polys[idx]], loc)
                uv = sum(w * luv[li] for w, li in zip(ws, loops[idx]))
                out[y, x] = px[min(H - 1, int((uv[1] % 1.0) * H)), min(W - 1, int((uv[0] % 1.0) * W)), :3]
                got[y, x] = True
    for _ in range(8):
        acc = np.zeros_like(out)
        n = np.zeros((T, T))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(out * got[..., None], dy, 0), dx, 1)
            n += np.roll(np.roll(got, dy, 0), dx, 1)
        fill = (~got) & (n > 0)
        out[fill] = acc[fill] / n[fill][:, None]
        got |= fill
    tex = bpy.data.images.new(dst.name + "_rebake", T, T, alpha=False)
    tex.pixels.foreach_set(np.concatenate([out, np.ones((T, T, 1), np.float32)], -1).ravel())
    nm.materials.clear()
    for m in me.materials:
        nm.materials.append(m)
    m = me.materials[0].copy()
    bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].links[0].from_node.image = tex
    nm.materials.clear()
    nm.materials.append(m)


def urn_rebuild(src):
    """Lathe the urn body from its median profile (Tripo grew a lump on its back), keeping the stand and the spout."""
    me = src.data
    co = np.array([v.co[:] for v in me.vertices])
    z0, z1 = co[:, 2].min(), co[:, 2].max()
    zn = (co[:, 2] - z0) / (z1 - z0)
    body = (zn > STAND) & (zn < 0.995)
    c = np.array([(co[body, 0].min() + co[body, 0].max()) / 2, (co[body, 1].min() + co[body, 1].max()) / 2])
    r = np.hypot(co[:, 0] - c[0], co[:, 1] - c[1])
    ang = np.degrees(np.arctan2(co[:, 1] - c[1], co[:, 0] - c[0]))
    spout_sec = (ang > SPOUT[0]) & (ang < SPOUT[1])
    lump_sec = (ang > LUMP[0]) & (ang < LUMP[1])
    rings = 36
    zs = np.linspace(STAND, 1.0, rings)
    prof = []
    for t in zs:
        m = (np.abs(zn - t) < 0.02) & ~spout_sec & ~lump_sec
        bins = [r[m & (ang >= a0) & (ang < a0 + 20)].max() for a0 in range(-180, 180, 20) if (m & (ang >= a0) & (ang < a0 + 20)).any()]
        prof.append(float(np.median(bins)) if bins else 0.0)
    prof = np.array(prof)
    for _ in range(3):
        prof[1:-2] = prof[:-3] * 0.25 + prof[1:-2] * 0.5 + prof[2:-1] * 0.25
    prof[-1] = 0.0
    segs = 32
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    cols = []
    for t, rr in zip(zs, prof):
        z = z0 + t * (z1 - z0)
        cols.append([bm.verts.new((c[0] + math.cos(k / segs * 2 * math.pi) * rr, c[1] + math.sin(k / segs * 2 * math.pi) * rr, z)) for k in range(segs)])
    for A, B in zip(cols, cols[1:]):
        for k in range(segs):
            bm.faces.new((A[k], A[(k + 1) % segs], B[(k + 1) % segs], B[k]))
    bm.faces.new(list(reversed(cols[0])))
    for f in bm.faces:
        f.smooth = True
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    lme = bpy.data.meshes.new("urn_lathe")
    bm.to_mesh(lme)
    bm.free()
    lathe = bpy.data.objects.new("urn_lathe", lme)
    bpy.context.scene.collection.objects.link(lathe)
    pr = np.interp(zn, zs, prof)
    keep = (zn < STAND + 0.02) | (spout_sec & (r > pr * 1.05) & (zn < 0.6))
    ex = src.copy()
    ex.data = me.copy()
    bpy.context.scene.collection.objects.link(ex)
    bm = bmesh.new()
    bm.from_mesh(ex.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.verts.ensure_lookup_table()
    kill = [f for f in bm.faces if not all(keep_at(v.co, c, z0, z1, prof, zs) for v in f.verts)]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(ex.data)
    bm.free()
    n = len(ex.data.polygons)
    if n > 1400:
        dec = ex.modifiers.new("dec", "DECIMATE")
        dec.ratio = 1400 / n
        bpy.context.view_layer.objects.active = ex
        bpy.ops.object.modifier_apply(modifier=dec.name)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ex.select_set(True)
    lathe.select_set(True)
    bpy.context.view_layer.objects.active = lathe
    bpy.ops.object.join()

    def remap(q, nrm):
        a = math.degrees(math.atan2(q[1] - c[1], q[0] - c[0]))
        if LUMP[0] - 15 < a < LUMP[1] + 15 and q[2] > z0 + STAND * (z1 - z0):
            th = math.radians(LUMP_TURN)
            cs, sn = math.cos(th), math.sin(th)
            dx, dy = q[0] - c[0], q[1] - c[1]
            q = Vector((c[0] + cs * dx - sn * dy, c[1] + sn * dx + cs * dy, q[2]))
            nrm = Vector((cs * nrm[0] - sn * nrm[1], sn * nrm[0] + cs * nrm[1], nrm[2]))
        return q, nrm
    return lathe, remap


def keep_at(p, c, z0, z1, prof, zs):
    zn = (p.z - z0) / (z1 - z0)
    if zn < STAND + 0.02:
        return True
    r = math.hypot(p.x - c[0], p.y - c[1])
    a = math.degrees(math.atan2(p.y - c[1], p.x - c[0]))
    return SPOUT[0] < a < SPOUT[1] and zn < 0.6 and r > float(np.interp(zn, zs, prof)) * 1.05


STAND = 0.2
SPOUT = (-15, 75)
LUMP = (100, 200)
LUMP_TURN = 150


PARTS = {
    "friar_celadon_teapot": (-1, 1, 1024, 1500),
    "keg_celadon": (1, 1, 512, 900),
    "powderkeg_celadon": (-1, -1, 512, 1200),
    "bigkeg_celadon": (1, -1, 1024, 2000),
}


def load():
    tp.th.clear_scene()
    bpy.ops.import_scene.gltf(filepath=SRC)
    src = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
    for o in list(bpy.context.scene.objects):
        if o is not src:
            bpy.data.objects.remove(o, do_unlink=True)
    src.parent = None
    src.data.transform(src.matrix_world)
    src.matrix_world.identity()
    return src


def keep_part(src, sy, sz):
    bm = bmesh.new()
    bm.from_mesh(src.data)
    kill = [f for f in bm.faces if not (f.calc_center_median().y * sy > 0 and f.calc_center_median().z * sz > 0)]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(src.data)
    bm.free()
    isl = tp.th.mesh_islands(src.data)
    big = max(len(i) for i in isl)
    drop = {i for part in isl if len(part) < big * 0.02 for i in part}
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in drop], context="VERTS")
    bm.to_mesh(src.data)
    bm.free()
    print("PART", sy, sz, len(src.data.polygons), "dropped", len(drop))


def finish(name, dst, src):
    bpy.data.objects.remove(src, do_unlink=True)
    dst.name = name
    img = next(n for n in dst.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.outputs["Color"].links and n.outputs["Color"].links[0].to_socket.name == "Base Color").image
    path = os.path.join("/tmp/opencode/skin_celadon", name + "_bake.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    m = dst.data.materials[0]
    for n in list(m.node_tree.nodes):
        if n.type == "TEX_IMAGE" and n.image is not img:
            m.node_tree.nodes.remove(n)
    tp.export([dst], os.path.join(ROOT, "assets", "source", name + "_tripo.glb"))


ONLY = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(PARTS)
for name, (sy, sz, T, tris) in PARTS.items():
    if name not in ONLY:
        continue
    src = load()
    keep_part(src, sy, sz)
    remap = None
    if name == "bigkeg_celadon":
        dst, remap = urn_rebuild(src)
        surface_bake(dst, src, T, remap)
        finish(name, dst, src)
        continue
    dst = src.copy()
    dst.data = src.data.copy()
    bpy.context.scene.collection.objects.link(dst)
    bm = bmesh.new()
    bm.from_mesh(dst.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(dst.data)
    bm.free()
    dec = dst.modifiers.new("dec", "DECIMATE")
    dec.ratio = tris / len(dst.data.polygons)
    bpy.context.view_layer.objects.active = dst
    bpy.ops.object.modifier_apply(modifier=dec.name)
    surface_bake(dst, src, T)
    finish(name, dst, src)
