# Emberglass Mere (1v1 / 2v2): a frozen lake between two snowbound keeps at sunset. Mirrored left/right (mirror
# "x"): only the west half (x < 40) is authored; ops, props and pads are copied to the east.
#
# Layout (west half):
#   keep      walled paved yard around the core (x 1-14), an east gate (main) and north-east / south-east posterns
#   shores    north and south shore paths (z ~4 and ~40) through the pines: the long, solid way round
#   lake      a frozen mere filling the middle (an ellipse ~31 x 23 m, x 25-55): the short way across, but the ice
#             is slick (champions keep their momentum, knockback skates bodies across it) and cracks into patches
#             of icy water under heavy hits (map event "ice", src/sim/mapEvents/ice.ts). The Grudge wakes on it.
#   islets    two rocky islets in the lake per side with the neutral pads: solid ground in the middle of the ice
import json
import math

W, D = 80, 44
C = W / 2
CZ = D / 2
# The oval flagged as ice is a little bigger than the lake bowl: the sim keeps only the cells at the lake floor.
LAKE_RX, LAKE_RZ = 17.0, 12.5
ISLETS = [(32.5, 14.5), (32.5, CZ * 2 - 14.5)]
ISLET_R = 2.6
ops = []
props = []


def shape(kind, **kw):
    ops.append({"op": "shape", "shape": kind, **kw})


def cell(op, **kw):
    ops.append({"op": op, **kw})


def in_lake(x, z):
    return ((x - C) / LAKE_RX) ** 2 + ((z - CZ) / LAKE_RZ) ** 2 <= 1.0


def in_islet(x, z, pad=0.0):
    return any(math.hypot(x - ix, z - iz) <= ISLET_R + pad for ix, iz in ISLETS)


ops.append({"op": "noise", "amp": 0.16, "scale": 0.12, "seed": 613})
# Snowfield a little above the lake, rim banks round the edge.
shape("rect", x=-10, z=-10, w=W + 20, h=D + 20, y=0.45, edge=0, mode="max")
shape("rect", x=-10, z=-10, w=W + 20, h=11, y=4.5, edge=3, mode="max", wobble=2.5)
shape("rect", x=-10, z=D - 1, w=W + 20, h=11, y=4.5, edge=3, mode="max", wobble=2.5)
shape("rect", x=-10, z=-10, w=11, h=D + 20, y=4.5, edge=3, mode="max", wobble=2.5)
cell("wall", style="rim", x=0, z=0, w=W, h=1)
cell("wall", style="rim", x=0, z=D - 1, w=W, h=1)
cell("wall", style="rim", x=0, z=0, w=1, h=D)

# The mere: a flat sheet just below the snowfield, with a soft shore, and the islets standing out of it.
for x in range(int(C - LAKE_RX) - 1, int(C)):
    for z in range(int(CZ - LAKE_RZ) - 1, int(CZ + LAKE_RZ) + 1):
        if in_lake(x + 0.5, z + 0.5) and not in_islet(x + 0.5, z + 0.5, 0.4):
            cell("ice", x=x, z=z, w=1, h=1)
for cx, cz, r in ((C, CZ, 9.0), (C - 6.5, CZ, 8.5), (C, CZ - 4.5, 7.5), (C, CZ + 4.5, 7.5)):
    shape("circle", x=cx, z=cz, r=r, y=0.1, edge=3.0, mode="min")
for ix, iz in ISLETS:
    shape("circle", x=ix, z=iz, r=ISLET_R, y=0.75, edge=0.8, mode="max")

# Keep: paved yard, castle walls with an east gate (z 19-24) and two posterns.
cell("paving", x=1, z=12, w=14, h=20)
cell("wall", style="castle", x=1, z=12, w=5, h=1)
cell("wall", style="castle", x=9, z=12, w=6, h=1)
cell("wall", style="castle", x=1, z=31, w=5, h=1)
cell("wall", style="castle", x=9, z=31, w=6, h=1)
cell("wall", style="castle", x=14, z=12, w=1, h=7)
cell("wall", style="castle", x=14, z=25, w=1, h=7)

# Paths: the gate road down to the shore, and the shore paths round the lake from the posterns.
cell("dirt", x=15, z=19, w=9, h=6)
cell("dirt", x=6, z=4, w=3, h=8)
cell("dirt", x=6, z=32, w=3, h=8)
cell("dirt", x=6, z=5, w=34, h=2)
cell("dirt", x=6, z=37, w=34, h=2)
# Frozen reeds (tall grass hides heroes) along the shoreline: ambush spots at the lake's edge.
for x, z, w, h in ((20, 9, 3, 2), (24, 10, 3, 2), (20, 33, 3, 2), (24, 32, 3, 2), (35, 7, 3, 2), (35, 35, 3, 2)):
    cell("grass", x=x, z=z, w=w, h=h)

