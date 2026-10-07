"""Bramble costume TINKER'S HIVE: a wind-up tin-toy badger riding MEAD rebuilt as an evil scrap-metal wasp, one Tripo
mesh (rider_tinker_full_tripo.glb from tools/costume/rider_tinker_concept.png: a concept painted over 4-view renders
of a Blender kit-bash, prompt in rider_tinker_concept_prompt.txt) on the rider rig and clips. Skinned like rider.py
(torso / hands / head bits by height / the wasp on hips) with three costume rules: the two perforated steel wings are
long blades rooted under the saddle (found by length, not position), the brass wind-up key - which Tripo left
floating behind her - is moved onto her back and turns on its own 'key' bone in every clip, and a big steel spanner
replaces the honey ladle. Team dye on her tin coat only.

The wasp walks: six leg bones (rooted under the thorax) and an abdomen bone (at the pipe behind the thorax) are
added and the hips-only wasp weights split onto them (wasp_rig). Idle and run stand on the ground (no hover) with a
tripod gait in run (front + rear legs of one side with the middle leg of the other), the abdomen sways side to side
in every clip, and the legs tuck up in flight and curl in death."""

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


# Wasp legs, measured on the mesh: root under the thorax and foot on the ground, (x, y) for the left (+x) side;
# the right side mirrors x. Front is -y.
LEGS = {"F": ((0.2, -0.48), (0.445, -0.76)), "M": ((0.2, -0.27), (0.615, -0.23)), "R": ((0.2, -0.06), (0.515, 0.22))}
LEG_Z = 0.45
ABDOMEN_ROOT = (0.0, 0.2, 0.75)


def _wasp_bones(arm):
    """leg_FL..leg_RR at the leg roots and 'abdomen' at the pipe, all children of hips and pointing +Y with no roll,
    so their local axes are the model's: Z swings a leg fore/aft (or the abdomen side to side), Y lifts a leg."""
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    names = []
    for k, ((rx, ry), _) in LEGS.items():
        for side, sx in (("L", 1), ("R", -1)):
            eb = arm.data.edit_bones.new(f"leg_{k}{side}")
            eb.head = Vector((rx * sx, ry, LEG_Z))
            eb.tail = eb.head + Vector((0, 0.08, 0))
            eb.roll = 0.0
            eb.parent = arm.data.edit_bones["hips"]
            eb.use_connect = False
            names.append(eb.name)
    eb = arm.data.edit_bones.new("abdomen")
    eb.head = Vector(ABDOMEN_ROOT)
    eb.tail = Vector(ABDOMEN_ROOT) + Vector((0, 0.25, 0))
    eb.roll = 0.0
    eb.parent = arm.data.edit_bones["hips"]
    eb.use_connect = False
    names.append("abdomen")
    bpy.ops.object.mode_set(mode="OBJECT")
    for n in names:
        arm.pose.bones[n].rotation_mode = "XYZ"
    return names


def _smooth(x, a, b):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def wasp_rig(name, arm):
    """Split the wasp's hips weights: behind the thorax (pipe and drill abdomen, below the saddle) onto 'abdomen';
    below the thorax and out to the sides onto the nearest leg (by where each leg runs from root to foot seen from
    above), blended into hips where the legs meet the body."""
    src = bpy.data.objects[name]
    for n in _wasp_bones(arm):
        src.vertex_groups.new(name=n)
    hips = src.vertex_groups["hips"].index
    legs = [(f"leg_{k}{side}", sx, r, f) for k, (r, f) in LEGS.items() for side, sx in (("L", 1), ("R", -1))]
    moved = {n: 0 for n, *_ in legs} | {"abdomen": 0}
    for v in src.data.vertices:
        gs = {g.group: g.weight for g in v.groups if g.weight > 1e-4}
        if list(gs) != [hips]:
            continue
        x, y, z = v.co
        if z > 0.95:
            continue
        w_ab = _smooth(y, 0.15, 0.25) if z < 0.95 else 0.0
        if w_ab > 0:
            src.vertex_groups["hips"].add([v.index], 1 - w_ab, "REPLACE")
            src.vertex_groups["abdomen"].add([v.index], w_ab, "ADD")
            moved["abdomen"] += 1
            continue
        if z > 0.52 or abs(x) < 0.1 or y < -0.98 or y > 0.32:
            continue
        w = _smooth(abs(x), 0.1, 0.2) * (1 - _smooth(z, 0.44, 0.52))
        if w <= 0:
            continue
        # Expected y of each same-side leg at this |x| (root -> foot as a straight line seen from above).
        best, bd = None, 9.0
        for n, sx, (rx, ry), (fx, fy) in legs:
            if sx * x <= 0:
                continue
            t = max(0.0, min(1.0, (abs(x) - rx) / (fx - rx)))
            d = abs(y - (ry + (fy - ry) * t))
            if d < bd:
                best, bd = n, d
        src.vertex_groups["hips"].add([v.index], 1 - w, "REPLACE")
        src.vertex_groups[best].add([v.index], w, "ADD")
        moved[best] += 1
    print("wasp_rig", moved)


