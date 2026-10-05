# Cutstone Quarry (deathmatch only): an abandoned stepped stone quarry at sunset, built for team and FFA deathmatch.
# Point symmetric (mirror "rot"): the north-west half is authored and rotated 180 degrees about the centre, so team
# deathmatch's two houses start in opposite corners. There are no keeps, pads or soldiers.
#
# Three levels, each a different kind of fight:
#   upper bench  (y 5)    the quarry lip around the outside: open scrubland with tall grass to hide in, the cranes,
#                         and the corner camps the houses spawn at; you can drop off it anywhere but only climb back
#                         up the haul roads
#   middle bench (y 2.6)  a 12 m shelf ringing the pit, broken by cut-stone stacks; cut back into the lip are two
#                         dead-end adits (mine mouths) per side where you can lurk - or get cornered
#   pit floor    (y 0.2)  the open killing floor with the crusher mound in the middle (y 1.6, two ramps), where
#                         the Grudge wakes; rubble heaps for cover
# Haul roads: two ramps pit -> middle bench and two ramps middle -> upper per side (each a 3 m wide road cut along a
# cliff face), so every level has a way up and a lot of ways down. Two jump pads per side fling you from the pit
# floor back up to the lip.
import json

W = D = 72
C = W / 2
UPPER, MIDDLE, PIT, MOUND = 6.2, 3.2, 0.2, 1.6
ops = []
props = []


def shape(kind, **kw):
    ops.append({"op": "shape", "shape": kind, **kw})


def cell(op, **kw):
    ops.append({"op": op, **kw})


def ramp(x0, z0, x1, z1, y0, y1, axis):
    """A haul road: 1 m slices from (x0, z0) to (x1, z1) along `axis`, height going y0 -> y1 (edge 0, set)."""
    if axis == "x":
        n = abs(x1 - x0)
        step = 1 if x1 > x0 else -1
        for k in range(n):
            x = x0 + k * step if step > 0 else x0 - k - 1
            y = y0 + (y1 - y0) * (k + 0.5) / n
            shape("rect", x=x, z=min(z0, z1), w=1, h=abs(z1 - z0), y=round(y, 2), edge=0, mode="set")
            cell("dirt", x=x, z=min(z0, z1), w=1, h=abs(z1 - z0))
    else:
        n = abs(z1 - z0)
        step = 1 if z1 > z0 else -1
        for k in range(n):
            z = z0 + k * step if step > 0 else z0 - k - 1
            y = y0 + (y1 - y0) * (k + 0.5) / n
            shape("rect", x=min(x0, x1), z=z, w=abs(x1 - x0), h=1, y=round(y, 2), edge=0, mode="set")
            cell("dirt", x=min(x0, x1), z=z, w=abs(x1 - x0), h=1)


ops.append({"op": "noise", "amp": 0.12, "scale": 0.15, "seed": 613})
# Levels: the lip everywhere, the middle bench inside it, the pit inside that; sharp cliff faces between them.
shape("rect", x=-12, z=-12, w=W + 24, h=D + 24, y=UPPER, edge=0, mode="set")
shape("rect", x=11, z=11, w=W - 22, h=D - 22, y=MIDDLE, edge=0, mode="set")
shape("rect", x=23, z=23, w=W - 46, h=D - 46, y=PIT, edge=0, mode="set")
cell("wall", style="rim", x=0, z=0, w=W, h=1)
cell("wall", style="rim", x=0, z=0, w=1, h=D)

# Crusher mound in the middle of the pit: a low flat-topped heap, ramps east and west (mirrored).
shape("rect", x=31, z=32, w=10, h=8, y=MOUND, edge=0, mode="set")
ramp(27, 33, 31, 39, PIT, MOUND, "x")
cell("paving", x=32, z=33, w=8, h=6)

# Haul roads, pit -> middle: along the pit's north wall heading west, and its west wall heading south.
ramp(33, 23, 23, 26, PIT, MIDDLE, "x")
ramp(23, 38, 26, 49, PIT, MIDDLE, "z")
# Middle -> upper: along the lip's north wall heading east, and its west wall heading north.
ramp(36, 11, 50, 14, MIDDLE, UPPER, "x")
ramp(11, 34, 14, 20, MIDDLE, UPPER, "z")

