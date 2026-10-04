import json
import math
import random

SEED = "9978ed11198d3fd830818e401e804b8258c963b4936880bea2c829b40df4a3e2"
rng = random.Random(int(SEED[:16], 16))

W = D = 72
C = W / 2
ops = []
props = []
grid = {}


def shape(kind, **kw):
    ops.append({"op": "shape", "shape": kind, **kw})


def cell(op, **kw):
    ops.append({"op": op, **kw})


def prop(t, x, z, **kw):
    props.append({"type": t, "x": x, "z": z, **kw})


def mark(x, z, what):
    if 0 <= x < C and 0 <= z < C:
        grid[(x, z)] = what


def both(x, z, what):
    mark(x, z, what)
    mark(z, x, what)


def rect(x0, z0, w, h, what, mirror=True):
    for z in range(z0, z0 + h):
        for x in range(x0, x0 + w):
            (both if mirror else mark)(x, z, what)


ops.append({"op": "noise", "amp": 0.12, "scale": 0.12, "seed": int(SEED[:6], 16) % 997})
shape("rect", x=-12, z=-12, w=W + 24, h=D + 24, y=1.0, mode="set")
shape("circle", x=C, z=C, r=4.0, y=0.42, edge=0.45, mode="set")
shape("circle", x=C, z=C, r=2.3, y=1.35, edge=0.35, mode="set")

# Keep: 15x15 paved yard; east wall with a side gate (z 4-7) and the open corner mouth onto the avenue (z 12-15).
rect(1, 1, 15, 15, "paving")
for x0, z0, w, h in [(16, 1, 1, 3), (16, 8, 1, 4)]:
    rect(x0, z0, w, h, "castle")

# Gravel: the diagonal avenue from the keep mouth to the court, with a roundabout half way.
for z in range(0, 36):
    for x in range(0, 36):
        if abs(x - z) <= 3 and 12 <= x + 0.5 <= 32 and 12 <= z + 0.5 <= 32:
            mark(x, z, "dirt")
        if math.hypot(x + 0.5 - 22.5, z + 0.5 - 22.5) <= 3.6:
            mark(x, z, "dirt")

rect(17, 3, 19, 5, "dirt")
rect(28, 8, 4, 9, "dirt")
rect(25, 17, 11, 5, "dirt")
rect(17, 8, 2, 5, "dirt")

# Inner court (octagon of paving around the fountain) and its hedge wing.
for z in range(28, 36):
    for x in range(28, 36):
        if x + z >= 60:
            mark(x, z, "paving")
        if math.hypot(x + 0.5 - C, z + 0.5 - C) <= 2.6:
            mark(x, z, "paving")
rect(28, 32, 1, 4, "hedge")

