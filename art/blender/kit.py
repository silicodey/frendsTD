"""Shared Blender toolkit for frendsTD unit models (run with Blender's Python module, `bpy`).

Units are game units: a board cell is 1 wide, plinths are ~0.86 across. Blender is Z-up; the unit faces -Y
(glTF export turns that into the game's +Z forward, Y up).
"""
import math

import bpy  # must load before bmesh
import bmesh
from mathutils import Matrix, Vector

PI = math.pi


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ------------------------------------------------------------------ materials
def mat(name, color, metal=0.0, rough=0.4, emit=0.0, coat=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    c = tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lin = tuple(x ** 2.2 for x in c)
    p.inputs['Base Color'].default_value = (*lin, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.08
    if emit:
        p.inputs['Emission Color'].default_value = (*lin, 1)
        p.inputs['Emission Strength'].default_value = emit
    return m


# ------------------------------------------------------------------ mesh helpers
def _finish(obj, material, bevel=0.0, segs=3, smooth=True, angle=0.6):
    obj.data.materials.append(material)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if bevel > 0:
        md = obj.modifiers.new('bevel', 'BEVEL')
        md.width = bevel
        md.segments = segs
        md.limit_method = 'ANGLE'
        md.angle_limit = angle
        md.harden_normals = True
    wn = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
    wn.keep_sharp = True
    return obj


def _obj(name, mesh):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def prism(name, material, sides, r_bottom, r_top, height, z=0.0, rot=0.0, bevel=0.01, smooth_sides=False, at=(0, 0)):
    """A regular n-gon prism / frustum standing on z (rot turns it about Z)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=r_bottom, radius2=r_top, depth=height)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(at[0], at[1], z + height / 2))
    bm.to_mesh(me)
    bm.free()
    return _finish(_obj(name, me), material, bevel=bevel, smooth=True, angle=0.3 if smooth_sides else 0.6)


def profile(name, material, pts, thickness, bevel=0.01):
    """Extrude a 2D profile (x = outward, z = up) by `thickness` along Y, centred."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((x, -thickness / 2, z)) for x, z in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, thickness, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return _finish(_obj(name, me), material, bevel=bevel)


def box(name, material, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.004):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    o = _finish(_obj(name, me), material, bevel=bevel, segs=2)
    o.location = loc
    o.rotation_euler = rot
    return o


def sphere(name, material, r, loc=(0, 0, 0), segs=48, rings=24):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bm.to_mesh(me)
    bm.free()
    o = _finish(_obj(name, me), material, bevel=0)
    o.location = loc
    return o


def torus(name, material, R, r, loc=(0, 0, 0), rot=(0, 0, 0), major=96, minor=16):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for i in range(major):
        a = 2 * PI * i / major
        c = Vector((math.cos(a) * R, math.sin(a) * R, 0))
        n = Vector((math.cos(a), math.sin(a), 0))
        for j in range(minor):
            b = 2 * PI * j / minor
            bm.verts.new(c + n * (math.cos(b) * r) + Vector((0, 0, math.sin(b) * r)))
    bm.verts.ensure_lookup_table()
    for i in range(major):
        for j in range(minor):
            a, b = i * minor + j, i * minor + (j + 1) % minor
            c, d = ((i + 1) % major) * minor + (j + 1) % minor, ((i + 1) % major) * minor + j
            bm.faces.new((bm.verts[a], bm.verts[b], bm.verts[c], bm.verts[d]))
    bm.to_mesh(me)
    bm.free()
    o = _finish(_obj(name, me), material, bevel=0)
    o.location = loc
    o.rotation_euler = rot
    return o


def cylinder(name, material, r, h, loc=(0, 0, 0), rot=(0, 0, 0), segs=32, bevel=0.004):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r, depth=h)
    bm.to_mesh(me)
    bm.free()
    o = _finish(_obj(name, me), material, bevel=bevel, segs=2)
    o.location = loc
    o.rotation_euler = rot
    return o


def place_radial(obj, angle, radius, z=0.0):
    """Stand a part made in 'outward = +X' space at `angle` around the centre (angle 0 = toward the camera, -Y)."""
    a = angle - PI / 2
    obj.rotation_euler = (0, 0, a)
    obj.location = (math.cos(a) * radius, math.sin(a) * radius, z)
    return obj


def group(name, objs, pivot=(0, 0, 0)):
    """Parent parts under an empty (an animated group: it turns about its own origin)."""
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    e.location = pivot
    inv = Matrix.Translation(pivot).inverted()  # matrix_world isn't updated until the next depsgraph pass
    for o in objs:
        o.parent = e
        o.matrix_parent_inverse = inv
    return e


# ------------------------------------------------------------------ studio
def studio(res=1100, samples=96, cam_dist=3.0, elev_deg=33, azim_deg=-35, target=(0, 0, 0.42), lens=50):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Punchy'
    world = bpy.data.worlds.new('studio')
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.2, 0.2, 0.21, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    # a soft grey floor to catch shadows and contact AO
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    floor = bpy.context.object
    floor.data.materials.append(mat('floor', '#6a6b6f', rough=0.8))
    # key, fill and rim area lights
    def light(name, loc, power, size, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = power
        ld.size = size
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        bpy.context.collection.objects.link(lo)
        lo.location = loc
        d = Vector(target) - Vector(loc)
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    light('key', (-2.2, -2.4, 3.2), 260, 2.4)
    light('fill', (2.6, -1.4, 1.6), 90, 3.0, (0.92, 0.95, 1.0))
    light('rim', (0.8, 2.8, 2.4), 200, 1.6)
    cd = bpy.data.cameras.new('cam')
    cd.lens = lens
    cam = bpy.data.objects.new('cam', cd)
    bpy.context.collection.objects.link(cam)
    e, a = math.radians(elev_deg), math.radians(azim_deg)
    cam.location = (target[0] + math.sin(a) * math.cos(e) * cam_dist, target[1] - math.cos(a) * math.cos(e) * cam_dist, target[2] + math.sin(e) * cam_dist)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    return floor


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
