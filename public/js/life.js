// Things that move, drawn every frame over the cached city: traffic on the
// main roads, trains on the elevated metro, planes at IGI, kites over the
// colonies, black kites over Jama Masjid, and clouds. Everything is in metres.

import { iso, unIso, llToEs, ZK } from './proj.js';
import { C, L, getMode } from './draw.js';
import { rng, hash2 } from './geo.js';

const CAR_COLOURS = ['#f4f4f2', '#c9cdd2', '#3d4247', '#b8322a', '#2f5d9e', '#d8d2c2', '#7c8288'];
const RUNWAYS = [
  [[28.5755, 77.0685], [28.5755, 77.1065]],
  [[28.5425, 77.0665], [28.5425, 77.1045]],
];

function cum(pts) {
  const c = [0];
  for (let k = 2; k < pts.length; k += 2) c.push(c[c.length - 1] + Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]));
  return c;
}

function along(pts, c, d) {
  const total = c[c.length - 1];
  d = Math.max(0, Math.min(total, d));
  let k = 1;
  while (k < c.length - 1 && c[k] < d) k++;
  const seg = c[k] - c[k - 1] || 1;
  const t = (d - c[k - 1]) / seg;
  const ae = pts[(k - 1) * 2];
  const as = pts[(k - 1) * 2 + 1];
  const be = pts[k * 2];
  const bs = pts[k * 2 + 1];
  return { e: ae + (be - ae) * t, s: as + (bs - as) * t, de: (be - ae) / seg, ds: (bs - as) / seg };
}

export class Life {
  constructor(meta, store, metroColours) {
    this.meta = meta;
    this.store = store;
    this.metroColours = metroColours || [];
    this.perCell = new Map();
    this.time = 0;
    const r = rng(7);
    this.runways = RUNWAYS.map(([a, b]) => [llToEs(...a), llToEs(...b)]);
    this.flights = [
      { rwy: 0, phase: 0, period: 40, mode: 'depart' },
      { rwy: 1, phase: 0.5, period: 46, mode: 'arrive' },
    ];
    const jm = llToEs(28.6507, 77.2334);
    this.birds = Array.from({ length: 22 }, () => ({ ce: jm.e + (r() - 0.5) * 900, cs: jm.s + (r() - 0.5) * 900, rad: 60 + r() * 160, z: 80 + r() * 70, w: 0.12 + r() * 0.15, ph: r() * 6.28 }));
    this.clouds = Array.from({ length: 26 }, () => ({
      e: r() * meta.width, s: r() * meta.height,
      puffs: Array.from({ length: 4 + Math.floor(r() * 4) }, () => [(r() - 0.5) * 900, (r() - 0.5) * 450, 160 + r() * 200]),
    }));
  }

  /** Lazily build the moving things that live in a cell. */
  forCell(c) {
    let v = this.perCell.get(c);
    if (v) return v;
    const r = rng(c.cx * 1000 + c.cy + 1);
    const cars = [];
    const trains = [];
    for (const l of c.lines) {
      if (l.cls >= 1 && l.cls <= 5) {
        const cm = cum(l.pts);
        const len = cm[cm.length - 1];
        const n = Math.floor(len / (l.cls <= 3 ? 45 : 110));
        for (let k = 0; k < n; k++) {
          const roll = r();
          const kind = roll < 0.25 ? 'auto' : roll < 0.32 ? 'bus' : roll < 0.45 ? 'bike' : 'car';
          cars.push({
            l, cm, len, d: r() * len, dir: r() < 0.5 ? 1 : -1, kind,
            v: (kind === 'bus' ? 7 : kind === 'auto' ? 8 : 11) + r() * 5,
            col: kind === 'auto' ? '#4f9a3a' : kind === 'bus' ? (r() < 0.5 ? '#c8452e' : '#3f8f4a') : CAR_COLOURS[Math.floor(r() * CAR_COLOURS.length)],
            lane: (l.cls <= 2 ? 6 : l.cls <= 3 ? 4.5 : 3) * (0.6 + r() * 0.6),
          });
        }
      } else if (l.cls === 14) {
        const cm = cum(l.pts);
        const len = cm[cm.length - 1];
        if (len > 300 && r() < Math.min(1, len / 1500)) trains.push({ l, cm, len, d: r() * len, dir: r() < 0.5 ? 1 : -1, wait: 0, col: this.metroColours[l.flags >> 1] || '#9a9a9a' });
      }
    }
    const kites = [];
    const houses = c.buildings.filter((b) => b.kind <= 1 && b.h < 20);
    for (let k = 0; k < Math.min(10, houses.length / 40); k++) {
      const b = houses[Math.floor(r() * houses.length)];
      kites.push({ e: b.ce, s: b.cs, roof: b.h, z: 35 + r() * 35, ph: r() * 6.28, de: (r() - 0.5) * 30, ds: -20 - r() * 25, col: ['#e8402c', '#f2c318', '#2f7bd8', '#e05aa0', '#f07c1c', '#ffffff', '#38a447'][Math.floor(r() * 7)] });
    }
    v = { cars, trains, kites };
    this.perCell.set(c, v);
    return v;
  }

