# Bellfry Abbey (deathmatch only): a roofless ruined abbey on a hill above its own graveyard, at night.
# Point symmetric (mirror "rot"): the north-west half is authored and rotated 180 degrees about the centre, so team
# deathmatch's two houses start in opposite graveyard corners. No keeps, pads or soldiers.
#
# Four heights:
#   crypt yards  (y -0.9)  a sunken walled yard in the west (and east) graveyard: one stair down, no other way out
#                          but a jump pad - the place to get cornered
#   graveyard    (y 0.6)   the ring of old graves, yews and long grass around the hill; lots of cover and grass to
#                          hide in, hedges that make dead ends
#   precinct     (y 2.4)   the abbey's terrace, raised on a retaining wall (two stairs up per side, drop off
#                          anywhere): the long roofless nave across the middle (the Grudge wakes at its altar),
#                          a cloister of broken arcades with an overgrown garth in the north-east (and south-west)
#   bell towers  (y 4.6)   a stump of a tower on the precinct's north-west (and south-east) corner, one stair up,
#                          a sniper's perch with a long drop on two sides
import json

W = D = 68
C = W / 2
CRYPT, YARD, PRECINCT, TOWER = -0.9, 0.6, 2.4, 4.6
ops = []
props = []


def shape(kind, **kw):
    ops.append({"op": "shape", "shape": kind, **kw})


def cell(op, **kw):
    ops.append({"op": op, **kw})


def ramp(x0, z0, x1, z1, y0, y1, axis, paint="paving"):
    """A stair: 1 m slices from (x0, z0) toward (x1, z1) along `axis`, height y0 -> y1."""
    if axis == "x":
        n = abs(x1 - x0)
        for k in range(n):
            x = x0 + k if x1 > x0 else x0 - k - 1
            y = y0 + (y1 - y0) * (k + 0.5) / n
            shape("rect", x=x, z=min(z0, z1), w=1, h=abs(z1 - z0), y=round(y, 2), edge=0, mode="set")
            cell(paint, x=x, z=min(z0, z1), w=1, h=abs(z1 - z0))
    else:
        n = abs(z1 - z0)
        for k in range(n):
            z = z0 + k if z1 > z0 else z0 - k - 1
            y = y0 + (y1 - y0) * (k + 0.5) / n
            shape("rect", x=min(x0, x1), z=z, w=abs(x1 - x0), h=1, y=round(y, 2), edge=0, mode="set")
            cell(paint, x=min(x0, x1), z=z, w=abs(x1 - x0), h=1)


def ruin(x, z, w, h):
    cell("wall", style="ruin", x=x, z=z, w=w, h=h)


ops.append({"op": "noise", "amp": 0.15, "scale": 0.14, "seed": 271})
shape("rect", x=-12, z=-12, w=W + 24, h=D + 24, y=YARD, edge=0, mode="set")
cell("wall", style="rim", x=0, z=0, w=W, h=1)
cell("wall", style="rim", x=0, z=0, w=1, h=D)

# Precinct terrace and its stairs (north and west; the rotation adds south and east).
shape("rect", x=16, z=16, w=W - 32, h=D - 32, y=PRECINCT, edge=0, mode="set")
ramp(29, 11, 33, 16, YARD, PRECINCT, "z")
ramp(11, 40, 16, 44, YARD, PRECINCT, "x")
cell("paving", x=16, z=29, w=36, h=10)

# Nave: two long broken walls across the precinct (the rotation makes the south one), doorways in each.
for x0, x1 in ((19, 25), (28, 38), (41, 49)):
    ruin(x0, 28, x1 - x0, 1)
cell("paving", x=33, z=33, w=2, h=2)

# Bell tower stump on the north-west corner of the precinct, stair up from the east.
shape("rect", x=16, z=16, w=6, h=6, y=TOWER, edge=0, mode="set")
ramp(27, 17, 22, 20, PRECINCT, TOWER, "x")
cell("paving", x=16, z=16, w=6, h=6)
ruin(16, 16, 2, 1)
ruin(16, 16, 1, 3)

# Cloister (north-east of the nave): a square of broken arcade walls around an overgrown garth.
for x, z, w, h in ((36, 18, 4, 1), (43, 18, 6, 1), (48, 18, 1, 3), (48, 24, 1, 3), (36, 18, 1, 2), (36, 24, 1, 3)):
    ruin(x, z, w, h)
cell("grass", x=38, z=20, w=9, h=5)

