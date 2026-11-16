"""List painted tiles that are current, for plan.py's done list.

    python done.py <tiles-dir> <min-width>

Tiles narrower than <min-width> were painted before the overlap margin was
kept (512 px instead of 576), so they are left off the list and repainted.
Reads only the WebP header, so it needs nothing beyond the standard library.
"""

import os
import struct
import sys


def webp_width(path):
    with open(path, "rb") as f:
        head = f.read(30)
    kind = head[12:16]
    if kind == b"VP8 ":
        return struct.unpack("<H", head[26:28])[0] & 0x3FFF
    if kind == b"VP8L":
        return (struct.unpack("<I", head[21:25])[0] & 0x3FFF) + 1
    if kind == b"VP8X":
        return int.from_bytes(head[24:27], "little") + 1
    return 0


if __name__ == "__main__":
    folder, min_width = sys.argv[1], int(sys.argv[2])
    for name in sorted(os.listdir(folder)):
        if name.endswith(".webp") and webp_width(os.path.join(folder, name)) >= min_width:
            print(name[:-5])
