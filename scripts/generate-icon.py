"""Original StudyDesk artwork. Python standard library; no paid assets."""
import math
import struct
import zlib
from pathlib import Path

size = 1024

def rounded(x, y, left, top, right, bottom, radius):
    cx = max(left + radius, min(x, right - radius))
    cy = max(top + radius, min(y, bottom - radius))
    return math.hypot(x - cx, y - cy) < radius and left <= x <= right and top <= y <= bottom

rows = []
for y in range(size):
    row = bytearray()
    for x in range(size):
        color = (0, 0, 0, 0)
        if rounded(x, y, 38, 38, 986, 986, 215):
            t = y / size
            color = (int(108 - t * 40), int(135 - t * 39), int(99 - t * 37), 255)
            # Warm two-page notebook, a central spine, and quiet desk line.
            if rounded(x, y, 221, 272, 490, 663, 28) or rounded(x, y, 517, 272, 786, 663, 28):
                color = (244, 241, 220, 255)
            if 480 <= x <= 526 and 303 <= y <= 683:
                color = (218, 222, 195, 255)
            if rounded(x, y, 281, 354, 425, 367, 6) or rounded(x, y, 281, 408, 425, 421, 6) or rounded(x, y, 281, 462, 393, 475, 6):
                color = (172, 187, 151, 255)
            if rounded(x, y, 579, 354, 724, 367, 6) or rounded(x, y, 579, 408, 724, 421, 6) or rounded(x, y, 579, 462, 692, 475, 6):
                color = (172, 187, 151, 255)
            if rounded(x, y, 177, 711, 831, 739, 14):
                color = (232, 234, 206, 255)
            if rounded(x, y, 246, 731, 269, 798, 11) or rounded(x, y, 739, 731, 762, 798, 11):
                color = (209, 219, 185, 255)
        row.extend(color)
    rows.append(b'\0' + row)

def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)

out = Path(__file__).resolve().parents[1] / 'build'
out.mkdir(exist_ok=True)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')
(out / 'icon.png').write_bytes(png)
print(out / 'icon.png')
