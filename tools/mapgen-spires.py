# Emberdune Spires (free for all): a moonlit desert canyon of sandstone ruins with a dune serpent.
# Generated from seed 7bf7713ccbf2e28e8b2c6b747485c3c017bebc448ccbde49677836e519230f9a (theme: desert canyon
# sandstone ruins, event: a giant roaming creature, shape: spiral arms, 72x72) and 2cfb954b9280deb930b5372d077fd127
# (name, a burrowing dune serpent, blue moonlit night, speed 5, breach every 20 s).
#
# Four-fold rotation (mirror "quad"): only the north-west quadrant is authored and rotated 3x about the centre, so
# the layout is a pinwheel, not a mirror image - every keep's east arm is pushed inward by a curved sandstone
# ridge that the next keep's arm runs along the other side of.
#
# Quadrant layout (keep in the corner):
#   keep     flat paved yard with castle walls, gates east and south
#   ridge    a curved sandstone cliff blade from the north edge (x 23) sweeping toward the centre, one narrow pass
#            through its middle; the pinwheel's four blades spiral the arms in toward the dune sea
#   dune sea a sunken ring of soft dune sand (radius 9-19 around the centre) where the serpent swims
#   island   a raised sandstone island in the middle (radius 8, ramps all round) with the Grudge's altar
import json
import math

SEED = "7bf7713ccbf2e28e8b2c6b747485c3c017bebc448ccbde49677836e519230f9a"
W = D = 72
C = W / 2
ops = []
props = []


def shape(kind, **kw):
    ops.append({"op": "shape", "shape": kind, **kw})


def cell(op, **kw):
    ops.append({"op": op, **kw})


def bez(p0, p1, p2, t):
    a = (1 - t) * (1 - t)
    b = 2 * (1 - t) * t
    c = t * t
    return a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]


ops.append({"op": "noise", "amp": 0.2, "scale": 0.12, "seed": int(SEED[:6], 16) % 997})
shape("rect", x=-12, z=-12, w=W + 24, h=D + 24, y=0.6, mode="set")

# Dune sea: a sunken soft-sand ring around the centre, with the raised island inside it.
shape("circle", x=C, z=C, r=19, y=0.05, edge=2.5, mode="set", wobble=0.8)
shape("circle", x=C, z=C, r=8, y=1.3, edge=2.4, mode="set", wobble=0.3)
for z in range(0, int(C) + 1):
    for x in range(0, int(C) + 1):
        d = math.hypot(x + 0.5 - C, z + 0.5 - C)
        if 9.0 <= d <= 19.5:
            cell("dirt", x=x, z=z, w=1, h=1)
        elif d < 6.6:
            cell("paving", x=x, z=z, w=1, h=1)

# Ridge blade (curved cliff) with a pass through the middle.
P0, P1, P2 = (23.0, 0.0), (25.5, 10.0), (31.5, 17.5)
spine = set()
n = 40
for k in range(n + 1):
    t = k / n
    x, z = bez(P0, P1, P2, t)
    in_pass = 0.38 <= t <= 0.64
    if not in_pass:
        shape("circle", x=x, z=z, r=1.9, y=4.6, edge=0.7, mode="max", wobble=0.5)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cx, cz = int(math.floor(x)) + dx, int(math.floor(z)) + dz
                if math.hypot(cx + 0.5 - x, cz + 0.5 - z) <= 1.4:
                    spine.add((cx, cz))
PASS = bez(P0, P1, P2, 0.51)
shape("circle", x=PASS[0], z=PASS[1], r=1.8, y=0.6, edge=1.4, mode="set")
for cx, cz in sorted(spine):
    if math.hypot(cx + 0.5 - PASS[0], cz + 0.5 - PASS[1]) < 2.4:
        continue
    if 0 <= cx < C and 0 <= cz < C:
        cell("wall", style="rim", x=cx, z=cz, w=1, h=1)
# Spires along the ridge crest and one at each pass mouth.
for t in (0.12, 0.3, 0.75, 0.92):
    x, z = bez(P0, P1, P2, t)
    props.append({"type": "spire", "x": round(x, 2), "z": round(z, 2), "scale": 1.15})

# Arena rim.
cell("wall", style="rim", x=0, z=0, w=W, h=1)

