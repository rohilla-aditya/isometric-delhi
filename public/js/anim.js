// Things that move, drawn every frame on top of the cached city:
// traffic, metro trains, aircraft at IGI, kites, black kites and clouds.

import { iso as P, cumulative, pointAlong, rng, llToTile } from './geo.js';
import { C, L, getMode } from './draw.js';

const CAR_COLOURS = ['#f4f4f2', '#c9cdd2', '#3d4247', '#b8322a', '#2f5d9e', '#d8d2c2', '#7c8288'];

export class Life {
  constructor(world) {
    this.world = world;
    const rand = rng(42);
    this.rand = rand;

    this.roads = world.roads
      .filter((r) => r.cls === 'major' || r.cls === 'avenue')
      .map((r) => ({ ...r, cum: cumulative(r.pts) }));
    this.cars = [];
    for (const r of this.roads) {
      const len = r.cum[r.cum.length - 1];
      const n = Math.round(len * (r.cls === 'major' ? 1.0 : 0.6));
      for (let k = 0; k < n; k++) {
        const roll = rand();
        const kind = roll < 0.22 ? 'auto' : roll < 0.3 ? 'bus' : roll < 0.4 ? 'bike' : 'car';
        this.cars.push({
          r,
          len,
          d: rand() * len,
          dir: rand() < 0.5 ? 1 : -1,
          v: (kind === 'bus' ? 0.45 : kind === 'auto' ? 0.55 : 0.7) + rand() * 0.5,
          kind,
          col: kind === 'auto' ? '#4f9a3a' : kind === 'bus' ? (rand() < 0.5 ? '#c8452e' : '#3f8f4a') : CAR_COLOURS[Math.floor(rand() * CAR_COLOURS.length)],
        });
      }
    }

    this.trains = [];
    for (const line of world.metro) {
      const len = line.cum[line.cum.length - 1];
      const n = Math.max(2, Math.round(len / 14));
      for (let k = 0; k < n; k++) {
        this.trains.push({ line, len, d: (k / n) * len, dir: k % 2 ? 1 : -1, v: 1.6, wait: 0 });
      }
    }

    const rwy = world.runways[0];
    const rwy2 = world.runways[1];
    this.flights = [
      { rwy, phase: 0, t: 0, period: 26, mode: 'depart' },
      { rwy: rwy2, phase: 0.5, t: 0, period: 30, mode: 'arrive' },
    ];
    const t3 = world.landmarks.find((l) => l.id === 'igi-airport');
    this.parked = [];
    for (let k = 0; k < 5; k++) this.parked.push({ i: t3.i0 + 0.45 + k * 0.42, j: t3.j1 + 1.4, hd: [0, -1] });

    // kites over the old city and the colonies, black kites wheeling above
    const kiteZones = new Set(['old', 'dense', 'res']);
    const roofs = world.tiles.filter((t) => t.b && kiteZones.has(t.zone));
    this.kites = [];
    for (let k = 0; k < 70; k++) {
      const t = roofs[Math.floor(rand() * roofs.length)];
      this.kites.push({
        i: t.i + 0.5, j: t.j + 0.5, roof: t.b.h, z: 40 + rand() * 40, ph: rand() * 6.28,
        col: ['#e8402c', '#f2c318', '#2f7bd8', '#e05aa0', '#f07c1c', '#ffffff', '#38a447'][Math.floor(rand() * 7)],
        di: (rand() - 0.5) * 1.2, dj: -0.6 - rand() * 0.6,
      });
    }
    const jm = llToTile(28.652, 77.236);
    this.birds = [];
    for (let k = 0; k < 18; k++) {
      this.birds.push({ ci: jm.i + (rand() - 0.5) * 8, cj: jm.j + (rand() - 0.5) * 8, r: 0.8 + rand() * 1.6, z: 70 + rand() * 50, w: 0.25 + rand() * 0.3, ph: rand() * 6.28 });
    }
    this.clouds = [];
    for (let k = 0; k < 9; k++) {
      const puffs = [];
      const n = 4 + Math.floor(rand() * 4);
      for (let p = 0; p < n; p++) puffs.push([(rand() - 0.5) * 6, (rand() - 0.5) * 3, 1.4 + rand() * 1.8]);
      this.clouds.push({ i: rand() * world.N, j: rand() * world.N, puffs });
    }
  }

  update(dt) {
    for (const c of this.cars) {
      c.d += c.dir * c.v * dt;
      if (c.d > c.len) c.d -= c.len;
      if (c.d < 0) c.d += c.len;
    }
    for (const tr of this.trains) {
      if (tr.wait > 0) {
        tr.wait -= dt;
        continue;
      }
      tr.d += tr.dir * tr.v * dt;
      if (tr.d > tr.len || tr.d < 0) {
        tr.d = Math.max(0, Math.min(tr.len, tr.d));
        tr.dir *= -1;
        tr.wait = 2;
      }
    }
    for (const f of this.flights) f.t += dt;
    const N = this.world.N;
    for (const c of this.clouds) {
      c.i += dt * 0.35;
      c.j -= dt * 0.12;
      if (c.i > N + 10) c.i = -10;
      if (c.j < -10) c.j = N + 10;
    }
  }

