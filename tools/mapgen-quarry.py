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

W = D = 56
C = W / 2
UPPER, MIDDLE, PIT, MOUND = 6.0, 3.0, 0.2, 1.6
ops = []
props = []


def shape(kind, **kw):
    ops.append({"op": "shape", "shape": kind, **kw})


def cell(op, **kw):
    ops.append({"op": op, **kw})


def ramp(x0, z0, x1, z1, y0, y1, axis):
    """A haul road: 1 m slices from (x0, z0) toward (x1, z1) along `axis`, height going y0 -> y1."""
    if axis == "x":
        n = abs(x1 - x0)
        for k in range(n):
            x = x0 + k if x1 > x0 else x0 - k - 1
            y = y0 + (y1 - y0) * (k + 0.5) / n
            shape("rect", x=x, z=min(z0, z1), w=1, h=abs(z1 - z0), y=round(y, 2), edge=0, mode="set")
            cell("dirt", x=x, z=min(z0, z1), w=1, h=abs(z1 - z0))
    else:
        n = abs(z1 - z0)
        for k in range(n):
            z = z0 + k if z1 > z0 else z0 - k - 1
            y = y0 + (y1 - y0) * (k + 0.5) / n
            shape("rect", x=min(x0, x1), z=z, w=abs(x1 - x0), h=1, y=round(y, 2), edge=0, mode="set")
            cell("dirt", x=min(x0, x1), z=z, w=abs(x1 - x0), h=1)


def rot(x, z):
    return W - x, D - z


ops.append({"op": "noise", "amp": 0.12, "scale": 0.15, "seed": 613})
# Levels: the lip everywhere (7 m wide), the middle bench inside it (9 m), the pit (24 m) in the middle.
shape("rect", x=-12, z=-12, w=W + 24, h=D + 24, y=UPPER, edge=0, mode="set")
shape("rect", x=7, z=7, w=W - 14, h=D - 14, y=MIDDLE, edge=0, mode="set")
shape("rect", x=16, z=16, w=W - 32, h=D - 32, y=PIT, edge=0, mode="set")
cell("wall", style="rim", x=0, z=0, w=W, h=1)
cell("wall", style="rim", x=0, z=0, w=1, h=D)

# Crusher mound in the middle of the pit (ramp west; the rotation adds east).
shape("rect", x=24, z=25, w=8, h=6, y=MOUND, edge=0, mode="set")
ramp(20, 26, 24, 30, PIT, MOUND, "x")
cell("paving", x=25, z=26, w=6, h=4)

# Haul roads, pit -> middle: along the pit's north wall heading west, and its west wall heading south.
ramp(26, 16, 16, 19, PIT, MIDDLE, "x")
ramp(16, 30, 19, 40, PIT, MIDDLE, "z")
# Middle -> lip: along the lip's north wall heading east, and its west wall heading north.
ramp(27, 7, 38, 10, MIDDLE, UPPER, "x")
ramp(7, 28, 10, 17, MIDDLE, UPPER, "z")

# Adits: dead-end notches cut back into the lip at middle-bench height, one north, one west.
for x, z, w, h in ((13, 2, 4, 5), (2, 37, 5, 4)):
    shape("rect", x=x, z=z, w=w, h=h, y=MIDDLE, edge=0, mode="set")
    cell("dirt", x=x, z=z, w=w, h=h)
    cell("grass", x=x + 1, z=z + 1, w=max(1, w - 2), h=max(1, h - 2))

# Paint: gravel roads on the lip, sawn slabs on the benches, scrub to hide in up top.
cell("dirt", x=2, z=3, w=24, h=2)
cell("dirt", x=3, z=2, w=2, h=24)
for x, z, w, h in ((20, 1, 6, 2), (1, 20, 2, 6), (42, 2, 8, 3), (2, 42, 3, 8), (8, 1, 4, 2)):
    cell("grass", x=x, z=z, w=w, h=h)
cell("paving", x=9, z=9, w=6, h=6)
for x, z, w, h in ((18, 9, 5, 3), (9, 20, 3, 5), (40, 9, 4, 3)):
    cell("grass", x=x, z=z, w=w, h=h)

# Props: cranes and sheds on the lip, cut-stone stacks and rubble as cover on the benches and the pit floor.
props += [
    {"type": "crane", "x": 22.5, "z": 4.0, "solid": True},
    {"type": "crane", "x": 4.0, "z": 31.0, "solid": True},
    {"type": "shed", "x": 46.0, "z": 3.5, "solid": True},
    {"type": "stoneblocks", "x": 12.0, "z": 12.0, "solid": True},
    {"type": "stoneblocks", "x": 23.0, "z": 12.0, "solid": True},
    {"type": "stoneblocks", "x": 11.5, "z": 34.0, "solid": True},
    {"type": "stoneblocks", "x": 21.5, "z": 21.5, "solid": True},
    {"type": "rubbleheap", "x": 30.5, "z": 20.5, "solid": True},
    {"type": "rubbleheap", "x": 20.5, "z": 35.0, "solid": True},
    {"type": "minecart", "x": 42.0, "z": 11.5, "solid": True},
    {"type": "scaffold", "x": 9.5, "z": 9.5, "solid": True},
    {"type": "deadtree", "x": 2.5, "z": 47.0, "solid": True},
]

# Power-ups: the fight-changers sit up on the lip and in the adits (a reason to climb), potions down in the pit.
half = [
    {"x": 28.0, "z": 3.0, "kind": "might"},
    {"x": 3.5, "z": 22.0, "kind": "rush"},
    {"x": 15.0, "z": 4.5, "kind": "haste"},
    {"x": 11.0, "z": 25.0, "kind": "shield"},
    {"x": 24.5, "z": 21.5, "kind": "potion"},
]
powerups = half + [dict(p, x=rot(p["x"], p["z"])[0], z=rot(p["x"], p["z"])[1]) for p in half]

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
    "spawns": [{"team": 0, "x": 4.5, "z": 4.5}],
    "powerups": powerups,
    "jumppads": [
        {"a": {"x": 18.5, "z": 22.5}, "b": {"x": 3.5, "z": 13.0}},
        {"a": {"x": 33.5, "z": 37.5}, "b": {"x": 52.5, "z": 43.0}},
    ],
}

with open("data/maps/quarry.json", "w") as f:
    json.dump(data, f, indent=1)
print("wrote data/maps/quarry.json", len(ops), "ops", len(props), "props")
