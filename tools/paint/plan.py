"""Choose the city tiles one painter shard should do next.

    python plan.py <meta.json> <done.txt> <shard> <shards> <max> > tiles.json

Tiles are 1024 x 1024 world px (see render.cjs). Every tile that touches the
map is listed, nearest to Connaught Place first, minus those already in
done.txt (one "tx_ty" per line); shard k of N takes every Nth of the rest.
"""

import json
import math
import sys

TILE = 1024
meta = json.load(open(sys.argv[1]))
done = set(open(sys.argv[2]).read().split()) if len(sys.argv) > 2 else set()
shard, shards, limit = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])

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

tiles = []
for ty in range(math.floor(min(ys) / TILE) - 1, math.ceil(max(ys) / TILE) + 1):
    for tx in range(math.floor(min(xs) / TILE) - 1, math.ceil(max(xs) / TILE) + 1):
        if touches(tx, ty) and f"{tx}_{ty}" not in done:
            tiles.append((math.hypot((tx + 0.5) * TILE - cpx, (ty + 0.5) * TILE - cpy), tx, ty))
tiles.sort()
mine = [[tx, ty] for k, (_, tx, ty) in enumerate(tiles) if k % shards == shard][:limit]
print(json.dumps(mine))
print(f"{len(tiles)} tiles left in total; shard {shard} takes {len(mine)}", file=sys.stderr)
