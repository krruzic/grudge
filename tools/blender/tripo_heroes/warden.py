"""Thorn (warden): Tripo treant body, Tripo bark shield strapped to the left forearm."""

WARM = {"tint": (1.3, 0.92, 0.62), "amount": 0.85, "below": 0.32}

CFG = {
    "yaw": -90,
    "height": 2.25,
    "weight": 1.15,
    "tex": 1024,
    "joints": {
        "hip": 0.84,
        "chest": 1.2,
        "neck": 1.4,
        "head_top": 2.2,
        "head_y": -0.12,
        "shoulder": (0.38, 1.42),
        "elbow": (0.55, 1.0),
        "wrist": (0.6, 0.68),
        "finger": (0.62, 0.3),
        "leg_x": 0.25,
        "knee": 0.47,
        "ankle": 0.1,
    },
    "rigid": [],
    "team_hue": (190, 250),
    "warm": WARM,
    "attach": [("attach_shield", "warden_shield_tripo.glb")],
}


def attach_shield(name, arm, src_path):
    bpy.ops.import_scene.gltf(filepath=src_path)
    w = [o for o in bpy.context.selected_objects if o.type == "MESH"][0]
    for o in list(bpy.context.selected_objects):
        if o is not w:
            bpy.data.objects.remove(o, do_unlink=True)
    w.parent = None
    w.data.transform(w.matrix_world)
    w.matrix_world = Matrix.Identity(4)
    dec = w.modifiers.new("dec", "DECIMATE")
    dec.ratio = 0.22
    dec.delimit = {"UV"}
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier=dec.name)
    img, px = th.tex_lookup(w)
    orig = th.team_faces

    def compact(src, cfg, cols):
        uv = src.data.uv_layers.active.data
        out = []
        for p, f in zip(src.data.polygons, orig(src, cfg, cols)):
            us = [uv[i].uv.x for i in p.loop_indices]
            vs = [uv[i].uv.y for i in p.loop_indices]
            out.append(f and max(us) - min(us) < 0.05 and max(vs) - min(vs) < 0.05)
        return out

    th.team_faces = compact
    try:
        th.bake_material(name + "_shield", w, {"tex": 512, "team_hue": (190, 250), "warm": WARM}, img, px, th.face_colors(w, px))
    finally:
        th.team_faces = orig
    fb = arm.data.bones["forearm_L"]
    th.place_on_bone(w, arm, "forearm_L", (0.0, 0.0, -0.25), fb.tail_local - fb.head_local, 0.75, at=0.6, side=(0, 1, 0))
    w.name = name + "_shield"
    return w
