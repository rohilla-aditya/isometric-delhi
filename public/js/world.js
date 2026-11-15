// Turns the geography in data.js into a grid of tiles: what the ground is,
// what stands on it, and which landmark (if any) owns it. Pure and
// deterministic so it runs the same in the browser and in tests.

import {
  GRID, YAMUNA, LAKES, ZONES, ROADS, RAILWAYS, LANDMARKS, RUNWAYS, KARTAVYA_PATH, METRO,
} from './data.js';
import {
  llToTile, lineToTiles, pointInPoly, distToPolyline, hash2, valueNoise, cumulative,
} from './geo.js';

export const STOREY = 3.2; // px per floor

const PALETTES = {
  res: ['#e8d8b9', '#f0e2c8', '#e3c6a6', '#d9b99b', '#efd9d0', '#cfd8d0', '#e6cfa0', '#f2e8d8', '#d8a48f', '#e9d3b6'],
  dense: ['#c98b6b', '#b8846a', '#d6a77f', '#a7a29a', '#cf9e7a', '#e0c09a', '#9fb4a6', '#d9c3a5', '#c47a62'],
  old: ['#d9b28c', '#c9a07a', '#e6c79a', '#b98d6a', '#d4b6a0', '#a8b8b0', '#e8d0b0', '#c07a5a', '#e4b7a0', '#b9c7d0'],
  commercial: ['#9fb7c9', '#8aa6b8', '#b8c6cf', '#c9c2b4', '#a6b3a0', '#d8d2c4', '#e2ddd2'],
  towers: ['#7fa3bf', '#93b2c8', '#a9c0cf', '#6f8fa8', '#c4cfd6', '#d9d4c8', '#b0a090', '#8fb0b8'],
  midrise: ['#e8d2b0', '#d8c0a0', '#e9e2d0', '#c9b7a0', '#d9a080', '#e0c8b8', '#c8b090'],
  industrial: ['#a7aaa8', '#9aa3ad', '#b8b2a5', '#8f9aa3', '#b0a898'],
  bungalow: ['#f4f1ea', '#efe6d6', '#f2ece2'],
};

const BUILT = new Set(['res', 'dense', 'old', 'commercial', 'towers', 'midrise', 'industrial']);
const STREET_GRID = { res: 4, dense: 3, old: 3, commercial: 4, towers: 5, midrise: 5, industrial: 5 };

function compileZones() {
  return ZONES.map((z) => {
    if (z.poly) return { type: z.type, poly: lineToTiles(z.poly) };
    const c = llToTile(z.c[0], z.c[1]);
    return { type: z.type, c: [c.i, c.j], r: z.r };
  });
}

function inZone(z, x, y) {
  if (z.poly) return pointInPoly(x, y, z.poly);
  return Math.hypot(x - z.c[0], y - z.c[1]) <= z.r;
}

/** Sample a tile-space polyline every `step` tiles. */
function samples(pts, step = 0.2) {
  const out = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let s = 0; s <= n; s++) out.push([ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n]);
  }
  return out;
}

export function landmarkFootprint(lm) {
  const c = llToTile(lm.lat, lm.lon);
  const i0 = Math.round(c.i - lm.w / 2);
  const j0 = Math.round(c.j - lm.d / 2);
  return { i0, j0, i1: i0 + lm.w - 1, j1: j0 + lm.d - 1 };
}

