// Coordinate systems.
//
//   lat/lon  -> geography
//   tile     -> continuous grid space; tile (i, j) covers [i, i+1] x [j, j+1],
//               i grows east, j grows south
//   world px -> isometric pixels at zoom 1; z lifts a point straight up
//
// With i east and j south, north points up and to the right on screen.

import { BOUNDS, GRID } from './data.js';

export const TW = 32; // tile width in world px
export const TH = 16; // tile height in world px
const HW = TW / 2;
const HH = TH / 2;

const LAT_SPAN = BOUNDS.latMax - BOUNDS.latMin;
const LON_SPAN = BOUNDS.lonMax - BOUNDS.lonMin;

export function llToTile(lat, lon) {
  return {
    i: ((lon - BOUNDS.lonMin) / LON_SPAN) * GRID,
    j: ((BOUNDS.latMax - lat) / LAT_SPAN) * GRID,
  };
}

export function tileToLL(i, j) {
  return {
    lat: BOUNDS.latMax - (j / GRID) * LAT_SPAN,
    lon: BOUNDS.lonMin + (i / GRID) * LON_SPAN,
  };
}

/** Tile-space point to world pixels. */
export function iso(i, j, z = 0) {
  return [(i - j) * HW, (i + j) * HH - z];
}

/** World pixels (on the ground plane) back to tile space. */
export function unIso(x, y) {
  const a = x / HW; // i - j
  const b = y / HH; // i + j
  return { i: (a + b) / 2, j: (b - a) / 2 };
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
    const [xi, yi] = poly[k];
    const [xj, yj] = poly[m];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let k = 0; k < pts.length - 1; k++) {
    const d = distToSegment(px, py, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

/** [lat, lon] list to [i, j] list in tile space. */
export function lineToTiles(pts) {
  return pts.map(([lat, lon]) => {
    const t = llToTile(lat, lon);
    return [t.i, t.j];
  });
}

export function polylineLength(pts) {
  let len = 0;
  for (let k = 0; k < pts.length - 1; k++) len += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
  return len;
}

/** Point and heading at distance d along a tile-space polyline. */
export function pointAlong(pts, cum, d) {
  const total = cum[cum.length - 1];
  d = Math.max(0, Math.min(total, d));
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (d - cum[lo]) / seg;
  const [ax, ay] = pts[lo];
  const [bx, by] = pts[hi];
  return { i: ax + (bx - ax) * t, j: ay + (by - ay) * t, di: (bx - ax) / seg, dj: (by - ay) / seg };
}

export function cumulative(pts) {
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return cum;
}

// Deterministic hashing and noise so the city is the same on every load.
export function hash2(i, j, seed = 0) {
  let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
