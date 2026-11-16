// Canvas drawing: colour handling for day/dusk/night, isometric primitives,
// and the per-tile ground and building painters.

// Model space: tiles are 32 x 16 px and heights are px times VS. Landmarks are
// drawn in model space under a canvas transform that places them in the city;
// VS lets a model keep its real height while its footprint is scaled.
export let VS = 1;
export function setVS(v) {
  VS = v;
}
export const P = (i, j, z = 0) => [(i - j) * 16, (i + j) * 8 - z * VS];

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
  h *= VS;
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
    ctx.lineTo(X, Y - h - o.finial * VS);
    ctx.stroke();
  }
}

/** Curvilinear temple tower (nagara shikhara). */
export function shikhara(ctx, ci, cj, r, z, h, col, o = {}) {
  const [X, Y] = P(ci, cj, z);
  const rx = r * 16 * R2;
  const ry = r * 8 * R2;
  h *= VS;
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
  ctx.lineTo(X, Y - h - 4 * VS);
  ctx.stroke();
  if (o.flag) flag(ctx, X, Y - h - 4 * VS, o.flag, 3.5);
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
  ctx.lineTo(X, Y - h * VS);
  ctx.stroke();
  return [X, Y - h * VS];
}

/**
 * An arch-shaped opening on a vertical face. axis 'i' means the face lies in
 * the plane i = plane (faces +i); 'j' means j = plane (faces +j).
 */
export function arch(ctx, axis, plane, c, hw, z0, z1, col) {
  const pt = (u, z) => (axis === 'i' ? P(plane, u, z) : P(u, plane, z));
  const rise = (hw * 18) / VS; // keep arches round whatever the height scale
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
