"""Gristle costume THE HARVEST WICKER BOAR: the village harvest effigy - a boar woven from dark willow wicker and bound
straw, amber lantern eyes, festival ribbons (vintner_wicker_tripo.glb from tools/costume/vintner_wicker_concept.png)
on the vintner rig, skinning and clips, swinging a wooden threshing mallet (vintner_wicker_mallet_tripo.glb) with a
strapped millstone on his back (vintner_wicker_millstone_tripo.glb) where the anvil was - both from
vintner_wicker_props.png. The mallet goes through the anvil hammer's placement; the millstone lies flat against his
back."""

_sc = dict(globals())
_src = open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "vintner.py")).read()
# reskin() reloads the source by hero name: point it at this costume's body.
_src = _src.replace('f"{name}_tripo.glb"', 'CFG.get("src", f"{name}_tripo.glb")')
exec(_src, _sc)
globals().update({k: v for k, v in _sc.items() if k != "CFG" and not k.startswith("__")})

CFG = {
    **_sc["CFG"],
    "name": "vintner",
    "src": "vintner_wicker_tripo.glb",
    "out": "vintner@wicker",
    "hammer": "vintner_wicker_mallet_tripo.glb",
    # Team dye on the ribbons only would be too little to read: the festival sash's green stripe.
    "team_hue": (95, 150),
    # The dark wicker and straw baked dull and murky in game: lift the browns / golds (hue kept).
    "vivid": {"hue": (0, 60), "pull": 0.0, "sat": 1.45, "val": 1.45, "min_sat": 0.05},
    "attach": [("attach_wicker", "vintner_wicker_millstone_tripo.glb"), ("attach_backanvil", "")],
}
_sc["CFG"] = CFG
STONE_DIAM = 0.78
# Centre of the stone: high on his back, just behind the shoulder blades.
STONE_AT = (0.0, 0.3, 1.4)


def attach_wicker(name, arm, src_path):
    """attach_anvil's weapon placement for the mallet, then the millstone (its thin axis against his back)."""
    reskin(name, arm)
    stone = th.import_prop(name + "_backanvil", src_path, tex=512)
    w = th.import_prop(name + "_anvil", os.path.join(os.path.dirname(src_path), CFG["hammer"]), tex=512)
    decimate(w, WEAPON_TRIS)
    co = np.array([v.co[:] for v in w.data.vertices])
    c = co.mean(0)
    _, _, vt = np.linalg.svd(co - c, full_matrices=False)
    ax = vt[0]
    t = (co - c) @ ax
    lo, hi = t.min(), t.max()
    wid = lambda m: np.linalg.norm((co[m] - c) - np.outer(t[m], ax), axis=1).max()
    if wid(t < lo + (hi - lo) * 0.2) > wid(t > hi - (hi - lo) * 0.2):
        ax, t, lo, hi = -ax, -t, -hi, -lo
    side = vt[2]
    up = np.cross(side, ax)
    L = hi - lo
    grip = c + ax * (lo + L * WEAPON_GRIP)
    hb = arm.data.bones["hand_R"]
    g = hb.head_local + (hb.tail_local - hb.head_local) * 0.5
    d = Vector(WEAPON_AXIS).normalized()
    sx = Vector(WEAPON_SIDE)
    sx = (sx - d * sx.dot(d)).normalized()
    R = frame([Vector(ax), Vector(up), Vector(side)], [d, sx, d.cross(sx)])
    w.data.transform(Matrix.Translation(g) @ R @ Matrix.Scale(WEAPON_LEN / L, 4) @ Matrix.Translation(-Vector(grip)))
    rigid(w, arm, "hand_R")
    w.name = name + "_anvil"

    # Millstone: the disc's face normal from the surface (area-weighted normal tensor - the two flat faces dominate;
    # the dangling rope loop threw a plain PCA off and turned the stone on edge), laid flat
    # against his upper back.
    me = stone.data
    T = np.zeros((3, 3))
    for p in me.polygons:
        n = np.array(p.normal[:])
        T += p.area * np.outer(n, n)
    ev, evec = np.linalg.eigh(T)
    nrm = evec[:, -1]
    co = np.array([v.co[:] for v in me.vertices])
    c = np.median(co, 0)
    inplane = (co - c) - np.outer((co - c) @ nrm, nrm)
    # Nothing is trimmed: a radius cut that dropped the rope loop also bit a hole in the rim.
    rad = np.percentile(np.linalg.norm(inplane, axis=1), 98)
    co = np.array([v.co[:] for v in me.vertices])
    c = (co.min(0) + co.max(0)) / 2
    e1 = np.cross(nrm, [0, 0, 1.0])
    if np.linalg.norm(e1) < 0.1:
        e1 = np.cross(nrm, [1.0, 0, 0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(nrm, e1)
    # Target axes must stay right-handed (X, -Z, Y): (X, Z, Y) mirrored the stone and turned it inside out.
    R = frame([Vector(e1), Vector(e2), Vector(nrm)], [Vector((1, 0, 0)), Vector((0, 0, -1)), Vector((0, 1, 0))])
    stone.data.transform(Matrix.Translation(Vector(STONE_AT)) @ R @ Matrix.Scale(STONE_DIAM / (2 * rad), 4) @ Matrix.Translation(-Vector(c)))
    rigid(stone, arm, "chest")
    stone.name = name + "_backanvil"
    _BACK.append(stone)
    return w
