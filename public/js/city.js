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
export const LEVELS = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4];
export const MAX_H = 320; // tallest thing, in metres, for culling

const AREA_STYLE = {
  1: '#d9d0bd', // residential
  2: '#d6cdc6', // commercial
  3: '#cdc8c0', // industrial
  4: '#c5d08f', // farmland
  5: '#b5cc85', // grass
  6: '#a3c876', // park
  7: '#88a65c', // forest
  8: '#e0d2aa', // sand
  9: '#b9c4a0', // cemetery
  10: '#c9c7b2', // military
  11: '#cfd3c0', // aerodrome
  12: '#bebdb7', // apron
  13: '#9dc46e', // pitch
  14: '#6aa5bf', // water
  15: '#cbc3b5', // railway
  16: '#d8cdb6', // construction
  17: '#e2d8c6', // plaza
};
const AREA_ORDER = [1, 2, 3, 15, 10, 11, 16, 4, 8, 5, 9, 6, 7, 13, 12, 17, 14];
const LAND = '#e3dccb';

// metres wide, casing colour, fill colour, minimum level to draw
const LINE_STYLE = {
  11: [14, null, '#6aa5bf', 1 / 8], // river
  12: [12, null, '#6aa5bf', 1 / 8], // canal
  13: [5, null, '#7fb0c4', 1 / 2], // drain
  15: [5, '#d8cfbf', '#e9e2d4', 1], // pedestrian
  7: [4.5, '#d2cbbd', '#f1ede4', 1], // service
  6: [7, '#c9c1b1', '#f6f2ea', 1 / 2], // street
  5: [10, '#bfb5a2', '#fbf7ee', 1 / 4], // tertiary
  4: [13, '#b8a98d', '#fff6dd', 1 / 8], // secondary
  3: [16, '#b39a74', '#ffe9b8', 1 / 8], // primary
  2: [20, '#a8875d', '#f9d58c', 1 / 8], // trunk
  1: [24, '#9a7650', '#f3b86a', 1 / 8], // motorway
  10: [18, null, '#a9a8a2', 1 / 4], // taxiway
  9: [45, null, '#6a6c70', 1 / 8], // runway
  8: [5, null, '#a39480', 1 / 4], // rail
};
const LINE_ORDER = [11, 12, 13, 15, 7, 6, 5, 4, 3, 2, 1, 10, 9, 8];

const PALETTES = {
  1: ['#e8d8b9', '#f0e2c8', '#e3c6a6', '#d9b99b', '#efd9d0', '#cfd8d0', '#e6cfa0', '#f2e8d8', '#d8a48f', '#c9b9a4', '#e9c9b6'],
  2: ['#e8d2b0', '#d8c0a0', '#e9e2d0', '#c9b7a0', '#d9a080', '#e0c8b8', '#c8b8a8'],
  3: ['#9fb7c9', '#8aa6b8', '#b8c6cf', '#c9c2b4', '#a6b3a0', '#d8d2c4', '#e2ddd2'],
  4: ['#a7aaa8', '#9aa3ad', '#b8b2a5', '#8f9aa3', '#b0a898'],
  5: ['#f3efe6', '#f0dcc0', '#e8c9a0', '#f2e6d0'],
  6: ['#e6d3b3', '#d9c2a0', '#cdb79a', '#e8dcc6'],
  7: ['#e4c9a2', '#d6b48a', '#e9d6b6'],
  8: ['#b9a58a', '#a99a85'],
  0: ['#e8d8b9', '#e3c6a6', '#d9c9b0', '#cfd8d0', '#e6cfa0', '#d8bfa8', '#c8c0b0', '#e1d3c2'],
};

