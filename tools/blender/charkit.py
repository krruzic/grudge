"""Character kit: build rigid-skinned low-poly characters from primitives.

Every part is bound 100% to one bone (N64-style rigid skinning). Characters
face -Y in Blender, which becomes +Z (toward the camera) in glTF / game space.
"""
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


def _mat_for(name, images):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 1.0
    key = name.split("_", 1)[1] if name.startswith("team_") else name
    if key == "eye":
        bsdf.inputs["Base Color"].default_value = (1.0, 0.85, 0.2, 1)
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.8, 0.1, 1)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    elif key in images:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = images[key]
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if key.startswith("face"):
            tex.interpolation = "Closest"
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            try:
                mat.surface_render_method = "DITHERED"
            except AttributeError:
                mat.blend_method = "CLIP"
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat


def _newell(pts):
    n = Vector((0, 0, 0))
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


class Char:
    def __init__(self, name, images):
        self.name = name
        self.images = images
        self.verts = []
        self.faces = []
        self.uvs = []
        self.cols = []
        self.fmat = []
        self.vbone = []
        self.mats = []

    def _mat_index(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def add_bm(self, bm, mat, bone, matrix=None, meters=0.9, shade=(1, 1, 1), uv_mode="box"):
        if matrix is not None:
            bm.transform(matrix)
        mi = self._mat_index(mat)
        center = Vector((0, 0, 0))
        for v in bm.verts:
            center += v.co
        center /= max(1, len(bm.verts))
        for f in bm.faces:
            pts = [l.vert.co.copy() for l in f.loops]
            n = _newell(pts)
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            base = len(self.verts)
            for p in pts:
                if uv_mode == "cyl":
                    d = p - center
                    u = math.atan2(d.y, d.x) / math.tau * 2
                    v = p.z / meters
                elif az >= ax and az >= ay:
                    u, v = p.x / meters, p.y / meters
                elif ax >= ay:
                    u, v = p.y / meters, p.z / meters
                else:
                    u, v = p.x / meters, p.z / meters
                self.verts.append(p)
                self.uvs.append((u, v))
                self.cols.append(shade)
                self.vbone.append(bone)
            self.faces.append(list(range(base, base + len(pts))))
            self.fmat.append(mi)
        bm.free()

    @staticmethod
    def xform(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        return (Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4()
                @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1)))

    def box(self, size, loc, mat, bone, rot=(0, 0, 0), **kw):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        self.add_bm(bm, mat, bone, self.xform(loc, rot, size), **kw)

    def cone(self, r1, r2, depth, loc, mat, bone, segs=6, rot=(0, 0, 0), cap=True, **kw):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, segments=segs, radius1=r1, radius2=r2, depth=depth)
        kw.setdefault("uv_mode", "cyl")
        self.add_bm(bm, mat, bone, self.xform(loc, rot), **kw)

    def limb(self, a, b, r1, r2, mat, bone, segs=6, **kw):
        a = Vector(a)
        b = Vector(b)
        d = b - a
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=d.length)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        m = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
        kw.setdefault("uv_mode", "cyl")
        self.add_bm(bm, mat, bone, m, **kw)

    def ico(self, r, loc, mat, bone, scale=(1, 1, 1), sub=1, rot=(0, 0, 0), deform=None, **kw):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
        if deform:
            for v in bm.verts:
                v.co = deform(v.co)
        self.add_bm(bm, mat, bone, self.xform(loc, rot, scale), **kw)

    def lathe(self, profile, loc, mat, bone, segs=8, sx=1.0, sy=1.0, rot=(0, 0, 0), phase=None, caps=True, **kw):
        bm = bmesh.new()
        rings = []
        ph = math.pi / segs if phase is None else phase
        for r, z in profile:
            if r <= 1e-6:
                rings.append([bm.verts.new((0, 0, z))])
                continue
            rings.append([
                bm.verts.new((math.cos(ph + i / segs * math.tau) * r * sx, math.sin(ph + i / segs * math.tau) * r * sy, z))
                for i in range(segs)
            ])
        for a, b in zip(rings, rings[1:]):
            if len(a) == 1 and len(b) == 1:
                continue
            for i in range(segs):
                j = (i + 1) % segs
                if len(a) == 1:
                    bm.faces.new((a[0], b[i], b[j]))
                elif len(b) == 1:
                    bm.faces.new((a[j], a[i], b[0]))
                else:
                    bm.faces.new((a[i], a[j], b[j], b[i]))
        if caps and len(rings[0]) > 1:
            bm.faces.new(list(reversed(rings[0])))
        if caps and len(rings[-1]) > 1:
            bm.faces.new(rings[-1])
        if caps:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        kw.setdefault("uv_mode", "cyl")
        self.add_bm(bm, mat, bone, self.xform(loc, rot), **kw)

    def lathe_ab(self, profile, a, b, mat, bone, segs=6, **kw):
        a = Vector(a)
        b = Vector(b)
        d = b - a
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        prof = [(r, t * d.length) for r, t in profile]
        before = len(self.verts)
        self.lathe(prof, (0, 0, 0), mat, bone, segs=segs, **kw)
        m = Matrix.Translation(a) @ q.to_matrix().to_4x4()
        for i in range(before, len(self.verts)):
            self.verts[i] = m @ self.verts[i]

    def tbox(self, bottom, top, h, loc, mat, bone, rot=(0, 0, 0), shift=(0, 0), **kw):
        bm = bmesh.new()
        bw, bd = bottom[0] / 2, bottom[1] / 2
        tw, td = top[0] / 2, top[1] / 2
        sx, sy = shift
        vs = [
            bm.verts.new((-bw, -bd, 0)), bm.verts.new((bw, -bd, 0)), bm.verts.new((bw, bd, 0)), bm.verts.new((-bw, bd, 0)),
            bm.verts.new((-tw + sx, -td + sy, h)), bm.verts.new((tw + sx, -td + sy, h)), bm.verts.new((tw + sx, td + sy, h)), bm.verts.new((-tw + sx, td + sy, h)),
        ]
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            bm.faces.new([vs[i] for i in f])
        self.add_bm(bm, mat, bone, self.xform(loc, rot), **kw)

    def decal(self, loc, w, h, mat, bone, rot=(0, 0, 0), curve=0.0, cols=3, shade=(1, 1, 1)):
        m = self.xform(loc, rot)
        mi = self._mat_index(mat)
        pts = []
        for i in range(cols + 1):
            t = i / cols
            x = (t - 0.5) * w
            y = curve * (2 * t - 1) ** 2
            pts.append((t, x, y))
        for i in range(cols):
            t0, x0, y0 = pts[i]
            t1, x1, y1 = pts[i + 1]
            quad = [((x0, y0, -h / 2), (t0, 0)), ((x1, y1, -h / 2), (t1, 0)), ((x1, y1, h / 2), (t1, 1)), ((x0, y0, h / 2), (t0, 1))]
            base = len(self.verts)
            for p, uv in quad:
                self.verts.append(m @ Vector(p))
                self.uvs.append(uv)
                self.cols.append(shade)
                self.vbone.append(bone)
            self.faces.append(list(range(base, base + 4)))
            self.fmat.append(mi)

    def tri_count(self):
        return sum(len(f) - 2 for f in self.faces)

    def build(self, bones, collection):
        for store in (bpy.data.objects, bpy.data.meshes, bpy.data.armatures):
            for nm in (self.name, self.name + "_rig"):
                old = store.get(nm)
                if old is not None and (store is bpy.data.objects or old.users == 0):
                    store.remove(old)
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        uv = mesh.uv_layers.new(name="UVMap")
        uv.data.foreach_set("uv", [c for u in self.uvs for c in u])
        col = mesh.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        flat = []
        for c in self.cols:
            flat.extend((c[0], c[1], c[2], 1.0))
        col.data.foreach_set("color", flat)
        mesh.color_attributes.active_color = col
        mesh.polygons.foreach_set("material_index", self.fmat)
        for m in self.mats:
            mesh.materials.append(_mat_for(m, self.images))
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        if not bones:
            smooth_weld(mesh)
            return obj, None

        arm_data = bpy.data.armatures.new(self.name + "_rig")
        arm = bpy.data.objects.new(self.name + "_rig", arm_data)
        collection.objects.link(arm)
        bpy.context.view_layer.objects.active = arm
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        arm.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        for name, (head, tail, parent) in bones.items():
            eb = arm_data.edit_bones.new(name)
            eb.head = Vector(head)
            eb.tail = Vector(tail)
            eb.roll = 0.0
            if parent:
                eb.parent = arm_data.edit_bones[parent]
        bpy.ops.object.mode_set(mode="OBJECT")

        groups = {}
        for name in bones:
            groups[name] = obj.vertex_groups.new(name=name)
        by_bone = {}
        for i, b in enumerate(self.vbone):
            by_bone.setdefault(b, []).append(i)
        for b, idx in by_bone.items():
            groups[b].add(idx, 1.0, "REPLACE")
        smooth_weld(mesh)
        obj.parent = arm
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        for pb in arm.pose.bones:
            pb.rotation_mode = "XYZ"
        return obj, arm


