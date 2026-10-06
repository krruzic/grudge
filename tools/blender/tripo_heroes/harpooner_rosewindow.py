"""Brindle costume THE STAINED-GLASS LILY KING: a leaded stained-glass frog in a cobalt-and-green glass cope with a
rose-window chest and a gothic amber crown (harpooner_rosewindow_tripo.glb from tools/costume/
harpooner_rosewindow_concept.png) on the harpooner rig and clips, with his own whalebone bow and harpoons (repainted
as stained glass by prop_costumes: assets/costumes/harpooner/rosewindow/). The cope is its own mesh island: it is
re-weighted to the torso only (hips / spine / chest by height), so the legs stride underneath it instead of tearing
it."""

_sc = dict(globals())
exec(open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "harpooner.py")).read(), _sc)
globals().update({k: v for k, v in _sc.items() if k != "CFG" and not k.startswith("__")})

CFG = {
    **_sc["CFG"],
    "name": "harpooner",
    "src": "harpooner_rosewindow_tripo.glb",
    "out": "harpooner@rosewindow",
    "joints": {**_sc["CFG"]["joints"], "shoulder": (0.3, 1.0), "elbow": (0.45, 0.88), "wrist": (0.58, 0.74), "finger": (0.67, 0.62)},
    # No rope coil box: the bell and red rope are part of the body here.
    "rigid": [],
    # Team dye: the cobalt panes of the cope.
    "team_hue": (210, 240),
    "preskin": "skin_glass",
    "attach": _sc["CFG"]["attach"],
}
_sc["CFG"] = CFG

# One bone carries most of the glass torso (panes don't bend): the spine from 0.6 to 1.04 m, wide blends to the hips
# below and the chest (head / shoulders) above.
COPE = (("hips", 0.0), ("spine", 0.6), ("chest", 1.04))
BAND = 0.16


def skin_glass(src, arm):
    """On the A-pose mesh, before the arms are swung down (automatic arm weights crushed the rose window and tore
    the cope when they swung): the cope island (the big piece reaching well behind the body), the gold border
    islands lying on it, and the glass torso are weighted hips / spine / chest by height only."""
    me = src.data
    par = list(range(len(me.vertices)))

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x

    for e in me.edges:
        par[find(e.vertices[0])] = find(e.vertices[1])
    # The build splits the mesh along UV seams: join coincident vertices too.
    at = {}
    for v in me.vertices:
        key = tuple(round(c, 4) for c in v.co)
        if key in at:
            par[find(v.index)] = find(at[key])
        else:
            at[key] = v.index
    isl = {}
    for v in me.vertices:
        isl.setdefault(find(v.index), []).append(v.index)
    cope = None
    for i in isl.values():
        ys = [me.vertices[k].co.y for k in i]
        if len(i) > 3000 and max(ys) > 0.35 and (cope is None or len(i) > len(cope)):
            cope = i
    if not cope:
        print("cope: not found")
        return
    # The cope's gold lead border (and any trim) are separate islands: those lying against the cope move with it.
    from mathutils import kdtree

    kd = kdtree.KDTree(len(cope))
    for k in cope:
        kd.insert(me.vertices[k].co, k)
    kd.balance()
    cs = set(cope)
    frame = []
    for i in isl.values():
        if i[0] in cs or len(i) > 3000:
            continue
        near = sum(1 for k in i if kd.find(me.vertices[k].co)[2] < 0.03)
        if near > 0.3 * len(i):
            frame += i
    groups = {g.name: g for g in src.vertex_groups}
    for n in ("hips", "spine", "chest"):
        groups.setdefault(n, src.vertex_groups.new(name=n))

    def set_w(k, w):
        for g in list(me.vertices[k].groups):
            src.vertex_groups[g.group].remove([k])
        for n, x in w.items():
            groups[n].add([k], x, "REPLACE")

    for k in cope + frame:
        z = me.vertices[k].co.z
        w = {}
        for j, (n, z0) in enumerate(COPE):
            lo = 1.0 if j == 0 else min(1.0, max(0.0, (z - z0 + BAND / 2) / BAND))
            hi = 1.0 if j == len(COPE) - 1 else 1.0 - min(1.0, max(0.0, (z - COPE[j + 1][1] + BAND / 2) / BAND))
            if lo * hi > 0:
                w[n] = lo * hi
        set_w(k, w)
    # Body / shirt: automatic weights mixed the thighs and arms into his glass torso and tore it on every stride.
    # The torso (between the hips and the neck, inside the shoulders) is banded hips / spine / chest by height like
    # the cope; legs, arms and head keep their automatic weights. The middle of the belly hangs a little lower.
    fixed = 0
    for v in me.vertices:
        if v.index in cs:
            continue
        x, z = abs(v.co.x), v.co.z
        if z > 1.12 or x > 0.28 or not (z > 0.5 or (x < 0.13 and z > 0.4)):
            continue
        w = {}
        for j, (n, z0) in enumerate(COPE):
            lo = 1.0 if j == 0 else min(1.0, max(0.0, (z - z0 + BAND / 2) / BAND))
            hi = 1.0 if j == len(COPE) - 1 else 1.0 - min(1.0, max(0.0, (z - COPE[j + 1][1] + BAND / 2) / BAND))
            if lo * hi > 0:
                w[n] = lo * hi
        set_w(v.index, w)
        fixed += 1
    print("cope: frame", len(frame), "torso banded", fixed)
    print("cope: re-weighted", len(cope))