/** Landmark placement: metres per model tile, metres per model px of height. */
export const LANDMARK_SCALE = {
  'india-gate': [20, 1.0], 'rashtrapati-bhavan': [85, 1.5], 'north-block': [120, 1.6], 'south-block': [120, 1.6],
  parliament: [100, 1.3], 'connaught-place': [140, 2], 'jantar-mantar': [90, 1.4], 'bangla-sahib': [95, 1.2],
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
    this.max = 80;
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
    const cv = makeCanvas(CHUNK, CHUNK);
    const ctx = cv.getContext('2d');
    ctx.setTransform(level, 0, 0, level, -x0 * level, -y0 * level);
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
    const g = [unIso(x0, y0), unIso(x1, y0), unIso(x0, y1), unIso(x1, y1)];
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
            ctx.beginPath();
            ctx.arc(e - s, (e + s) / 2, 5, 0, Math.PI * 2);
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
    if (level >= 1 / 2) this.addTrees(things, areas, ge0, ge1, gs0, gs1 + MAX_H, level);
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
        faces.push({ ae, as, be, bs, d: ae + as + be + bs, f: 0.72 + 0.24 * ((ns - ne + 1) / 2) });
      }
      faces.sort((x, y) => x.d - y.d);
      for (const f of faces) {
        ctx.beginPath();
        ctx.moveTo(f.ae - f.as, (f.ae + f.as) / 2);
        ctx.lineTo(f.be - f.bs, (f.be + f.bs) / 2);
        ctx.lineTo(f.be - f.bs, (f.be + f.bs) / 2 - h * ZK);
        ctx.lineTo(f.ae - f.as, (f.ae + f.as) / 2 - h * ZK);
        ctx.closePath();
        ctx.fillStyle = C(col, f.f);
        ctx.fill();
        if (level >= 1 / 2) {
          ctx.strokeStyle = C(col, f.f);
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
        if (level >= 1 && h >= 9) this.windows(ctx, f, h, b.seed, night, b.kind, col);
      }
    }
    // roof
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const x = p[k * 2] - p[k * 2 + 1];
      const y = (p[k * 2] + p[k * 2 + 1]) / 2 - h * ZK;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = C(col, walls ? 1.08 : 1);
    ctx.fill();
    if (level >= 1) {
      ctx.strokeStyle = C(col, 0.82);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    // the black water tank on every Delhi roof
    if (level >= 1 && (b.kind === 1 || b.kind === 0) && h < 24 && b.area > 40 && b.area < 900 && (b.seed & 3) !== 0) {
      const [x, y] = iso(b.ce, b.cs, h);
      ctx.fillStyle = C('#2b2d30');
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 2.2, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 2.2, y - 2, 4.4, 2);
      ctx.beginPath();
      ctx.ellipse(x, y, 2.2, 1.1, 0, 0, Math.PI);
      ctx.fill();
    }
  }

  windows(ctx, f, h, seed, night, kind, col) {
    const len = Math.hypot(f.be - f.ae, f.bs - f.as);
    const floors = Math.max(1, Math.floor(h / 3.3));
    const cols = Math.max(1, Math.floor(len / 4));
    const glass = kind === 3 && h > 20;
    if (!night) {
      ctx.strokeStyle = glass ? C('#eef4f8', 0.9) : C(col, 0.62);
      ctx.globalAlpha = glass ? 0.5 : 0.35;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let k = 1; k < floors; k++) {
        const z = (k * h) / floors;
        ctx.moveTo(f.ae - f.as, (f.ae + f.as) / 2 - z * ZK);
        ctx.lineTo(f.be - f.bs, (f.be + f.bs) / 2 - z * ZK);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = L('#ffd98a', 0.92);
    for (let k = 0; k < floors; k++) {
      for (let c = 0; c < cols; c++) {
        if (hash2(seed + k * 31, c + Math.round(f.ae), 5) > 0.42) continue;
        const t0 = (c + 0.3) / cols;
        const t1 = (c + 0.7) / cols;
        const z0 = k * 3.3 + 1;
        const ae = f.ae + (f.be - f.ae) * t0;
        const as = f.as + (f.bs - f.as) * t0;
        const be = f.ae + (f.be - f.ae) * t1;
        const bs = f.as + (f.bs - f.as) * t1;
        ctx.beginPath();
        ctx.moveTo(ae - as, (ae + as) / 2 - z0 * ZK);
        ctx.lineTo(be - bs, (be + bs) / 2 - z0 * ZK);
        ctx.lineTo(be - bs, (be + bs) / 2 - (z0 + 1.5) * ZK);
        ctx.lineTo(ae - as, (ae + as) / 2 - (z0 + 1.5) * ZK);
        ctx.fill();
      }
    }
  }
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
