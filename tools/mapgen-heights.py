import json

W, D = 80, 56
ops = []
def shape(shape, **kw):
    ops.append({"op": "shape", "shape": shape, **kw})
def cell(op, **kw):
    ops.append({"op": op, **kw})

ops.append({"op": "noise", "amp": 0.3, "scale": 0.12, "seed": 11})
shape("rect", x=-10, z=-10, w=100, h=11, y=4.5, edge=3, mode="max", wobble=2.5)
shape("rect", x=-10, z=55, w=100, h=11, y=4.5, edge=3, mode="max", wobble=2.5)
shape("rect", x=-10, z=-10, w=11, h=76, y=4.5, edge=3, mode="max", wobble=2.5)
shape("rect", x=1, z=13, w=39, h=26, y=0.35, edge=2, mode="set", wobble=1.0)

shape("rect", x=16, z=1, w=48, h=10, y=2.8, edge=0, mode="max")
shape("rect", x=4, z=2, w=12, h=9, y=2.8, edge=4.5, mode="max", wobble=0.6)
shape("circle", x=30, z=5, r=2.2, y=3.3, edge=2, mode="max", wobble=0.8)

shape("rect", x=1, z=19, w=12, h=18, y=1.0, edge=0, mode="set")
shape("rect", x=5, z=14, w=5, h=5, y=1.0, edge=3.5, mode="max", wobble=0.4)
shape("rect", x=5, z=37, w=5, h=3, y=1.0, edge=3, mode="max", wobble=0.4)
shape("rect", x=13, z=25, w=3, h=6, y=1.0, edge=3.5, mode="max", wobble=0.4)

shape("rect", x=33, z=22, w=14, h=12, y=2.2, edge=0, mode="max")
shape("rect", x=26, z=25, w=7, h=6, y=2.2, edge=5, mode="max", wobble=0.5)

shape("rect", x=14, z=41, w=52, h=14, y=-0.62, edge=2, mode="set", wobble=1.2)
shape("rect", x=5, z=40, w=10, h=8, y=0.3, edge=3, mode="max", wobble=0.8)
shape("circle", x=40, z=46, r=3.2, y=0.55, edge=1.5, mode="max", wobble=0.8)
shape("circle", x=24, z=51, r=2.2, y=0.45, edge=1.5, mode="max", wobble=0.8)
shape("circle", x=31, z=44, r=1.6, y=0.4, edge=1.2, mode="max", wobble=0.6)

cell("wall", style="rim", x=0, z=0, w=80, h=1)
cell("wall", style="rim", x=0, z=55, w=80, h=1)
cell("wall", style="rim", x=0, z=0, w=1, h=56)

cell("water", x=14, z=41, w=26, h=14)
cell("water", x=33, z=41, w=4, h=3, deep=True)
cell("water", x=19, z=53, w=4, h=2, deep=True)
cell("bridge", style="wood", y=0.2, x=15, z=46, w=10, h=2)
cell("bridge", style="wood", y=0.2, x=25, z=46, w=2, h=5)
cell("bridge", style="wood", y=0.2, x=27, z=49, w=10, h=2)
cell("bridge", style="wood", y=0.35, x=37, z=49, w=6, h=2)
cell("grass", x=38, z=43, w=4, h=2)
cell("grass", x=22, z=50, w=3, h=3)
cell("grass", x=30, z=43, w=2, h=2)

cell("paving", x=1, z=19, w=12, h=18)
cell("wall", style="castle", x=1, z=19, w=5, h=1)
cell("wall", style="castle", x=9, z=19, w=4, h=1)
cell("wall", style="castle", x=1, z=36, w=5, h=1)
cell("wall", style="castle", x=9, z=36, w=4, h=1)
cell("wall", style="castle", x=12, z=19, w=1, h=7)
cell("wall", style="castle", x=12, z=30, w=1, h=7)