# Keep: paved yard, castle walls with east and south gates.
cell("paving", x=1, z=1, w=15, h=15)
cell("wall", style="castle", x=16, z=1, w=1, h=7)
cell("wall", style="castle", x=16, z=12, w=1, h=5)
cell("wall", style="castle", x=1, z=16, w=7, h=1)
cell("wall", style="castle", x=12, z=16, w=5, h=1)
cell("dirt", x=17, z=8, w=5, h=4)
cell("dirt", x=8, z=17, w=4, h=5)

# Scatter: dry clay pans in the arms, scrub grass (tall grass hides heroes) in the corners of the arms.
for x, z, w, h in ((19, 2, 3, 3), (3, 20, 4, 3), (12, 26, 4, 3)):
    cell("grass", x=x, z=z, w=w, h=h)

props += [
    {"type": "tower", "x": 1.5, "z": 16.5, "solid": True},
    {"type": "tower", "x": 16.5, "z": 1.5, "solid": True},
    {"type": "tower", "x": 16.5, "z": 16.5, "solid": True},
    {"type": "banner", "x": 2.5, "z": 2.5},
    {"type": "torch", "x": 17.5, "z": 7.5},
    {"type": "torch", "x": 17.5, "z": 12.5},
    {"type": "torch", "x": 7.5, "z": 17.5},
    {"type": "torch", "x": 12.5, "z": 17.5},
    {"type": "tent", "x": 4.5, "z": 13.0},
    {"type": "cactus", "x": 20.5, "z": 14.5, "solid": True},
    {"type": "cactus", "x": 3.5, "z": 25.5, "solid": True},
    {"type": "obelisk", "x": 22.5, "z": 22.5, "solid": True},
    {"type": "spire", "x": 2.5, "z": 31.0, "scale": 1.3, "solid": True},
    {"type": "spire", "x": 9.0, "z": 33.0, "scale": 0.9, "solid": True},
    {"type": "colossus", "x": 14.5, "z": 30.0, "rot": 30, "solid": True},
    {"type": "ribcage", "x": 30.0, "z": 23.5, "rot": 45},
    {"type": "obelisk", "x": 31.5, "z": 31.5, "scale": 0.8, "solid": True},
    {"type": "torch", "x": 30.5, "z": 30.5},
]

pads = [
    {"zone": "home", "x": 3.5, "z": 12.5},
    {"zone": "home", "x": 12.5, "z": 3.5},
    {"zone": "home", "x": 12, "z": 12},
    {"zone": "forward", "x": 21.5, "z": 5.5},
    {"zone": "neutral", "x": 30.5, "z": 34.5},
]

data = {
    "name": "Emberdune Spires",
    "blurb": "Four keeps in a moonlit sandstone canyon, curved ridges spiralling every road into a sea of dunes. Something lives in the sand. It surfaces every twenty seconds, and it hunts whoever carries the Grudge.",
    "emblem": "serpent",
    "width": W,
    "depth": D,
    "teams": 4,
    "mode": "ffa",
    "mirror": "quad",
    "surround": "crag",
    "palette": "desert",
    "rimHeight": 2.2,
    "waterLevel": -2.0,
    "atmosphere": {
        "sunColor": "#c4d4ff",
        "sunIntensity": 2.1,
        "ambientSky": "#6a7cc8",
        "ambientGround": "#5a4636",
        "ambientIntensity": 1.8,
        "fogColor": "#30406e",
        "skyZenith": "#0c1434",
        "skyHorizon": "#3c5490",
        "sand": True,
    },
    "serpent": {
        "radius": 14,
        "inner": 9.6,
        "outer": 18.6,
        "speed": 5,
        "huntSpeed": 4.3,
        "firstSeconds": 35,
        "everySeconds": 20,
        "warnSeconds": 2.5,
        "huntWarn": 1.0,
        "huntCooldown": 6,
        "breachRadius": 3.2,
        "damage": 120,
        "knockback": 14,
        "stun": 0.7,
        "churnRadius": 3.0,
        "churnSlow": 0.7,
    },
    "notes": "Generated by tools/mapgen-spires.py (see its header for the layout).",
    "ops": ops,
    "props": props,
    "cores": [{"team": 0, "x": 6.5, "z": 6.5}],
    "pads": pads,
    "spawns": [{"team": 0, "x": 9, "z": 9}],
}

with open("data/maps/spires.json", "w") as f:
    json.dump(data, f, indent=1)
print("wrote data/maps/spires.json", len(ops), "ops", len(props), "props")