  visibleCells(view) {
    const cs = this.meta.cell;
    const pts = [unIso(view.x0, view.y0), unIso(view.x1, view.y0), unIso(view.x0, view.y1), unIso(view.x1, view.y1)];
    const out = [];
    const e0 = Math.min(...pts.map((p) => p.e));
    const e1 = Math.max(...pts.map((p) => p.e));
    const s0 = Math.min(...pts.map((p) => p.s));
    const s1 = Math.max(...pts.map((p) => p.s));
    for (let cy = Math.max(0, Math.floor(s0 / cs)); cy <= Math.floor(s1 / cs); cy++) {
      for (let cx = Math.max(0, Math.floor(e0 / cs)); cx <= Math.floor(e1 / cs); cx++) {
        const k = cx + ',' + cy;
        const c = this.store.cells.get(k);
        if (c) out.push(c);
      }
    }
    return out;
  }

  update(dt, view) {
    this.time += dt;
    if (view.zoom < 0.12) return;
    for (const c of this.visibleCells(view)) {
      const v = this.forCell(c);
      for (const car of v.cars) {
        car.d += car.dir * car.v * dt;
        if (car.d > car.len) car.d -= car.len;
        if (car.d < 0) car.d += car.len;
      }
      for (const t of v.trains) {
        if (t.wait > 0) {
          t.wait -= dt;
          continue;
        }
        t.d += t.dir * 16 * dt;
        if (t.d > t.len || t.d < 0) {
          t.d = Math.max(0, Math.min(t.len, t.d));
          t.dir *= -1;
          t.wait = 6;
        }
      }
    }
    for (const c of this.clouds) {
      c.e += dt * 9;
      c.s -= dt * 3;
      if (c.e > this.meta.width + 3000) c.e = -3000;
      if (c.s < -3000) c.s = this.meta.height + 3000;
    }
  }

  draw(ctx, view, opts) {
    const night = getMode() === 'night';
    const cells = view.zoom >= 0.12 ? this.visibleCells(view) : [];
    const inView = (e, s, z = 0, m = 60) => {
      const [x, y] = iso(e, s, z);
      return x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
    };
    for (const c of cells) {
      const v = this.forCell(c);
      if (opts.traffic && view.zoom >= 0.3) for (const car of v.cars) this.car(ctx, car, inView, night);
      if (opts.metro) for (const t of v.trains) this.train(ctx, t, inView, night, view.zoom);
      if (!night && view.zoom >= 0.4) for (const k of v.kites) this.kite(ctx, k, inView);
    }
    this.planes(ctx, inView, view.zoom);
    if (view.zoom >= 0.3) this.drawBirds(ctx, inView);
    this.drawClouds(ctx, inView, night, view.zoom);
  }