# Crypt yard: sunken, walled, one stair down from the graveyard path on its east side.
shape("rect", x=3, z=21, w=9, h=10, y=CRYPT, edge=0, mode="set")
ramp(15, 24, 11, 27, YARD, CRYPT, "x")
cell("paving", x=3, z=21, w=9, h=10)

# Graveyard: paths, long grass between the graves, a hedge with a blind end.
cell("dirt", x=2, z=12, w=46, h=3)
cell("dirt", x=12, z=2, w=3, h=40)
for x, z, w, h in ((3, 3, 7, 7), (17, 3, 9, 6), (30, 4, 8, 5), (4, 35, 6, 9), (3, 50, 7, 6), (55, 4, 8, 6)):
    cell("grass", x=x, z=z, w=w, h=h)
cell("wall", style="hedge", x=30, z=9, w=10, h=1)
cell("wall", style="hedge", x=39, z=3, w=1, h=6)
cell("wall", style="hedge", x=4, z=46, w=7, h=1)

props += [
    {"type": "gravestones", "x": 20.5, "z": 5.0, "solid": True},
    {"type": "gravestones", "x": 25.5, "z": 4.0, "solid": True},
    {"type": "gravestones", "x": 6.0, "z": 38.5, "solid": True},
    {"type": "gravestones", "x": 33.0, "z": 6.5, "solid": True},
    {"type": "gravestones", "x": 5.5, "z": 53.0, "solid": True},
    {"type": "gravestones", "x": 58.0, "z": 6.0, "solid": True},
    {"type": "angel", "x": 7.0, "z": 7.0, "solid": True},
    {"type": "angel", "x": 44.0, "z": 3.5, "solid": True},
    {"type": "yew", "x": 9.5, "z": 17.5, "solid": True},
    {"type": "yew", "x": 27.5, "z": 9.0, "solid": True},
    {"type": "yew", "x": 3.5, "z": 47.5, "solid": True},
    {"type": "yew", "x": 50.0, "z": 9.5, "solid": True},
    {"type": "shrine", "x": 7.0, "z": 30.0, "solid": True},
    {"type": "shrine", "x": 33.0, "z": 30.0, "solid": True},
    {"type": "brokenpillar", "x": 24.5, "z": 31.5, "solid": True},
    {"type": "brokenpillar", "x": 42.0, "z": 23.0, "solid": True},
    {"type": "fallenbell", "x": 19.5, "z": 25.0, "solid": True},
    {"type": "column", "x": 30.5, "z": 31.0, "solid": True},
    {"type": "column", "x": 40.0, "z": 21.0, "solid": True},
    {"type": "arch", "x": 26.5, "z": 28.5, "rot": 0},
    {"type": "torch", "x": 28.0, "z": 15.0},
    {"type": "torch", "x": 10.0, "z": 39.0},
    {"type": "torch", "x": 16.0, "z": 23.0},
]

data = {
    "name": "Bellfry Abbey",
    "blurb": "A roofless abbey on a hill above its graveyard. Fight through the nave, snipe from the bell towers, lose them in the long grass between the graves - and never follow anyone down into the crypt yards.",
    "emblem": "bell",
    "width": W,
    "depth": D,
    "mode": "tdm",
    "mirror": "rot",
    "surround": "valley",
    "palette": "abbey",
    # Moonlit night: silvery key light, dark slate sky, grey-blue mist (not too blue).
    "atmosphere": {
        "sunColor": "#e8ecf6",
        "sunIntensity": 2.4,
        "ambientSky": "#b4bccc",
        "ambientGround": "#585e54",
        "ambientIntensity": 2.1,
        "fogColor": "#40485a",
        "skyZenith": "#141a2e",
        "skyHorizon": "#4a5670",
    },
    "rimHeight": 4.0,
    "waterLevel": -2.0,
    "notes": "Generated by tools/mapgen-abbey.py (see its header for the layout). Deathmatch only.",
    "ops": ops,
    "props": props,
    "cores": [],
    "pads": [],
    "spawns": [{"team": 0, "x": 5.5, "z": 5.5}],
    "jumppads": [{"a": {"x": 5.5, "z": 22.5}, "b": {"x": 20.0, "z": 46.0}}],
}

with open("data/maps/abbey.json", "w") as f:
    json.dump(data, f, indent=1)
print("wrote data/maps/abbey.json", len(ops), "ops", len(props), "props")
