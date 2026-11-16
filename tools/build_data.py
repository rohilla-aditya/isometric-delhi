"""Turn an OpenStreetMap extract of Delhi NCR into the map's data files.

    python tools/build_data.py path/to/region.osm.pbf [more.osm.pbf ...]

Writes public/data/:
  meta.json            bounds, projection, cell size and the list of cells
  cells/<cx>_<cy>.bin  everything inside one 2 km x 2 km cell (format below)

Coordinates are metres east (e) and south (s) of the north-west corner of
BOUNDS. Inside a cell file they are decimetres from the cell's corner, int16.

Cell file, little-endian:
  'DLH2', u16 nAreas, u16 nLines, u32 nBuildings
  area:     u8 class, u8 nRings, then per ring u16 n + n*(i16 x, i16 y)
  line:     u8 class, u8 flags (1 = bridge), u16 n + n*(i16 x, i16 y)
  building: u8 height (m), u8 kind, u8 n + n*(i16 x, i16 y)
"""

from __future__ import annotations

import json
import math
import os
import struct
import sys
from collections import defaultdict

import osmium
import shapely
from shapely import wkb
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Polygon, box

# Delhi NCR: Delhi, Gurugram, Faridabad, Noida, Greater Noida and Ghaziabad.
BOUNDS = {"latMin": 28.33, "latMax": 28.89, "lonMin": 76.83, "lonMax": 77.56}
CELL = 2000  # metres
LAT0 = (BOUNDS["latMin"] + BOUNDS["latMax"]) / 2
MX = 111320 * math.cos(math.radians(LAT0))  # metres per degree of longitude
MY = 110574  # metres per degree of latitude
WIDTH = (BOUNDS["lonMax"] - BOUNDS["lonMin"]) * MX
HEIGHT = (BOUNDS["latMax"] - BOUNDS["latMin"]) * MY

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data")

# Area classes, in drawing order.
AREA = {
    "residential": 1, "commercial": 2, "industrial": 3, "farmland": 4, "grass": 5,
    "park": 6, "forest": 7, "sand": 8, "cemetery": 9, "military": 10, "aerodrome": 11,
    "apron": 12, "pitch": 13, "water": 14, "railway": 15, "construction": 16, "plaza": 17,
}
LINE = {
    "motorway": 1, "trunk": 2, "primary": 3, "secondary": 4, "tertiary": 5,
    "street": 6, "service": 7, "rail": 8, "runway": 9, "taxiway": 10, "river": 11,
    "canal": 12, "drain": 13, "metro": 14, "pedestrian": 15,
}
# Building kinds drive the palette and the height guess.
KIND = {"house": 1, "apartments": 2, "commercial": 3, "industrial": 4, "religious": 5,
        "civic": 6, "school": 7, "hut": 8, "other": 0}


def project(lon: float, lat: float) -> tuple[float, float]:
    return (lon - BOUNDS["lonMin"]) * MX, (BOUNDS["latMax"] - lat) * MY


def area_class(tags) -> str | None:
    g = tags.get
    if g("natural") == "water" or g("waterway") == "riverbank" or g("landuse") in ("reservoir", "basin"):
        return "water"
    if g("aeroway") == "apron":
        return "apron"
    if g("aeroway") == "aerodrome":
        return "aerodrome"
    if g("leisure") in ("park", "garden", "golf_course", "nature_reserve") or g("landuse") in ("recreation_ground", "village_green"):
        return "park"
    if g("leisure") in ("pitch", "stadium", "track"):
        return "pitch"
    if g("landuse") in ("forest",) or g("natural") in ("wood", "scrub", "heath"):
        return "forest"
    if g("landuse") in ("grass", "meadow") or g("natural") == "grassland":
        return "grass"
    if g("landuse") in ("farmland", "orchard", "farmyard", "plant_nursery", "greenhouse_horticulture", "allotments"):
        return "farmland"
    if g("natural") in ("sand", "beach", "bare_rock") or g("landuse") in ("brownfield", "landfill", "quarry"):
        return "sand"
    if g("landuse") == "construction":
        return "construction"
    if g("landuse") in ("cemetery",) or g("amenity") == "grave_yard":
        return "cemetery"
    if g("landuse") == "military":
        return "military"
    if g("landuse") == "railway":
        return "railway"
    if g("landuse") in ("industrial",):
        return "industrial"
    if g("landuse") in ("commercial", "retail"):
        return "commercial"
    if g("landuse") == "residential":
        return "residential"
    if g("highway") == "pedestrian" or g("place") == "square":
        return "plaza"
    return None


