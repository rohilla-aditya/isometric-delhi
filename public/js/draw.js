// Canvas drawing: colour handling for day/dusk/night, isometric primitives,
// and the per-tile ground and building painters.

import { iso as P, hash2 } from './geo.js';

// ---------------------------------------------------------------- colour --

const TINTS = {
  day: [1, 1, 1],
  dusk: [1.0, 0.8, 0.68],
  night: [0.3, 0.34, 0.52],
};
let mode = 'day';
let tint = TINTS.day;
const cache = new Map();

export function setMode(m) {
  mode = m;
  tint = TINTS[m];
  cache.clear();
}
export function getMode() {
  return mode;
}

function parse(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A scene colour, scaled by k (face shading) and tinted for time of day. */
export function C(hex, k = 1) {
  const key = hex + k;
  let v = cache.get(key);
  if (!v) {
    const [r, g, b] = parse(hex);
    const f = (x, t) => Math.max(0, Math.min(255, Math.round(x * k * t)));
    v = `rgb(${f(r, tint[0])},${f(g, tint[1])},${f(b, tint[2])})`;
    cache.set(key, v);
  }
  return v;
}

/** A self-lit colour (windows, lamps): not darkened at night. */
export function L(hex, a = 1) {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ------------------------------------------------------------ primitives --

export function fillPts(ctx, pts, fill, seam = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (seam) {
    ctx.strokeStyle = fill;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

/** Flat rectangle on the ground (or at height z). */
export function rect(ctx, i, j, a, b, fill, z = 0, seam = true) {
  fillPts(ctx, [P(i, j, z), P(i + a, j, z), P(i + a, j + b, z), P(i, j + b, z)], fill, seam);
}

/** Axis-aligned box: footprint (i, j, a, b) in tiles, base z and height h in px. */
export function box(ctx, i, j, a, b, z, h, col, o = {}) {
  const top = z + h;
  // +j face (bottom-left on screen)
  fillPts(ctx, [P(i, j + b, z), P(i + a, j + b, z), P(i + a, j + b, top), P(i, j + b, top)], C(col, o.kl ?? 0.93));
  // +i face (bottom-right on screen)
  fillPts(ctx, [P(i + a, j, z), P(i + a, j + b, z), P(i + a, j + b, top), P(i + a, j, top)], C(col, o.kr ?? 0.74));
  if (!o.noTop) rect(ctx, i, j, a, b, C(o.topCol || col, o.kt ?? 1.08), top);
}

export function circlePts(ci, cj, r, n = 16, rj = r, rot = 0) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * Math.PI * 2;
    pts.push([ci + Math.cos(a) * r, cj + Math.sin(a) * rj]);
  }
  return pts;
}

/**
 * Extrude a convex ground polygon (tile coords) from z by h. Visible side
 * faces are shaded by their orientation; topScale tapers the top.
 */
export function prism(ctx, pts, z, h, col, o = {}) {
  const n = pts.length;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) {
    cx += x;
    cy += y;
  }
  cx /= n;
  cy /= n;
  const s = o.topScale ?? 1;
  const top = pts.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s]);
  const faces = [];
  for (let k = 0; k < n; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % n];
    let nx = b[1] - a[1];
    let ny = -(b[0] - a[0]);
    if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    if (nx + ny <= -0.05) continue;
    faces.push({ a, b, ta: top[k], tb: top[(k + 1) % n], d: a[0] + b[0] + a[1] + b[1], f: 0.72 + 0.24 * ((ny - nx + 1) / 2) });
  }
  faces.sort((p, q) => p.d - q.d);
  const k0 = o.k ?? 1;
  for (const f of faces) {
    fillPts(ctx, [P(f.a[0], f.a[1], z), P(f.b[0], f.b[1], z), P(f.tb[0], f.tb[1], z + h), P(f.ta[0], f.ta[1], z + h)], C(col, f.f * k0));
  }
  if (!o.noTop) fillPts(ctx, top.map(([x, y]) => P(x, y, z + h)), C(o.topCol || col, o.kt ?? 1.08));
}

