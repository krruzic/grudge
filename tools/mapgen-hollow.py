# Russet Hollow (1v1 / 2v2): an autumn cider orchard at dusk, pinched to an hourglass at the cider press.
# Generated from seed 41baa37d25e9c0dd91b44523257f4c412a857967c788bcdcbe1a0daf462f0716 (theme: autumn orchard,
# event: erupting cider wells that launch whoever stands on them, shape: hourglass 88x44). Mirrored left/right
# (mirror "x"): only the west half (x < 44) is authored; ops, props and pads are copied to the east.
#
# Layout (west half):
#   keep      walled paved yard around the core (x 1-14), gates east (main) and north-east / south-east posterns
#   lane      a leaf-strewn cart track from the keep gate straight to the press yard at the waist
#   terraces  two raised orchard terraces (north and south, 2 m up) reached by a ramp at their west end; their
#             east ends are earth banks you can drop off into the waist but can't climb
#   waist     the hourglass neck (24 m wide) around the cider press, where the Grudge sits
#   wells     three cider wells per side; on a timer they build pressure, then erupt and fling anyone on them
#             along a fixed arc (lane well -> past the press into enemy ground; terrace wells -> the other terrace)
import json
import math

SEED = "41baa37d25e9c0dd91b44523257f4c412a857967c788bcdcbe1a0daf462f0716"
W, D = 88, 44
C = W / 2
CZ = D / 2
ops = []
props = []


def shape(kind, **kw):
    ops.append({"op": "shape", "shape": kind, **kw})


def cell(op, **kw):
    ops.append({"op": op, **kw})


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def top(x):
    """Northern edge of the playable field at column x (the hourglass pinch)."""
    return 1 + int(round(9 * smooth((x - 16) / 26)))


def bottom(x):
    return D - top(x)


ops.append({"op": "noise", "amp": 0.18, "scale": 0.13, "seed": int(SEED[:6], 16) % 997})
# Lift the whole field slightly so noise never dips it into dark hollows, then the rim banks outside the hourglass.
shape("rect", x=-10, z=-10, w=W + 20, h=D + 20, y=0.35, edge=0, mode="max")
shape("rect", x=-10, z=-10, w=W + 20, h=11, y=4.5, edge=3, mode="max", wobble=2.5)
shape("rect", x=-10, z=D - 1, w=W + 20, h=11, y=4.5, edge=3, mode="max", wobble=2.5)
shape("rect", x=-10, z=-10, w=11, h=D + 20, y=4.5, edge=3, mode="max", wobble=2.5)

# Hourglass: rim cells outside the pinch.
for x in range(0, int(C)):
    t = top(x)
    if t > 1:
        cell("wall", style="rim", x=x, z=1, w=1, h=t - 1)
        cell("wall", style="rim", x=x, z=bottom(x) + 1, w=1, h=t - 1)
for x in range(16, int(C)):
    t = top(x)
    if t > 2:
        cell("wall", style="hedge", x=x, z=t - 1, w=1, h=1)
        cell("wall", style="hedge", x=x, z=bottom(x), w=1, h=1)
cell("wall", style="rim", x=0, z=0, w=W, h=1)
cell("wall", style="rim", x=0, z=D - 1, w=W, h=1)
cell("wall", style="rim", x=0, z=0, w=1, h=D)
# Raise the pinch shoulders into steep orchard hillsides so the hourglass reads from the camera, with a
# hedgerow along the foot of each and old apple trees on the slopes.
for x in range(16, int(C), 2):
    t = top(x)
    if t > 2:
        shape("rect", x=x, z=-2, w=2, h=t + 1, y=4.5, edge=1.2, mode="max", wobble=0.5)
        shape("rect", x=x, z=D - t + 1, w=2, h=t + 1, y=4.5, edge=1.2, mode="max", wobble=0.5)

# Terraces: 2 m orchard shelves north and south of the lane (x 19-38), ramp at the west end, bank to the east.
for zt, zb in ((top(19) + 1, 15), (D - 15, bottom(19))):
    shape("rect", x=22, z=zt, w=16, h=zb - zt, y=2.0, edge=0, mode="max")
    shape("rect", x=18, z=zt, w=4, h=zb - zt, y=2.0, edge=4, mode="max")
    # The inner bank face toward the lane, a little ragged.
    shape("rect", x=22, z=zb - 1 if zt < CZ else zt, w=16, h=1, y=2.0, edge=0.6, mode="max", wobble=0.4)

