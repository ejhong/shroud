"""Extract a front-surface control from Moraes's CC BY 4.0 Blender 2.91 model.

Usage: python3 scripts/prepare-cloth-head.py /path/to/Body_3D.blend
No Blender installation or third-party Python packages are required. This reads
the stored mesh only; it does not evaluate Blender modifiers or cloth dynamics.
Source: https://doi.org/10.6084/m9.figshare.29645060
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path
from blend_reader import Blend

path = Path(sys.argv[1])
blend = Blend(path)
mesh = next(block['data'] for block in blend.blocks
            if blend.structs[block['sdna']]['type'] == 'Mesh')
raw = blend.readptr(blend.get(mesh, 'Mesh', 'mvert'))
vertices = [struct.unpack_from('<3f', raw, i) for i in range(0, len(raw), 20)]
polygons = blend.readptr(blend.get(mesh, 'Mesh', 'mpoly'))
loops = blend.readptr(blend.get(mesh, 'Mesh', 'mloop'))

# Local -Z is toward the crown, +Y is toward the face. Ten model millimetres
# per stored unit is an explicit display scale, not a Shroud measurement.
width, height = 121, 149
size_x, size_y = 240, 296
coords = [((x * 10 + 120) / size_x * (width - 1),
           (z * 10 + 920) / size_y * (height - 1),
           (y - 3) * 10) for x, y, z in vertices]
surface = [0.] * (width * height)
mask = [0] * len(surface)
for offset in range(0, len(polygons), 12):
    start, count = struct.unpack_from('<2i', polygons, offset)
    ids = [struct.unpack_from('<I', loops, (start + j) * 8)[0] for j in range(count)]
    if min(vertices[i][2] for i in ids) > -60:
        continue
    for j in range(1, count - 1):
        a, b, c = [coords[i] for i in (ids[0], ids[j], ids[j + 1])]
        determinant = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(determinant) < 1e-8:
            continue
        for row in range(max(0, math.ceil(min(a[1], b[1], c[1]))),
                         min(height - 1, math.floor(max(a[1], b[1], c[1]))) + 1):
            for col in range(max(0, math.ceil(min(a[0], b[0], c[0]))),
                             min(width - 1, math.floor(max(a[0], b[0], c[0]))) + 1):
                u = ((b[1] - c[1]) * (col - c[0]) + (c[0] - b[0]) * (row - c[1])) / determinant
                v = ((c[1] - a[1]) * (col - c[0]) + (a[0] - c[0]) * (row - c[1])) / determinant
                if min(u, v, 1 - u - v) >= -1e-7:
                    depth = u * a[2] + v * b[2] + (1 - u - v) * c[2]
                    if depth > surface[row * width + col]:
                        surface[row * width + col] = depth
                        mask[row * width + col] = 1

record = {
    'id': 'moraes-head-front-1',
    'title': 'Head front surface, adapted from human_3-base',
    'creator': 'Cicero Moraes',
    'source': 'https://doi.org/10.6084/m9.figshare.29645060',
    'license': 'CC BY 4.0',
    'licenseURL': 'https://creativecommons.org/licenses/by/4.0/',
    'originalFile': 'Data_Shroud_of_Turin/Body_3D.blend',
    'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
    'changes': 'Stored mesh only; head cropped, frontmost surface rasterized at 2 mm spacing, depth rounded to 0.01 mm. No modifiers, photographic texture, or original cloth simulation.',
    'coordinates': {'x': '10 * local X', 'yDown': '10 * local Z + 920', 'z': '10 * (local Y - 3)', 'unit': 'assumed model mm', 'width': size_x, 'height': size_y},
    'width': width, 'height': height,
    'data': [round(value, 2) for value in surface],
    'mask': mask,
}
destination = Path(__file__).resolve().parent.parent / 'assets/models/moraes-head.json'
destination.write_text(json.dumps(record, separators=(',', ':')) + '\n')
print(f'{destination.name}: {width} × {height}, {sum(mask)} surface samples; max depth {max(surface):.2f} model mm')
