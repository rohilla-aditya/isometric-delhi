// Paints the OpenStreetMap city into cached chunks.
//
// Painter's order inside a chunk: land-use fills, water and roads, then every
// standing thing (buildings, trees, metro viaduct pieces, landmarks) sorted by
// e + s so nearer things cover farther ones.

import { iso, unIso, ZK, llToEs } from './proj.js';
import { C, L, getMode, setVS } from './draw.js';
import { MODELS } from './landmarks.js';
import { hash2 } from './geo.js';

export const CHUNK = 512;
// Chunks are painted at half resolution and shown with hard pixel edges, so the
// city reads as pixel art; 2 means one art pixel per 2 x 2 screen pixels.
export const PIXEL = 2;
export const LEVELS = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8];
export const MAX_H = 320; // tallest thing, in metres, for culling

const AREA_STYLE = {
  1: '#d9d0bd', // residential
  2: '#d6cdc6', // commercial
  3: '#cdc8c0', // industrial
  4: '#c5d08f', // farmland
  5: '#a9cf73', // grass
  6: '#8fc65c', // park
  7: '#6f9e44', // forest
  8: '#e0d2aa', // sand
  9: '#b9c4a0', // cemetery
  10: '#c9c7b2', // military
  11: '#cfd3c0', // aerodrome
  12: '#bebdb7', // apron
  13: '#7fbf55', // pitch
  14: '#4f9cc4', // water
  15: '#cbc3b5', // railway
  16: '#d8cdb6', // construction
  17: '#e2d8c6', // plaza
};
const AREA_ORDER = [1, 2, 3, 15, 10, 11, 16, 4, 8, 5, 9, 6, 7, 13, 12, 17, 14];
const LAND = '#e2d8c2';

// metres wide, casing colour, fill colour, minimum level to draw
const LINE_STYLE = {
  11: [14, null, '#4f9cc4', 1 / 8], // river
  12: [12, null, '#4f9cc4', 1 / 8], // canal
  13: [5, null, '#6aa9c8', 1 / 2], // drain
  15: [5, '#cfc4ae', '#e6dcc6', 1], // pedestrian
  7: [4.5, '#d3cbbb', '#9a9a9e', 1], // service
  6: [7, '#d9d1c1', '#8b8c91', 1 / 2], // street
  5: [10, '#ddd5c5', '#7f8086', 1 / 4], // tertiary
  4: [13, '#ddd5c5', '#76777d', 1 / 8], // secondary
  3: [16, '#e0d8c8', '#6c6d74', 1 / 8], // primary
  2: [20, '#e0d8c8', '#63646b', 1 / 8], // trunk
  1: [24, '#e3dbcb', '#5a5b62', 1 / 8], // motorway
  10: [18, null, '#a9a8a2', 1 / 4], // taxiway
  9: [45, null, '#5e6066', 1 / 8], // runway
  8: [5, null, '#9c8c78', 1 / 4], // rail
};
const LINE_ORDER = [11, 12, 13, 15, 7, 6, 5, 4, 3, 2, 1, 10, 9, 8];

// Wall colours: Delhi's painted plaster, brick and stone, a little brighter
// than life so the city reads well from above.
const PALETTES = {
  1: ['#f0c9a0', '#f4dcb4', '#e7a98e', '#f2d1c9', '#bfdcd0', '#f3e2a6', '#e6b98c', '#d8e2ec', '#f0b8a8', '#e9d7bf', '#c9d9a8', '#f5e8d2'],
  2: ['#f1d7b0', '#e5c09c', '#f2e7d2', '#d9b79a', '#e9a888', '#efd1c4', '#cfd8e2', '#e0cba8'],
  3: ['#a9c6dc', '#8fb4cf', '#c3d4e0', '#d6cdbb', '#b4c7b0', '#e6dfcf', '#f0e9dc'],
  4: ['#b4b7b5', '#a9b2bc', '#c5bfb2', '#9ea9b2', '#bdb4a3'],
  5: ['#f7f3ea', '#f4ddb8', '#ecc690', '#f6e9d0'],
  6: ['#eed8b4', '#e2c49c', '#d6bd9c', '#f0e2c8'],
  7: ['#eecb9c', '#e2b47e', '#f2dcb6'],
  8: ['#c4ad8c', '#b6a184'],
  0: ['#efd2a8', '#e9b996', '#ded1b8', '#c9dccf', '#f0dc9e', '#e3c0a4', '#d2ccbc', '#ecd8c4', '#f2c6b6'],
};

/** Landmark placement: metres per model tile, metres per model px of height. */
export const LANDMARK_SCALE = {
  'india-gate': [20, 1.0], 'rashtrapati-bhavan': [85, 1.5], 'north-block': [120, 1.6], 'south-block': [120, 1.6],
  parliament: [100, 1.3], 'connaught-place': [117, 2], 'jantar-mantar': [90, 1.4], 'bangla-sahib': [95, 1.2],
  'birla-mandir': [75, 1.45], 'new-delhi-station': [200, 1.25], 'red-fort': [180, 2.4], 'jama-masjid': [65, 1.15],
  rajghat: [60, 1], 'bharat-mandapam': [160, 3], 'purana-qila': [200, 2.2], 'humayun-tomb': [115, 1.15],
  'lodhi-tomb': [40, 1.25], 'jln-stadium': [120, 1.8], 'lotus-temple': [75, 1.55], akshardham: [100, 1.3],
  'qutub-minar': [28, 0.87], 'hauz-khas': [100, 1], tughlakabad: [250, 1.4], 'signature-bridge': [150, 2.33],
  'igi-airport': [330, 1.6],
};

