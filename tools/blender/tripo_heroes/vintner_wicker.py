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
    "attach": [("attach_wicker", "vintner_wicker_millstone_tripo.glb"), ("attach_backanvil", "")],
}
_sc["CFG"] = CFG
STONE_TRIS = 1400
STONE_DIAM = 0.9


def attach_wicker(name, arm, src_path):
    """attach_anvil's weapon placement for the mallet, then the millstone (its thin axis against his back)."""
    reskin(name, arm)
    stone = th.import_prop(name + "_backanvil", src_path, tex=512)
    decimate(stone, STONE_TRIS)
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

    # Millstone: the disc's thin axis (smallest PCA spread) -> world -Y (out of his back), centred on the old anvil spot.
    co = np.array([v.co[:] for v in stone.data.vertices])
    c = co.mean(0)
    _, s, vt = np.linalg.svd(co - c, full_matrices=False)
    a0, a1, thin = vt[0], vt[1], vt[2]
    diam = np.ptp((co - c) @ a0)
    R = frame([Vector(a0), Vector(a1), Vector(thin)], [Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, 1, 0))])
    stone.data.transform(Matrix.Translation(Vector(BACK_AT)) @ R @ Matrix.Scale(STONE_DIAM / diam, 4) @ Matrix.Translation(-Vector(c)))
    rigid(stone, arm, "chest")
    stone.name = name + "_backanvil"
    _BACK.append(stone)
    return w