cell("wall", style="ruin", x=15, z=39, w=11, h=1)
cell("wall", style="ruin", x=30, z=39, w=10, h=1)
cell("wall", style="ruin", x=36, z=21, w=2, h=1)
cell("wall", style="ruin", x=36, z=34, w=2, h=1)
cell("wall", style="ruin", x=34, z=23, w=1, h=1)
cell("wall", style="ruin", x=34, z=32, w=1, h=1)

cell("grass", x=20, z=2, w=5, h=4)
cell("grass", x=33, z=7, w=5, h=3)
cell("grass", x=17, z=30, w=4, h=5)
cell("grass", x=24, z=14, w=5, h=3)
cell("dirt", x=10, z=3, w=30, h=3)
cell("dirt", x=13, z=27, w=13, h=2)
cell("dirt", x=26, z=27, w=14, h=2)
cell("dirt", x=6, z=10, w=3, h=9)
cell("dirt", x=6, z=37, w=3, h=4)
cell("dirt", x=9, z=46, w=6, h=2)

props = []
def prop(t, x, z, **kw):
    props.append({"type": t, "x": x, "z": z, **kw})
prop("arch", 7.5, 19.5, rot=0)
prop("arch", 7.5, 36.5, rot=0)
prop("arch", 12.5, 28, rot=90)
for x, z in [(1.5, 19.5), (12.5, 19.5), (1.5, 36.5), (12.5, 36.5)]:
    prop("tower", x, z, solid=True)
prop("banner", 4, 21)
prop("banner", 4, 35)
prop("torch", 10.5, 26)
prop("torch", 10.5, 31)
prop("crate", 3, 24, solid=True)
prop("statue", 3, 32, solid=True)
prop("rock", 35.5, 25.5, solid=True)
prop("rock", 35.5, 30.5, solid=True)
prop("torch", 33.5, 26)
prop("torch", 33.5, 30)
prop("tower", 40.5, 3.5, solid=True)
prop("banner", 38, 8)
prop("rock", 27, 9, solid=True)
prop("rock", 18, 9, solid=True)
for x, z in [(22, 4), (35, 3), (26, 2)]:
    prop("pine", x, z)
for x, z in [(2.5, 3), (3, 12), (2, 44), (3, 51), (10, 53), (15, 17), (29, 16), (21, 37), (29, 36)]:
    prop("tree" if z > 13 else "pine", x, z)
for x, z in [(17, 19), (28, 20), (31, 37), (23, 23)]:
    prop("rock", x, z, solid=True)
prop("crate", 16, 47)
prop("torch", 40.5, 44)
prop("rock", 30, 52)

data = {
    "name": "Grudgecrag Heights",
    "blurb": "Three roads to war: a high ridge for ambushers, the relic crag in the middle, and a slow reed marsh. Pick your lane.",
    "emblem": "peak",
    "width": W,
    "depth": D,
    "mirror": "x",
    "rimHeight": 4.5,
    "waterLevel": -0.5,
    "notes": "Authored for the left half (x < 40) and mirrored across x = 40 by tools/mapgen-heights.py. Top: a high ridge (y 2.8) reached by a ramp from each base's north gate; its south face is a cliff you can drop off onto the middle field. Middle: the crag (y 2.2) with ramps east and west, cliffs north and south; the relic's home is on top. Bottom: a wadeable marsh with deep pools, a winding boardwalk and a reed island with the south neutral pad. A ruined wall separates the middle from the marsh, with one gap per side.",
    "ops": ops,
    "props": props,
    "cores": [{"team": 0, "x": 5, "z": 28}],
    "pads": [
        {"zone": "home", "x": 9, "z": 22.5},
        {"zone": "home", "x": 9, "z": 33.5},
        {"zone": "home", "x": 9.5, "z": 28},
        {"zone": "forward", "x": 20, "z": 23},
        {"zone": "forward", "x": 11, "z": 44},
        {"zone": "neutral", "x": 40, "z": 6},
        {"zone": "neutral", "x": 40, "z": 46},
    ],
    "spawns": [{"team": 0, "x": 7.5, "z": 31}],
}
json.dump(data, open("data/maps/heights.json", "w"), indent=1)
print("ok", len(ops), len(props))