def smooth_weld(mesh, angle=50.0):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    dl = bm.verts.layers.deform.active
    groups = {}
    for v in bm.verts:
        key = (tuple(round(c, 4) for c in v.co), tuple(sorted(v[dl].keys())) if dl else ())
        groups.setdefault(key, []).append(v)
    targetmap = {}
    for vs in groups.values():
        for v in vs[1:]:
            targetmap[v] = vs[0]
    if targetmap:
        bmesh.ops.weld_verts(bm, targetmap=targetmap)
    lim = math.radians(angle)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) != 2:
            e.smooth = False
            continue
        a, b = e.link_faces
        e.smooth = a.normal.angle(b.normal, 0.0) < lim and a.material_index == b.material_index
    bm.to_mesh(mesh)
    bm.free()


def animate(arm, clips, fps=24):
    """clips: {name: {"length": frames, "bones": {bone: [(frame, (rx, ry, rz) degrees)]},
    "loc": {bone: [(frame, (x, y, z))]}}}"""
    scene = bpy.context.scene
    scene.render.fps = fps
    arm.animation_data_create()
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)
    for name, clip in clips.items():
        act = bpy.data.actions.get(name + "_" + arm.name)
        if act:
            bpy.data.actions.remove(act)
        act = bpy.data.actions.new(name + "_" + arm.name)
        arm.animation_data.action = act
        for pb in arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
        rots = dict(clip.get("bones", {}))
        rots.update(clip.get("rot", {}))
        for bone, keys in rots.items():
            pb = arm.pose.bones[bone]
            for frame, rot in keys:
                pb.rotation_euler = tuple(math.radians(r) for r in rot)
                pb.keyframe_insert("rotation_euler", frame=frame)
        for bone, keys in clip.get("loc", {}).items():
            pb = arm.pose.bones[bone]
            for frame, loc in keys:
                pb.location = loc
                pb.keyframe_insert("location", frame=frame)
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, act)
        strip.name = name
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)