export function cyl(ctx, ci, cj, r, z, h, col, o = {}) {
  prism(ctx, circlePts(ci, cj, r, o.n || 14, o.rj ?? r), z, h, col, o);
}

const R2 = Math.SQRT2;

function sideGradient(ctx, X, rx, Y, col) {
  const g = ctx.createLinearGradient(X - rx, Y, X + rx, Y);
  g.addColorStop(0, C(col, 1.15));
  g.addColorStop(0.45, C(col, 1));
  g.addColorStop(1, C(col, 0.7));
  return g;
}

/** Hemispherical (or onion) dome sitting on a circle of radius r. */
export function dome(ctx, ci, cj, r, z, h, col, o = {}) {
  const [X, Y] = P(ci, cj, z);
  const rx = r * 16 * R2;
  const ry = r * 8 * R2;
  ctx.beginPath();
  if (o.onion) {
    ctx.moveTo(X - rx * 0.8, Y);
    ctx.bezierCurveTo(X - rx * 1.3, Y - h * 0.4, X - rx * 0.55, Y - h * 0.72, X, Y - h);
    ctx.bezierCurveTo(X + rx * 0.55, Y - h * 0.72, X + rx * 1.3, Y - h * 0.4, X + rx * 0.8, Y);
    ctx.ellipse(X, Y, rx * 0.8, ry * 0.8, 0, 0, Math.PI);
  } else {
    ctx.ellipse(X, Y, rx, h, 0, Math.PI, Math.PI * 2);
    ctx.ellipse(X, Y, rx, ry, 0, 0, Math.PI);
  }
  ctx.closePath();
  ctx.fillStyle = sideGradient(ctx, X, rx, Y, col);
  ctx.fill();
  if (o.stripes) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = C('#2b2b2b', 1);
    ctx.lineWidth = 0.35;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(X + k * rx * 0.3, Y + 2);
      ctx.quadraticCurveTo(X + k * rx * 0.42, Y - h * 0.5, X, Y - h);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (o.finial) {
    ctx.strokeStyle = C(o.finialCol || '#c9a227', 1);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(X, Y - h);
    ctx.lineTo(X, Y - h - o.finial);
    ctx.stroke();
  }
}