def attach_tinker(name, arm, _path):
    """The body re-skin (like attach_ladle's first step) plus the key bone and the wasp's leg / abdomen bones;
    returns the spanner."""
    reskin(name, arm)
    _key_bone(arm)
    wasp_rig(name, arm)
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


LEG_NAMES = [f"leg_{k}{s}" for k in "FMR" for s in "LR"]
# Tripod gait: front and rear legs of one side step with the middle leg of the other.
TRIPOD = {"leg_FL": 0.0, "leg_MR": 0.0, "leg_RL": 0.0, "leg_FR": 0.5, "leg_ML": 0.5, "leg_RR": 0.5}


def leg_rot(name, fwd, lift):
    """Pose rotation for a leg: `fwd` degrees swung toward the head, `lift` degrees raised off the ground."""
    sx = 1 if name.endswith("L") else -1
    return (0, -lift * sx, -fwd * sx)


def gait(n, swing=16, lift=22, samples=8):
    """One tripod cycle over n frames: each leg swings forward lifted for half the cycle, then pushes back planted."""
    out = {}
    for b, ph in TRIPOD.items():
        keys = []
        for i in range(samples + 1):
            u = (i / samples + ph) % 1.0
            if u < 0.5:
                s = u / 0.5
                fwd, up = -swing + 2 * swing * s, lift * math.sin(math.pi * s)
            else:
                s = (u - 0.5) / 0.5
                fwd, up = swing - 2 * swing * s, 0.0
            keys.append((round(n * i / samples), leg_rot(b, fwd, up)))
        out[b] = keys
    return out


def legs_pose(n, fwd=0, lift=0):
    return {b: [(0, leg_rot(b, fwd, lift)), (n, leg_rot(b, fwd, lift))] for b in LEG_NAMES}


def sway(n, amp, cycles=1, pitch=0):
    """Abdomen swinging side to side (cycles full swings over the clip), with an optional pitch bob."""
    steps = max(8, cycles * 8)
    return [
        (round(n * i / steps), (pitch * math.sin(4 * math.pi * cycles * i / steps), 0,
                                amp * math.sin(2 * math.pi * cycles * i / steps)))
        for i in range(steps + 1)
    ]


def tinker_clips(clips):
    """rider_clips, plus: the wind-up key turning (a full turn every 1.5 s) in every clip; the wasp standing and
    walking on its six legs in idle / run (no hover, a tripod gait in run); its abdomen swaying in every clip; legs
    tucked in flight and curled in death."""
    clips = rider_clips(clips)
    for cl in clips.values():
        n = max((f for keys in cl["bones"].values() for f, _ in keys), default=24)
        steps = max(4, round(n / 6))
        cl["bones"]["key"] = [(round(n * i / steps), (0, 360 * (n / 36) * i / steps, 0)) for i in range(steps + 1)]
        cl["bones"].update(legs_pose(n))
        cl["bones"]["abdomen"] = sway(n, 7, max(1, round(n / 24)))
    # Idle: standing, a slow tail sway and a little weight shift.
    idle = clips["idle"]
    idle["loc"]["hips"] = [(0, (0, 0.0, 0)), (24, (0, 0.025, 0)), (48, (0, 0.0, 0))]
    idle["bones"]["hips"] = [(0, (0, 0, 0)), (24, (1.5, 0, 0)), (48, (0, 0, 0))]
    idle["bones"]["abdomen"] = sway(48, 10, 1, pitch=3)
    idle["bones"].update(legs_pose(48))
    # Run: walking on the ground, one tripod cycle per loop, a small body bounce on each step and the tail swinging.
    run = clips["run"]
    # (Kept small: planted feet ride the body, so a bigger bounce / roll lifts them off the ground.)
    run["loc"]["hips"] = [(f, (0, 0.012 * abs(math.sin(2 * math.pi * f / 16)), 0)) for f in range(0, 17, 2)]
    run["bones"]["hips"] = [(f, (3, 0, 1.0 * math.sin(2 * math.pi * f / 16))) for f in range(0, 17, 2)]
    run["bones"].update(gait(16))
    run["bones"]["abdomen"] = sway(16, 14, 1, pitch=4)
    # Flying: legs tucked up and back.
    clips["fly"]["bones"].update(legs_pose(16, fwd=-25, lift=35))
    # Death: legs curl in.
    clips["death"]["bones"].update(
        {b: [(0, leg_rot(b, 0, 0)), (8, leg_rot(b, 10, 30)), (16, leg_rot(b, 15, 45))] for b in LEG_NAMES}
    )
    clips["death"]["bones"]["abdomen"] = [(0, (0, 0, 0)), (6, (-10, 0, 12)), (16, (-25, 0, 5))]
    return clips