# Adits: dead-end notches cut back into the lip at middle-bench height, one north, one west.
for x, z, w, h in ((19, 6, 5, 5), (6, 46, 5, 5)):
    shape("rect", x=x, z=z, w=w, h=h, y=MIDDLE, edge=0, mode="set")
    cell("dirt", x=x, z=z, w=w, h=h)
    cell("grass", x=x + 1, z=z + 1, w=w - 2, h=h - 2)

# Paint: gravel roads around the lip, worked stone on the benches (cobble), scrub grass to hide in up top.
cell("dirt", x=3, z=3, w=8, h=8)
cell("dirt", x=11, z=4, w=26, h=3)
cell("dirt", x=4, z=11, w=3, h=26)
for x, z, w, h in ((24, 3, 8, 3), (3, 26, 3, 8), (40, 4, 10, 4), (4, 40, 4, 8), (13, 2, 4, 3), (2, 14, 3, 4)):
    cell("grass", x=x, z=z, w=w, h=h)
cell("paving", x=12, z=12, w=10, h=10)
for x, z, w, h in ((24, 13, 6, 3), (13, 24, 3, 6), (16, 30, 4, 4), (30, 16, 4, 4)):
    cell("grass", x=x, z=z, w=w, h=h)

# Props (authored here, rotated for the other half): cranes on the lip, cut-stone stacks and rubble as cover on
# the benches and the pit floor, a mine cart and scaffold on the middle bench, stonecutters' sheds by the camps.
props += [
    {"type": "crane", "x": 30.5, "z": 7.0, "solid": True},
    {"type": "crane", "x": 7.0, "z": 25.5, "solid": True},
    {"type": "shed", "x": 4.0, "z": 15.0, "solid": True},
    {"type": "shed", "x": 15.5, "z": 3.5, "solid": True},
    {"type": "stoneblocks", "x": 17.5, "z": 17.5, "solid": True},
    {"type": "stoneblocks", "x": 29.0, "z": 16.5, "solid": True},
    {"type": "stoneblocks", "x": 15.5, "z": 29.0, "solid": True},
    {"type": "stoneblocks", "x": 29.5, "z": 28.5, "solid": True},
    {"type": "stoneblocks", "x": 26.5, "z": 44.5, "solid": True},
    {"type": "rubbleheap", "x": 38.0, "z": 27.5, "solid": True},
    {"type": "rubbleheap", "x": 44.5, "z": 30.5, "solid": True},
    {"type": "rubbleheap", "x": 18.5, "z": 40.5, "solid": True},
    {"type": "minecart", "x": 21.0, "z": 13.0, "solid": True},
    {"type": "scaffold", "x": 13.5, "z": 13.5, "solid": True},
    {"type": "deadtree", "x": 3.5, "z": 33.5, "solid": True},
]

data = {
    "name": "Cutstone Quarry",
    "blurb": "An abandoned quarry cut in three great steps. Brawl on the open pit floor, lurk in the mine adits, rain down from the lip - and mind the drops: it's a long way back up the haul roads.",
    "emblem": "pick",
    "width": W,
    "depth": D,
    "mode": "tdm",
    "mirror": "rot",
    "surround": "crag",
    "palette": "quarry",
    # Late golden sunset: warm low sun, peach sky, dusty haze.
    "atmosphere": {
        "sunColor": "#fff0dc",
        "sunIntensity": 2.2,
        "ambientSky": "#c8d0ec",
        "ambientGround": "#8a7a66",
        "ambientIntensity": 1.3,
        "fogColor": "#e8dccc",
        "skyZenith": "#5a78c0",
        "skyHorizon": "#ffd8b0",
    },
    "rimHeight": 6.5,
    "waterLevel": -1.0,
    "notes": "Generated by tools/mapgen-quarry.py (see its header for the layout). Deathmatch only.",
    "ops": ops,
    "props": props,
    "cores": [],
    "pads": [],
    "spawns": [{"team": 0, "x": 6.5, "z": 6.5}],
    "jumppads": [
        {"a": {"x": 25.5, "z": 34.5}, "b": {"x": 6.5, "z": 30.5}},
        {"a": {"x": 34.5, "z": 47.5}, "b": {"x": 30.0, "z": 66.0}},
    ],
}

with open("data/maps/quarry.json", "w") as f:
    json.dump(data, f, indent=1)
print("wrote data/maps/quarry.json", len(ops), "ops", len(props), "props")
