// Hand-built isometric models of Delhi's landmarks, composed from the
// primitives in draw.js. Each entry gives an approximate height in px (for
// hit-testing and labels) and a draw function that receives the landmark with
// its footprint (i0, j0, w, d) in tile space.

import { iso as P } from './geo.js';
import {
  C, L, box, rect, prism, cyl, circlePts, dome, shikhara, flag, pole, arch, tree, fillPts, getMode,
} from './draw.js';

const RED = '#b4492f';
const SAND = '#d9a77a';
const CREAM = '#ead2aa';
const MARBLE = '#f3efe6';
const GOLD = '#e2b12a';
const STONE = '#a8916f';
const TRICOLOUR = ['#ff9933', '#ffffff', '#138808'];

const centre = (lm) => [lm.i0 + lm.w / 2, lm.j0 + lm.d / 2];
const lawn = (ctx, lm, col = '#9cc06a') => rect(ctx, lm.i0, lm.j0, lm.w, lm.d, C(col));

function chhatri(ctx, i, j, z, r = 0.1, col = MARBLE) {
  box(ctx, i - r * 0.8, j - r * 0.8, r * 1.6, r * 1.6, z, 2.5, col);
  dome(ctx, i, j, r, z + 2.5, r * 30, col, { finial: 1 });
}

function walls(ctx, i, j, a, b, th, h, col, front, o = {}) {
  // back walls first (north and west), or the two front ones
  if (!front) {
    box(ctx, i, j, a, th, 0, h, col, o);
    box(ctx, i, j, th, b, 0, h, col, o);
  } else {
    box(ctx, i + a - th, j, th, b, 0, h, col, o);
    box(ctx, i, j + b - th, a, th, 0, h, col, o);
  }
}

function water(ctx, i, j, a, b, z = 0) {
  rect(ctx, i, j, a, b, C('#5aa3c4'), z, false);
}

