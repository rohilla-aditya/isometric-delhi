// Turns the world into drawable items and paints them into cached chunks.
//
// The static city is far too heavy to redraw every frame, so it is painted
// once per chunk (512 device px square) and per resolution level, then blitted.
// Painter's order: ground tiles, then road strokes, then objects sorted by
// depth (i + j) so that nearer things cover farther ones.

import { iso as P, TW, TH } from './geo.js';
import { C, L, drawGround, drawTileObject, box, getMode, setMode } from './draw.js';
import { drawLandmark, modelHeight } from './landmarks.js';

export const CHUNK = 512;
export const LEVELS = [0.25, 0.5, 1, 2, 4];
const BUCKET = 128;

const ROAD_STYLE = {
  major: { edge: ['#c4bdae', 11], core: ['#66666c', 8.5], line: '#e8dfbf' },
  avenue: { edge: ['#c8c1b2', 7.5], core: ['#7b7b80', 5.6] },
  path: { edge: ['#e5dccb', 9], core: ['#c98e6c', 6.5] },
};

export class Scene {
  constructor(world) {
    this.world = world;
    this.items = [];
    this.buckets = new Map();
    const N = world.N;
    this.bounds = { x0: -N * (TW / 2) - 40, x1: N * (TW / 2) + 40, y0: -120, y1: N * TH + 40 };
    this.build();
  }

  add(item) {
    item.id = this.items.length;
    this.items.push(item);
    const bx0 = Math.floor(item.x0 / BUCKET);
    const bx1 = Math.floor(item.x1 / BUCKET);
    const by0 = Math.floor(item.y0 / BUCKET);
    const by1 = Math.floor(item.y1 / BUCKET);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const k = bx + ',' + by;
        let b = this.buckets.get(k);
        if (!b) this.buckets.set(k, (b = []));
        b.push(item.id);
      }
    }
  }

  build() {
    const w = this.world;
    const N = w.N;
    // ground
    for (const t of w.tiles) {
      const [x, y] = P(t.i, t.j);
      this.add({ o: t.i + t.j, x0: x - 17, x1: x + 17, y0: y - 1, y1: y + TH + 20, ground: t });
    }
    // roads, rails and bridges
    const lines = [];
    for (const r of w.rails) lines.push({ kind: 'rail', pts: r.pts });
    for (const r of w.roads) lines.push({ kind: r.cls, pts: r.pts });
    lines.forEach((ln, k) => {
      const bb = bboxOf(ln.pts, 8);
      this.add({ o: 1e6 + (ln.kind === 'rail' ? 0 : ln.kind === 'avenue' ? 1000 : 2000) + k, ...bb, line: ln });
    });
    for (const br of findBridges(w)) {
      const bb = bboxOf(br.pts, 12);
      this.add({ o: 1.5e6, ...bb, bridge: br });
    }
    // objects
    for (const t of w.tiles) {
      if (!t.b && !t.trees) continue;
      const [x, y] = P(t.i, t.j);
      const h = (t.b ? t.b.h + 10 : 0) + 14;
      this.add({ o: 2e6 + (t.i + t.j) * 1000 + t.i, x0: x - 18, x1: x + 18, y0: y - h, y1: y + TH + 2, tile: t });
    }
    for (const lm of w.landmarks) {
      const c = [P(lm.i0, lm.j0), P(lm.i1 + 1, lm.j0), P(lm.i1 + 1, lm.j1 + 1), P(lm.i0, lm.j1 + 1)];
      const xs = c.map((p) => p[0]);
      const ys = c.map((p) => p[1]);
      const pad = lm.id === 'signature-bridge' ? 60 : 12;
      const box = { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - modelHeight(lm.id) - 20, y1: Math.max(...ys) + 6 };
      lm.screen = box;
      this.add({ o: 2e6 + (lm.i1 + lm.j1) * 1000 + 999, ...box, lm });
    }
    // metro viaducts, in short pieces so they sort among buildings
    for (const line of w.metro) {
      const pieces = splitLine(line.pts, 0.55);
      for (const [a, b] of pieces) {
        const bb = bboxOf([a, b], 6);
        bb.y0 -= 16;
        const mi = (a[0] + b[0]) / 2;
        const mj = (a[1] + b[1]) / 2;
        this.add({ o: 2e6 + Math.floor(mi + mj) * 1000 + 998, ...bb, metro: { a, b, color: line.color } });
      }
      for (const [i, j] of line.pts) {
        const [x, y] = P(i, j);
        this.add({ o: 2e6 + Math.floor(i + j) * 1000 + 999, x0: x - 14, x1: x + 14, y0: y - 24, y1: y + 10, station: { i, j } });
      }
    }
    void N;
  }

  query(x0, y0, x1, y1) {
    const seen = new Set();
    const out = [];
    for (let by = Math.floor(y0 / BUCKET); by <= Math.floor(y1 / BUCKET); by++) {
      for (let bx = Math.floor(x0 / BUCKET); bx <= Math.floor(x1 / BUCKET); bx++) {
        const b = this.buckets.get(bx + ',' + by);
        if (!b) continue;
        for (const id of b) {
          if (seen.has(id)) continue;
          seen.add(id);
          const it = this.items[id];
          if (it.x1 < x0 || it.x0 > x1 || it.y1 < y0 || it.y0 > y1) continue;
          out.push(it);
        }
      }
    }
    out.sort((a, b) => a.o - b.o);
    return out;
  }

  /** Paint every item overlapping the world rect into ctx (already transformed). */
  paint(ctx, x0, y0, x1, y1, detail, opts) {
    const N = this.world.N;
    let clipped = false;
    for (const it of this.query(x0, y0, x1, y1)) {
      const linear = it.line || it.bridge;
      if (linear && !clipped) {
        // keep roads and rails inside the diorama
        ctx.save();
        ctx.beginPath();
        [P(0, 0), P(N, 0), P(N, N), P(0, N)].forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.clip();
        clipped = true;
      } else if (!linear && clipped) {
        ctx.restore();
        clipped = false;
      }
      if (it.ground) drawGround(ctx, it.ground, N, detail);
      else if (it.line) drawLine(ctx, it.line, detail);
      else if (it.bridge) drawBridge(ctx, it.bridge);
      else if (it.tile) drawTileObject(ctx, it.tile, detail);
      else if (it.lm) drawLandmark(ctx, it.lm);
      else if (it.metro) {
        if (opts.metro) drawViaduct(ctx, it.metro);
      } else if (it.station) {
        if (opts.metro && detail >= 1) box(ctx, it.station.i - 0.22, it.station.j - 0.22, 0.44, 0.44, 9, 4, '#e6e2d8', { topCol: '#9aa4aa' });
      }
    }
    if (clipped) ctx.restore();
  }
}