beds = [
    [(x, z) for z in range(8, 17) for x in range(18, 28) if x - z >= 4],
    [(x, z) for z in range(8, 17) for x in range(32, 36)],
    [(x, z) for z in range(22, 28) for x in range(27, 36) if x - z >= 4],
    [(x, z) for z in range(1, 3) for x in range(17, 36)],
]
for bed in beds:
    s = set(bed)
    for (x, z) in bed:
        edge = any((x + dx, z + dz) not in s for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        both(x, z, "hedge" if edge else "bed")

for (x, z), what in sorted(grid.items()):
    if what in ("paving", "dirt"):
        cell(what, x=x, z=z, w=1, h=1)
    elif what == "hedge":
        cell("wall", style="hedge", x=x, z=z, w=1, h=1)
    elif what == "castle":
        cell("wall", style="castle", x=x, z=z, w=1, h=1)
    elif what == "bed":
        cell("wall", style="rim", x=x, z=z, w=1, h=1)
        cell("grass", x=x, z=z, w=1, h=1)

cell("wall", style="rim", x=0, z=0, w=W, h=1)
# Border between neighbouring gardens: gate a (z 3-7) on the lane, gate b (z 17-21) on the inner lane.
cell("paving", x=35, z=3, w=2, h=5)
cell("paving", x=35, z=17, w=2, h=5)
cell("wall", style="hedge", x=35, z=1, w=2, h=2)
cell("wall", style="hedge", x=35, z=8, w=2, h=9)
cell("wall", style="hedge", x=35, z=22, w=2, h=6)

for z in range(31, 41):
    for x in range(31, 41):
        d = math.hypot(x + 0.5 - C, z + 0.5 - C)
        if 2.4 < d <= 4.2:
            cell("ford", x=x, z=z, w=1, h=1)

palette = ["#d8384a", "#f2c84a", "#e8e0f0", "#9a5ad8", "#ff8a3a"]
for bed in beds[:3]:
    inner = [(x, z) for (x, z) in bed if grid.get((x, z)) == "bed"]
    rng.shuffle(inner)
    for (x, z) in inner[: max(2, len(inner) // 7)]:
        col = palette[rng.randrange(len(palette))]
        prop("flowers", x + 0.5, z + 0.5, color=col)
        prop("flowers", z + 0.5, x + 0.5, color=col)
for x, z in [(18.5, 8.5), (27.5, 8.5), (32.5, 8.5), (35.5, 8.5), (32.5, 16.5), (35.5, 16.5), (27.5, 22.5), (35.5, 22.5)]:
    prop("topiary", x, z)
    prop("topiary", z, x)
for x, z in [(19.5, 19.5), (25.5, 25.5)]:
    prop("urn", x, z)
for x, z in [(19.8, 25.2), (25.2, 19.8)]:
    prop("urn", x, z)
prop("fountain", C, C)
prop("banner", 2.5, 2.5)
prop("tower", 2.5, 14.5, solid=True)
prop("torch", 17.3, 3.4)
prop("torch", 17.3, 8.5)
prop("torch", 3.4, 17.3)
prop("torch", 8.5, 17.3)
prop("crate", 13.5, 2.5)
prop("statue", 16.5, 16.5)
prop("tree", 23.5, 32.5, scale=1.2)
prop("tree", 32.5, 23.5, scale=1.2)

pads = [
    {"zone": "home", "x": 3.5, "z": 12.5},
    {"zone": "home", "x": 12.5, "z": 3.5},
    {"zone": "home", "x": 12, "z": 12},
    {"zone": "neutral", "x": 22.5, "z": 22.5},
    {"zone": "neutral", "x": 26, "z": 5.5},
    {"zone": "neutral", "x": 5.5, "z": 26},
]

slots = [
    {"set": "a", "x": 35, "z": 3, "w": 2, "h": 5},
    {"set": "a", "x": 35, "z": 17, "w": 2, "h": 5},
    {"set": "b", "x": 28, "z": 28, "w": 4, "h": 4,
     "cells": [[x, 59 - x] for x in range(28, 32)] + [[x, 60 - x] for x in range(29, 32)],
     "line": [28.15, 31.85, 31.85, 28.15]},
]

data = {
    "name": "Bellwick Gardens",
    "blurb": "Four houses share one walled garden. When the bells ring, iron gates either seal the lanes between neighbours, forcing everyone through the court, or seal the court itself. The fountain under the Grudge mends heroes who wade in.",
    "emblem": "bell",
    "width": W,
    "depth": D,
    "teams": 4,
    "mode": "ffa",
    "mirror": "quad",
    "surround": "garden",
    "rimHeight": 1.6,
    "waterLevel": 0.75,
    "gates": {"firstSeconds": 45, "everySeconds": 40, "warnSeconds": 5, "slots": slots},
    "fountain": {"x": C, "z": C, "r": 5.0, "heal": 32},
    "notes": "Generated by tools/mapgen-gardens.py. Four-fold rotation (mirror quad); the north-west quadrant is authored and mirrored across its diagonal, so the whole map has eight-fold symmetry. 72x72 (cut down from 104 for tighter fights). Keeps sit in the corners, a gravel avenue with a roundabout runs from each keep mouth to the octagonal inner court. Hedge parterres (hedge outline, blocked flower bed inside) split the quadrants into corridors. Gate set a (both border gates between neighbouring gardens) and set b (the diagonal court gates across each avenue mouth) swap every 40 s: with set a shut you can only reach a neighbour through the court; with set b shut the court is sealed and the border lanes are open. The fountain heals heroes standing in its basin.",
    "ops": ops,
    "props": props,
    "cores": [{"team": 0, "x": 6.5, "z": 6.5}],
    "pads": pads,
    "spawns": [{"team": 0, "x": 9, "z": 9}],
    "jumppads": [{"a": {"x": 31, "z": 34}, "b": {"x": 6, "z": 10.5}}, {"a": {"x": 2.5, "z": 8}, "b": {"x": 28, "z": 28}}, {"a": {"x": 19.5, "z": 5.5}, "b": {"x": 54, "z": 18}}],
    "patrols": [{"a": {"x": 29.5, "z": 5.5}, "b": {"x": 29.5, "z": 19.5}}],
    "dens": [{"x": 30, "z": 12.5}],
}

with open("data/maps/gardens.json", "w") as f:
    json.dump(data, f, indent=1)
print("wrote data/maps/gardens.json", len(ops), "ops", len(props), "props")
