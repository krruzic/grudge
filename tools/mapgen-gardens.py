import json
import math
import random

SEED = "9978ed11198d3fd830818e401e804b8258c963b4936880bea2c829b40df4a3e2"
rng = random.Random(int(SEED[:16], 16))

W = D = 104
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

rect(1, 1, 21, 21, "paving")
for x0, z0, w, h in [(22, 1, 1, 5), (22, 11, 1, 5)]:
    rect(x0, z0, w, h, "castle")

for z in range(0, 52):
    for x in range(0, 52):
        if abs(x - z) <= 4 and 16 <= x + 0.5 <= 46 and 16 <= z + 0.5 <= 46:
            mark(x, z, "dirt")
        if math.hypot(x + 0.5 - 32.5, z + 0.5 - 32.5) <= 5.2:
            mark(x, z, "dirt")

rect(23, 5, 28, 7, "dirt")
rect(40, 12, 6, 13, "dirt")
rect(36, 25, 15, 7, "dirt")
rect(23, 12, 3, 6, "dirt")
rect(46, 32, 5, 8, "dirt")

for z in range(40, 52):
    for x in range(40, 52):
        if x + z >= 86:
            mark(x, z, "paving")
        if math.hypot(x + 0.5 - C, z + 0.5 - C) <= 2.6:
            mark(x, z, "paving")
rect(40, 46, 1, 6, "hedge")
rect(40, 47, 1, 4, "paving")

beds = [
    [(x, z) for z in range(12, 25) for x in range(26, 40) if x - z >= 6],
    [(x, z) for z in range(12, 25) for x in range(46, 51)],
    [(x, z) for z in range(32, 40) for x in range(39, 46) if x - z >= 6],
    [(x, z) for z in range(1, 5) for x in range(23, 51)],
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
cell("paving", x=51, z=6, w=2, h=5)
cell("paving", x=51, z=26, w=2, h=5)
cell("wall", style="hedge", x=51, z=1, w=2, h=5)
cell("wall", style="hedge", x=51, z=11, w=2, h=15)
cell("wall", style="hedge", x=51, z=31, w=2, h=9)

for z in range(49, 56):
    for x in range(49, 56):
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
for x, z in [(26.5, 12.5), (39.5, 12.5), (46.5, 12.5), (50.5, 12.5), (46.5, 24.5), (50.5, 24.5), (39.5, 33.5)]:
    prop("topiary", x, z)
    prop("topiary", z, x)
for x, z in [(28.5, 28.5), (36.5, 36.5)]:
    prop("urn", x, z)
for x, z in [(28.6, 36.4), (36.4, 28.6)]:
    prop("urn", x, z)
prop("fountain", C, C)
prop("banner", 2.5, 2.5)
prop("tower", 2.5, 20.5, solid=True)
prop("torch", 23.5, 4.5)
prop("torch", 23.5, 11.5)
prop("torch", 4.5, 23.5)
prop("torch", 11.5, 23.5)
prop("crate", 19.5, 2.5)
prop("statue", 23.5, 23.5)
prop("tree", 33.5, 46.5, scale=1.2)
prop("tree", 46.5, 33.5, scale=1.2)

pads = [
    {"zone": "home", "x": 5, "z": 16},
    {"zone": "home", "x": 16, "z": 5},
    {"zone": "home", "x": 15, "z": 15},
    {"zone": "neutral", "x": 32.5, "z": 32.5},
    {"zone": "neutral", "x": 37.5, "z": 8.5},
    {"zone": "neutral", "x": 8.5, "z": 37.5},
    {"zone": "neutral", "x": 41.5, "z": 28.5},
    {"zone": "neutral", "x": 28.5, "z": 41.5},
]

slots = [
    {"set": "a", "x": 51, "z": 6, "w": 2, "h": 5},
    {"set": "b", "x": 51, "z": 26, "w": 2, "h": 5},
    {"set": "b", "x": 40, "z": 47, "w": 1, "h": 4},
    {"set": "b", "x": 47, "z": 40, "w": 4, "h": 1},
]

data = {
    "name": "Bellwick Gardens",
    "blurb": "Four houses share one walled garden. When the bells ring, iron gates swap between the outer borders and the inner court. The fountain under the Grudge mends heroes who wade in.",
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
    "notes": "Generated by tools/mapgen-gardens.py. Four-fold rotation (mirror quad); the north-west quadrant is authored and mirrored across its diagonal, so the whole map has eight-fold symmetry. Keeps sit in the corners, a gravel avenue with a roundabout runs from each keep mouth to the octagonal inner court. Hedge parterres (hedge outline, blocked flower bed inside) split the quadrants into corridors. Gate set a (outer border gates near the keeps) and set b (mid border gates and the court gates) swap every 40 s; the avenue never closes. The fountain heals heroes standing in its basin.",
    "ops": ops,
    "props": props,
    "cores": [{"team": 0, "x": 6.5, "z": 6.5}],
    "pads": pads,
    "spawns": [{"team": 0, "x": 10.5, "z": 10.5}],
    "jumppads": [{"a": {"x": 45, "z": 49}, "b": {"x": 8, "z": 13}}, {"a": {"x": 3.5, "z": 10.5}, "b": {"x": 49, "z": 46}}, {"a": {"x": 28, "z": 8.5}, "b": {"x": 78, "z": 26}}],
    "patrols": [{"a": {"x": 42.5, "z": 8.5}, "b": {"x": 42.5, "z": 28.5}}],
    "dens": [{"x": 43, "z": 18.5}],
}

with open("data/maps/gardens.json", "w") as f:
    json.dump(data, f, indent=1)
print("wrote data/maps/gardens.json", len(ops), "ops", len(props), "props")