def bake_ao(objs, samples=64):
    scene = bpy.context.scene
    hidden = []
    for o in scene.objects:
        if o not in objs and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    prev = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    for o in objs:
        m = o.data
        ao = m.color_attributes.get("AO") or m.color_attributes.new("AO", "BYTE_COLOR", "CORNER")
        m.color_attributes.active_color = ao
    for o in scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    for o in objs:
        m = o.data
        ao = m.color_attributes["AO"]
        col = m.color_attributes["Col"]
        n = len(col.data)
        a = [0.0] * (n * 4)
        c = [0.0] * (n * 4)
        ao.data.foreach_get("color", a)
        col.data.foreach_get("color", c)
        for i in range(n):
            f = 0.45 + 0.55 * a[i * 4]
            for k in range(3):
                c[i * 4 + k] *= f
        col.data.foreach_set("color", c)
        m.color_attributes.remove(ao)
        m.color_attributes.active_color = m.color_attributes["Col"]
    for o in hidden:
        o.hide_render = False
    try:
        scene.render.engine = prev
    except TypeError:
        pass


def export(objs, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_vertex_color="ACTIVE",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_skins=True,
        export_def_bones=False,
    )
    return os.path.getsize(path)


def turntable(objs, path, size=512):
    """Render a 4-view turntable strip of the character with Workbench."""
    scene = bpy.context.scene
    prev_engine = scene.render.engine
    try:
        scene.render.engine = "BLENDER_WORKBENCH"
    except TypeError:
        pass
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = False
    hidden = []
    for o in scene.objects:
        if o not in objs and o.type != "CAMERA" and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    cam_data = bpy.data.cameras.get("TT_cam") or bpy.data.cameras.new("TT_cam")
    cam = bpy.data.objects.get("TT_cam") or bpy.data.objects.new("TT_cam", cam_data)
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.6
    prev_cam = scene.camera
    scene.camera = cam
    paths = []
    for i, ang in enumerate((0, 90, 180, 270)):
        a = math.radians(ang)
        d = 6
        cam.location = (math.sin(a) * d, -math.cos(a) * d, 1.0 + 1.2)
        cam.rotation_euler = (math.radians(78), 0, a)
        p = path.replace(".png", f"_{i}.png")
        scene.render.filepath = p
        bpy.ops.render.render(write_still=True)
        paths.append(p)
    for o in hidden:
        o.hide_render = False
    scene.camera = prev_cam
    try:
        scene.render.engine = prev_engine
    except TypeError:
        pass
    return paths