ROAD = {
    "motorway": "motorway", "motorway_link": "motorway", "trunk": "trunk", "trunk_link": "trunk",
    "primary": "primary", "primary_link": "primary", "secondary": "secondary", "secondary_link": "secondary",
    "tertiary": "tertiary", "tertiary_link": "tertiary", "residential": "street", "unclassified": "street",
    "living_street": "street", "road": "street", "service": "service", "pedestrian": "pedestrian",
}


def line_class(tags) -> str | None:
    g = tags.get
    h = g("highway")
    if h in ROAD:
        if h == "service" and g("service") in ("parking_aisle", "driveway", "drive-through"):
            return None
        return ROAD[h]
    r = g("railway")
    if r == "rail" and g("service") not in ("yard", "siding", "spur"):
        return "rail"
    if r in ("subway", "light_rail", "monorail"):
        # only draw the elevated and at-grade stretches; tunnels stay hidden
        return None if g("tunnel") in ("yes", "building_passage") else "metro"
    a = g("aeroway")
    if a == "runway":
        return "runway"
    if a == "taxiway":
        return "taxiway"
    w = g("waterway")
    if w == "river":
        return "river"
    if w == "canal":
        return "canal"
    if w in ("drain", "stream"):
        return "drain"
    return None


def building_kind(tags) -> str:
    b = tags.get("building")
    if b in ("house", "detached", "semidetached_house", "terrace", "bungalow", "residential", "farm"):
        return "house"
    if b in ("apartments", "dormitory", "flats"):
        return "apartments"
    if b in ("commercial", "retail", "office", "hotel", "supermarket", "mall"):
        return "commercial"
    if b in ("industrial", "warehouse", "factory", "shed", "hangar", "manufacture"):
        return "industrial"
    if b in ("temple", "mosque", "church", "gurudwara", "religious", "shrine", "cathedral", "chapel") or tags.get("amenity") == "place_of_worship":
        return "religious"
    if b in ("government", "public", "civic", "hospital", "train_station", "transportation", "stadium"):
        return "civic"
    if b in ("school", "university", "college", "kindergarten"):
        return "school"
    if b in ("hut", "cabin", "shelter", "roof", "garage", "garages", "kiosk"):
        return "hut"
    return "other"


def parse_height(tags) -> float | None:
    for key in ("height", "building:height"):
        v = tags.get(key)
        if v:
            try:
                return float(v.replace("m", "").strip().split()[0])
            except ValueError:
                pass
    v = tags.get("building:levels")
    if v:
        try:
            return float(v.split(";")[0]) * 3.2 + 1
        except ValueError:
            pass
    return None


def guess_height(kind: str, area: float, seed: int) -> float:
    """Most Delhi buildings have no height in OSM; guess from type and size."""
    r = (seed * 2654435761 % 4294967296) / 4294967296
    if kind == "hut":
        return 3
    if kind == "industrial":
        return 7 + r * 5
    if kind == "religious":
        return 9 + r * 6
    if kind == "apartments":
        return 12 + r * 30 if area > 400 else 10 + r * 6
    if kind == "commercial":
        return 12 + r * 18 if area > 800 else 9 + r * 8
    if area < 60:
        return 4 + r * 4
    if area < 400:  # the typical 2-4 storey Delhi plot house
        return 7 + r * 8
    if area < 2000:
        return 10 + r * 12
    return 12 + r * 14


class MetroColours(osmium.SimpleHandler):
    """First pass: which ways belong to which coloured metro line."""

    def __init__(self):
        super().__init__()
        self.way_colour = {}
        self.colours = []

    def relation(self, r):
        if r.tags.get("route") not in ("subway", "light_rail", "monorail"):
            return
        col = (r.tags.get("colour") or "").strip().lower()
        if not col.startswith("#") or len(col) not in (4, 7):
            return
        if len(col) == 4:
            col = "#" + "".join(ch * 2 for ch in col[1:])
        if col not in self.colours:
            if len(self.colours) >= 120:
                return
            self.colours.append(col)
        idx = self.colours.index(col) + 1
        for m in r.members:
            if m.type == "w":
                self.way_colour.setdefault(m.ref, idx)


