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
    "attach": [("attach_cope", "")] + _sc["CFG"]["attach"],
}
_sc["CFG"] = CFG

COPE = (("hips", 0.0), ("spine", 0.75), ("chest", 0.95))


def attach_cope(name, arm, _path):
    """Re-weight the cope island (the big piece that reaches well behind the body) to hips / spine / chest by
    height, blended over 8 cm. Returns nothing to export (the body object already carries it)."""
    src = bpy.data.objects[name]
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
        return None
    groups = {g.name: g for g in src.vertex_groups}
    for n in ("hips", "spine", "chest"):
        groups.setdefault(n, src.vertex_groups.new(name=n))
    for k in cope:
        v = me.vertices[k]
        for g in list(v.groups):
            src.vertex_groups[g.group].remove([k])
        z = v.co.z
        w = {}
        for j, (n, z0) in enumerate(COPE):
            lo = 1.0 if j == 0 else min(1.0, max(0.0, (z - z0 + 0.04) / 0.08))
            hi = 1.0 if j == len(COPE) - 1 else 1.0 - min(1.0, max(0.0, (z - COPE[j + 1][1] + 0.04) / 0.08))
            if lo * hi > 0:
                w[n] = lo * hi
        for n, x in w.items():
            groups[n].add([k], x, "REPLACE")
    print("cope: re-weighted", len(cope))
    return None