# Keep: paved yard, castle walls with an east gate (z 19-24) and two posterns.
cell("paving", x=1, z=12, w=14, h=20)
cell("wall", style="castle", x=1, z=12, w=5, h=1)
cell("wall", style="castle", x=9, z=12, w=6, h=1)
cell("wall", style="castle", x=1, z=31, w=5, h=1)
cell("wall", style="castle", x=9, z=31, w=6, h=1)
cell("wall", style="castle", x=14, z=12, w=1, h=7)
cell("wall", style="castle", x=14, z=25, w=1, h=7)

# Paint: autumn grass everywhere (base), the cart track and orchard paths in leaf-litter dirt, and windfall patches.
cell("dirt", x=15, z=19, w=29, h=6)
cell("dirt", x=6, z=4, w=3, h=8)
cell("dirt", x=6, z=32, w=3, h=8)
cell("dirt", x=6, z=4, w=14, h=2)
cell("dirt", x=6, z=38, w=14, h=2)
cell("dirt", x=18, z=6, w=4, h=9)
cell("dirt", x=18, z=29, w=4, h=9)
cell("dirt", x=22, z=11, w=16, h=2)
cell("dirt", x=22, z=31, w=16, h=2)
# Press yard: worn flagstones around the waist.
for z in range(int(CZ) - 7, int(CZ) + 7):
    for x in range(int(C) - 7, int(C)):
        if math.hypot(x + 0.5 - C, z + 0.5 - CZ) <= 6.4:
            cell("paving", x=x, z=z, w=1, h=1)
# Windfall patches under the orchard rows (tall grass hides heroes - a reason to fight in the orchard).
for x, z, w, h in ((24, 6, 4, 3), (31, 7, 4, 3), (24, 34, 4, 3), (31, 34, 4, 3), (8, 1, 5, 2), (8, 41, 5, 2)):
    cell("grass", x=x, z=z, w=w, h=h)

# Props (west half; mirrored east). Orchard rows on the terraces, the press at the waist, farm clutter.
for z in (8.5, 13.5):
    for x in (23.5, 27.5, 31.5, 35.5):
        props.append({"type": "appletree", "x": x + (0.8 if z > 10 else 0), "z": z, "solid": True})
        props.append({"type": "appletree", "x": x + (0.8 if z > 10 else 0), "z": D - z, "solid": True})
props += [
    {"type": "press", "x": C, "z": CZ - 5.0, "solid": True},
    {"type": "press", "x": C, "z": CZ + 5.0, "solid": True},
    {"type": "barrels", "x": 39.5, "z": CZ - 4.5, "solid": True},
    {"type": "barrels", "x": 39.5, "z": CZ + 4.5, "solid": True},
    {"type": "pumpkins", "x": 16.5, "z": 17.0, "solid": True},
    {"type": "pumpkins", "x": 16.5, "z": 27.0, "solid": True},
    {"type": "pumpkins", "x": 21.0, "z": 3.0},
    {"type": "haycart", "x": 11.5, "z": 3.5, "solid": True},
    {"type": "haycart", "x": 11.5, "z": 40.5, "solid": True},
    {"type": "barrels", "x": 2.5, "z": 29.5, "solid": True},
    {"type": "barrels", "x": 2.5, "z": 14.5, "solid": True},
    {"type": "tower", "x": 1.5, "z": 12.5, "solid": True},
    {"type": "tower", "x": 14.5, "z": 12.5, "solid": True},
    {"type": "tower", "x": 1.5, "z": 31.5, "solid": True},
    {"type": "tower", "x": 14.5, "z": 31.5, "solid": True},
    {"type": "arch", "x": 7.5, "z": 12.5, "rot": 0},
    {"type": "arch", "x": 7.5, "z": 31.5, "rot": 0},
    {"type": "arch", "x": 14.5, "z": 22, "rot": 90},
    {"type": "banner", "x": 13.3, "z": 18.5},
    {"type": "banner", "x": 13.3, "z": 25.5},
    {"type": "torch", "x": 17.5, "z": 18.5},
    {"type": "torch", "x": 17.5, "z": 25.5},
    {"type": "torch", "x": 38.5, "z": 18.5},
    {"type": "torch", "x": 38.5, "z": 25.5},
    {"type": "appletree", "x": 3.5, "z": 4.5, "solid": True},
    {"type": "appletree", "x": 3.5, "z": 39.5, "solid": True},
    {"type": "appletree", "x": 15.5, "z": 7.5, "solid": True},
    {"type": "appletree", "x": 15.5, "z": 36.5, "solid": True},
]
for x in (26.5, 32.5, 37.5, 41.5):
    t = top(int(x))
    props.append({"type": "appletree", "x": x, "z": max(1.5, t - 2.5), "scale": 0.9})
    props.append({"type": "appletree", "x": x, "z": min(D - 1.5, D - t + 2.5), "scale": 0.9})

