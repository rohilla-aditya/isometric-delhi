"""List the painted tiles that are up to date, for plan.py's done list.

    python done.py <painters.json> <version>

painters.json, on the painted branch, records which painter version made
each tile. Tiles from an older painter (or not recorded) are repainted.
"""

import json
import os
import sys

if __name__ == "__main__":
    manifest, version = sys.argv[1], sys.argv[2]
    made = json.load(open(manifest)) if os.path.exists(manifest) else {}
    for tile, v in sorted(made.items()):
        if v == version:
            print(tile)