  draw(ctx, view, time, opts) {
    const night = getMode() === 'night';
    const inView = (i, j, m = 40) => {
      const [x, y] = P(i, j);
      return x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m + 80;
    };

    if (opts.traffic) this.drawCars(ctx, inView, night, view.zoom);
    if (opts.metro) this.drawTrains(ctx, inView, night);
    this.drawPlanes(ctx, time, inView);
    if (!night) this.drawKites(ctx, time, inView);
    this.drawBirds(ctx, time, inView);
    this.drawClouds(ctx, inView, night);
  }

  drawCars(ctx, inView, night, zoom) {
    if (zoom < 0.35) return;
    for (const c of this.cars) {
      const p = pointAlong(c.r.pts, c.r.cum, c.d);
      // keep left: offset to the left of the direction of travel
      const ni = -p.dj * c.dir;
      const nj = p.di * c.dir;
      const lane = c.r.cls === 'major' ? 0.13 : 0.08;
      const i = p.i - ni * lane;
      const j = p.j - nj * lane;
      if (i < 0 || j < 0 || i > this.world.N || j > this.world.N || !inView(i, j)) continue;
      const [x, y] = P(i, j, 1);
      let hx = (p.di - p.dj) * 16 * c.dir;
      let hy = (p.di + p.dj) * 8 * c.dir;
      const hl = Math.hypot(hx, hy) || 1;
      hx /= hl;
      hy /= hl;
      const len = c.kind === 'bus' ? 4.5 : c.kind === 'bike' ? 1.2 : c.kind === 'auto' ? 1.6 : 2.2;
      const wid = c.kind === 'bus' ? 1.5 : c.kind === 'bike' ? 0.5 : 1.15;
      ctx.fillStyle = night ? C(c.col, 1.6) : C(c.col);
      ctx.beginPath();
      ctx.moveTo(x + hx * len / 2 - hy * wid / 2, y + hy * len / 2 + hx * wid / 2);
      ctx.lineTo(x + hx * len / 2 + hy * wid / 2, y + hy * len / 2 - hx * wid / 2);
      ctx.lineTo(x - hx * len / 2 + hy * wid / 2, y - hy * len / 2 - hx * wid / 2);
      ctx.lineTo(x - hx * len / 2 - hy * wid / 2, y - hy * len / 2 + hx * wid / 2);
      ctx.fill();
      if (c.kind === 'auto' && !night) {
        ctx.fillStyle = C('#f2c318');
        ctx.fillRect(x - 0.5, y - 0.9, 1, 0.6);
      }
      if (night) {
        ctx.fillStyle = L('#fff2c0', 0.85);
        ctx.fillRect(x + hx * len * 0.7 - 0.5, y + hy * len * 0.7 - 0.5, 1, 1);
        ctx.fillStyle = L('#ff3b2f', 0.8);
        ctx.fillRect(x - hx * len * 0.6 - 0.4, y - hy * len * 0.6 - 0.4, 0.8, 0.8);
      }
    }
  }

  drawTrains(ctx, inView, night) {
    ctx.lineCap = 'round';
    for (const tr of this.trains) {
      const head = pointAlong(tr.line.pts, tr.line.cum, tr.d);
      if (!inView(head.i, head.j)) continue;
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const p = pointAlong(tr.line.pts, tr.line.cum, tr.d - tr.dir * k * 0.12);
        pts.push(P(p.i, p.j, 12));
      }
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = night ? L('#fff0c8', 0.95) : C('#eef0f2');
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.strokeStyle = C(tr.line.color, night ? 1.6 : 1);
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  }