export function generateWorld(seed = 11) {
  const N = GRID;
  const tiles = new Array(N * N);
  const at = (i, j) => (i >= 0 && j >= 0 && i < N && j < N ? tiles[j * N + i] : null);

  const zones = compileZones();
  const river = lineToTiles(YAMUNA);
  const lakes = LAKES.map((l) => {
    const c = llToTile(l.c[0], l.c[1]);
    return { c: [c.i, c.j], r: l.r };
  });

  // 1. Zones and water.
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i + 0.5;
      const y = j + 0.5;
      let zone = 'res';
      for (const z of zones) if (inZone(z, x, y)) zone = z.type;
      const t = { i, j, zone, g: 'lot', b: null, trees: 0, lm: null, road: null, street: 0, v: hash2(i, j, seed) };

      const wob = valueNoise(x / 6, y / 6, seed + 3);
      const dr = distToPolyline(x, y, river);
      if (dr < 1.25 + wob * 0.7) t.g = 'water';
      else if (dr < 2.0 + wob) t.g = 'sand';
      else if (dr < 3.6 + wob * 2.5 && !['park', 'lawn', 'forest', 'old'].includes(zone)) zone = t.zone = 'flood';
      for (const l of lakes) if (Math.hypot(x - l.c[0], y - l.c[1]) <= l.r) t.g = 'water';
      tiles[j * N + i] = t;
    }
  }

  // 2. Landmarks claim their footprint and clear a ring around it.
  const landmarks = LANDMARKS.map((lm) => ({ ...lm, ...landmarkFootprint(lm) }));
  for (const lm of landmarks) {
    for (let j = lm.j0 - 1; j <= lm.j1 + 1; j++) {
      for (let i = lm.i0 - 1; i <= lm.i1 + 1; i++) {
        const t = at(i, j);
        if (!t) continue;
        const inside = i >= lm.i0 && i <= lm.i1 && j >= lm.j0 && j <= lm.j1;
        if (inside) {
          t.lm = lm.id;
          if (!lm.onWater) {
            t.g = 'plaza';
            t.zone = 'landmark';
          }
        } else if (!t.lm && t.g !== 'water' && BUILT.has(t.zone)) {
          t.zone = 'park';
        }
      }
    }
  }

  // 3. Roads, rails, the ceremonial axis and runways are rasterised so nothing
  // gets built on them; they are drawn as smooth strokes later.
  const mark = (pts, r, fn) => {
    for (const [x, y] of samples(pts)) {
      for (let j = Math.floor(y - r); j <= Math.floor(y + r); j++) {
        for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
          const t = at(i, j);
          if (t && Math.hypot(i + 0.5 - x, j + 0.5 - y) <= r) fn(t);
        }
      }
    }
  };
  const roads = [];
  for (const r of ROADS) {
    let pts = lineToTiles(r.pts);
    if (r.loop) pts = [...pts, pts[0]];
    roads.push({ name: r.name, cls: r.cls, pts });
    mark(pts, r.cls === 'major' ? 0.8 : 0.62, (t) => {
      if (t.lm) return;
      if (t.road !== 'major') t.road = r.cls;
    });
  }
  const kp = lineToTiles(KARTAVYA_PATH.pts);
  roads.push({ name: KARTAVYA_PATH.name, cls: 'path', pts: kp });
  mark(kp, 0.62, (t) => { if (!t.lm) { t.road = 'path'; t.g = 'lawn'; } });

  const rails = RAILWAYS.map((r) => ({ name: r.name, pts: lineToTiles(r.pts) }));
  for (const r of rails) mark(r.pts, 0.55, (t) => { if (!t.lm && !t.road) t.road = 'rail'; });

  const runways = RUNWAYS.map((r) => lineToTiles(r));
  for (const r of runways) mark(r, 0.75, (t) => { if (t.zone === 'airport') t.g = 'runway'; });
  const t3 = landmarks.find((l) => l.id === 'igi-airport');
  for (let j = t3.j0 - 3; j <= t3.j1 + 3; j++) {
    for (let i = t3.i0 - 3; i <= t3.i1 + 4; i++) {
      const t = at(i, j);
      if (t && !t.lm && t.zone === 'airport' && t.g !== 'runway') t.g = 'apron';
    }
  }

  // 4. Ground, minor streets, buildings and trees.
  for (const t of tiles) {
    const { i, j, v } = t;
    const r2 = hash2(i, j, seed + 17);
    const r3 = hash2(i, j, seed + 29);
    if (t.lm || t.g === 'water' || t.g === 'sand') continue;
    const z = t.zone;

    if (z === 'lawn') {
      t.g = 'lawn';
      continue;
    }
    if (z === 'airport') {
      if (t.g !== 'runway' && t.g !== 'apron') t.g = 'grass';
      continue;
    }
    if (z === 'farm' || z === 'flood') {
      t.g = 'farm';
      if (r2 < (z === 'flood' ? 0.12 : 0.08)) t.trees = 1;
      if (z === 'farm' && r3 < 0.035 && !t.road) t.b = hut(v);
      continue;
    }
    if (z === 'forest') {
      t.g = 'forest';
      if (!t.road) t.trees = 2 + Math.floor(r2 * 3);
      continue;
    }
    if (z === 'park') {
      t.g = 'park';
      if (!t.road && r2 < 0.55) t.trees = 1 + Math.floor(r3 * 2);
      continue;
    }
    if (z === 'lutyens' || z === 'estate') {
      t.g = 'park';
      if (t.road) continue;
      if (r2 < (z === 'lutyens' ? 0.32 : 0.18)) {
        t.b = { kind: 'bungalow', h: 5 + Math.floor(r3 * 3), col: pick(PALETTES.bungalow, v), inset: 0.28 };
        t.trees = 1;
      } else t.trees = 2 + Math.floor(r3 * 2);
      continue;
    }

    // Built-up zones.
    t.g = 'lot';
    if (t.road) continue;
    const grid = STREET_GRID[z];
    const off = z === 'old' ? 1 : 2;
    const onI = (i + off) % grid === 0;
    const onJ = (j + off) % grid === 0;
    const keep = z === 'old' || z === 'dense' ? r2 > 0.35 : r2 > 0.08;
    if ((onI || onJ) && keep) {
      t.street = (onI ? 2 : 0) | (onJ ? 1 : 0); // 2: runs along j, 1: runs along i
      continue;
    }
    if ((z === 'res' || z === 'midrise') && r3 < 0.09) {
      t.g = 'park';
      t.trees = 2;
      continue;
    }
    t.b = building(z, v, r2, r3, i, j, seed);
    if (z === 'res' && r3 > 0.85) t.trees = 1;
  }

  // 5. Metro lines as tile-space polylines with station positions.
  const metro = METRO.map((line) => {
    const pts = line.stations.map(([, lat, lon]) => {
      const t = llToTile(lat, lon);
      return [t.i, t.j];
    });
    return { ...line, pts, cum: cumulative(pts) };
  });

  return { N, tiles, at, landmarks, roads, rails, runways, metro, river, seed };
}

