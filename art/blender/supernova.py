"""Supernova (Tokyo, legendary): a red star in two chrome gimbal rings, between two tall leaning pylons,
on a two-tier octagonal plinth. Built after the concept sheet.

    python art/blender/supernova.py <out dir>      (with the `bpy` module installed)
writes supernova.blend and supernova.png (studio render).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import kit  # noqa: E402
from kit import PI  # noqa: E402

OUT = sys.argv[-1] if len(sys.argv) > 1 else '.'
kit.reset()

gun = kit.mat('gunmetal', '#3A3D4C', metal=0.55, rough=0.36)
gun2 = kit.mat('gunmetal light', '#5A5D6E', metal=0.5, rough=0.32)
top = kit.mat('top face', '#24262f', metal=0.4, rough=0.5)
chrome = kit.mat('chrome', '#C9CAD3', metal=1.0, rough=0.14)
collar = kit.mat('collar', '#30323d', metal=0.6, rough=0.4)
slot = kit.mat('slot', '#FF2A62', emit=9)
star = kit.mat('star', '#E8104A', rough=0.22, emit=0.7, coat=1.0)

OCT = PI / 8
# plinth
kit.prism('lower tier', gun, 8, 0.47, 0.45, 0.16, z=0.0, rot=OCT, bevel=0.012)
kit.prism('chrome band', chrome, 8, 0.445, 0.425, 0.028, z=0.16, rot=OCT, bevel=0.006)
kit.prism('ledge', gun, 8, 0.425, 0.415, 0.02, z=0.188, rot=OCT, bevel=0.006)
kit.prism('upper tier', gun2, 8, 0.33, 0.3, 0.07, z=0.208, rot=OCT, bevel=0.01)
kit.prism('top face', top, 8, 0.26, 0.26, 0.01, z=0.276, rot=OCT, bevel=0.003)
for i in range(4):  # slot lights on the diagonal faces of the lower tier
    a = PI / 4 + i * PI / 2
    s = kit.box(f'slot {i}', slot, (0.012, 0.1, 0.022), bevel=0.002)
    kit.place_radial(s, a, 0.425, 0.08)

# pylons: tall leaning pylons left/right, short wedges front/back (profile: x = outward, z = up)
tall = [(-0.05, 0), (0.07, 0), (0.12, 0.3), (0.1, 0.6), (0.04, 0.68), (-0.02, 0.62), (0.02, 0.32)]
wedge = [(-0.06, 0), (0.08, 0), (0.06, 0.2), (0.0, 0.24), (-0.06, 0.2)]
for i in range(4):
    a = i * PI / 2
    is_tall = i % 2 == 1
    p = kit.profile(f'pylon {i}', gun2, tall if is_tall else wedge, 0.14 if is_tall else 0.16, bevel=0.016)
    kit.place_radial(p, a, 0.39, 0.16)
    s = kit.box(f'pylon slot {i}', slot, (0.012, 0.022, 0.13 if is_tall else 0.1), bevel=0.002)
    import mathutils  # noqa: E402
    # the slot sits on the outer face, leaning with it
    off = (0.1, 0, 0.16) if is_tall else (0.081, 0, 0.11)
    lean = 0.16 if is_tall else -0.1
    s.rotation_euler = (0, -lean, 0)
    s.location = off
    s.parent = p

# the star and its gimbal (animated groups)
STAR_Z = 0.56
st = kit.sphere('star', star, 0.135, (0, 0, STAR_Z))
kit.group('star spin', [st], (0, 0, STAR_Z))


def ring(name, R, rot):
    t = kit.torus(name, chrome, R, 0.018, (0, 0, STAR_Z), rot)
    parts = [t]
    for th in (0.25, 0.25 + PI):
        # collars sit on the ring in its own plane, before the ring's rotation
        c = kit.cylinder(f'{name} collar', collar, 0.03, 0.06, segs=24)
        c.location = (math.cos(th) * R, math.sin(th) * R, 0)
        c.rotation_euler = (PI / 2, 0, th)
        c.parent = t
    return kit.group(f'{name} spin', parts, (0, 0, STAR_Z))


ring('ring A', 0.215, (0.6, 0.45, 0.0))
ring('ring B', 0.245, (PI / 2 - 0.55, -0.35, 0.0))

kit.studio(target=(0, 0, 0.38), cam_dist=2.0, elev_deg=26, azim_deg=-32)
os.makedirs(OUT, exist_ok=True)
import bpy  # noqa: E402
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'supernova.blend'))
kit.render(os.path.join(OUT, 'supernova.png'))
print('triangles:', sum(len(o.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.loop_triangles) for o in bpy.data.objects if o.type == 'MESH' and o.name != 'Plane'))
