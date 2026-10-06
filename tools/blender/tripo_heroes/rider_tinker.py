"""Bramble costume TINKER'S HIVE: a wind-up tin-toy badger riding MEAD rebuilt as an evil scrap-metal wasp, one Tripo
mesh (rider_tinker_full_tripo.glb from tools/costume/rider_tinker_concept.png: a concept painted over 4-view renders
of a Blender kit-bash, prompt in rider_tinker_concept_prompt.txt) on the rider rig and clips. Skinned like rider.py
(torso / hands / head bits by height / the wasp on hips) with three costume rules: the two perforated steel wings are
long blades rooted under the saddle (found by length, not position), the brass wind-up key - which Tripo left
floating behind her - is moved onto her back and turns on its own 'key' bone in every clip, and a big steel spanner
replaces the honey ladle. Team dye on her tin coat only."""

_sc = dict(globals())
_src = open(os.path.join(ROOT, "tools", "blender", "tripo_heroes", "rider.py")).read()
# reskin(): load this costume's source, classify before snapshotting the A-pose (classify moves the key), and make a
# 'key' vertex group.
_src = _src.replace('f"{name}_tripo.glb"', 'CFG.get("src", f"{name}_tripo.glb")')
_src = _src.replace(
    "    A = [v.co.copy() for v in me.vertices]\n    kinds = classify(me)",
    "    kinds = classify(me)\n    A = [v.co.copy() for v in me.vertices]",
)
_src = _src.replace('for n in list(bones) + ["wing_L", "wing_R"]:', 'for n in list(bones) + ["wing_L", "wing_R", "key"]:')
exec(_src, _sc)
globals().update({k: v for k, v in _sc.items() if k != "CFG" and not k.startswith("__")})

CFG = {
    **_sc["CFG"],
    "name": "rider",
    "src": "rider_tinker_full_tripo.glb",
    "out": "rider@tinker",
    # Her teal tin coat (and hat) take the team colour; nothing on the wasp.
    "team_hue": (160, 205),
    "team_box": ((-0.75, -0.5, 1.0), (0.75, 0.3, 1.86)),
    "attach": [("attach_tinker", "")],
    "clips": "tinker_clips",
}
_sc["CFG"] = CFG
# Wing bones at the blades' roots (measured on the mesh, mirrored), pointing back along the wasp.
_sc["WING_ROOT"] = (0.17, -0.38, 0.87)
KEY_ROOT = (-0.06, -0.02, 1.3)
KEY_MOVE = Vector(KEY_ROOT) - Vector((-0.27, 0.251, 1.268))


def tinker_classify(me):
    """rider.classify plus: wings = the two long thin blades (any position), key = every piece of the brass key
    (shaft and bow, all inside the box where Tripo left it floating behind her; moved onto her back here)."""
    out = []
    isl = islands(me)
    torso = max((i for i in isl if np.mean([me.vertices[k].co.z for k in i]) > 1.1), key=len)
    for i in isl:
        co = np.array([me.vertices[k].co[:] for k in i])
        c = co.mean(0)
        lo = co.min(0)
        ext = co.max(0) - lo
        if i is torso:
            kind = "torso"
        elif ext[0] > 0.6 and len(i) < 1000 and c[2] > 1.0:
            kind = "wing_L" if c[0] > 0 else "wing_R"
        elif (lo[0] > -0.4 and co.max(0)[0] < -0.12 and lo[1] > 0.18 and co.max(0)[1] < 0.9
              and lo[2] > 0.95 and co.max(0)[2] < 1.5):
            kind = "key"
            for k in i:
                me.vertices[k].co += KEY_MOVE
        elif abs(c[0]) > 0.45 and c[2] > 1.45 and c[1] < 0.2:
            kind = "hand_L" if c[0] > 0 else "hand_R"
        elif lo[2] > 1.1 and abs(c[0]) < 0.32 and -0.25 < c[1] < 0.4:
            kind = "band"
        else:
            kind = "hips"
        out.append((kind, i))
    return out


_sc["classify"] = tinker_classify

import charkit as _ck  # noqa: E402
import texgen as _tg  # noqa: E402


def _key_bone(arm):
    """A 'key' bone on her back (child of chest, pointing back) for the wind-up key to turn on."""
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones.new("key")
    eb.head = Vector(KEY_ROOT)
    eb.tail = Vector(KEY_ROOT) + Vector((0, 0.12, 0))
    eb.roll = 0.0
    eb.parent = arm.data.edit_bones["chest"]
    eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.pose.bones["key"].rotation_mode = "XYZ"


def attach_tinker(name, arm, _path):
    """The body re-skin (like attach_ladle's first step) plus the key bone; returns the spanner."""
    reskin(name, arm)
    _key_bone(arm)
    return attach_spanner(name, arm, _path)


def attach_spanner(name, arm, _path):
    """A big steel spanner in hand_R, posed like the ladle (long axis -X from the grip, jaw at the far end)."""
    images = _tg.build_all(os.path.join(ROOT, "assets", "textures"))
    c = _ck.Char(name + "_spanner", images)
    c.limb((0.16, 0, 0), (-0.62, 0, 0), 0.035, 0.03, "iron", "x", segs=6)
    c.box((0.12, 0.05, 0.04), (0.15, 0, 0), "leather", "x")
    c.box((0.18, 0.24, 0.07), (-0.7, 0, 0), "steel", "x")
    c.box((0.12, 0.06, 0.07), (-0.82, -0.09, 0), "steel", "x")
    c.box((0.12, 0.06, 0.07), (-0.82, 0.09, 0), "steel", "x")
    c.limb((-0.62, 0, 0.04), (-0.62, 0, 0.07), 0.04, 0.04, "gold", "x", segs=8)
    for k, col in enumerate(c.cols):
        c.cols[k] = tuple(x * 0.62 for x in col)
    w, _ = c.build({}, bpy.context.scene.collection)
    th.place_on_bone(w, arm, "hand_R", (0, 0, 0), LADLE_AXIS, LADLE_LEN, at=0.45, side=LADLE_OPEN)
    w.name = name + "_spanner"
    return w


def tinker_clips(clips):
    """rider_clips, plus the wind-up key turning (a full turn every 1.5 s) in every clip."""
    clips = rider_clips(clips)
    for cl in clips.values():
        n = max((f for keys in cl["bones"].values() for f, _ in keys), default=24)
        steps = max(4, round(n / 6))
        cl["bones"]["key"] = [(round(n * i / steps), (0, 360 * (n / 36) * i / steps, 0)) for i in range(steps + 1)]
    return clips