function pick(list, v) {
  return list[Math.floor(v * list.length) % list.length];
}

function hut(v) {
  return { kind: 'hut', h: 4, col: pick(['#c9a27c', '#b98e6a', '#d8b48c'], v), inset: 0.32 };
}

function building(zone, v, r2, r3, i, j, seed) {
  const n = valueNoise(i / 9, j / 9, seed + 41); // clusters of taller blocks
  let floors;
  let inset;
  let kind = 'block';
  switch (zone) {
    case 'old':
      floors = 2 + Math.floor(r2 * 3.2);
      inset = 0.04;
      if (r3 < 0.025) kind = 'mosque';
      break;
    case 'dense':
      floors = 2 + Math.floor(r2 * 3.5 + n * 1.5);
      inset = 0.05;
      break;
    case 'commercial':
      floors = 3 + Math.floor(r2 * 5 + n * 6);
      inset = 0.1;
      kind = 'glass';
      break;
    case 'towers':
      floors = 10 + Math.floor(r2 * 14 + n * 18);
      inset = 0.2;
      kind = 'glass';
      break;
    case 'midrise':
      floors = 6 + Math.floor(r2 * 5 + n * 4);
      inset = 0.16;
      break;
    case 'industrial':
      floors = 2 + Math.floor(r2 * 1.5);
      inset = 0.06;
      kind = 'shed';
      break;
    default:
      floors = 2 + Math.floor(r2 * 2.6 + n * 1.4);
      inset = 0.12 + r3 * 0.06;
  }
  const col = pick(PALETTES[zone] || PALETTES.res, v);
  const tank = (kind === 'block' || kind === 'mosque') && floors <= 7 && r3 > 0.5;
  return { kind, h: Math.round(floors * STOREY), floors, col, inset, tank, seed: Math.floor(v * 1e6) };
}
