// Tap or hover any building on the map: find it under the pointer and say
// what it is, using what OpenStreetMap records (type, height, footprint).

import { iso, unIso, esToLL, ZK } from './proj.js';
import { DISTRICT_LABELS } from './data.js';

const KIND = ['Building', 'House', 'Apartment block', 'Shops and offices', 'Factory or warehouse', 'Place of worship',
  'Public building', 'School or college', 'Hut or shed'];
const TALLEST = 320; // metres: how far up a tower can reach above the point it stands on

function inside(pts, e, s) {
  let hit = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const ei = pts[i];
    const si = pts[i + 1];
    const ej = pts[j];
    const sj = pts[j + 1];
    if (si > s !== sj > s && e < ((ej - ei) * (s - si)) / (sj - si) + ei) hit = !hit;
  }
  return hit;
}

/**
 * The building drawn at world point (x, y), or null. A point on screen can be
 * a roof, a wall, or the ground, so test the building's footprint at every
 * height up to its roof; the front-most hit wins, as in the drawing order.
 */
export function pickBuilding(store, cell, x, y) {
  const a = unIso(x, y);
  const b = unIso(x, y + TALLEST * ZK);
  const e0 = Math.min(a.e, b.e);
  const e1 = Math.max(a.e, b.e);
  const s0 = Math.min(a.s, b.s);
  const s1 = Math.max(a.s, b.s);
  let best = null;
  let bestD = -Infinity;
  for (let cy = Math.floor(s0 / cell); cy <= Math.floor(s1 / cell); cy++) {
    for (let cx = Math.floor(e0 / cell); cx <= Math.floor(e1 / cell); cx++) {
      const c = store.get(cx, cy);
      if (!c) continue;
      for (const bd of c.buildings) {
        const d = bd.ce + bd.cs;
        if (d <= bestD) continue;
        const [be0, bs0, be1, bs1] = bd.bbox;
        if (be1 < e0 || be0 > e1 || bs1 < s0 || bs0 > s1) continue;
        const steps = Math.max(1, Math.ceil(bd.h / 3));
        for (let k = 0; k <= steps; k++) {
          const g = unIso(x, y + ((bd.h * k) / steps) * ZK);
          if (g.e >= be0 && g.e <= be1 && g.s >= bs0 && g.s <= bs1 && inside(bd.pts, g.e, g.s)) {
            best = bd;
            bestD = d;
            break;
          }
        }
      }
    }
  }
  return best;
}

const num = (v) => Math.round(v).toLocaleString('en-IN');

/** What to say about a building. */
export function describe(b) {
  const { lat, lon } = esToLL(b.ce, b.cs);
  let place = null;
  let dist = Infinity;
  const k = Math.cos((lat * Math.PI) / 180);
  for (const [name, la, lo] of DISTRICT_LABELS) {
    const d = Math.hypot((la - lat) * 111, (lo - lon) * 111 * k);
    if (d < dist) {
      dist = d;
      place = name;
    }
  }
  const floors = Math.max(1, Math.round(b.h / 3.2));
  return {
    kind: KIND[b.kind] || 'Building',
    size: `About ${num(b.h)} m tall · ${floors} floor${floors > 1 ? 's' : ''} · ${num(b.area)} m² footprint`,
    place: place ? `${dist < 2.5 ? 'In' : 'Near'} ${place}` : '',
    lat,
    lon,
  };
}

/** Screen-space anchor above a building's roof, in world pixels. */
export function roofTop(b) {
  let top = Infinity;
  let x = 0;
  for (let k = 0; k < b.pts.length; k += 2) {
    const p = iso(b.pts[k], b.pts[k + 1], b.h);
    if (p[1] < top) top = p[1];
  }
  [x] = iso(b.ce, b.cs, b.h);
  return [x, top];
}

/** Highlight a building: its roof and the corners down to the ground. */
export function outlineBuilding(ctx, b, zoom, colour) {
  const n = b.pts.length / 2;
  const roof = [];
  const foot = [];
  for (let k = 0; k < n; k++) {
    roof.push(iso(b.pts[k * 2], b.pts[k * 2 + 1], b.h));
    foot.push(iso(b.pts[k * 2], b.pts[k * 2 + 1], 0));
  }
  ctx.save();
  ctx.lineWidth = 2 / zoom;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour.replace(/[\d.]+\)$/, '0.22)');
  ctx.beginPath();
  roof.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // the outermost corners, so the walls read as part of the highlight
  let l = 0;
  let r = 0;
  let f = 0;
  for (let k = 1; k < n; k++) {
    if (foot[k][0] < foot[l][0]) l = k;
    if (foot[k][0] > foot[r][0]) r = k;
    if (foot[k][1] > foot[f][1]) f = k;
  }
  ctx.beginPath();
  for (const k of new Set([l, r, f])) {
    ctx.moveTo(roof[k][0], roof[k][1]);
    ctx.lineTo(foot[k][0], foot[k][1]);
  }
  ctx.moveTo(foot[l][0], foot[l][1]);
  ctx.lineTo(foot[f][0], foot[f][1]);
  ctx.lineTo(foot[r][0], foot[r][1]);
  ctx.stroke();
  ctx.restore();
}