  drawPlanes(ctx, time, inView) {
    for (const p of this.parked) if (inView(p.i, p.j)) plane(ctx, p.i, p.j, 0.5, p.hd, 1);
    for (const f of this.flights) {
      const u = ((f.t / f.period + f.phase) % 1);
      const [a, b] = f.rwy;
      let di = b[0] - a[0];
      let dj = b[1] - a[1];
      const len = Math.hypot(di, dj);
      di /= len;
      dj /= len;
      let i;
      let j;
      let z;
      let hd;
      if (f.mode === 'depart') {
        // roll west to east, rotate, climb away
        const s = u < 0.5 ? len * 0.8 * Math.pow(u / 0.5, 2) : len * 0.8 + (u - 0.5) * 80;
        i = a[0] + di * s;
        j = a[1] + dj * s;
        z = u < 0.4 ? 0.5 : Math.pow((u - 0.4) / 0.6, 1.5) * 260;
        hd = [di, dj];
      } else if (u < 0.55) {
        // approach from the east, descending
        const e = ((0.55 - u) / 0.55) * 50;
        i = b[0] + di * e;
        j = b[1] + dj * e;
        z = (e / 50) * 220 + 0.5;
        hd = [-di, -dj];
      } else {
        // touchdown and roll-out, slowing
        const s = len * 0.6 * (1 - Math.pow(1 - (u - 0.55) / 0.45, 2));
        i = b[0] - di * s;
        j = b[1] - dj * s;
        z = 0.5;
        hd = [-di, -dj];
      }
      if (!inView(i, j, 300)) continue;
      plane(ctx, i, j, z, hd, 1.25);
    }
  }

  drawKites(ctx, time, inView) {
    ctx.lineWidth = 0.25;
    for (const k of this.kites) {
      if (!inView(k.i, k.j)) continue;
      const sway = Math.sin(time * 1.3 + k.ph);
      const ki = k.i + k.di + sway * 0.12;
      const kj = k.j + k.dj + Math.cos(time * 0.9 + k.ph) * 0.08;
      const [x, y] = P(ki, kj, k.z + Math.sin(time * 2 + k.ph) * 3);
      const [rx, ry] = P(k.i, k.j, k.roof + 1);
      ctx.strokeStyle = 'rgba(80,80,80,0.5)';
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.quadraticCurveTo((rx + x) / 2 + 4, (ry + y) / 2 + 6, x, y);
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway * 0.35);
      ctx.fillStyle = C(k.col);
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(1.6, 0);
      ctx.lineTo(0, 2);
      ctx.lineTo(-1.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawBirds(ctx, time, inView) {
    ctx.strokeStyle = C('#2a2522');
    ctx.lineWidth = 0.6;
    for (const b of this.birds) {
      const a = time * b.w + b.ph;
      const i = b.ci + Math.cos(a) * b.r;
      const j = b.cj + Math.sin(a) * b.r;
      if (!inView(i, j)) continue;
      const [x, y] = P(i, j, b.z);
      const f = Math.sin(time * 6 + b.ph) * 0.6;
      ctx.beginPath();
      ctx.moveTo(x - 2.2, y - 0.6 + f);
      ctx.quadraticCurveTo(x - 1, y - 1.2, x, y);
      ctx.quadraticCurveTo(x + 1, y - 1.2, x + 2.2, y - 0.6 + f);
      ctx.stroke();
    }
  }

  drawClouds(ctx, inView, night) {
    for (const c of this.clouds) {
      if (!inView(c.i, c.j, 160)) continue;
      // shadow on the ground
      ctx.fillStyle = night ? 'rgba(0,0,0,0.05)' : 'rgba(40,40,60,0.07)';
      for (const [u, v, r] of c.puffs) {
        const [x, y] = P(c.i + u + 3, c.j + v + 3, 0);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 20, r * 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const [u, v, r] of c.puffs) {
        const [x, y] = P(c.i + u, c.j + v, 150);
        const g = ctx.createRadialGradient(x, y - r * 4, r * 2, x, y, r * 22);
        g.addColorStop(0, night ? 'rgba(150,160,190,0.35)' : 'rgba(255,255,255,0.8)');
        g.addColorStop(1, night ? 'rgba(150,160,190,0)' : 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 22, r * 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function plane(ctx, i, j, z, hd, s) {
  const [x, y] = P(i, j, z);
  let hx = (hd[0] - hd[1]) * 16;
  let hy = (hd[0] + hd[1]) * 8;
  const l = Math.hypot(hx, hy) || 1;
  hx /= l;
  hy /= l;
  const px = -hy;
  const py = hx;
  if (z > 2) {
    const [sx, sy] = P(i, j, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 5 * s, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const L4 = 5 * s;
  const W = 4.6 * s;
  ctx.fillStyle = C('#f5f6f7');
  ctx.beginPath();
  ctx.moveTo(x + hx * L4, y + hy * L4);
  ctx.lineTo(x + px * W, y + py * W);
  ctx.lineTo(x - hx * L4 * 0.2, y - hy * L4 * 0.2);
  ctx.lineTo(x - px * W, y - py * W);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C('#f5f6f7');
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  ctx.moveTo(x + hx * L4, y + hy * L4);
  ctx.lineTo(x - hx * L4, y - hy * L4);
  ctx.stroke();
  ctx.fillStyle = C('#c8452e');
  ctx.beginPath();
  ctx.arc(x - hx * L4 * 0.9, y - hy * L4 * 0.9, 0.9 * s, 0, Math.PI * 2);
  ctx.fill();
}
