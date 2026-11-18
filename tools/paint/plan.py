"""Choose the city tiles one painter shard should do next.

    python plan.py <meta.json> <done.txt> <shard> <shards> <max> [A|B] > tiles.json

Tiles are 1024 x 1024 world px (see render.cjs). Every tile that touches the
map is listed, nearest to Connaught Place first, minus those already in
done.txt (one "tx_ty" per line); shard k of N takes every Nth of the rest.

Painting goes in two passes, like a chessboard. Pass A takes the "white"
tiles ((tx + ty) even), painted from the render alone. Pass B takes the
"black" ones, and only once all four edge neighbours are done, so each sees
its neighbours' finished art around its edges. Without A or B, every tile.
"""

import json
import math
import sys

TILE = 1024
meta = json.load(open(sys.argv[1]))
done = set(open(sys.argv[2]).read().split()) if len(sys.argv) > 2 else set()
shard, shards, limit = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
phase = sys.argv[6] if len(sys.argv) > 6 else None

W, H = meta["width"], meta["height"]
corners = [(0, 0), (W, 0), (W, H), (0, H)]  # ground metres
xs = [e - s for e, s in corners]
ys = [(e + s) / 2 for e, s in corners]


def touches(tx, ty):
    """Does the tile overlap the map's diamond on screen?"""
    cx, cy = (tx + 0.5) * TILE, (ty + 0.5) * TILE
    e, s = (2 * cy + cx) / 2, (2 * cy - cx) / 2  # tile centre back on the ground
    pad = TILE * 0.75
    return -pad <= e <= W + pad and -pad <= s <= H + pad


lat0, lon0 = 28.6328, 77.2199  # Connaught Place
b = meta["bounds"]
ce, cs = (lon0 - b["lonMin"]) * meta["mx"], (b["latMax"] - lat0) * meta["my"]
cpx, cpy = ce - cs, (ce + cs) / 2



def ready(tx, ty):
    if phase == "A":
        return (tx + ty) % 2 == 0
    if phase == "B":
        return (tx + ty) % 2 == 1 and all(
            f"{tx + dx}_{ty + dy}" in done or not touches(tx + dx, ty + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    return True


tiles = []
for ty in range(math.floor(min(ys) / TILE) - 1, math.ceil(max(ys) / TILE) + 1):
    for tx in range(math.floor(min(xs) / TILE) - 1, math.ceil(max(xs) / TILE) + 1):
        if touches(tx, ty) and f"{tx}_{ty}" not in done and ready(tx, ty):
            tiles.append((math.hypot((tx + 0.5) * TILE - cpx, (ty + 0.5) * TILE - cpy), tx, ty))
tiles.sort()
mine = [[tx, ty] for k, (_, tx, ty) in enumerate(tiles) if k % shards == shard][:limit]
print(json.dumps(mine))
print(f"{len(tiles)} tiles ready{' in pass ' + phase if phase else ''}; shard {shard} takes {len(mine)}", file=sys.stderr)