# Props (west half; mirrored east): pines along the rim and the keep, cabins by the shore paths, lanterns
# lighting the paths, cairns and rocks on the islets, the keep's towers and gate.
for x, z in ((2.5, 3.0), (4.5, 1.8), (13.0, 2.2), (16.5, 2.0), (21.0, 1.8), (27.0, 2.0), (33.0, 1.9), (38.0, 2.2),
             (2.5, 41.0), (4.5, 42.2), (13.0, 41.8), (16.5, 42.0), (21.0, 42.2), (27.0, 42.0), (33.0, 42.1),
             (38.0, 41.8), (17.5, 10.0), (17.5, 34.0), (2.2, 9.0), (2.2, 35.0)):
    props.append({"type": "pine", "x": x, "z": z, "solid": True})
props += [
    # On the shore between the path and the lake (further out they sat on the rim bank, hanging off the cliff).
    {"type": "cabin", "x": 29.5, "z": 10.6, "solid": True, "w": 4.6, "d": 3.6},
    {"type": "cabin", "x": 29.5, "z": D - 10.6, "rot": 180, "solid": True, "w": 4.6, "d": 3.6},
    {"type": "lantern", "x": 15.5, "z": 6.8},
    {"type": "lantern", "x": 15.5, "z": D - 6.8},
    {"type": "lantern", "x": 30.5, "z": 6.8},
    {"type": "lantern", "x": 30.5, "z": D - 6.8},
    {"type": "lantern", "x": 23.5, "z": 18.0},
    {"type": "lantern", "x": 23.5, "z": 26.0},
    {"type": "cairn", "x": 31.0, "z": 12.8, "solid": True},
    {"type": "cairn", "x": 31.0, "z": D - 12.8, "solid": True},
    {"type": "rock", "x": 34.2, "z": 16.4, "solid": True},
    {"type": "rock", "x": 34.2, "z": D - 16.4, "solid": True},
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
    {"type": "crate", "x": 2.5, "z": 29.5, "solid": True},
    {"type": "crate", "x": 2.5, "z": 14.5, "solid": True},
]

pads = [
    {"zone": "home", "x": 10.5, "z": 16.5},
    {"zone": "home", "x": 10.5, "z": 27.5},
    {"zone": "home", "x": 3.5, "z": 22},
    {"zone": "forward", "x": 21.5, "z": 7.5},
    {"zone": "forward", "x": 21.5, "z": D - 7.5},
    {"zone": "neutral", "x": ISLETS[0][0], "z": ISLETS[0][1]},
    {"zone": "neutral", "x": ISLETS[1][0], "z": ISLETS[1][1]},
]

data = {
    "name": "Emberglass Mere",
    "blurb": "Two snowbound keeps on either side of a frozen lake at sunset. The ice is the short way across, but it's slick - you slide, and a hard hit sends you skating - and heavy blows crack it into patches of freezing water that refreeze after a while.",
    "emblem": "tide",
    "width": W,
    "depth": D,
    "mirror": "x",
    "surround": "alpine",
    # Sunset over snow: a low orange sun, a violet sky going to deep blue overhead, warm haze.
    "atmosphere": {
        "sunColor": "#ffc882",
        "sunIntensity": 2.1,
        "ambientSky": "#c4c6d6",
        "ambientGround": "#6e665e",
        "ambientIntensity": 1.35,
        "fogColor": "#e2c4a2",
        "skyZenith": "#4a5a9a",
        "skyHorizon": "#ffaa5c",
    },
    "unitSpeedMul": 1.2,
    "rimHeight": 4.5,
    "waterLevel": -1.0,
    "ice": {
        "patch": 4,
        "hp": 100,
        "accelMul": 0.12,
        "knockDecay": 2.0,
        "rollMul": 1.25,
        "rollCarry": 0.7,
        "hitMul": 0.35,
        "hitMin": 12,
        "hitMax": 40,
        "landCrack": 30,
        "breakSeconds": 14,
        "refreezeWarn": 3,
        "waterSlow": 0.5,
        "dunkDamage": 45,
        "dunkStun": 0.6,
        "firstSeconds": 20,
    },
    "notes": "Generated by tools/mapgen-mere.py (see its header for the layout).",
    "ops": ops,
    "props": props,
    "lanes": [{"name": "NORTH", "x": 40, "z": 5}, {"name": "LAKE", "x": 40, "z": 22}, {"name": "SOUTH", "x": 40, "z": 39}],
    "cores": [{"team": 0, "x": 6, "z": 22}],
    "pads": pads,
    "spawns": [{"team": 0, "x": 8.5, "z": 22}],
    "patrols": [{"a": {"x": 40, "z": 5}, "b": {"x": 40, "z": 39}}],
}

with open("data/maps/mere.json", "w") as f:
    json.dump(data, f, indent=1)
print("wrote data/maps/mere.json", len(ops), "ops", len(props), "props")
