"""Split Professor Hoot's one-call Tripo props mesh (square, snow fort block, ice lookout in a row along Y) into
three source meshes by the empty gaps between them: assets/source/{architect_square,snowfort,lookout}_tripo.glb.
Run: blender -b --python tools/blender/tripo_heroes/_architect_split.py -- <props_tripo.glb>"""
import os
import sys

import bpy
import numpy as np

ROOT = os.environ.get("GRUDGE_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))
src_path = sys.argv[sys.argv.index("--") + 1]
NAMES = ["architect_square", "snowfort", "lookout"]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src_path)
src = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
ys = np.array([(src.matrix_world @ v.co).y for v in src.data.vertices])
hist, edges = np.histogram(ys, 300)
gap_runs = []
i = 0
while i < len(hist):
    if hist[i] == 0:
        j = i
        while j < len(hist) and hist[j] == 0:
            j += 1
        gap_runs.append((j - i, (edges[i] + edges[j]) / 2))
        i = j
    else:
        i += 1
cuts = sorted(c for _, c in sorted(gap_runs, reverse=True)[:2])
print("CUTS", cuts, sorted(gap_runs, reverse=True)[:4])
# Islands (welded by position): past the wide gap is the tower; of the rest, the square lies flat at the far -X
# side (its grip arm reaches almost to the fort along Y, so a Y cut alone splits it wrong).
SQUARE_X = -0.28
par = list(range(len(src.data.vertices)))


def find(x):
    while par[x] != x:
        par[x] = par[par[x]]
        x = par[x]
    return x


for e in src.data.edges:
    par[find(e.vertices[0])] = find(e.vertices[1])
at = {}
for v in src.data.vertices:
    k = tuple(round(c, 4) for c in v.co)
    if k in at:
        par[find(v.index)] = find(at[k])
    else:
        at[k] = v.index
co_all = np.array([(src.matrix_world @ v.co)[:] for v in src.data.vertices])
roots = np.array([find(i) for i in range(len(par))])
group = {}
for r in set(roots.tolist()):
    c = co_all[roots == r]
    cy = c[:, 1].mean()
    group[r] = 2 if cy > cuts[1] else (0 if c[:, 0].max() < SQUARE_X else 1)
order = [[], [], []]
for p in src.data.polygons:
    order[group[roots[p.vertices[0]]]].append(p.index)
order = [(0, o) for o in order]
pieces = []
for _, sel in order:
    bpy.ops.object.select_all(action="DESELECT")
    dup = src.copy()
    dup.data = src.data.copy()
    bpy.context.scene.collection.objects.link(dup)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(dup.data)
    keep = set(sel)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(dup.data)
    bm.free()
    co = np.array([(dup.matrix_world @ v.co)[:] for v in dup.data.vertices])
    dims = co.max(0) - co.min(0)
    pieces.append((dup, dims))
    print("PIECE", len(sel), dims)
# The row runs along +Y from the image's left: square, fort, tower.
sq, fort, tower = pieces
bpy.data.objects.remove(src, do_unlink=True)
for (obj, _), name in zip((sq, fort, tower), NAMES):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    out = os.path.join(ROOT, "assets", "source", f"{name}_tripo.glb")
    bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format="GLB")
    print("WROTE", out)