/** Place landmarks in metres and record what they hide. */
export function placeLandmarks(list) {
  return list.map((lm) => {
    const [mpt, zs] = LANDMARK_SCALE[lm.id] || [60, 1];
    const c = llToEs(lm.lat, lm.lon);
    const hw = (lm.w * mpt) / 2;
    const hd = (lm.d * mpt) / 2;
    const top = (MODELS[lm.id]?.h ?? 20) * zs;
    const corners = [iso(c.e - hw, c.s - hd), iso(c.e + hw, c.s - hd), iso(c.e + hw, c.s + hd), iso(c.e - hw, c.s + hd)];
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const pad = lm.id === 'signature-bridge' ? mpt * 2 : 4;
    return {
      ...lm, e: c.e, s: c.s, mpt, zs, hw, hd, top,
      rect: [c.e - hw, c.s - hd, c.e + hw, c.s + hd],
      screen: { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - top * ZK - 10, y1: Math.max(...ys) + 4 },
      hides: !lm.onWater,
    };
  });
}

export function drawLandmarkModel(ctx, lm) {
  const g = lm.mpt / 16;
  const ci = lm.w / 2;
  const cj = lm.d / 2;
  const [X, Y] = iso(lm.e, lm.s);
  ctx.save();
  ctx.translate(X - (ci - cj) * 16 * g, Y - (ci + cj) * 8 * g);
  ctx.scale(g, g);
  setVS((lm.zs * ZK) / g);
  MODELS[lm.id].draw(ctx, { ...lm, i0: 0, j0: 0, i1: lm.w - 1, j1: lm.d - 1 });
  setVS(1);
  ctx.restore();
  if (getMode() === 'night') {
    const [fx, fy] = iso(lm.e, lm.s, lm.top * 0.4);
    const r = Math.max(lm.hw, lm.hd) * 1.6 + 20;
    const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    grd.addColorStop(0, L('#ffd9a0', 0.3));
    grd.addColorStop(1, L('#ffd9a0', 0));
    ctx.fillStyle = grd;
    ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
  }
}

function pick(list, seed) {
  return list[(seed >>> 0) % list.length];
}