# Cider wells: launch target (tx, tz) for whoever stands on one when it erupts. Group "a" (lane) and "b"
# (terraces) alternate, each erupting every 30 s.
wells = [
    {"x": 30.5, "z": CZ, "tx": 55.5, "tz": CZ, "group": "a"},
    {"x": 33.5, "z": 10.0, "tx": 30.0, "tz": D - 10.0, "group": "b"},
    {"x": 33.5, "z": D - 10.0, "tx": 30.0, "tz": 10.0, "group": "b"},
]
for wl in wells:
    props.append({"type": "ciderwell", "x": wl["x"], "z": wl["z"]})

pads = [
    {"zone": "home", "x": 10.5, "z": 16.5},
    {"zone": "home", "x": 10.5, "z": 27.5},
    {"zone": "home", "x": 3.5, "z": 22},
    {"zone": "forward", "x": 27.5, "z": 10.5},
    {"zone": "forward", "x": 27.5, "z": D - 10.5},
    {"zone": "neutral", "x": 40.5, "z": 13.5},
    {"zone": "neutral", "x": 40.5, "z": D - 13.5},
]

data = {
    "name": "Russet Hollow",
    "blurb": "A cider orchard at the end of harvest, pinched to one lane at the press. The cider wells erupt every fifteen seconds and fling whoever stands on them across the field: ride one to flank, or get thrown into the enemy.",
    "emblem": "apple",
    "width": W,
    "depth": D,
    "mirror": "x",
    "surround": "valley",
    "palette": "autumn",
    # Dusk at the end of harvest: low orange sun, lilac sky, warm haze and falling leaves.
    "atmosphere": {
        "sunColor": "#ffe2c0",
        "sunIntensity": 2.3,
        "ambientSky": "#b8c4e8",
        "ambientGround": "#6a5c40",
        "ambientIntensity": 1.3,
        "fogColor": "#c8bcb0",
        "skyZenith": "#4f6ab8",
        "skyHorizon": "#f2c8a0",
        "leaves": True,
    },
    "rimHeight": 4.5,
    "waterLevel": -0.5,
    "geysers": {
        "firstSeconds": 40,
        "everySeconds": 15,
        "warnSeconds": 4,
        "radius": 2.4,
        "damage": 30,
        "flight": 1.05,
        "peak": 5.0,
        "mudSeconds": 6,
        "mudRadius": 3.0,
        "mudSlow": 0.55,
        "wells": wells,
    },
    "notes": "Generated by tools/mapgen-hollow.py (see its header for the layout).",
    "ops": ops,
    "props": props,
    "lanes": [{"name": "NORTH", "x": 44, "z": 9}, {"name": "LANE", "x": 44, "z": 22}, {"name": "SOUTH", "x": 44, "z": 35}],
    "cores": [{"team": 0, "x": 6, "z": 22}],
    "pads": pads,
    "spawns": [{"team": 0, "x": 8.5, "z": 22}],
    "patrols": [{"a": {"x": 44, "z": 12}, "b": {"x": 44, "z": 32}}],
}

with open("data/maps/hollow.json", "w") as f:
    json.dump(data, f, indent=1)
print("wrote data/maps/hollow.json", len(ops), "ops", len(props), "props")