export const MODELS = {
  'india-gate': {
    h: 44,
    draw(ctx, lm) {
      const [ci, cj] = centre(lm);
      rect(ctx, lm.i0, lm.j0, 2, 2, C('#ddd3bd'));
      box(ctx, ci - 0.55, cj - 0.75, 1.1, 1.5, 0, 2.5, '#cbb89a');
      box(ctx, ci - 0.32, cj - 0.62, 0.64, 1.24, 2.5, 30, '#d8b48a');
      const dark = C('#6e5640', 1);
      arch(ctx, 'i', ci + 0.32, cj, 0.26, 2.5, 22, dark);
      arch(ctx, 'j', cj + 0.62, ci, 0.12, 2.5, 13, dark);
      box(ctx, ci - 0.27, cj - 0.55, 0.54, 1.1, 32.5, 4.5, '#cfa97f');
      dome(ctx, ci, cj, 0.17, 37, 4, '#cfa97f');
      // the empty canopy to the east
      box(ctx, ci + 0.75, cj - 0.15, 0.3, 0.3, 0, 7, '#d8b48a');
      dome(ctx, ci + 0.9, cj, 0.15, 7, 4, '#d8b48a', { finial: 1.5 });
    },
  },

  'rashtrapati-bhavan': {
    h: 40,
    draw(ctx, lm) {
      const { i0, j0, d } = lm;
      const cj = j0 + d / 2;
      // Amrit Udyan: terraced Mughal garden with water channels
      rect(ctx, i0, j0, 1.7, d, C('#7fb850'));
      for (let k = 1; k < 4; k++) rect(ctx, i0 + 0.1, j0 + k, 1.5, 0.08, C('#6fb0c8'), 0, false);
      rect(ctx, i0 + 0.8, j0 + 0.2, 0.08, d - 0.4, C('#6fb0c8'), 0, false);
      rect(ctx, i0 + 1.7, j0, 3.3, d, C('#e2d6bf'));
      // wings: red sandstone base, cream upper storeys
      box(ctx, i0 + 1.8, j0 + 0.3, 2.4, 3.4, 0, 6, RED);
      box(ctx, i0 + 1.85, j0 + 0.35, 2.3, 3.3, 6, 8, CREAM);
      // portico with colonnade
      const ci = i0 + 3.3;
      box(ctx, ci - 0.4, cj - 0.75, 1.3, 1.5, 0, 16, CREAM);
      ctx.strokeStyle = C('#8c6d50', 1);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let k = 1; k < 12; k++) {
        const a = P(ci + 0.9, cj - 0.75 + (k / 12) * 1.5, 1);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(a[0], a[1] - 13);
      }
      ctx.stroke();
      for (const [u, v] of [[i0 + 1.95, j0 + 0.45], [i0 + 4.05, j0 + 0.45], [i0 + 1.95, j0 + 3.55], [i0 + 4.05, j0 + 3.55]]) chhatri(ctx, u, v, 14, 0.12, CREAM);
      cyl(ctx, ci, cj, 0.5, 16, 6, CREAM, { n: 18 });
      dome(ctx, ci, cj, 0.52, 22, 14, '#c99a62', { finial: 3 });
      // Jaipur Column in the forecourt
      const top = pole(ctx, i0 + 4.6, cj, 0, 26, '#d6c2a0', 1.2);
      ctx.fillStyle = C(GOLD);
      ctx.beginPath();
      ctx.arc(top[0], top[1], 1.4, 0, Math.PI * 2);
      ctx.fill();
    },
  },

  'north-block': { h: 22, draw: (ctx, lm) => secretariat(ctx, lm) },
  'south-block': { h: 22, draw: (ctx, lm) => secretariat(ctx, lm) },

  parliament: {
    h: 22,
    draw(ctx, lm) {
      const { i0, j0 } = lm;
      const cj = j0 + 1;
      rect(ctx, i0, j0, 3, 2, C('#9cc06a'));
      // the circular house of 1927
      const oi = i0 + 0.95;
      cyl(ctx, oi, cj, 0.85, 0, 2, '#d7c19b', { n: 24 });
      cyl(ctx, oi, cj, 0.82, 2, 6, CREAM, { n: 24, topCol: '#c8b48e' });
      ctx.strokeStyle = C('#8f7454', 1);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      for (let k = 0; k < 18; k++) {
        const a = -Math.PI / 4 + ((k + 0.5) / 18) * Math.PI;
        const p = P(oi + Math.cos(a) * 0.82, cj + Math.sin(a) * 0.82, 2.5);
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0], p[1] - 4.5);
      }
      ctx.stroke();
      cyl(ctx, oi, cj, 0.32, 8, 4, CREAM, { n: 16 });
      dome(ctx, oi, cj, 0.32, 12, 3, '#d9c6a2');
      // the triangular house of 2023
      const ni = i0 + 2.2;
      const tri = circlePts(ni, cj, 0.75, 3, 0.75, -Math.PI / 2);
      prism(ctx, tri, 0, 3, RED);
      prism(ctx, tri.map(([x, y]) => [ni + (x - ni) * 0.97, cj + (y - cj) * 0.97]), 3, 7, '#e8d3ae');
      dome(ctx, ni, cj, 0.24, 10, 4, '#d4bf98');
      const top = pole(ctx, ni, cj, 14, 6, '#cfcfcf');
      flag(ctx, top[0], top[1], TRICOLOUR, 4);
    },
  },

  'connaught-place': {
    h: 30,
    draw(ctx, lm) {
      const [ci, cj] = centre(lm);
      fillPts(ctx, circlePts(ci, cj, 2.45, 40).map(([x, y]) => P(x, y)), C('#77777b'));
      fillPts(ctx, circlePts(ci, cj, 0.9, 32).map(([x, y]) => P(x, y)), C('#8fc35d'));
      fillPts(ctx, circlePts(ci, cj, 0.35, 20).map(([x, y]) => P(x, y)), C('#d9cfbd'));
      const segs = [];
      const ring = (r0, r1, n, h) => {
        for (let k = 0; k < n; k++) {
          const gap = 0.07;
          const a0 = (k / n) * Math.PI * 2 + gap;
          const a1 = ((k + 1) / n) * Math.PI * 2 - gap;
          const pts = [];
          for (let s = 0; s <= 3; s++) {
            const a = a0 + ((a1 - a0) * s) / 3;
            pts.push([ci + Math.cos(a) * r1, cj + Math.sin(a) * r1]);
          }
          for (let s = 3; s >= 0; s--) {
            const a = a0 + ((a1 - a0) * s) / 3;
            pts.push([ci + Math.cos(a) * r0, cj + Math.sin(a) * r0]);
          }
          const am = (a0 + a1) / 2;
          const rm = (r0 + r1) / 2;
          segs.push({ pts, h, d: Math.cos(am) * rm + Math.sin(am) * rm });
        }
      };
      ring(1.05, 1.45, 12, 7);
      ring(1.75, 2.25, 16, 8);
      segs.sort((a, b) => a.d - b.d);
      for (const s of segs) {
        prism(ctx, s.pts, 0, 2.5, '#d8d2c4', { noTop: true });
        prism(ctx, s.pts, 2.5, s.h - 2.5, '#f3efe6', { topCol: '#e0d9ca' });
      }
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        tree(ctx, ci + Math.cos(a) * 0.65, cj + Math.sin(a) * 0.65, 2.2, '#4f8a3a');
      }
      const top = pole(ctx, ci, cj, 0, 30, '#d8d8d8', 0.7);
      flag(ctx, top[0], top[1], TRICOLOUR, 9);
    },
  },

  'jantar-mantar': {
    h: 20,
    draw(ctx, lm) {
      const [ci, cj] = centre(lm);
      rect(ctx, lm.i0, lm.j0, 1, 1, C('#d8cdb6'));
      const col = '#d0634a';
      box(ctx, ci - 0.42, cj - 0.05, 0.22, 0.4, 0, 4, col);
      cyl(ctx, ci - 0.25, cj + 0.3, 0.13, 0, 4, col, { n: 12, topCol: '#c45a42' });
      // Samrat Yantra: the giant triangular gnomon, rising to the north
      fillPts(ctx, [P(ci - 0.07, cj + 0.38, 0), P(ci + 0.07, cj + 0.38, 0), P(ci + 0.07, cj - 0.32, 19), P(ci - 0.07, cj - 0.32, 19)], C('#f0e6d6'));
      fillPts(ctx, [P(ci + 0.07, cj + 0.38, 0), P(ci + 0.07, cj - 0.32, 0), P(ci + 0.07, cj - 0.32, 19)], C(col, 0.8));
      box(ctx, ci + 0.2, cj - 0.05, 0.22, 0.4, 0, 4, col);
    },
  },

  'bangla-sahib': {
    h: 30,
    draw(ctx, lm) {
      const { i0, j0 } = lm;
      rect(ctx, i0, j0, 2, 2, C('#e6dfd2'));
      rect(ctx, i0 + 1.15, j0 + 0.25, 0.75, 1.5, C('#f5f2ea'));
      water(ctx, i0 + 1.22, j0 + 0.32, 0.6, 1.36);
      const top = pole(ctx, i0 + 1.5, j0 + 0.12, 0, 26, '#d8d8d8', 0.6);
      ctx.fillStyle = C('#ff8c1a');
      ctx.beginPath();
      ctx.moveTo(top[0], top[1]);
      ctx.lineTo(top[0] + 6, top[1] + 2);
      ctx.lineTo(top[0], top[1] + 4);
      ctx.fill();
      box(ctx, i0 + 0.15, j0 + 0.25, 0.95, 1.5, 0, 8, MARBLE);
      for (const [u, v] of [[i0 + 0.25, j0 + 0.35], [i0 + 1.0, j0 + 0.35], [i0 + 0.25, j0 + 1.65], [i0 + 1.0, j0 + 1.65]]) {
        dome(ctx, u, v, 0.09, 8, 4, GOLD, { onion: true, finial: 1 });
      }
      cyl(ctx, i0 + 0.62, j0 + 1, 0.3, 8, 3, MARBLE, { n: 16 });
      dome(ctx, i0 + 0.62, j0 + 1, 0.34, 11, 12, GOLD, { onion: true, finial: 3 });
    },
  },

  'birla-mandir': {
    h: 34,
    draw(ctx, lm) {
      const [ci, cj] = centre(lm);
      rect(ctx, lm.i0, lm.j0, 2, 2, C('#e3d8c3'));
      box(ctx, ci - 0.75, cj - 0.75, 1.5, 1.5, 0, 5, '#efe2c8', { topCol: '#e6d4b4' });
      shikhara(ctx, ci + 0.5, cj - 0.5, 0.22, 5, 13, '#d0603e');
      shikhara(ctx, ci - 0.5, cj + 0.5, 0.22, 5, 13, '#d0603e');
      box(ctx, ci + 0.15, cj - 0.25, 0.45, 0.5, 5, 5, '#efe2c8');
      shikhara(ctx, ci, cj, 0.36, 5, 26, '#cf5a3a', { flag: ['#ff8c1a'] });
    },
  },

  'new-delhi-station': {
    h: 12,
    draw(ctx, lm) {
      const { i0, j0 } = lm;
      rect(ctx, i0, j0, 2, 2, C('#b4aa98'));
      box(ctx, i0 + 0.05, j0 + 0.1, 0.3, 1.8, 0, 9, '#c4553b', { topCol: '#e3cfae' });
      for (let k = 0; k < 4; k++) box(ctx, i0 + 0.5 + k * 0.36, j0 + 0.08, 0.24, 1.84, 0, 3.5, '#d2cbbd', { topCol: '#9da7ad' });
      box(ctx, i0 + 1.75, j0 + 0.3, 0.22, 1.4, 0, 8, '#c4553b', { topCol: '#e3cfae' });
    },
  },

  'red-fort': {
    h: 22,
    draw(ctx, lm) {
      const { i0, j0, w, d } = lm;
      rect(ctx, i0 - 0.1, j0 - 0.1, w + 0.2, d + 0.2, C('#8fb6a8')); // the old moat
      rect(ctx, i0, j0, w, d, C('#a6c37a'));
      rect(ctx, i0 + 1.6, j0 + 0.3, 0.12, d - 0.6, C('#6fb0c8'), 0, false); // Nahr-i-Bihisht
      cyl(ctx, i0 + 0.1, j0 + 0.1, 0.25, 0, 11, RED, { n: 12 });
      walls(ctx, i0, j0, w, d, 0.22, 9, RED, false);
      // Lahori Gate, with the flag
      const gj = j0 + d / 2;
      box(ctx, i0 - 0.08, gj - 0.38, 0.42, 0.76, 0, 15, RED);
      arch(ctx, 'i', i0 + 0.34, gj, 0.14, 0, 8, C('#4a2016', 1));
      chhatri(ctx, i0 + 0.12, gj - 0.25, 15, 0.09);
      chhatri(ctx, i0 + 0.12, gj + 0.25, 15, 0.09);
      const top = pole(ctx, i0 + 0.15, gj, 15, 10, '#d8d8d8');
      flag(ctx, top[0], top[1], TRICOLOUR, 5);
      // halls inside
      box(ctx, i0 + 0.9, gj - 0.35, 0.55, 0.7, 0, 6, SAND, { topCol: '#e6c39c' });
      box(ctx, i0 + 2.2, j0 + 0.6, 0.48, 0.65, 0, 5, MARBLE);
      dome(ctx, i0 + 2.44, j0 + 0.92, 0.12, 5, 3, MARBLE, { finial: 1 });
      box(ctx, i0 + 2.2, j0 + 1.6, 0.48, 0.85, 0, 5, MARBLE);
      box(ctx, i0 + 1.7, j0 + 3.2, 0.5, 0.5, 0, 5, MARBLE);
      for (const k of [-0.15, 0, 0.15]) dome(ctx, i0 + 1.8, j0 + 3.45 + k, 0.08, 5, 4, MARBLE, { onion: true });
      box(ctx, i0 + 2.2, j0 + 3.4, 0.48, 0.8, 0, 5, MARBLE);
      cyl(ctx, i0 + w - 0.1, j0 + 0.1, 0.25, 0, 11, RED, { n: 12 });
      cyl(ctx, i0 + 0.1, j0 + d - 0.1, 0.25, 0, 11, RED, { n: 12 });
      walls(ctx, i0, j0, w, d, 0.22, 8, RED, true);
      // Delhi Gate on the south wall
      box(ctx, i0 + w / 2 - 0.35, j0 + d - 0.32, 0.7, 0.4, 0, 13, RED);
      arch(ctx, 'j', j0 + d + 0.08, i0 + w / 2, 0.13, 0, 7, C('#4a2016', 1));
      chhatri(ctx, i0 + w / 2 - 0.2, j0 + d - 0.12, 13, 0.08);
      chhatri(ctx, i0 + w / 2 + 0.2, j0 + d - 0.12, 13, 0.08);
      cyl(ctx, i0 + w - 0.1, j0 + d - 0.1, 0.25, 0, 11, RED, { n: 12 });
    },
  },

  'jama-masjid': {
    h: 36,
    draw(ctx, lm) {
      const { i0, j0 } = lm;
      const cj = j0 + 1;
      box(ctx, i0 + 0.05, j0 + 0.05, 1.9, 1.9, 0, 3, '#b5543a', { topCol: '#dcc6a3' });
      water(ctx, i0 + 1.0, cj - 0.15, 0.3, 0.3, 3);
      box(ctx, i0 + 0.05, j0 + 0.05, 1.9, 0.12, 3, 3, '#b5543a');
      minaret(ctx, i0 + 0.62, j0 + 0.2, 3);
      box(ctx, i0 + 0.15, j0 + 0.3, 0.45, 1.4, 3, 8, '#b5543a');
      ctx.strokeStyle = C(MARBLE, 1);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let k = 1; k < 7; k++) {
        const p = P(i0 + 0.6, j0 + 0.3 + (k / 7) * 1.4, 4);
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0], p[1] - 6);
      }
      ctx.stroke();
      dome(ctx, i0 + 0.38, cj - 0.45, 0.17, 11, 9, MARBLE, { onion: true, stripes: true, finial: 2 });
      dome(ctx, i0 + 0.38, cj, 0.24, 11, 13, MARBLE, { onion: true, stripes: true, finial: 2.5 });
      dome(ctx, i0 + 0.38, cj + 0.45, 0.17, 11, 9, MARBLE, { onion: true, stripes: true, finial: 2 });
      box(ctx, i0 + 1.65, cj - 0.25, 0.3, 0.5, 3, 8, '#b5543a');
      dome(ctx, i0 + 1.8, cj, 0.12, 11, 5, MARBLE, { onion: true });
      box(ctx, i0 + 0.05, j0 + 1.83, 1.9, 0.12, 3, 3, '#b5543a');
      minaret(ctx, i0 + 0.62, j0 + 1.8, 3);
    },
  },

  rajghat: {
    h: 6,
    draw(ctx, lm) {
      const [ci, cj] = centre(lm);
      lawn(ctx, lm, '#8fc35d');
      rect(ctx, ci - 0.7, cj - 0.7, 1.4, 1.4, C('#c9bfa9'));
      box(ctx, ci - 0.35, cj - 0.35, 0.7, 0.7, 0, 2, '#2a2a2a', { topCol: '#3b3b3b' });
      const [X, Y] = P(ci + 0.3, cj - 0.3, 2);
      ctx.fillStyle = L('#ff9a2e', 1);
      ctx.beginPath();
      ctx.moveTo(X - 1, Y);
      ctx.quadraticCurveTo(X, Y - 5, X + 1, Y);
      ctx.fill();
    },
  },

  'bharat-mandapam': {
    h: 14,
    draw(ctx, lm) {
      const [ci, cj] = centre(lm);
      rect(ctx, lm.i0, lm.j0, 2, 2, C('#d8d2c4'));
      const e = circlePts(ci, cj, 0.85, 28, 0.68);
      prism(ctx, e, 0, 4, '#8fb0c4');
      prism(ctx, e, 4, 6, '#efe8dc', { topScale: 0.78, topCol: '#f4efe6' });
    },
  },

  'purana-qila': {
    h: 16,
    draw(ctx, lm) {
      const { i0, j0, w, d } = lm;
      rect(ctx, i0, j0, w, d, C('#a9be78'));
      const col = '#a8865f';
      cyl(ctx, i0 + 0.15, j0 + 0.15, 0.25, 0, 10, col, { n: 12, topScale: 0.85 });
      walls(ctx, i0, j0, w, d, 0.2, 8, col, false);
      // Bara Darwaza on the west
      box(ctx, i0 - 0.05, j0 + 1.1, 0.4, 0.8, 0, 13, '#b2603f');
      chhatri(ctx, i0 + 0.15, j0 + 1.25, 13, 0.1, '#e8dcc6');
      chhatri(ctx, i0 + 0.15, j0 + 1.75, 13, 0.1, '#e8dcc6');
      // Qila-i-Kuhna mosque and Sher Mandal
      box(ctx, i0 + 1.0, j0 + 0.9, 0.4, 1.1, 0, 6, '#b88a5c');
      dome(ctx, i0 + 1.2, j0 + 1.45, 0.16, 6, 6, '#c9a27a');
      prism(ctx, circlePts(i0 + 2.1, j0 + 2.0, 0.2, 8), 0, 7, '#b4603f');
      chhatri(ctx, i0 + 2.1, j0 + 2.0, 7, 0.1, '#e8dcc6');
      cyl(ctx, i0 + w - 0.15, j0 + 0.15, 0.25, 0, 10, col, { n: 12, topScale: 0.85 });
      cyl(ctx, i0 + 0.15, j0 + d - 0.15, 0.25, 0, 10, col, { n: 12, topScale: 0.85 });
      walls(ctx, i0, j0, w, d, 0.2, 7, col, true);
      cyl(ctx, i0 + w - 0.15, j0 + d - 0.15, 0.25, 0, 10, col, { n: 12, topScale: 0.85 });
    },
  },

  'humayun-tomb': {
    h: 44,
    draw(ctx, lm) {
      const [ci, cj] = centre(lm);
      lawn(ctx, lm, '#8fbf5a');
      // charbagh: paths and water channels
      rect(ctx, lm.i0, cj - 0.12, 3, 0.24, C('#d9c7a6'), 0, false);
      rect(ctx, ci - 0.12, lm.j0, 0.24, 3, C('#d9c7a6'), 0, false);
      rect(ctx, lm.i0, cj - 0.04, 3, 0.08, C('#6fb0c8'), 0, false);
      rect(ctx, ci - 0.04, lm.j0, 0.08, 3, C('#6fb0c8'), 0, false);
      for (const [u, v] of [[0.5, 0.5], [2.5, 0.5], [0.5, 2.5]]) tree(ctx, lm.i0 + u, lm.j0 + v, 2.4, '#4f8a3a');
      box(ctx, ci - 0.95, cj - 0.95, 1.9, 1.9, 0, 4, '#b8543a', { topCol: '#dbbf96' });
      ctx.fillStyle = C('#5a2a1a', 1);
      for (let k = 0; k < 6; k++) {
        arch(ctx, 'j', cj + 0.95, ci - 0.95 + 0.16 + k * 0.3, 0.07, 0.4, 3.4, C('#5a2a1a', 1));
        arch(ctx, 'i', ci + 0.95, cj - 0.95 + 0.16 + k * 0.3, 0.07, 0.4, 3.4, C('#5a2a1a', 1));
      }
      const q = 0.62;
      const c = 0.2;
      const oct = [[ci - q + c, cj - q], [ci + q - c, cj - q], [ci + q, cj - q + c], [ci + q, cj + q - c], [ci + q - c, cj + q], [ci - q + c, cj + q], [ci - q, cj + q - c], [ci - q, cj - q + c]];
      prism(ctx, oct, 4, 12, '#bd5b3f', { topCol: '#dcc19b' });
      arch(ctx, 'i', ci + q, cj, 0.2, 5, 15, C('#f1e9da', 1));
      arch(ctx, 'i', ci + q, cj, 0.14, 5, 13, C('#5a2a1a', 1));
      arch(ctx, 'j', cj + q, ci, 0.2, 5, 15, C('#f1e9da', 1));
      arch(ctx, 'j', cj + q, ci, 0.14, 5, 13, C('#5a2a1a', 1));
      for (const [u, v] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) chhatri(ctx, ci + u, cj + v, 16, 0.1);
      cyl(ctx, ci, cj, 0.42, 16, 4, MARBLE, { n: 18 });
      dome(ctx, ci, cj, 0.46, 20, 16, MARBLE, { finial: 4 });
    },
  },

  'lodhi-tomb': {
    h: 16,
    draw(ctx, lm) {
      const [ci, cj] = centre(lm);
      lawn(ctx, lm);
      rect(ctx, ci - 0.42, cj - 0.42, 0.84, 0.84, C('#cdbf9f'));
      prism(ctx, circlePts(ci, cj, 0.3, 8, 0.3, Math.PI / 8), 0, 6, '#a99a85');
      for (let k = 0; k < 8; k += 2) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        chhatri(ctx, ci + Math.cos(a) * 0.24, cj + Math.sin(a) * 0.24, 6, 0.06, '#b5aa98');
      }
      dome(ctx, ci, cj, 0.24, 6, 7, '#b5aa98', { finial: 1.5 });
    },
  },

  'jln-stadium': {
    h: 22,
    draw(ctx, lm) {
      const [ci, cj] = centre(lm);
      rect(ctx, lm.i0, lm.j0, 3, 3, C('#d6cfbf'));
      const outer = circlePts(ci, cj, 1.35, 36, 1.2);
      prism(ctx, outer, 0, 9, '#e4e1da', { noTop: true });
      fillPts(ctx, outer.map(([x, y]) => P(x, y, 9)), C('#bcb3a6'));
      const inner = circlePts(ci, cj, 0.88, 32, 0.74).map(([x, y]) => P(x, y, 9));
      fillPts(ctx, inner, C('#8f8a82'));
      ctx.save();
      ctx.beginPath();
      inner.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.clip();
      fillPts(ctx, circlePts(ci + 0.08, cj + 0.08, 0.84, 32, 0.7).map(([x, y]) => P(x, y, 1)), C('#b5553f'));
      fillPts(ctx, circlePts(ci + 0.08, cj + 0.08, 0.68, 32, 0.54).map(([x, y]) => P(x, y, 1)), C('#6fae4f'));
      ctx.restore();
      // tensile roof on masts
      ctx.strokeStyle = C('#cfcfcf', 1);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const p = P(ci + Math.cos(a) * 1.42, cj + Math.sin(a) * 1.27, 0);
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0], p[1] - 21);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.88;
      const ro = circlePts(ci, cj, 1.42, 36, 1.27).map(([x, y]) => P(x, y, 15));
      const ri = circlePts(ci, cj, 1.0, 36, 0.86).map(([x, y]) => P(x, y, 13)).reverse();
      ctx.beginPath();
      ro.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ri.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = C('#f7f7f5', 1);
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
    },
  },

  'lotus-temple': {
    h: 24,
    draw(ctx, lm) {
      const [ci, cj] = centre(lm);
      rect(ctx, lm.i0, lm.j0, 2, 2, C('#e4ddd0'));
      fillPts(ctx, circlePts(ci, cj, 0.98, 36).map(([x, y]) => P(x, y)), C('#5aa3c4'));
      cyl(ctx, ci, cj, 0.72, 0, 3, '#f2f0ea', { n: 27 });
      const petals = [];
      for (let k = 0; k < 9; k++) {
        petals.push({ a: (k / 9) * Math.PI * 2, R: 0.68, tipR: 0.3, z: 3, tz: 13 });
        petals.push({ a: ((k + 0.5) / 9) * Math.PI * 2, R: 0.46, tipR: 0.05, z: 3, tz: 22 });
      }
      petals.sort((p, q) => (p.tz - q.tz) * 0.02 + (Math.cos(p.a) + Math.sin(p.a)) * p.R - (Math.cos(q.a) + Math.sin(q.a)) * q.R);
      for (const p of petals) {
        const w = 0.36;
        const pt = (a, r, z) => P(ci + Math.cos(a) * r, cj + Math.sin(a) * r, z);
        const b1 = pt(p.a - w, p.R, p.z);
        const b2 = pt(p.a + w, p.R, p.z);
        const tip = pt(p.a, p.tipR, p.tz);
        const bulge = pt(p.a, p.R * 1.18, (p.z + p.tz) / 2);
        const f = 0.78 + 0.26 * ((Math.sin(p.a) - Math.cos(p.a)) / Math.SQRT2 * 0.5 + 0.5);
        ctx.beginPath();
        ctx.moveTo(b1[0], b1[1]);
        ctx.quadraticCurveTo((b1[0] + bulge[0]) / 2, bulge[1], tip[0], tip[1]);
        ctx.quadraticCurveTo((b2[0] + bulge[0]) / 2, bulge[1], b2[0], b2[1]);
        ctx.closePath();
        ctx.fillStyle = C('#f7f6f1', f);
        ctx.fill();
        ctx.strokeStyle = C('#cfcac0', 1);
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
    },
  },

  akshardham: {
    h: 34,
    draw(ctx, lm) {
      const { i0, j0, w, d } = lm;
      const [ci, cj] = centre(lm);
      lawn(ctx, lm, '#8fc35d');
      rect(ctx, i0 + 0.3, j0 + 0.3, w - 0.6, d - 0.6, C('#e8d9c4'));
      water(ctx, i0 + 0.55, j0 + 0.55, 0.3, d - 1.1);
      const pink = '#d98a6c';
      walls(ctx, i0 + 0.15, j0 + 0.15, w - 0.3, d - 0.3, 0.2, 5, pink, false, { topCol: '#e7a688' });
      box(ctx, ci - 0.62, cj - 0.62, 1.24, 1.24, 0, 6, '#e09a78', { topCol: '#f0c4a6' });
      box(ctx, ci - 0.46, cj - 0.46, 0.92, 0.92, 6, 6, '#e7a888', { topCol: '#f2cdb2' });
      const small = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        small.push([ci + Math.cos(a) * 0.38, cj + Math.sin(a) * 0.38]);
      }
      small.sort((p, q) => p[0] + p[1] - q[0] - q[1]);
      for (const [u, v] of small.slice(0, 4)) dome(ctx, u, v, 0.09, 12, 5, '#f0c9a8', { finial: 1 });
      cyl(ctx, ci, cj, 0.24, 12, 3, '#efc0a0', { n: 16 });
      dome(ctx, ci, cj, 0.27, 15, 10, '#f3d2b8', { finial: 3 });
      for (const [u, v] of small.slice(4)) dome(ctx, u, v, 0.09, 12, 5, '#f0c9a8', { finial: 1 });
      walls(ctx, i0 + 0.15, j0 + 0.15, w - 0.3, d - 0.3, 0.2, 5, pink, true, { topCol: '#e7a688' });
    },
  },

  'qutub-minar': {
    h: 84,
    draw(ctx, lm) {
      const { i0, j0 } = lm;
      rect(ctx, i0, j0, 2, 2, C('#c9bc9c'));
      // Quwwat-ul-Islam ruins and colonnades
      const ruin = '#b49a7a';
      box(ctx, i0 + 0.1, j0 + 0.1, 0.9, 0.12, 0, 3, ruin);
      box(ctx, i0 + 0.1, j0 + 0.1, 0.12, 1.1, 0, 3, ruin);
      box(ctx, i0 + 0.35, j0 + 0.45, 0.5, 0.15, 0, 9, '#b8805e');
      arch(ctx, 'j', j0 + 0.6, i0 + 0.6, 0.12, 0, 7, C('#6c4a32', 1));
      pole(ctx, i0 + 0.6, j0 + 0.95, 0, 6, '#4a4a4a', 1.1); // the iron pillar
      box(ctx, i0 + 0.1, j0 + 1.1, 0.9, 0.12, 0, 3, ruin);
      // Alai Darwaza
      box(ctx, i0 + 1.15, j0 + 1.35, 0.4, 0.4, 0, 5, '#b8543a');
      dome(ctx, i0 + 1.35, j0 + 1.55, 0.16, 5, 4, '#e8dcc6');
      // the minar: five fluted storeys with balconies
      const ci = i0 + 1.3;
      const cj = j0 + 0.65;
      const storeys = [[22, '#b35538'], [17, '#b8603f'], [13, '#be6a46'], [9, '#ddc8a8'], [8, '#d6bf9c']];
      let z = 0;
      let r = 0.3;
      const total = storeys.reduce((s, [h]) => s + h, 0);
      cyl(ctx, ci, cj, 0.36, 0, 1.5, '#a68b6a', { n: 16 });
      z = 1.5;
      for (const [h, col] of storeys) {
        const r2 = r - (0.17 * h) / total;
        cyl(ctx, ci, cj, r, z, h, col, { n: 16, topScale: r2 / r });
        z += h;
        cyl(ctx, ci, cj, r2 * 1.3, z, 1.3, '#7a3b28', { n: 16, topCol: '#9a5a40' });
        z += 1.3;
        r = r2;
      }
      cyl(ctx, ci, cj, r * 0.8, z, 3, '#e9dfcf', { n: 12 });
      dome(ctx, ci, cj, r * 0.8, z + 3, 2.5, '#e9dfcf');
    },
  },

  'hauz-khas': {
    h: 16,
    draw(ctx, lm) {
      const { i0, j0 } = lm;
      rect(ctx, i0, j0, 2, 1, C('#cfc3a6'));
      const col = '#b7a58a';
      box(ctx, i0 + 0.1, j0 + 0.15, 1.8, 0.35, 0, 5, col);
      for (let k = 0; k < 6; k++) arch(ctx, 'j', j0 + 0.5, i0 + 0.25 + k * 0.3, 0.07, 0.5, 4, C('#5e5140', 1));
      chhatri(ctx, i0 + 0.3, j0 + 0.32, 5, 0.09, '#c9bda5');
      chhatri(ctx, i0 + 1.65, j0 + 0.32, 5, 0.09, '#c9bda5');
      box(ctx, i0 + 0.8, j0 + 0.45, 0.42, 0.42, 0, 7, col);
      dome(ctx, i0 + 1.01, j0 + 0.66, 0.2, 7, 7, '#c5b9a2', { finial: 1.5 });
    },
  },

  tughlakabad: {
    h: 12,
    draw(ctx, lm) {
      const { i0, j0, w, d } = lm;
      rect(ctx, i0, j0, w, d, C('#8ea35a'));
      const col = '#8f7f6a';
      const bast = (u, v) => cyl(ctx, u, v, 0.26, 0, 9, col, { n: 12, topScale: 0.75 });
      bast(i0 + 0.2, j0 + 0.2);
      box(ctx, i0, j0, 1.1, 0.25, 0, 7, col);
      box(ctx, i0 + 1.6, j0, 1.4, 0.25, 0, 6, col);
      box(ctx, i0, j0, 0.25, 1.8, 0, 7, col);
      box(ctx, i0, j0 + 2.3, 0.25, 0.7, 0, 5, col);
      bast(i0 + 0.2, j0 + 1.5);
      box(ctx, i0 + 1.2, j0 + 1.0, 0.5, 0.4, 0, 4, '#9c8b74');
      box(ctx, i0 + 1.9, j0 + 1.7, 0.3, 0.6, 0, 3, '#9c8b74');
      tree(ctx, i0 + 0.9, j0 + 2.0, 2.2, '#5f7f3a', 'kikar');
      tree(ctx, i0 + 2.3, j0 + 0.9, 2.2, '#5f7f3a', 'kikar');
      bast(i0 + w - 0.2, j0 + 0.2);
      box(ctx, i0 + w - 0.25, j0, 0.25, 1.3, 0, 6, col);
      box(ctx, i0 + w - 0.25, j0 + 1.8, 0.25, 1.2, 0, 7, col);
      box(ctx, i0, j0 + d - 0.25, 1.4, 0.25, 0, 7, col);
      box(ctx, i0 + 2.0, j0 + d - 0.25, 1.0, 0.25, 0, 6, col);
      bast(i0 + 0.2, j0 + d - 0.2);
      bast(i0 + w - 0.2, j0 + d - 0.2);
    },
  },

  'signature-bridge': {
    h: 70,
    draw(ctx, lm) {
      const ci = lm.i0 + 0.5;
      const cj = lm.j0 + 0.5;
      const steel = C('#dfe4e8', 1);
      const apex = P(ci - 0.05, cj - 0.1, 66);
      const legA = P(ci - 0.35, cj + 0.25, 3);
      const legB = P(ci + 0.35, cj + 0.25, 3);
      // cables fanning to the deck on both sides
      ctx.strokeStyle = C('#c9ced2', 1);
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      for (let k = 1; k <= 9; k++) {
        const t = k / 10;
        const s = [apex[0] + (legA[0] - apex[0]) * t * 0.5, apex[1] + (legA[1] - apex[1]) * t * 0.5];
        for (const dir of [-1, 1]) {
          const deck = P(ci + dir * (0.4 + k * 0.17), lm.j0 + 0.5, 3);
          ctx.moveTo(s[0], s[1]);
          ctx.lineTo(deck[0], deck[1]);
        }
      }
      ctx.stroke();
      ctx.fillStyle = steel;
      ctx.beginPath();
      ctx.moveTo(legA[0] - 1.2, legA[1]);
      ctx.lineTo(apex[0] - 1, apex[1]);
      ctx.lineTo(apex[0] + 1.6, apex[1] + 1);
      ctx.lineTo(legB[0] + 1.2, legB[1]);
      ctx.lineTo(legB[0] - 0.8, legB[1]);
      ctx.lineTo(apex[0] + 0.2, apex[1] + 10);
      ctx.lineTo(legA[0] + 0.8, legA[1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C('#9aa3aa', 1);
      ctx.lineWidth = 0.4;
      ctx.stroke();
    },
  },

  'igi-airport': {
    h: 40,
    draw(ctx, lm) {
      const { i0, j0 } = lm;
      rect(ctx, i0, j0, 3, 2, C('#bcbbb5'));
      // control tower
      cyl(ctx, i0 + 0.3, j0 + 0.25, 0.09, 0, 32, '#e9e6df', { n: 10 });
      cyl(ctx, i0 + 0.3, j0 + 0.25, 0.22, 32, 4, '#5f8aa5', { n: 14, topScale: 1.15, topCol: '#e0e0e0' });
      box(ctx, i0 + 0.15, j0 + 0.55, 2.7, 0.8, 0, 6, '#9fbfd3');
      box(ctx, i0 + 0.1, j0 + 0.5, 2.8, 0.9, 6, 1.5, '#e8e8e6', { topCol: '#f1f1ef' });
      for (let k = 0; k < 6; k++) box(ctx, i0 + 0.3 + k * 0.42, j0 + 1.4, 0.12, 0.45, 2, 2, '#d8d8d4');
    },
  },
};

function secretariat(ctx, lm) {
  const { i0, j0 } = lm;
  rect(ctx, i0, j0, 2, 1, C('#e2d6bf'));
  box(ctx, i0 + 0.1, j0 + 0.2, 1.8, 0.6, 0, 4, RED);
  box(ctx, i0 + 0.12, j0 + 0.22, 1.76, 0.56, 4, 7, CREAM);
  chhatri(ctx, i0 + 0.3, j0 + 0.5, 11, 0.09, CREAM);
  cyl(ctx, i0 + 1, j0 + 0.5, 0.2, 11, 3, CREAM, { n: 14 });
  dome(ctx, i0 + 1, j0 + 0.5, 0.21, 14, 6, '#d9b98a', { finial: 2 });
  chhatri(ctx, i0 + 1.7, j0 + 0.5, 11, 0.09, CREAM);
}

function minaret(ctx, i, j, z0) {
  let z = z0;
  for (let k = 0; k < 6; k++) {
    cyl(ctx, i, j, 0.075 - k * 0.004, z, 5, k % 2 ? MARBLE : '#b5543a', { n: 8 });
    z += 5;
  }
  chhatri(ctx, i, j, z, 0.07);
}

export function modelHeight(id) {
  return MODELS[id]?.h ?? 20;
}

export function drawLandmark(ctx, lm) {
  MODELS[lm.id]?.draw(ctx, lm);
  if (getMode() === 'night') floodlight(ctx, lm);
}

function floodlight(ctx, lm) {
  const [ci, cj] = centre(lm);
  const [X, Y] = P(ci, cj, modelHeight(lm.id) * 0.4);
  const r = 10 + lm.w * 10;
  const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
  g.addColorStop(0, L('#ffd9a0', 0.28));
  g.addColorStop(1, L('#ffd9a0', 0));
  ctx.fillStyle = g;
  ctx.fillRect(X - r, Y - r, r * 2, r * 2);
}