function ringPath(ctx, pts) {
  for (let k = 0; k < pts.length; k += 2) {
    const x = pts[k] - pts[k + 1];
    const y = (pts[k] + pts[k + 1]) / 2;
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function linePath(ctx, pts, z = 0) {
  ctx.beginPath();
  for (let k = 0; k < pts.length; k += 2) {
    const x = pts[k] - pts[k + 1];
    const y = (pts[k] + pts[k + 1]) / 2 - z * ZK;
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
}

function inRing(e, s, pts) {
  let inside = false;
  const n = pts.length / 2;
  for (let a = 0, b = n - 1; a < n; b = a++) {
    const xa = pts[a * 2];
    const ya = pts[a * 2 + 1];
    const xb = pts[b * 2];
    const yb = pts[b * 2 + 1];
    if (ya > s !== yb > s && e < ((xb - xa) * (s - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

export class City {
  constructor(meta, store, landmarks, metroColours) {
    this.meta = meta;
    this.store = store;
    this.landmarks = landmarks;
    this.metroColours = metroColours || [];
    this.cache = new Map();
    this.max = 140;
    this.opts = { metro: true };
  }

  clear() {
    this.cache.clear();
  }

  /** Cells needed to paint a world-pixel rectangle, or null if any are still loading. */
  cellsFor(x0, y0, x1, y1) {
    const cs = this.meta.cell;
    const pts = [unIso(x0, y0), unIso(x1, y0), unIso(x0, y1 + MAX_H * ZK), unIso(x1, y1 + MAX_H * ZK)];
    const e0 = Math.min(...pts.map((p) => p.e)) - 60;
    const e1 = Math.max(...pts.map((p) => p.e)) + 60;
    const s0 = Math.min(...pts.map((p) => p.s)) - 60;
    const s1 = Math.max(...pts.map((p) => p.s)) + 60;
    const out = [];
    let missing = false;
    for (let cy = Math.max(0, Math.floor(s0 / cs)); cy <= Math.floor(s1 / cs); cy++) {
      for (let cx = Math.max(0, Math.floor(e0 / cs)); cx <= Math.floor(e1 / cs); cx++) {
        const c = this.store.get(cx, cy);
        if (c === undefined) missing = true;
        else if (c) out.push(c);
      }
    }
    return missing ? null : out;
  }

  get(level, cx, cy) {
    const k = level + ':' + cx + ':' + cy;
    const c = this.cache.get(k);
    if (c) {
      this.cache.delete(k);
      this.cache.set(k, c);
    }
    return c;
  }

  /** Paint one chunk if its cells are loaded; returns the canvas or null. */
  render(level, cx, cy, makeCanvas) {
    const span = CHUNK / level;
    const x0 = cx * span;
    const y0 = cy * span;
    const cells = this.cellsFor(x0, y0, x0 + span, y0 + span);
    if (!cells) return null;
    const cv = makeCanvas(CHUNK / PIXEL, CHUNK / PIXEL);
    const ctx = cv.getContext('2d');
    const k0 = level / PIXEL;
    ctx.setTransform(k0, 0, 0, k0, -x0 * k0, -y0 * k0);
    this.paint(ctx, cells, x0, y0, x0 + span, y0 + span, level);
    const k = level + ':' + cx + ':' + cy;
    this.cache.set(k, cv);
    while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value);
    return cv;
  }

  paint(ctx, cells, x0, y0, x1, y1, level) {
    const night = getMode() === 'night';
    ctx.fillStyle = C(LAND);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // ground region of this chunk, for culling flat things
    // ground under this chunk, reaching a little below it for trees whose
    // crowns rise into it
    const g = [unIso(x0, y0), unIso(x1, y0), unIso(x0, y1 + 60), unIso(x1, y1 + 60)];
    const ge0 = Math.min(...g.map((p) => p.e));
    const ge1 = Math.max(...g.map((p) => p.e));
    const gs0 = Math.min(...g.map((p) => p.s));
    const gs1 = Math.max(...g.map((p) => p.s));
    const hit = (b) => b[2] >= ge0 && b[0] <= ge1 && b[3] >= gs0 && b[1] <= gs1;

    // 1. land use
    const areas = [];
    for (const c of cells) for (const a of c.areas) if (hit(a.bbox)) areas.push(a);
    areas.sort((a, b) => AREA_ORDER.indexOf(a.cls) - AREA_ORDER.indexOf(b.cls));
    for (const a of areas) {
      ctx.beginPath();
      for (const r of a.rings) ringPath(ctx, r);
      ctx.fillStyle = C(AREA_STYLE[a.cls] || LAND);
      ctx.fill('evenodd');
      if (level >= 1 && (a.cls === 5 || a.cls === 6 || a.cls === 7 || a.cls === 13 || a.cls === 4)) speckle(ctx, a, level, ge0, ge1, gs0, gs1);
    }

    // 2. water lines and roads, casings first so junctions merge
    const lines = [];
    for (const c of cells) for (const l of c.lines) if (l.cls !== 14 && hit(l.bbox) && LINE_STYLE[l.cls] && level >= LINE_STYLE[l.cls][3]) lines.push(l);
    lines.sort((a, b) => LINE_ORDER.indexOf(a.cls) - LINE_ORDER.indexOf(b.cls));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const minW = 1.4 / level;
    for (const pass of ['case', 'fill']) {
      for (const l of lines) {
        if (l.flags & 1 && pass === 'case') continue;
        const [w, casing, fill] = LINE_STYLE[l.cls];
        if (pass === 'case' && !casing) continue;
        linePath(ctx, l.pts);
        ctx.strokeStyle = C(pass === 'case' ? casing : fill);
        ctx.lineWidth = Math.max(minW, pass === 'case' ? w + 3 : w);
        ctx.stroke();
        if (pass === 'fill' && level >= 1 && l.cls <= 5 && !(l.flags & 1)) laneMarks(ctx, l);
        if (l.cls === 8 && pass === 'fill' && level >= 1) {
          ctx.setLineDash([1, 2]);
          ctx.strokeStyle = C('#6b5948');
          ctx.lineWidth = 3.4;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (l.cls === 9 && pass === 'fill' && level >= 1 / 2) {
          ctx.setLineDash([24, 24]);
          ctx.strokeStyle = C('#f2f2f2');
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    // bridges: shadow, then deck with railings
    for (const l of lines) {
      if (!(l.flags & 1) || l.cls >= 8) continue;
      const [w, casing, fill] = LINE_STYLE[l.cls];
      ctx.save();
      ctx.translate(0, 5);
      linePath(ctx, l.pts);
      ctx.strokeStyle = 'rgba(20,30,40,0.22)';
      ctx.lineWidth = w + 4;
      ctx.stroke();
      ctx.restore();
      linePath(ctx, l.pts);
      ctx.strokeStyle = C(casing || '#bdb6a6', 0.9);
      ctx.lineWidth = w + 3;
      ctx.stroke();
      ctx.strokeStyle = C(fill);
      ctx.lineWidth = w;
      ctx.stroke();
    }
    if (level >= 2) for (const l of lines) if (l.cls === 6 && !(l.flags & 1)) parkedCars(ctx, l);
    if (level >= 2) for (const l of lines) if ((l.cls === 5 || l.cls === 6 || l.cls === 15) && !(l.flags & 1)) streetLife(ctx, l);
    if (getMode() !== 'day' && level >= 1 / 4) {
      ctx.fillStyle = L('#ffcf7a', night ? 0.5 : 0.28);
      for (const l of lines) {
        if (l.cls > 4) continue;
        const p = l.pts;
        for (let k = 0; k < p.length - 2; k += 2) {
          const len = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
          for (let t = 0; t < len; t += 45) {
            const e = p[k] + ((p[k + 2] - p[k]) * t) / len;
            const s = p[k + 1] + ((p[k + 3] - p[k + 1]) * t) / len;
            // a small pool of lamplight, never bigger than a few screen pixels
            ctx.beginPath();
            ctx.arc(e - s, (e + s) / 2, Math.min(3, 2.5 / level), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // 3. standing things, sorted by depth
    const things = [];
    const lms = this.landmarks.filter((lm) => lm.screen.x1 >= x0 && lm.screen.x0 <= x1 && lm.screen.y1 >= y0 && lm.screen.y0 <= y1);
    const hidden = this.landmarks.filter((lm) => lm.hides);
    const yTop = y0;
    const yBot = y1 + MAX_H * ZK;
    for (const c of cells) {
      for (const b of c.buildings) {
        const bx = b.ce - b.cs;
        const by = (b.ce + b.cs) / 2;
        if (bx < x0 - 400 || bx > x1 + 400 || by < yTop - 200 || by > yBot) continue;
        if (level < 1 / 4 && b.area < 60) continue;
        let skip = false;
        for (const lm of hidden) {
          const r = lm.rect;
          if (b.ce > r[0] && b.ce < r[2] && b.cs > r[1] && b.cs < r[3]) {
            skip = true;
            break;
          }
        }
        if (!skip) things.push({ d: b.ce + b.cs, b });
      }
    }
    if (level >= 1 / 2) this.addTrees(things, areas, ge0, ge1, gs0, gs1, level);
    if (this.opts.metro) {
      for (const c of cells) {
        for (const l of c.lines) {
          if (l.cls !== 14 || !hit(l.bbox)) continue;
          const p = l.pts;
          for (let k = 0; k < p.length - 2; k += 2) {
            const len = Math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]);
            const n = Math.max(1, Math.ceil(len / 25));
            for (let t = 0; t < n; t++) {
              const a = [p[k] + ((p[k + 2] - p[k]) * t) / n, p[k + 1] + ((p[k + 3] - p[k + 1]) * t) / n];
              const b2 = [p[k] + ((p[k + 2] - p[k]) * (t + 1)) / n, p[k + 1] + ((p[k + 3] - p[k + 1]) * (t + 1)) / n];
              things.push({ d: a[0] + a[1] + b2[0] + b2[1] - (a[0] + a[1]), m: { a, b: b2, col: this.metroColours[l.flags >> 1] || '#9a9a9a', pillar: t % 2 === 0 } });
            }
          }
        }
      }
    }
    for (const lm of lms) things.push({ d: lm.e + lm.s + lm.hw + lm.hd, lm });
    things.sort((a, b) => a.d - b.d);

    if (level >= 1 / 4 && getMode() !== 'night') shadows(ctx, things);
    const walls = level >= 1 / 4;
    for (const t of things) {
      if (t.b) this.building(ctx, t.b, walls, level, night);
      else if (t.tree) tree(ctx, t.tree, level);
      else if (t.m) viaduct(ctx, t.m, level);
      else if (t.lm) drawLandmarkModel(ctx, t.lm);
    }
  }

  addTrees(things, areas, e0, e1, s0, s1, level) {
    for (const a of areas) {
      if (a.cls !== 6 && a.cls !== 7 && a.cls !== 9 && a.cls !== 5) continue;
      const step = a.cls === 7 ? 13 : a.cls === 5 ? 40 : 20;
      const [be0, bs0, be1, bs1] = a.bbox;
      const ea = Math.max(e0, be0);
      const eb = Math.min(e1, be1);
      const sa = Math.max(s0, bs0);
      const sb = Math.min(s1, bs1);
      if (ea > eb || sa > sb) continue;
      for (let s = Math.floor(sa / step) * step; s < sb; s += step) {
        for (let e = Math.floor(ea / step) * step; e < eb; e += step) {
          const ix = Math.round(e / step);
          const iy = Math.round(s / step);
          const r = hash2(ix, iy, a.cls);
          if (a.cls !== 7 && r < 0.35) continue;
          const te = e + hash2(ix, iy, 7) * step * 0.8;
          const ts = s + hash2(ix, iy, 9) * step * 0.8;
          if (!inRing(te, ts, a.rings[0])) continue;
          let hole = false;
          for (let k = 1; k < a.rings.length; k++) if (inRing(te, ts, a.rings[k])) hole = true;
          if (hole) continue;
          things.push({ d: te + ts, tree: { e: te, s: ts, size: (a.cls === 7 ? 3.2 : 4) + r * 2.4, kikar: a.cls === 7 } });
        }
      }
    }
    void level;
  }

  building(ctx, b, walls, level, night) {
    const p = b.pts;
    const n = p.length / 2;
    const h = b.h;
    const col = pick(PALETTES[b.kind] || PALETTES[0], b.seed);
    // Delhi roofs are mostly bare concrete, tinted a little by the walls
    const roofCol = b.kind === 4 ? '#b9bec2' : mix(col, '#d6d1c6', 0.55);
    const detail = level >= 1 && walls;
    if (walls) {
      const faces = [];
      for (let k = 0; k < n; k++) {
        const ae = p[k * 2];
        const as = p[k * 2 + 1];
        const be = p[((k + 1) % n) * 2];
        const bs = p[((k + 1) % n) * 2 + 1];
        const de = be - ae;
        const ds = bs - as;
        let ne = ds * b.orient;
        let ns = -de * b.orient;
        const len = Math.hypot(ne, ns) || 1;
        ne /= len;
        ns /= len;
        if (ne + ns <= 0) continue;
        faces.push({ ae, as, be, bs, d: ae + as + be + bs, f: 0.72 + 0.24 * ((ns - ne + 1) / 2), len: Math.hypot(de, ds) });
      }
      faces.sort((x, y) => x.d - y.d);
      const shop = detail && h <= 22 && (b.kind === 3 || ((b.kind === 0 || b.kind === 1) && b.seed % 3 === 0));
      for (const f of faces) {
        quad(ctx, f, 0, h);
        ctx.fillStyle = C(col, f.f);
        ctx.fill();
        if (level >= 1 / 2) {
          ctx.strokeStyle = C(col, f.f);
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
        if (detail && f.len > 2.5) {
          if (shop) shopFront(ctx, f, b.seed, night);
          this.windows(ctx, f, h, b.seed, night, b.kind, shop);
        }
        if (detail) {
          // bold pixel-art ink line down the corners and along the foot of the wall
          ctx.strokeStyle = C(INK);
          ctx.lineWidth = PIXEL / level;
          ctx.beginPath();
          ctx.moveTo(f.ae - f.as, (f.ae + f.as) / 2 - h * ZK);
          ctx.lineTo(f.ae - f.as, (f.ae + f.as) / 2);
          ctx.lineTo(f.be - f.bs, (f.be + f.bs) / 2);
          ctx.lineTo(f.be - f.bs, (f.be + f.bs) / 2 - h * ZK);
          ctx.stroke();
        }
      }
    }
    // roof, kept as its own path: the detail below draws other shapes in between
    const roof = new Path2D();
    for (let k = 0; k < n; k++) {
      const x = p[k * 2] - p[k * 2 + 1];
      const y = (p[k * 2] + p[k * 2 + 1]) / 2 - h * ZK;
      if (k) roof.lineTo(x, y);
      else roof.moveTo(x, y);
    }
    roof.closePath();
    ctx.fillStyle = C(walls ? roofCol : col, walls ? 1.06 : 1);
    ctx.fill(roof);
    if (!detail) return;
    // inside the roof: weathering stains, then the parapet as a pale lip with
    // a shadowed inner face, then a bold ink outline around it all
    ctx.save();
    ctx.clip(roof);
    if (b.kind === 4) corrugate(ctx, b, h, roofCol);
    else weather(ctx, b, h, roofCol, level);
    ctx.strokeStyle = C(roofCol, 0.8);
    ctx.lineWidth = 3.4;
    ctx.stroke(roof);
    ctx.strokeStyle = C(roofCol, 1.16);
    ctx.lineWidth = 1.7;
    ctx.stroke(roof);
    ctx.restore();
    ctx.strokeStyle = C(INK);
    ctx.lineWidth = PIXEL / level;
    ctx.stroke(roof);
    if (level >= 2 || b.area < 4000) this.roofTop(ctx, b, h, col, roofCol);
  }

  /** Stair room, water tank, AC units, solar panels and dishes on flat roofs. */
  roofTop(ctx, b, h, col, roofCol) {
    if (b.kind === 4 || b.kind === 8 || b.area < 35) return;
    const r = (k) => hash2(b.seed, k, 13);
    const inside = (e, s) => inRing(e, s, b.pts);
    const v0e = b.pts[0];
    const v0s = b.pts[1];
    // a stair room ("mumty") towards one corner
    if (b.area > 60 && b.kind !== 5 && r(1) < 0.8) {
      const e = v0e + (b.ce - v0e) * 0.4;
      const s = v0s + (b.cs - v0s) * 0.4;
      if (inside(e, s)) block(ctx, e - 1.3, s - 1.3, 2.6, 2.6, h, 2.6, col, roofCol);
    }
    // the black plastic water tank on nearly every Delhi roof
    if ((b.kind <= 2 || b.kind === 7) && h < 40 && r(2) < 0.85) {
      const e = b.ce + (r(3) - 0.5) * Math.sqrt(b.area) * 0.35;
      const s = b.cs + (r(4) - 0.5) * Math.sqrt(b.area) * 0.35;
      if (inside(e, s)) tank(ctx, e, s, h);
    }
    // window AC units along the roof
    const nAc = b.area > 80 ? 1 + Math.floor(r(5) * 3) : 0;
    for (let k = 0; k < nAc; k++) {
      const e = b.ce + (r(10 + k) - 0.5) * Math.sqrt(b.area) * 0.6;
      const s = b.cs + (r(20 + k) - 0.5) * Math.sqrt(b.area) * 0.6;
      if (inside(e, s)) block(ctx, e, s, 1.1, 0.8, h, 0.7, '#d9dcdc', '#eef0f0');
    }
    // solar panels on big roofs: schools, offices, flats, temples
    if (b.area > 350 && (b.kind === 2 || b.kind === 3 || b.kind === 6 || b.kind === 7 || r(6) < 0.25)) {
      const rows = Math.min(4, Math.floor(Math.sqrt(b.area) / 9));
      for (let a = 0; a < rows; a++) {
        for (let c = 0; c < rows + 1; c++) {
          const e = b.ce + (c - rows / 2) * 2.2;
          const s = b.cs + (a - rows / 2) * 1.8;
          if (inside(e, s) && inside(e + 1.8, s + 1.1)) panel(ctx, e, s, h);
        }
      }
    }
    // washing drying on a line
    if (b.kind <= 2 && b.area > 70 && r(30) < 0.35) {
      const a0 = [b.ce + (r(31) - 0.5) * Math.sqrt(b.area) * 0.5, b.cs + (r(32) - 0.5) * Math.sqrt(b.area) * 0.5];
      const a1 = [a0[0] + 4, a0[1] - 1.5];
      if (inside(...a0) && inside(...a1)) washing(ctx, a0, a1, h, b.seed);
    }
    // a dish on some houses
    if (b.kind <= 1 && r(7) < 0.3) {
      const e = b.ce + (r(8) - 0.5) * Math.sqrt(b.area) * 0.5;
      const s = b.cs + (r(9) - 0.5) * Math.sqrt(b.area) * 0.5;
      if (inside(e, s)) {
        const [x, y] = iso(e, s, h + 1.2);
        ctx.fillStyle = C('#f2f2ee');
        ctx.beginPath();
        ctx.ellipse(x, y, 0.9, 0.6, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = C('#8d8f90');
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
    }
  }

  windows(ctx, f, h, seed, night, kind, shop) {
    const floors = Math.max(1, Math.floor(h / 3.2));
    const glass = (kind === 3 || kind === 6) && h > 18;
    const cols = Math.max(1, Math.floor(f.len / (glass ? 2.2 : 3.4)));
    const first = shop ? 1 : 0;
    const winH = glass ? 2.2 : 1.4;
    const winW = glass ? 0.86 : 0.42;
    const day = glass ? C('#9fc0d6', f.f + 0.12) : C('#3c5573', f.f + 0.15);
    for (let k = first; k < floors; k++) {
      const z0 = k * 3.2 + (glass ? 0.5 : 1.1);
      if (z0 + winH > h - 0.4) break;
      for (let c = 0; c < cols; c++) {
        const lit = night && hash2(seed + k * 31, c + Math.round(f.ae), 5) < 0.42;
        if (night && !lit) continue;
        ctx.fillStyle = night ? L('#ffd98a', 0.92) : day;
        const t0 = (c + 0.5 - winW / 2) / cols;
        const t1 = (c + 0.5 + winW / 2) / cols;
        const ae = f.ae + (f.be - f.ae) * t0;
        const as = f.as + (f.bs - f.as) * t0;
        const be = f.ae + (f.be - f.ae) * t1;
        const bs = f.as + (f.bs - f.as) * t1;
        ctx.beginPath();
        ctx.moveTo(ae - as, (ae + as) / 2 - z0 * ZK);
        ctx.lineTo(be - bs, (be + bs) / 2 - z0 * ZK);
        ctx.lineTo(be - bs, (be + bs) / 2 - (z0 + winH) * ZK);
        ctx.lineTo(ae - as, (ae + as) / 2 - (z0 + winH) * ZK);
        ctx.fill();
      }
    }
  }
}

const INK = '#3b332d'; // outline colour

/** Rain stains and dirt on a bare concrete roof (path is clipped to the roof). */
function weather(ctx, b, h, roofCol, level) {
  const size = Math.sqrt(b.area);
  const n = 2 + Math.floor(hash2(b.seed, 40, 7) * 4);
  for (let k = 0; k < n; k++) {
    const e = b.ce + (hash2(b.seed, 41 + k, 7) - 0.5) * size;
    const s = b.cs + (hash2(b.seed, 51 + k, 7) - 0.5) * size;
    const r = size * (0.12 + hash2(b.seed, 61 + k, 7) * 0.22);
    const [x, y] = iso(e, s, h);
    ctx.fillStyle = C(k % 3 === 2 ? '#8a7a64' : '#6f6a62');
    ctx.globalAlpha = 0.16 + hash2(b.seed, 71 + k, 7) * 0.12;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.55, hash2(b.seed, 81 + k, 7) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (level < 2) return;
  // grit: scattered single art pixels
  const dot = PIXEL / level;
  const [bx0, by0, bx1, by1] = bbox(b.pts);
  for (let k = 0; k < Math.min(60, b.area / 12); k++) {
    const e = bx0 + hash2(b.seed, 100 + k, 9) * (bx1 - bx0);
    const s = by0 + hash2(b.seed, 200 + k, 9) * (by1 - by0);
    const [x, y] = iso(e, s, h);
    ctx.fillStyle = C(roofCol, k % 2 ? 0.82 : 1.12);
    ctx.fillRect(x, y, dot, dot);
  }
}

const CLOTHES = ['#d9443a', '#2f7bd8', '#f2c318', '#3a9a4a', '#ffffff', '#e05aa0', '#8b3fb0'];

function washing(ctx, a, b, z, seed) {
  const [ax, ay] = iso(a[0], a[1], z + 1.6);
  const [bx, by] = iso(b[0], b[1], z + 1.6);
  ctx.strokeStyle = C('#5a5550');
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.moveTo(ax, ay + 1.6);
  ctx.lineTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx, by + 1.6);
  ctx.stroke();
  const n = 4 + ((seed >>> 0) % 3);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    ctx.fillStyle = C(CLOTHES[((seed >>> 0) + k * 3) % CLOTHES.length]);
    ctx.fillRect(x - 0.35, y, 0.7, 0.9 + ((seed >> k) & 1) * 0.4);
  }
}

const SKIN = ['#8d5a3b', '#a8714c', '#6f442b', '#b9825a'];
const DRESS = ['#d9443a', '#2f7bd8', '#f2c318', '#3a9a4a', '#ffffff', '#e05aa0', '#8b3fb0', '#f07c1c', '#4a4a52', '#e9e1cf'];

/** People on the footpaths and the odd vendor cart with its umbrella. */
function streetLife(ctx, l) {
  const p = l.pts;
  const half = (LINE_STYLE[l.cls][0] + 3) / 2;
  for (let k = 0; k < p.length - 2; k += 2) {
    const ae = p[k];
    const as = p[k + 1];
    const de = p[k + 2] - ae;
    const ds = p[k + 3] - as;
    const len = Math.hypot(de, ds);
    if (len < 8) continue;
    const ue = de / len;
    const us = ds / len;
    for (let t = 3; t < len - 3; t += 3.2) {
      const r = hash2(Math.round((ae + ue * t) * 2), Math.round((as + us * t) * 2), 47);
      if (r > (l.cls === 15 ? 0.3 : 0.12)) continue;
      const side = r < 0.06 ? -1 : 1;
      const off = l.cls === 15 ? (r - 0.15) * 6 : side * (half - 0.4);
      const e = ae + ue * t - us * off;
      const s = as + us * t + ue * off;
      if (r < 0.012 && l.cls !== 15) cart(ctx, e, s, r);
      else person(ctx, e, s, r);
    }
  }
}

function person(ctx, e, s, r) {
  const [x, y] = iso(e, s);
  const q = Math.floor(r * 1e4);
  ctx.fillStyle = 'rgba(40,40,70,0.25)';
  ctx.fillRect(x - 0.2, y - 0.2, 1.1, 0.5);
  ctx.fillStyle = C(DRESS[q % DRESS.length]);
  ctx.fillRect(x - 0.35, y - 1.5, 0.7, 1.3);
  ctx.fillStyle = C(SKIN[(q >> 3) % SKIN.length]);
  ctx.fillRect(x - 0.3, y - 2.1, 0.6, 0.6);
}

function cart(ctx, e, s, r) {
  const [x, y] = iso(e, s);
  const q = Math.floor(r * 1e5);
  ctx.fillStyle = C('#8a5a34');
  ctx.fillRect(x - 1.2, y - 1.2, 2.4, 1);
  ctx.fillStyle = C(['#e8402c', '#f2c318', '#3a9a4a', '#f07c1c'][q % 4]);
  ctx.fillRect(x - 1.1, y - 1.8, 2.2, 0.6); // the fruit and vegetables
  ctx.strokeStyle = C('#5a5550');
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  ctx.moveTo(x, y - 1.8);
  ctx.lineTo(x, y - 3.6);
  ctx.stroke();
  ctx.fillStyle = C(AWNINGS[q % AWNINGS.length]);
  ctx.beginPath();
  ctx.moveTo(x - 1.8, y - 3.2);
  ctx.lineTo(x, y - 4.2);
  ctx.lineTo(x + 1.8, y - 3.2);
  ctx.closePath();
  ctx.fill();
}

const AWNINGS = ['#d9443a', '#2f7bd8', '#f2c318', '#3a9a4a', '#e07a2e', '#8b3fb0', '#e05aa0'];

/** Ground-floor shop: rolling shutter and a striped awning above it. */
function shopFront(ctx, f, seed, night) {
  quad(ctx, f, 0.2, 2.5);
  ctx.fillStyle = night ? L('#ffcf7a', 0.75) : C('#a6a6a2', f.f);
  ctx.fill();
  const awn = AWNINGS[(seed >>> 3) % AWNINGS.length];
  quad(ctx, f, 2.5, 3.3);
  ctx.fillStyle = C(awn, f.f + 0.05);
  ctx.fill();
  // stripes on the awning
  const n = Math.max(2, Math.floor(f.len / 1.4));
  ctx.fillStyle = C('#f6f1e6', f.f);
  for (let k = 0; k < n; k += 2) {
    const t0 = k / n;
    const t1 = (k + 1) / n;
    const ae = f.ae + (f.be - f.ae) * t0;
    const as = f.as + (f.bs - f.as) * t0;
    const be = f.ae + (f.be - f.ae) * t1;
    const bs = f.as + (f.bs - f.as) * t1;
    ctx.beginPath();
    ctx.moveTo(ae - as, (ae + as) / 2 - 2.5 * ZK);
    ctx.lineTo(be - bs, (be + bs) / 2 - 2.5 * ZK);
    ctx.lineTo(be - bs, (be + bs) / 2 - 3.3 * ZK);
    ctx.lineTo(ae - as, (ae + as) / 2 - 3.3 * ZK);
    ctx.fill();
  }
}

/** A wall face between heights z0 and z1, as the current path. */
function quad(ctx, f, z0, z1) {
  ctx.beginPath();
  ctx.moveTo(f.ae - f.as, (f.ae + f.as) / 2 - z0 * ZK);
  ctx.lineTo(f.be - f.bs, (f.be + f.bs) / 2 - z0 * ZK);
  ctx.lineTo(f.be - f.bs, (f.be + f.bs) / 2 - z1 * ZK);
  ctx.lineTo(f.ae - f.as, (f.ae + f.as) / 2 - z1 * ZK);
  ctx.closePath();
}

/** Small axis-aligned box standing on a roof at height z. */
function block(ctx, e, s, w, d, z, h, col, top) {
  const P = (ee, ss, zz) => iso(ee, ss, zz);
  const face = (pts, fill) => {
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  face([P(e, s + d, z), P(e + w, s + d, z), P(e + w, s + d, z + h), P(e, s + d, z + h)], C(col, 0.96));
  face([P(e + w, s, z), P(e + w, s + d, z), P(e + w, s + d, z + h), P(e + w, s, z + h)], C(col, 0.74));
  face([P(e, s, z + h), P(e + w, s, z + h), P(e + w, s + d, z + h), P(e, s + d, z + h)], C(top, 1.04));
}

function tank(ctx, e, s, z) {
  const [x, y] = iso(e, s, z);
  const rx = 1.5;
  const ry = 0.75;
  const hh = 1.8 * ZK;
  ctx.fillStyle = C('#26282b');
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(x - rx, y - hh);
  ctx.ellipse(x, y - hh, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C('#3c3f43');
  ctx.beginPath();
  ctx.ellipse(x, y - hh, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function panel(ctx, e, s, z) {
  const a = iso(e, s, z + 0.3);
  const b = iso(e + 1.8, s, z + 0.9);
  const c = iso(e + 1.8, s + 1.1, z + 0.9);
  const d = iso(e, s + 1.1, z + 0.3);
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.lineTo(...c);
  ctx.lineTo(...d);
  ctx.closePath();
  ctx.fillStyle = C('#2c4a7a');
  ctx.fill();
  ctx.strokeStyle = C('#9fb4d0');
  ctx.lineWidth = 0.25;
  ctx.stroke();
}

/** Corrugated metal stripes across a factory roof (path already clipped). */
function corrugate(ctx, b, h, roofCol) {
  const [e0, s0, e1, s1] = bbox(b.pts);
  ctx.strokeStyle = C(roofCol, 0.88);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let e = Math.floor(e0); e < e1; e += 1.6) {
    const a = iso(e, s0, h);
    const c = iso(e, s1, h);
    ctx.moveTo(...a);
    ctx.lineTo(...c);
  }
  ctx.stroke();
}

function bbox(pts) {
  let e0 = Infinity;
  let s0 = Infinity;
  let e1 = -Infinity;
  let s1 = -Infinity;
  for (let k = 0; k < pts.length; k += 2) {
    e0 = Math.min(e0, pts[k]);
    e1 = Math.max(e1, pts[k]);
    s0 = Math.min(s0, pts[k + 1]);
    s1 = Math.max(s1, pts[k + 1]);
  }
  return [e0, s0, e1, s1];
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

/** Dashed centre line: yellow on the big roads, white on the smaller ones. */
function laneMarks(ctx, l) {
  linePath(ctx, l.pts);
  ctx.setLineDash(l.cls <= 3 ? [7, 6] : [4, 7]);
  ctx.strokeStyle = C(l.cls <= 3 ? '#f2c94c' : '#f4f1e8');
  ctx.lineWidth = l.cls <= 2 ? 0.9 : 0.6;
  ctx.stroke();
  ctx.setLineDash([]);
}

const PARKED = ['#f4f4f2', '#c9cdd2', '#3d4247', '#b8322a', '#2f5d9e', '#d8d2c2', '#4f9a3a', '#f2c318'];

/** Cars parked along both kerbs of residential streets. */
function parkedCars(ctx, l) {
  const p = l.pts;
  for (let k = 0; k < p.length - 2; k += 2) {
    const ae = p[k];
    const as = p[k + 1];
    const de = p[k + 2] - ae;
    const ds = p[k + 3] - as;
    const len = Math.hypot(de, ds);
    if (len < 12) continue;
    const ue = de / len;
    const us = ds / len;
    for (let t = 6; t < len - 6; t += 6.5) {
      for (const side of [-1, 1]) {
        const r = hash2(Math.round((ae + ue * t) * 3), Math.round((as + us * t) * 3) + side, 21);
        if (r > 0.45) continue;
        const ce = ae + ue * t - us * side * 2.6;
        const cs = as + us * t + ue * side * 2.6;
        const hl = 2.1;
        const hw = 0.85;
        const pts = [
          [ce + ue * hl - us * hw, cs + us * hl + ue * hw], [ce + ue * hl + us * hw, cs + us * hl - ue * hw],
          [ce - ue * hl + us * hw, cs - us * hl - ue * hw], [ce - ue * hl - us * hw, cs - us * hl + ue * hw],
        ];
        ctx.beginPath();
        pts.forEach(([e, s], q) => {
          const [x, y] = iso(e, s, 0.8);
          if (q) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = C(PARKED[Math.floor(r * 100) % PARKED.length]);
        ctx.fill();
        ctx.strokeStyle = C('#2b2b2e', 0.9);
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
    }
  }
}

/** Dithered speckles that give grass and fields a hand-drawn texture. */
function speckle(ctx, a, level, e0, e1, s0, s1) {
  const [be0, bs0, be1, bs1] = a.bbox;
  const ea = Math.max(e0, be0);
  const eb = Math.min(e1, be1);
  const sa = Math.max(s0, bs0);
  const sb = Math.min(s1, bs1);
  if (ea > eb || sa > sb) return;
  const step = level >= 2 ? 2.2 : 3.4;
  const dot = PIXEL / level; // one art pixel
  const base = AREA_STYLE[a.cls];
  const dark = C(base, 0.86);
  const light = C(base, 1.1);
  ctx.save();
  ctx.beginPath();
  for (const r of a.rings) ringPath(ctx, r);
  ctx.clip('evenodd');
  for (let s = Math.floor(sa / step) * step; s < sb; s += step) {
    for (let e = Math.floor(ea / step) * step; e < eb; e += step) {
      const r = hash2(Math.round(e / step), Math.round(s / step), 31);
      if (r > 0.5) continue;
      const pe = e + hash2(Math.round(e), Math.round(s), 3) * step;
      const ps = s + hash2(Math.round(s), Math.round(e), 4) * step;
      ctx.fillStyle = r < 0.3 ? dark : light;
      ctx.fillRect(pe - ps, (pe + ps) / 2, dot * 2, dot);
    }
  }
  ctx.restore();
}

/**
 * Sun shadows for every building in one path. Each building adds its
 * footprint, the footprint shifted away from the sun and the band between
 * them, all wound the same way, so a single non-zero fill gives an even
 * shadow where they overlap.
 */
function shadows(ctx, things) {
  const dusk = getMode() === 'dusk';
  const k = dusk ? 2.2 : 0.9; // shadow length per metre of height
  const oe = 0.55 * k;
  const os = -0.35 * k;
  ctx.beginPath();
  for (const t of things) {
    const b = t.b;
    if (!b) continue;
    const p = b.pts;
    const n = p.length / 2;
    const de = b.h * oe;
    const ds = b.h * os;
    const ring = (ee, ss) => {
      const xy = [];
      for (let q = 0; q < n; q++) xy.push(p[q * 2] + ee - (p[q * 2 + 1] + ss), (p[q * 2] + ee + p[q * 2 + 1] + ss) / 2);
      return xy;
    };
    addPoly(ctx, ring(0, 0));
    addPoly(ctx, ring(de, ds));
    for (let q = 0; q < n; q++) {
      const ae = p[q * 2];
      const as = p[q * 2 + 1];
      const be = p[((q + 1) % n) * 2];
      const bs = p[((q + 1) % n) * 2 + 1];
      addPoly(ctx, [ae - as, (ae + as) / 2, be - bs, (be + bs) / 2, be + de - (bs + ds), (be + de + bs + ds) / 2, ae + de - (as + ds), (ae + de + as + ds) / 2]);
    }
  }
  ctx.fillStyle = dusk ? 'rgba(70,40,90,0.26)' : 'rgba(50,60,120,0.2)';
  ctx.fill('nonzero');
}

function addPoly(ctx, xy) {
  let a = 0;
  const n = xy.length / 2;
  for (let q = 0; q < n; q++) {
    const r = (q + 1) % n;
    a += xy[q * 2] * xy[r * 2 + 1] - xy[r * 2] * xy[q * 2 + 1];
  }
  if (Math.abs(a) < 1e-6) return;
  const fwd = a > 0;
  for (let q = 0; q < n; q++) {
    const i = fwd ? q : n - 1 - q;
    if (q) ctx.lineTo(xy[i * 2], xy[i * 2 + 1]);
    else ctx.moveTo(xy[i * 2], xy[i * 2 + 1]);
  }
  ctx.closePath();
}

function tree(ctx, t, level) {
  const [x, y] = iso(t.e, t.s);
  const s = t.size;
  if (level < 1) {
    ctx.fillStyle = C(t.kikar ? '#5f7f3a' : '#4f8a3a', 0.9);
    ctx.beginPath();
    ctx.arc(x, y - s, s, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.5, y, s * 1.05, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C('#6b4a2f');
  ctx.lineWidth = s * 0.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - s * 1.2);
  ctx.stroke();
  const col = t.kikar ? '#6a8a3e' : '#5d8f3c';
  if (t.kikar) {
    ctx.fillStyle = C(col, 0.85);
    ctx.beginPath();
    ctx.ellipse(x, y - s * 1.4, s * 1.2, s * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C(col, 1.08);
    ctx.beginPath();
    ctx.ellipse(x - s * 0.2, y - s * 1.6, s * 0.8, s * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = C(col, 0.82);
  ctx.beginPath();
  ctx.arc(x, y - s * 1.7, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C(col, 1.06);
  ctx.beginPath();
  ctx.arc(x - s * 0.3, y - s * 1.95, s * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

const DECK = 11; // metro viaduct height, m

function viaduct(ctx, m, level) {
  const [ax, ay] = iso(m.a[0], m.a[1]);
  if (m.pillar && level >= 1 / 2) {
    ctx.strokeStyle = C('#b9b4aa');
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax, ay - DECK * ZK);
    ctx.stroke();
  }
  const [bx, by] = iso(m.b[0], m.b[1], DECK);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(ax, ay - DECK * ZK);
  ctx.lineTo(bx, by);
  ctx.strokeStyle = C('#d6d1c6');
  ctx.lineWidth = Math.max(9, 1.5 / level);
  ctx.stroke();
  ctx.strokeStyle = C(m.col);
  ctx.lineWidth = Math.max(2.5, 1 / level);
  ctx.stroke();
}