class Collector(osmium.SimpleHandler):
    def __init__(self, way_colour=None):
        super().__init__()
        self.way_colour = way_colour or {}
        self.wkb = osmium.geom.WKBFactory()
        self.areas = []      # (class, shapely geometry)
        self.lines = []      # (class, bridge, LineString)
        self.buildings = []  # (height, kind, Polygon)
        self.seen = 0

    def area(self, a):
        tags = a.tags
        try:
            if "building" in tags and tags.get("building") != "no":
                geom = wkb.loads(self.wkb.create_multipolygon(a), hex=True)
                for poly in getattr(geom, "geoms", [geom]):
                    self.add_building(tags, poly, a.id)
                return
            cls = area_class(tags)
            if cls:
                geom = wkb.loads(self.wkb.create_multipolygon(a), hex=True)
                self.areas.append((cls, shapely.transform(geom, self._proj)))
        except Exception:  # broken multipolygons are common; skip them
            return

    def way(self, w):
        cls = line_class(w.tags)
        if not cls:
            return
        try:
            pts = [project(n.lon, n.lat) for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        if len(pts) < 2:
            return
        flags = 1 if w.tags.get("bridge") not in (None, "no") else 0
        if cls == "metro":
            flags |= self.way_colour.get(w.id, 0) << 1
        self.lines.append((cls, flags, LineString(pts)))

    @staticmethod
    def _proj(coords):
        out = coords.copy()
        out[:, 0] = (coords[:, 0] - BOUNDS["lonMin"]) * MX
        out[:, 1] = (BOUNDS["latMax"] - coords[:, 1]) * MY
        return out

    def add_building(self, tags, poly, oid):
        p = shapely.transform(Polygon(poly.exterior), self._proj)
        if p.area < 8:
            return
        p = p.simplify(0.6, preserve_topology=False)
        if p.is_empty or not isinstance(p, Polygon):
            return
        kind = building_kind(tags)
        h = parse_height(tags) or guess_height(kind, p.area, oid)
        c = p.centroid
        # plain tuples, not shapely objects: millions of them must fit in memory
        coords = tuple(round(v, 1) for xy in list(p.exterior.coords)[:-1] for v in xy)
        self.buildings.append((max(3, min(255, round(h))), KIND[kind], coords, c.x, c.y))


def clip_to_cells(geom, fn):
    """Call fn(cx, cy, piece) for each cell the geometry touches."""
    x0, y0, x1, y1 = geom.bounds
    for cy in range(max(0, int(y0 // CELL)), min(int(HEIGHT // CELL), int(y1 // CELL)) + 1):
        for cx in range(max(0, int(x0 // CELL)), min(int(WIDTH // CELL), int(x1 // CELL)) + 1):
            cellbox = box(cx * CELL, cy * CELL, (cx + 1) * CELL, (cy + 1) * CELL)
            piece = geom.intersection(cellbox)
            if not piece.is_empty:
                fn(cx, cy, piece)


def enc_pts(coords, ox, oy):
    out = bytearray()
    for x, y in coords:
        out += struct.pack("<hh", max(-32768, min(32767, round((x - ox) * 10))), max(-32768, min(32767, round((y - oy) * 10))))
    return out


def main(paths):
    mc = MetroColours()
    for p in paths:
        mc.apply_file(p)
    col = Collector(mc.way_colour)
    for p in paths:
        print("reading", p, flush=True)
        col.apply_file(p, locations=True, idx="flex_mem")
    print(f"{len(col.buildings)} buildings, {len(col.areas)} areas, {len(col.lines)} lines", flush=True)

    cells = defaultdict(lambda: {"areas": [], "lines": [], "buildings": []})
    span = box(0, 0, WIDTH, HEIGHT)

    for cls, geom in col.areas:
        geom = geom.buffer(0) if not geom.is_valid else geom
        geom = geom.simplify(1.0)
        if not geom.intersects(span):
            continue

        def add_area(cx, cy, piece, cls=cls):
            for poly in getattr(piece, "geoms", [piece]):
                if isinstance(poly, Polygon) and poly.area > 20:
                    cells[(cx, cy)]["areas"].append((AREA[cls], poly))

        clip_to_cells(geom, add_area)

    for cls, bridge, ln in col.lines:
        if not ln.intersects(span):
            continue

        def add_line(cx, cy, piece, cls=cls, bridge=bridge):
            parts = piece.geoms if isinstance(piece, MultiLineString) else [piece]
            for part in parts:
                if isinstance(part, LineString) and len(part.coords) >= 2:
                    cells[(cx, cy)]["lines"].append((LINE[cls], bridge, part))

        clip_to_cells(ln, add_line)

    for b in col.buildings:
        cx_, cy_ = b[3], b[4]
        if not (0 <= cx_ < WIDTH and 0 <= cy_ < HEIGHT):
            continue
        cells[(int(cx_ // CELL), int(cy_ // CELL))]["buildings"].append(b)

    os.makedirs(os.path.join(OUT, "cells"), exist_ok=True)
    index = []
    total = 0
    for (cx, cy), c in sorted(cells.items()):
        ox, oy = cx * CELL, cy * CELL
        body = bytearray(b"DLH2")
        body += struct.pack("<HHI", len(c["areas"]), len(c["lines"]), len(c["buildings"]))
        for cls, poly in c["areas"]:
            rings = [poly.exterior] + list(poly.interiors)[:254]
            body += struct.pack("<BB", cls, len(rings))
            for r in rings:
                pts = list(r.coords)[:-1][:65535]
                body += struct.pack("<H", len(pts)) + enc_pts(pts, ox, oy)
        for cls, bridge, ln in c["lines"]:
            pts = list(ln.coords)[:65535]
            body += struct.pack("<BBH", cls, bridge, len(pts)) + enc_pts(pts, ox, oy)
        # buildings sorted back to front so the browser can draw them in order
        c["buildings"].sort(key=lambda b: b[3] + b[4])
        for h, kind, coords, _x, _y in c["buildings"]:
            pts = list(zip(coords[0::2], coords[1::2]))[:255]
            body += struct.pack("<BBB", h, kind, len(pts)) + enc_pts(pts, ox, oy)
        with open(os.path.join(OUT, "cells", f"{cx}_{cy}.bin"), "wb") as f:
            f.write(body)
        index.append([cx, cy, len(c["buildings"])])
        total += len(body)

    meta = {"bounds": BOUNDS, "cell": CELL, "width": WIDTH, "height": HEIGHT, "mx": MX, "my": MY,
            "cells": index, "buildings": sum(len(c["buildings"]) for c in cells.values()),
            "metroColours": ["#9a9a9a"] + mc.colours}
    meta.update(render_overview(col, os.path.join(OUT)))
    with open(os.path.join(OUT, "meta.json"), "w") as f:
        json.dump(meta, f)
    print(f"wrote {len(index)} cells, {total / 1e6:.1f} MB", flush=True)


# ------------------------------------------------------------- overview --
# The zoomed-out view is a picture, rendered here once, because drawing
# millions of buildings in the browser at that scale would be far too slow.
# Colours match public/js/city.js.

AREA_RGB = {1: "#d9d0bd", 2: "#d6cdc6", 3: "#cdc8c0", 4: "#c5d08f", 5: "#b5cc85", 6: "#a3c876", 7: "#88a65c",
            8: "#e0d2aa", 9: "#b9c4a0", 10: "#c9c7b2", 11: "#cfd3c0", 12: "#bebdb7", 13: "#9dc46e", 14: "#6aa5bf",
            15: "#cbc3b5", 16: "#d8cdb6", 17: "#e2d8c6"}
AREA_ORDER = [1, 2, 3, 15, 10, 11, 16, 4, 8, 5, 9, 6, 7, 13, 12, 17, 14]
LINE_RGB = {11: (14, "#6aa5bf"), 12: (12, "#6aa5bf"), 5: (10, "#f4efe4"), 4: (13, "#fff2d0"), 3: (16, "#ffe2a6"),
            2: (20, "#f6cc7c"), 1: (24, "#efb060"), 9: (45, "#6a6c70"), 8: (5, "#a39480")}
LINE_ORDER = [11, 12, 5, 4, 3, 2, 1, 9, 8]
ROOF = {1: ["#e8d8b9", "#e3c6a6", "#d9b99b", "#efd9d0", "#cfd8d0", "#e6cfa0", "#d8a48f"],
        2: ["#e8d2b0", "#d8c0a0", "#e9e2d0", "#d9a080"], 3: ["#9fb7c9", "#b8c6cf", "#c9c2b4"],
        4: ["#a7aaa8", "#9aa3ad", "#b8b2a5"], 5: ["#f3efe6", "#f0dcc0"], 6: ["#e6d3b3", "#d9c2a0"],
        7: ["#e4c9a2", "#d6b48a"], 8: ["#b9a58a"], 0: ["#e8d8b9", "#e3c6a6", "#d9c9b0", "#cfd8d0", "#e6cfa0", "#d8bfa8"]}
OV_SCALE = 1 / 16  # overview px per world px
OV_TILE = 1024


def render_overview(col, out):
    from PIL import Image, ImageDraw

    ss = 2  # supersample, then shrink for smooth edges
    k = OV_SCALE * ss
    x0, y0 = -HEIGHT, -320.0
    x1, y1 = WIDTH, (WIDTH + HEIGHT) / 2 + 40
    w, h = int((x1 - x0) * k) + 1, int((y1 - y0) * k) + 1
    img = Image.new("RGB", (w, h), "#e9e2d3")
    d = ImageDraw.Draw(img)

    def px(e, s, z=0.0):
        return ((e - s) - x0) * k, ((e + s) / 2 - z - y0) * k

    d.polygon([px(0, 0), px(WIDTH, 0), px(WIDTH, HEIGHT), px(0, HEIGHT)], fill="#e3dccb")
    for cls in AREA_ORDER:
        for c, geom in col.areas:
            if AREA[c] != cls:
                continue
            for poly in getattr(geom, "geoms", [geom]):
                if isinstance(poly, Polygon) and poly.area > 400:
                    d.polygon([px(x, y) for x, y in poly.exterior.coords], fill=AREA_RGB[cls])
    for cls in LINE_ORDER:
        wd, colr = LINE_RGB[cls]
        for c, _flags, ln in col.lines:
            if LINE[c] == cls:
                d.line([px(x, y) for x, y in ln.coords], fill=colr, width=max(1, round(wd * k * 1.2)))
    print("overview: buildings", flush=True)
    col.buildings.sort(key=lambda b: b[3] + b[4])
    for hgt, kind, coords, bx, by in col.buildings:
        pal = ROOF[kind]
        c = pal[int(bx * 7 + by * 13) % len(pal)]
        pts = [px(x, y) for x, y in zip(coords[0::2], coords[1::2])]
        if len(pts) < 3:
            continue
        d.polygon(pts, fill="#b8ab98")
        d.polygon([(a, b - hgt * k) for a, b in pts], fill=c)
    img = img.resize((w // ss, h // ss), Image.LANCZOS)
    ow, oh = img.size
    cols, rows = math.ceil(ow / OV_TILE), math.ceil(oh / OV_TILE)
    os.makedirs(os.path.join(out, "overview"), exist_ok=True)
    for ty in range(rows):
        for tx in range(cols):
            tile = img.crop((tx * OV_TILE, ty * OV_TILE, (tx + 1) * OV_TILE, (ty + 1) * OV_TILE))
            tile.save(os.path.join(out, "overview", f"{tx}_{ty}.webp"), quality=82, method=6)
    mini_w = 640
    mini = img.resize((mini_w, round(oh * mini_w / ow)), Image.LANCZOS)
    mini.save(os.path.join(out, "minimap.webp"), quality=85)
    return {
        "overview": {"scale": OV_SCALE, "x0": x0, "y0": y0, "size": OV_TILE, "cols": cols, "rows": rows},
        "minimap": {"scale": mini_w / (x1 - x0), "x0": x0, "y0": y0},
    }


if __name__ == "__main__":
    main(sys.argv[1:])