/** Curvilinear temple tower (nagara shikhara). */
export function shikhara(ctx, ci, cj, r, z, h, col, o = {}) {
  const [X, Y] = P(ci, cj, z);
  const rx = r * 16 * R2;
  const ry = r * 8 * R2;
  ctx.beginPath();
  ctx.moveTo(X - rx, Y);
  ctx.quadraticCurveTo(X - rx * 1.02, Y - h * 0.75, X - rx * 0.2, Y - h);
  ctx.lineTo(X + rx * 0.2, Y - h);
  ctx.quadraticCurveTo(X + rx * 1.02, Y - h * 0.75, X + rx, Y);
  ctx.ellipse(X, Y, rx, ry, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = sideGradient(ctx, X, rx, Y, col);
  ctx.fill();
  ctx.strokeStyle = C(o.rib || '#7d3324', 1);
  ctx.lineWidth = 0.35;
  for (let k = 1; k < 7; k++) {
    const t = k / 7;
    const w = rx * (1 - Math.pow(t, 2.2) * 0.8);
    ctx.beginPath();
    ctx.ellipse(X, Y - h * t, w, ry * (w / rx), 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
  // amalaka and finial
  ctx.fillStyle = C(o.cap || '#e9d9b8', 1);
  ctx.beginPath();
  ctx.ellipse(X, Y - h, rx * 0.32, rx * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C('#c9a227', 1);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(X, Y - h);
  ctx.lineTo(X, Y - h - 4);
  ctx.stroke();
  if (o.flag) flag(ctx, X, Y - h - 4, o.flag, 3.5);
}

export function flag(ctx, X, Y, colours, w = 5) {
  const hgt = w * 0.66;
  const band = hgt / colours.length;
  colours.forEach((c, k) => {
    ctx.fillStyle = C(c, 1);
    ctx.fillRect(X, Y + k * band, w, band + 0.05);
  });
}

export function pole(ctx, i, j, z, h, col = '#d0d0d0', w = 0.5) {
  const [X, Y] = P(i, j, z);
  ctx.strokeStyle = C(col, 1);
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(X, Y);
  ctx.lineTo(X, Y - h);
  ctx.stroke();
  return [X, Y - h];
}

/**
 * An arch-shaped opening on a vertical face. axis 'i' means the face lies in
 * the plane i = plane (faces +i); 'j' means j = plane (faces +j).
 */
export function arch(ctx, axis, plane, c, hw, z0, z1, col) {
  const pt = (u, z) => (axis === 'i' ? P(plane, u, z) : P(u, plane, z));
  const rise = hw * 18;
  const spring = z1 - rise;
  const pts = [pt(c - hw, z0), pt(c - hw, spring)];
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI - (k / 8) * Math.PI;
    pts.push(pt(c + Math.cos(a) * hw, spring + Math.sin(a) * rise));
  }
  pts.push(pt(c + hw, z0));
  fillPts(ctx, pts, col, false);
}

export function tree(ctx, i, j, size, col, kind = 'round') {
  const [X, Y] = P(i, j, 0);
  const s = size;
  ctx.fillStyle = C('#000000', 1);
  ctx.globalAlpha = 0.13;
  ctx.beginPath();
  ctx.ellipse(X + s * 0.5, Y + 0.6, s * 1.05, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = C('#6b4a2f', 1);
  ctx.lineWidth = Math.max(0.6, s * 0.18);
  ctx.beginPath();
  ctx.moveTo(X, Y);
  ctx.lineTo(X, Y - s * 1.1);
  ctx.stroke();
  if (kind === 'kikar') {
    ctx.fillStyle = C(col, 0.85);
    ctx.beginPath();
    ctx.ellipse(X, Y - s * 1.35, s * 1.15, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C(col, 1.08);
    ctx.beginPath();
    ctx.ellipse(X - s * 0.2, Y - s * 1.55, s * 0.75, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = C(col, 0.82);
  ctx.beginPath();
  ctx.arc(X, Y - s * 1.6, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C(col, 1.05);
  ctx.beginPath();
  ctx.arc(X - s * 0.28, Y - s * 1.85, s * 0.62, 0, Math.PI * 2);
  ctx.fill();
}

// --------------------------------------------------------------- ground --

const GROUND = {
  water: ['#5f9fb8'],
  sand: ['#dccfa6', '#d6c89c', '#e0d4ae'],
  lot: ['#d3cab6', '#cfc5b0', '#d8cfbc', '#cbc2ae'],
  park: ['#9cc06a', '#95bb64', '#a2c470'],
  forest: ['#869f56', '#7e9850', '#8ca55c'],
  farm: ['#a9c46c', '#c6cf7a', '#8fb35b', '#d8c98a', '#b7d08a', '#9fbf62'],
  lawn: ['#8fc75b'],
  grass: ['#b4c78a', '#afc285'],
  apron: ['#bcbbb5', '#b6b5ae'],
  runway: ['#5e6166'],
  plaza: ['#ddd3bf'],
};

export function groundColour(t) {
  const list = GROUND[t.g] || GROUND.lot;
  return list[Math.floor(t.v * 977) % list.length];
}

export function drawGround(ctx, t, N, detail) {
  const { i, j } = t;
  const col = groundColour(t);
  rect(ctx, i, j, 1, 1, C(col));

  if (detail >= 1) {
    if (t.g === 'farm') {
      // furrows
      ctx.strokeStyle = C(col, 0.88);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const along = t.v > 0.5;
      for (let k = 1; k < 4; k++) {
        const u = k / 4;
        const a = along ? P(i + u, j + 0.05) : P(i + 0.05, j + u);
        const b = along ? P(i + u, j + 0.95) : P(i + 0.95, j + u);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    } else if (t.g === 'water' && detail >= 2 && t.v > 0.6) {
      ctx.strokeStyle = C('#8cc0d2', 1);
      ctx.lineWidth = 0.5;
      const [x, y] = P(i + 0.5, j + 0.5);
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.quadraticCurveTo(x - 2, y - 1.2, x, y);
      ctx.quadraticCurveTo(x + 2, y + 1.2, x + 4, y);
      ctx.stroke();
    } else if (t.g === 'lawn' && t.road !== 'path') {
      // the canals along Kartavya Path
      rect(ctx, i, j + 0.38, 1, 0.24, C('#6fb0c8'), 0, false);
    } else if (t.g === 'runway' && detail >= 2) {
      const a = P(i + 0.3, j + 0.5);
      const b = P(i + 0.7, j + 0.5);
      ctx.strokeStyle = C('#f2f2f2', 1);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }
  if (t.street) {
    const c = C('#8f8b85');
    if (t.street & 2) rect(ctx, i + 0.32, j, 0.36, 1, c, 0, false);
    if (t.street & 1) rect(ctx, i, j + 0.32, 1, 0.36, c, 0, false);
  }

  // Earth slab on the two front edges of the diorama.
  const d = 18;
  if (i === N - 1) fillPts(ctx, [P(i + 1, j, 0), P(i + 1, j + 1, 0), P(i + 1, j + 1, -d), P(i + 1, j, -d)], C('#7a5f45', 0.8));
  if (j === N - 1) fillPts(ctx, [P(i, j + 1, 0), P(i + 1, j + 1, 0), P(i + 1, j + 1, -d), P(i, j + 1, -d)], C('#8d6e50', 1));
}

// ------------------------------------------------------------- objects --

const TREE_COL = { forest: '#5f7f3a', park: '#5d8f3c', lutyens: '#4f8a3a', estate: '#5d8f3c', farm: '#6c9440', flood: '#7a9a48' };

export function drawTileObject(ctx, t, detail) {
  if (t.trees && !t.b) drawTrees(ctx, t, t.trees);
  if (t.b) drawBuilding(ctx, t, detail);
  if (t.trees && t.b) drawTrees(ctx, t, t.trees, true);
}

function drawTrees(ctx, t, n, beside = false) {
  const { i, j } = t;
  const kind = t.zone === 'forest' ? 'kikar' : 'round';
  const col = TREE_COL[t.zone] || '#5d8f3c';
  const pts = [];
  for (let k = 0; k < n; k++) {
    let u = 0.15 + hash2(i * 7 + k, j * 13, 5) * 0.7;
    let v = 0.15 + hash2(i * 11, j * 3 + k, 9) * 0.7;
    if (beside) {
      u = 0.82;
      v = 0.82;
    }
    pts.push([i + u, j + v]);
  }
  pts.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  for (const [u, v] of pts) tree(ctx, u, v, 2.6 + hash2(Math.floor(u * 10), Math.floor(v * 10), 3) * 1.6, col, kind);
}

function drawBuilding(ctx, t, detail) {
  const b = t.b;
  const s = b.inset;
  const i = t.i + s;
  const j = t.j + s;
  const a = 1 - 2 * s;
  const night = mode === 'night';

  switch (b.kind) {
    case 'hut':
      box(ctx, i, j, a, a, 0, 3, b.col);
      prism(ctx, [[i - 0.04, j - 0.04], [i + a + 0.04, j - 0.04], [i + a + 0.04, j + a + 0.04], [i - 0.04, j + a + 0.04]], 3, 3, '#a88b5a', { topScale: 0.15 });
      return;
    case 'bungalow':
      box(ctx, i, j, a, a * 0.8, 0, b.h, b.col, { topCol: '#e2dccf' });
      box(ctx, i + a * 0.55, j + a * 0.8, a * 0.3, a * 0.18, 0, b.h * 0.6, '#ffffff');
      if (night) windows(ctx, i, j, a, a * 0.8, b.h, 1, b.seed || t.v * 1e6, 0.5);
      return;
    case 'shed': {
      box(ctx, i, j, a, a, 0, b.h, b.col);
      if (detail >= 1) {
        // sawtooth roof
        const n = 3;
        for (let k = 0; k < n; k++) {
          const u = i + (k / n) * a;
          const w = a / n;
          fillPts(ctx, [P(u, j + a, b.h), P(u + w, j + a, b.h), P(u + w, j + a, b.h + 3)], C('#8d969e', 0.9));
          fillPts(ctx, [P(u, j, b.h), P(u + w, j, b.h + 3), P(u + w, j + a, b.h + 3), P(u, j + a, b.h)], C('#c9ced2', 1));
        }
      }
      return;
    }
    case 'glass': {
      box(ctx, i, j, a, a, 0, b.h, b.col, { topCol: '#c7c9c8' });
      if (detail >= 1) floorBands(ctx, i, j, a, a, b.h, b.floors, '#e9f1f5', 0.45);
      if (night) windows(ctx, i, j, a, a, b.h, b.floors, b.seed, 0.45);
      if (b.floors > 14) box(ctx, i + a * 0.3, j + a * 0.3, a * 0.4, a * 0.4, b.h, 4, '#b9bcbc');
      return;
    }
    case 'mosque': {
      box(ctx, i, j, a, a, 0, b.h, '#f1ede3');
      dome(ctx, i + a / 2, j + a / 2, a * 0.28, b.h, 7, '#f6f3ec', { finial: 2 });
      cyl(ctx, i + a * 0.85, j + a * 0.85, 0.05, b.h, 9, '#f1ede3', { n: 6 });
      return;
    }
    default: {
      box(ctx, i, j, a, a, 0, b.h, b.col);
      if (detail >= 1) {
        floorBands(ctx, i, j, a, a, b.h, b.floors, '#000000', 0.12);
        // parapet
        const pc = C(b.col, 0.85);
        ctx.strokeStyle = pc;
        ctx.lineWidth = 0.5;
        const q = [P(i, j, b.h), P(i + a, j, b.h), P(i + a, j + a, b.h), P(i, j + a, b.h)];
        ctx.beginPath();
        ctx.moveTo(q[0][0], q[0][1]);
        for (const p of q.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.closePath();
        ctx.stroke();
      }
      if (night) windows(ctx, i, j, a, a, b.h, b.floors, b.seed, 0.4);
      if (b.tank) {
        // the black plastic water tank on every Delhi roof
        const tu = i + a * (0.25 + (b.seed % 7) / 20);
        const tv = j + a * (0.25 + (b.seed % 5) / 14);
        if (detail >= 1 && b.seed % 3 === 0) box(ctx, i + a * 0.62, j + a * 0.08, a * 0.26, a * 0.3, b.h, 3, b.col);
        cyl(ctx, tu, tv, 0.07, b.h, 2.6, '#2b2d30', { n: 8, topCol: '#3a3d40', kt: 1 });
      }
    }
  }
}

function floorBands(ctx, i, j, a, b, h, floors, col, alpha) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = C(col, 1);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let f = 1; f < floors; f++) {
    const z = (f / floors) * h;
    let p = P(i, j + b, z);
    ctx.moveTo(p[0], p[1]);
    p = P(i + a, j + b, z);
    ctx.lineTo(p[0], p[1]);
    p = P(i + a, j, z);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function windows(ctx, i, j, a, b, h, floors, seed, density) {
  const fh = h / floors;
  ctx.fillStyle = L('#ffd98a', 0.95);
  const cols = 4;
  for (let f = 0; f < floors; f++) {
    const z = f * fh + fh * 0.35;
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.3) / cols;
      if (hash2(seed + f, c, 1) < density) {
        const p0 = P(i + u * a, j + b, z);
        const p1 = P(i + (u + 0.14) * a, j + b, z);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p1[0], p1[1] - fh * 0.4);
        ctx.lineTo(p0[0], p0[1] - fh * 0.4);
        ctx.fill();
      }
      if (hash2(seed + f, c + 9, 2) < density) {
        const p0 = P(i + a, j + u * b, z);
        const p1 = P(i + a, j + (u + 0.14) * b, z);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p1[0], p1[1] - fh * 0.4);
        ctx.lineTo(p0[0], p0[1] - fh * 0.4);
        ctx.fill();
      }
    }
  }
}