function bboxOf(pts, pad) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [i, j] of pts) {
    const [x, y] = P(i, j);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad };
}

function splitLine(pts, step) {
  const out = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let s = 0; s < n; s++) {
      out.push([
        [ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n],
        [ax + ((bx - ax) * (s + 1)) / n, ay + ((by - ay) * (s + 1)) / n],
      ]);
    }
  }
  return out;
}

/** Runs of a road that cross water become bridges with railings and piers. */
function findBridges(w) {
  const out = [];
  const wet = (i, j) => w.at(Math.floor(i), Math.floor(j))?.g === 'water';
  for (const r of [...w.roads, ...w.rails.map((x) => ({ ...x, cls: 'rail' }))]) {
    let run = null;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const [ax, ay] = r.pts[k];
      const [bx, by] = r.pts[k + 1];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.15);
      for (let s = 0; s <= n; s++) {
        const p = [ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n];
        if (wet(p[0], p[1])) {
          if (!run) run = { cls: r.cls, pts: [] };
          run.pts.push(p);
        } else if (run) {
          run.pts.push(p);
          out.push(run);
          run = null;
        }
      }
    }
    if (run) out.push(run);
  }
  return out.filter((b) => b.pts.length > 2);
}

function path(ctx, pts, z = 0) {
  ctx.beginPath();
  pts.forEach(([i, j], k) => {
    const [x, y] = P(i, j, z);
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
}

function drawLine(ctx, ln, detail) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (ln.kind === 'rail') {
    path(ctx, ln.pts);
    ctx.strokeStyle = C('#a39480');
    ctx.lineWidth = 5;
    ctx.stroke();
    if (detail >= 1) {
      ctx.setLineDash([0.8, 1.6]);
      ctx.strokeStyle = C('#6b5948');
      ctx.lineWidth = 3.6;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = C('#8d9095');
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    return;
  }
  const st = ROAD_STYLE[ln.kind];
  path(ctx, ln.pts);
  ctx.strokeStyle = C(st.edge[0]);
  ctx.lineWidth = st.edge[1];
  ctx.stroke();
  ctx.strokeStyle = C(st.core[0]);
  ctx.lineWidth = st.core[1];
  ctx.stroke();
  if (st.line && detail >= 1) {
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = C(st.line);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (getMode() !== 'day' && ln.kind !== 'path') streetLights(ctx, ln.pts, ln.kind === 'major' ? 0.9 : 1.4);
}

function streetLights(ctx, pts, every) {
  const glow = L('#ffcf7a', getMode() === 'night' ? 0.55 : 0.3);
  ctx.fillStyle = glow;
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / every));
    for (let s = 0; s < n; s++) {
      const [x, y] = P(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBridge(ctx, br) {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  // shadow on the water, piers, then the deck
  ctx.save();
  ctx.translate(0, 5);
  path(ctx, br.pts);
  ctx.strokeStyle = 'rgba(20,40,60,0.25)';
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = C('#9c958a');
  ctx.lineWidth = 1.6;
  for (let k = 0; k < br.pts.length; k += 4) {
    const [x, y] = P(br.pts[k][0], br.pts[k][1]);
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  path(ctx, br.pts);
  ctx.strokeStyle = C('#d9d3c6');
  ctx.lineWidth = br.cls === 'rail' ? 6 : br.cls === 'major' ? 11 : 8;
  ctx.stroke();
  ctx.strokeStyle = C(br.cls === 'rail' ? '#6b5948' : '#6d6d72');
  ctx.lineWidth = br.cls === 'rail' ? 3 : br.cls === 'major' ? 8 : 5.5;
  ctx.stroke();
}

function drawViaduct(ctx, m) {
  const z = 10;
  const [ax, ay] = P(m.a[0], m.a[1], 0);
  ctx.strokeStyle = C('#b9b4aa');
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax, ay - z);
  ctx.stroke();
  ctx.lineCap = 'round';
  path(ctx, [m.a, m.b], z);
  ctx.strokeStyle = C('#d6d1c6');
  ctx.lineWidth = 3.4;
  ctx.stroke();
  ctx.strokeStyle = C(m.color);
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

/** Chunk cache keyed by level and chunk index, evicted least-recently-used. */
export class ChunkCache {
  constructor(scene, max = 90) {
    this.scene = scene;
    this.max = max;
    this.map = new Map();
    this.opts = { metro: true };
  }

  clear() {
    this.map.clear();
  }

  key(level, cx, cy) {
    return level + ':' + cx + ':' + cy;
  }

  get(level, cx, cy) {
    const k = this.key(level, cx, cy);
    const c = this.map.get(k);
    if (c) {
      this.map.delete(k);
      this.map.set(k, c);
    }
    return c;
  }

  render(level, cx, cy) {
    const span = CHUNK / level;
    const x0 = cx * span;
    const y0 = cy * span;
    const cv = makeCanvas(CHUNK, CHUNK);
    const ctx = cv.getContext('2d');
    ctx.setTransform(level, 0, 0, level, -x0 * level, -y0 * level);
    this.scene.paint(ctx, x0, y0, x0 + span, y0 + span, detailFor(level), this.opts);
    const k = this.key(level, cx, cy);
    this.map.set(k, cv);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return cv;
  }
}

export function detailFor(level) {
  return level >= 2 ? 2 : level >= 1 ? 1 : 0;
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** A whole-city render at low resolution, used as fallback and minimap. */
export function renderOverview(scene, scale, opts) {
  const b = scene.bounds;
  const w = Math.ceil((b.x1 - b.x0) * scale);
  const h = Math.ceil((b.y1 - b.y0) * scale);
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, -b.x0 * scale, -b.y0 * scale);
  scene.paint(ctx, b.x0, b.y0, b.x1, b.y1, 0, opts);
  return { canvas: cv, scale, x0: b.x0, y0: b.y0 };
}

export { setMode };