  car(ctx, c, inView, night) {
    const p = along(c.l.pts, c.cm, c.d);
    const ne = -p.ds * c.dir;
    const ns = p.de * c.dir;
    const e = p.e - ne * c.lane;
    const s = p.s - ns * c.lane;
    if (!inView(e, s)) return;
    const [x, y] = iso(e, s, 1);
    let hx = (p.de - p.ds) * c.dir;
    let hy = ((p.de + p.ds) / 2) * c.dir;
    const hl = Math.hypot(hx, hy) || 1;
    hx /= hl;
    hy /= hl;
    const len = c.kind === 'bus' ? 11 : c.kind === 'bike' ? 2.2 : c.kind === 'auto' ? 3 : 4.6;
    const wid = c.kind === 'bus' ? 2.6 : c.kind === 'bike' ? 0.8 : c.kind === 'auto' ? 1.5 : 1.9;
    ctx.fillStyle = night ? C(c.col, 1.6) : C(c.col);
    ctx.beginPath();
    ctx.moveTo(x + (hx * len) / 2 - (hy * wid) / 2, y + (hy * len) / 2 + (hx * wid) / 2);
    ctx.lineTo(x + (hx * len) / 2 + (hy * wid) / 2, y + (hy * len) / 2 - (hx * wid) / 2);
    ctx.lineTo(x - (hx * len) / 2 + (hy * wid) / 2, y - (hy * len) / 2 - (hx * wid) / 2);
    ctx.lineTo(x - (hx * len) / 2 - (hy * wid) / 2, y - (hy * len) / 2 + (hx * wid) / 2);
    ctx.fill();
    if (c.kind === 'auto' && !night) {
      ctx.fillStyle = C('#f2c318');
      ctx.fillRect(x - 0.8, y - 1.6, 1.6, 1);
    }
    if (night) {
      ctx.fillStyle = L('#fff2c0', 0.9);
      ctx.beginPath();
      ctx.arc(x + hx * len * 0.6, y + hy * len * 0.6, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = L('#ff3b2f', 0.85);
      ctx.fillRect(x - hx * len * 0.55 - 0.6, y - hy * len * 0.55 - 0.6, 1.2, 1.2);
    }
  }

  train(ctx, t, inView, night, zoom) {
    const head = along(t.l.pts, t.cm, t.d);
    if (!inView(head.e, head.s, 12, 200)) return;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k <= 6; k++) {
      const p = along(t.l.pts, t.cm, t.d - t.dir * k * 22);
      const [x, y] = iso(p.e, p.s, 12.5);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = night ? L('#fff0c8', 0.95) : C('#eef0f2');
    ctx.lineWidth = Math.max(3.2, 1.6 / zoom);
    ctx.stroke();
    ctx.strokeStyle = C(t.col, night ? 1.5 : 1);
    ctx.lineWidth = Math.max(1, 0.6 / zoom);
    ctx.stroke();
  }

  kite(ctx, k, inView) {
    const t = this.time;
    if (!inView(k.e, k.s, k.z)) return;
    const sway = Math.sin(t * 1.3 + k.ph);
    const ke = k.e + k.de + sway * 3;
    const ks = k.s + k.ds + Math.cos(t * 0.9 + k.ph) * 2;
    const [x, y] = iso(ke, ks, k.z + Math.sin(t * 2 + k.ph) * 2);
    const [rx, ry] = iso(k.e, k.s, k.roof + 1);
    ctx.strokeStyle = 'rgba(80,80,80,0.45)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.quadraticCurveTo((rx + x) / 2 + 6, (ry + y) / 2 + 8, x, y);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway * 0.35);
    ctx.fillStyle = C(k.col);
    ctx.beginPath();
    ctx.moveTo(0, -2.4);
    ctx.lineTo(2, 0);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  planes(ctx, inView, zoom) {
    for (const f of this.flights) {
      const u = (this.time / f.period + f.phase) % 1;
      const [a, b] = this.runways[f.rwy];
      let de = b.e - a.e;
      let ds = b.s - a.s;
      const len = Math.hypot(de, ds);
      de /= len;
      ds /= len;
      let e;
      let s;
      let z;
      let hd;
      if (f.mode === 'depart') {
        const d = u < 0.5 ? len * 0.8 * Math.pow(u / 0.5, 2) : len * 0.8 + (u - 0.5) * 18000;
        e = a.e + de * d;
        s = a.s + ds * d;
        z = u < 0.4 ? 1 : Math.pow((u - 0.4) / 0.6, 1.5) * 1400;
        hd = [de, ds];
      } else if (u < 0.55) {
        const out = ((0.55 - u) / 0.55) * 14000;
        e = b.e + de * out;
        s = b.s + ds * out;
        z = (out / 14000) * 900 + 1;
        hd = [-de, -ds];
      } else {
        const d = len * 0.65 * (1 - Math.pow(1 - (u - 0.55) / 0.45, 2));
        e = b.e - de * d;
        s = b.s - ds * d;
        z = 1;
        hd = [-de, -ds];
      }
      if (!inView(e, s, z, 400)) continue;
      plane(ctx, e, s, z, hd, Math.max(1, 0.5 / zoom));
    }
  }

  drawBirds(ctx, inView) {
    ctx.strokeStyle = C('#2a2522');
    ctx.lineWidth = 0.8;
    for (const b of this.birds) {
      const a = this.time * b.w + b.ph;
      const e = b.ce + Math.cos(a) * b.rad;
      const s = b.cs + Math.sin(a) * b.rad;
      if (!inView(e, s, b.z)) continue;
      const [x, y] = iso(e, s, b.z);
      const f = Math.sin(this.time * 6 + b.ph) * 0.8;
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 0.8 + f);
      ctx.quadraticCurveTo(x - 1.4, y - 1.6, x, y);
      ctx.quadraticCurveTo(x + 1.4, y - 1.6, x + 3, y - 0.8 + f);
      ctx.stroke();
    }
  }

  drawClouds(ctx, inView, night, zoom) {
    if (zoom > 1.5) return;
    for (const c of this.clouds) {
      if (!inView(c.e, c.s, 900, 3000)) continue;
      ctx.fillStyle = night ? 'rgba(0,0,0,0.05)' : 'rgba(40,40,60,0.06)';
      for (const [u, v, r] of c.puffs) {
        const [x, y] = iso(c.e + u + 600, c.s + v + 600, 0);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const [u, v, r] of c.puffs) {
        const [x, y] = iso(c.e + u, c.s + v, 900);
        const g = ctx.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r * 1.5);
        g.addColorStop(0, night ? 'rgba(150,160,190,0.3)' : 'rgba(255,255,255,0.78)');
        g.addColorStop(1, night ? 'rgba(150,160,190,0)' : 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.5, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function plane(ctx, e, s, z, hd, k) {
  const [x, y] = iso(e, s, z);
  let hx = hd[0] - hd[1];
  let hy = (hd[0] + hd[1]) / 2;
  const l = Math.hypot(hx, hy) || 1;
  hx /= l;
  hy /= l;
  const px = -hy;
  const py = hx;
  if (z > 2) {
    const [sx, sy] = iso(e, s, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 34 * k, 17 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const Ln = 36 * k;
  const W = 32 * k;
  ctx.fillStyle = C('#f5f6f7');
  ctx.beginPath();
  ctx.moveTo(x + hx * Ln * 0.4, y + hy * Ln * 0.4);
  ctx.lineTo(x + px * W, y + py * W);
  ctx.lineTo(x - hx * Ln * 0.15, y - hy * Ln * 0.15);
  ctx.lineTo(x - px * W, y - py * W);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C('#f5f6f7');
  ctx.lineWidth = 7 * k;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + hx * Ln, y + hy * Ln);
  ctx.lineTo(x - hx * Ln, y - hy * Ln);
  ctx.stroke();
  ctx.fillStyle = C('#c8452e');
  ctx.beginPath();
  ctx.arc(x - hx * Ln * 0.9, y - hy * Ln * 0.9, 4 * k, 0, Math.PI * 2);
  ctx.fill();
  void hash2;
  void ZK;
}
