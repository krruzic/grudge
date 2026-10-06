"""Hollin costume BEEKEEPER: her original beekeeping-abbess Tripo body (scribe_bee_tripo.glb) on the same rig and
clips, with a giant honey dipper (scribe_dipper_tripo.glb, scribe_dipper_prompt.txt) in hand_R instead of the quill."""

_sc = dict(globals())
exec(open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "scribe.py")).read(), _sc)
# Everything scribe.py defines (skinning, clips, helpers), so CFG names resolve exactly as for her base model.
globals().update({k: v for k, v in _sc.items() if k != "CFG" and not k.startswith("__")})

CFG = {
    **_sc["CFG"],
    "name": "scribe",
    "src": "scribe_bee_tripo.glb",
    "out": "scribe@beekeeper",
    "attach": [("attach_dipper", "scribe_dipper_tripo.glb")],
}
# scribe.py's functions read their own module's CFG: point it at this one (src = the bee body).
_sc["CFG"] = CFG


def attach_dipper(name, arm, path):
    """Like attach_quill, but the dipper's ends come from its principal axis (the wide end is the dipper head, carried up)."""
    reskin(name, arm)
    w = th.import_prop(name + "_quill", path, tex=512)
    decimate(w, _sc["QUILL_TRIS"])
    co = np.array([v.co[:] for v in w.data.vertices])
    c = co.mean(0)
    _, _, vt = np.linalg.svd(co - c, full_matrices=False)
    ax = vt[0]
    t = (co - c) @ ax
    lo, hi = t.min(), t.max()
    wid = lambda m: np.linalg.norm((co[m] - c) - np.outer(t[m], ax), axis=1).max()
    if wid(t < lo + (hi - lo) * 0.2) > wid(t > hi - (hi - lo) * 0.2):
        ax, t, lo, hi = -ax, -t, -hi, -lo
    nib, tip = Vector(c + ax * lo), Vector(c + ax * hi)
    d = (tip - nib).normalized()
    grip = nib + (tip - nib) * _sc["QUILL_AT"]
    q = d.rotation_difference(Vector((-1, 0, 0)))
    w.data.transform(q.to_matrix().to_4x4() @ Matrix.Translation(-grip))
    th.place_on_bone(w, arm, "hand_R", (0, 0, 0), _sc["QUILL_AXIS"], _sc["QUILL_LEN"] * 1.24 * 0.8 / (hi - lo), at=0.5, side=(1, 0, 0))
    w.name = name + "_quill"
    return w
