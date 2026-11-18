"""Building footprints OpenStreetMap is missing, and measured building heights.

Two open datasets, used by build_data.py:

* Overture Maps buildings (ODbL): footprints conflated from OpenStreetMap,
  Microsoft and Google. Only the ones that do not come from OpenStreetMap
  are added, and only where no OSM building already stands.
* Google Open Buildings 2.5D Temporal, 2023 (CC BY 4.0): a building height
  raster at 0.5 m for the Global South, published as public GeoTIFFs. Each
  footprint gets the presence-weighted mean height under it, calibrated
  against the OSM buildings whose height or levels are tagged.

The approach follows Pixel Chennai's heights_x.py (MIT, github.com/rcdexta/pixelchennai).
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import urllib.request

import numpy as np

GCS = "https://storage.googleapis.com/open-buildings-temporal-data/v1"
MANIFESTS = ["39_EPSG_32643_2023_06_30.json", "3b_EPSG_32643_2023_06_30.json"]  # S2 cells covering the NCR, UTM 43N
UTM = "EPSG:32643"
DEC = 4  # read the 0.5 m rasters at 2 m: enough for a Delhi plot, and fast


def fetch(url, path):
    for attempt in range(5):
        try:
            urllib.request.urlretrieve(url, path)
            return
        except Exception:  # noqa: BLE001 - flaky network: retry, then give up
            if attempt == 4:
                raise


# ------------------------------------------------------------- Overture --

def overture_buildings(bbox, workdir):
    """Overture footprints not sourced from OSM, as (lon/lat ring, class, height or None)."""
    import pyarrow.parquet as pq
    import shapely

    path = os.path.join(workdir, "overture_buildings.parquet")
    if not os.path.exists(path):
        w, s, e, n = bbox
        subprocess.run(["overturemaps", "download", f"--bbox={w},{s},{e},{n}", "-f", "geoparquet",
                        "--type=building", "-o", path], check=True)
    t = pq.read_table(path, columns=["geometry", "sources", "class", "height", "num_floors"]).to_pylist()
    out = []
    for row in t:
        src = (row.get("sources") or [{}])[0] or {}
        if src.get("dataset") == "OpenStreetMap":
            continue
        g = shapely.from_wkb(row["geometry"])
        for poly in getattr(g, "geoms", [g]):
            if poly.geom_type != "Polygon":
                continue
            h = row.get("height")
            if not h and row.get("num_floors"):
                h = row["num_floors"] * 3.2 + 1
            out.append((np.asarray(poly.exterior.coords)[:-1], row.get("class"), h))
    print(f"overture: {len(out)} non-OSM footprints", flush=True)
    return out


# ------------------------------------------------------ Google 2.5D ------

def google_tiles(bbox):
    """URLs of the 2023 height tiles that overlap bbox (lon/lat)."""
    from pyproj import Transformer

    tr = Transformer.from_crs("EPSG:4326", UTM, always_xy=True)
    w, s, e, n = bbox
    xs, ys = tr.transform([w, e, w, e], [s, s, n, n])
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    urls = []
    with tempfile.TemporaryDirectory() as tmp:
        for name in MANIFESTS:
            p = os.path.join(tmp, name)
            fetch(f"{GCS}/manifests/{name}", p)
            m = json.load(open(p))
            prefix = m["uriPrefix"].replace("gs://open-buildings-temporal-data/v1", GCS)
            for ts in m["tilesets"]:
                for src in ts["sources"]:
                    a = src["affineTransform"]
                    tx0, ty1 = a["translateX"], a["translateY"]
                    tx1 = tx0 + src["dimensions"]["width"] * a["scaleX"]
                    ty0 = ty1 + src["dimensions"]["height"] * a["scaleY"]
                    if tx1 > x0 and tx0 < x1 and ty1 > y0 and ty0 < y1:
                        urls.append(prefix + src["uris"][0])
    return urls


def google_heights(rings_lonlat, bbox, workdir):
    """Presence-weighted mean Google height (m) under each footprint; NaN where none."""
    import rasterio
    from pyproj import Transformer
    from rasterio.enums import Resampling
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    from shapely.geometry import Polygon

    tr = Transformer.from_crs("EPSG:4326", UTM, always_xy=True)
    n = len(rings_lonlat)
    flat = np.concatenate(rings_lonlat)
    ux, uy = tr.transform(flat[:, 0], flat[:, 1])
    ends = np.cumsum([len(r) for r in rings_lonlat])
    starts = ends - np.array([len(r) for r in rings_lonlat])
    cx = np.array([ux[a:b].mean() for a, b in zip(starts, ends)])
    cy = np.array([uy[a:b].mean() for a, b in zip(starts, ends)])
    sum_h = np.zeros(n + 1)
    sum_w = np.zeros(n + 1)
    urls = google_tiles(bbox)
    print(f"google 2.5D: {len(urls)} tiles", flush=True)
    for k, url in enumerate(urls):
        path = os.path.join(workdir, "tile.tif")
        fetch(url, path)
        with rasterio.open(path) as r:
            b = r.bounds
            sel = np.nonzero((cx >= b.left) & (cx < b.right) & (cy >= b.bottom) & (cy < b.top))[0]
            if len(sel):
                shape = (r.height // DEC, r.width // DEC)
                hgt = r.read(2, out_shape=shape, resampling=Resampling.average)
                pres = r.read(3, out_shape=shape, resampling=Resampling.average)
                t = from_origin(b.left, b.top, r.res[0] * DEC, r.res[1] * DEC)
        os.remove(path)
        if not len(sel):
            continue
        polys = ((Polygon(np.column_stack([ux[starts[i]:ends[i]], uy[starts[i]:ends[i]]])), i + 1) for i in sel)
        ids = rasterize(polys, out_shape=shape, transform=t, all_touched=True, dtype="int32")
        ok = (ids > 0) & (pres > 0.3) & (hgt > 0)
        wts = pres[ok].astype(np.float64)
        sum_h += np.bincount(ids[ok], weights=hgt[ok] * wts, minlength=n + 1)
        sum_w += np.bincount(ids[ok], weights=wts, minlength=n + 1)
        print(f"  tile {k + 1}/{len(urls)}: {len(sel)} footprints", flush=True)
    return np.where(sum_w[1:] > 0, sum_h[1:] / np.maximum(sum_w[1:], 1e-9), np.nan)


def calibration(google, tagged):
    """Map Google heights to the heights OSM mappers tagged, bin by bin.

    google: array of Google heights; tagged: matching array of tagged heights
    (NaN where untagged). Returns a function of a Google height.
    """
    ok = ~np.isnan(google) & ~np.isnan(tagged) & (tagged >= 3) & (tagged <= 150)
    g, t = google[ok], tagged[ok]
    edges = [0, 4, 6, 8, 10, 13, 17, 22, 30, 45, 200]
    mids, meds = [], []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (g >= lo) & (g < hi)
        if m.sum() >= 20:
            mids.append(float(np.median(g[m])))
            meds.append(float(np.median(t[m])))
    if len(mids) < 2:
        print("calibration: too few tagged buildings, using Google heights as they are", flush=True)
        return lambda h: h
    print(f"calibration from {ok.sum()} tagged buildings: " + ", ".join(f"{a:.0f}->{b:.0f} m" for a, b in zip(mids, meds)), flush=True)

    def cal(h):
        return float(np.interp(h, mids, meds)) if h <= mids[-1] else meds[-1] * h / mids[-1]

    raw = np.median(np.abs(g - t))
    fit = np.median(np.abs(np.array([cal(h) for h in g]) - t))
    print(f"median error vs tagged: raw {raw:.1f} m, calibrated {fit:.1f} m", flush=True)
    return cal
