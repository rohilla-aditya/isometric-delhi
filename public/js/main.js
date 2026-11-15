import { generateWorld } from './world.js';
import { iso as P, unIso, llToTile } from './geo.js';
import { DISTRICT_LABELS } from './data.js';
import { Scene, ChunkCache, CHUNK, LEVELS, renderOverview, setMode } from './renderer.js';
import { Life } from './anim.js';
import { modelHeight } from './landmarks.js';

const BG = { day: '#e9e2d3', dusk: '#e2b99a', night: '#0f1526' };
const FEATURED = new Set(['india-gate', 'red-fort', 'qutub-minar', 'lotus-temple', 'akshardham', 'connaught-place', 'rashtrapati-bhavan', 'humayun-tomb', 'igi-airport', 'jama-masjid', 'signature-bridge']);
const MIN_ZOOM = 0.18;
const MAX_ZOOM = 4;

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');
const mini = $('minimap');
const mctx = mini.getContext('2d');

const opts = { traffic: true, metro: true, labels: true };
let mode = 'day';
let world;
let scene;
let cache;
let life;
const overviews = {};
let dpr = 1;
let W = 0;
let H = 0;
const cam = { x: 0, y: 0, zoom: 1 };
let flight = null;
let selected = null;
let hovered = null;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

function screenToWorld(sx, sy) {
  return [cam.x + (sx - W / 2) / cam.zoom, cam.y + (sy - H / 2) / cam.zoom];
}

function clampCam() {
  const b = scene.bounds;
  cam.x = Math.max(b.x0, Math.min(b.x1, cam.x));
  cam.y = Math.max(b.y0, Math.min(b.y1, cam.y));
  cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom));
}

function overview() {
  if (!overviews[mode]) overviews[mode] = renderOverview(scene, 0.25, cache.opts);
  return overviews[mode];
}

// ------------------------------------------------------------------ draw --

function frame(now, dt) {
  if (flight) stepFlight(now);
  life.update(dt);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BG[mode];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const s = dpr * cam.zoom;
  ctx.setTransform(s, 0, 0, s, dpr * (W / 2 - cam.x * cam.zoom), dpr * (H / 2 - cam.y * cam.zoom));
  ctx.imageSmoothingEnabled = true;

  const [vx0, vy0] = screenToWorld(0, 0);
  const [vx1, vy1] = screenToWorld(W, H);
  const want = cam.zoom * dpr;
  const level = LEVELS.find((l) => l >= want * 0.9) || LEVELS[LEVELS.length - 1];
  const span = CHUNK / level;
  const ov = overview();
  const budgetEnd = performance.now() + 14;
  let pending = 0;
  for (let cy = Math.floor(vy0 / span); cy <= Math.floor(vy1 / span); cy++) {
    for (let cx = Math.floor(vx0 / span); cx <= Math.floor(vx1 / span); cx++) {
      const x0 = cx * span;
      const y0 = cy * span;
      const b = scene.bounds;
      if (x0 > b.x1 || x0 + span < b.x0 || y0 > b.y1 || y0 + span < b.y0) continue;
      let c = cache.get(level, cx, cy);
      if (!c && performance.now() < budgetEnd) c = cache.render(level, cx, cy);
      if (c) {
        ctx.drawImage(c, x0, y0, span + 0.6 / cam.zoom, span + 0.6 / cam.zoom);
      } else {
        pending++;
        const sx = (x0 - ov.x0) * ov.scale;
        const sy = (y0 - ov.y0) * ov.scale;
        ctx.drawImage(ov.canvas, sx, sy, span * ov.scale, span * ov.scale, x0, y0, span, span);
      }
    }
  }

  life.draw(ctx, { x0: vx0, y0: vy0, x1: vx1, y1: vy1, zoom: cam.zoom }, now / 1000, opts);
  if (hovered || selected) outline(hovered || selected);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (opts.labels) drawLabels();
  drawMinimap();
  $('loading').hidden = true;
  return pending;
}

function outline(lm) {
  const { i0, j0, i1, j1 } = lm;
  const pts = [P(i0 - 0.15, j0 - 0.15), P(i1 + 1.15, j0 - 0.15), P(i1 + 1.15, j1 + 1.15), P(i0 - 0.15, j1 + 1.15)];
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.strokeStyle = mode === 'night' ? 'rgba(255,214,140,0.95)' : 'rgba(214,72,30,0.95)';
  ctx.lineWidth = 1.6 / cam.zoom;
  ctx.setLineDash([4 / cam.zoom, 3 / cam.zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function toScreen(x, y) {
  return [(x - cam.x) * cam.zoom + W / 2, (y - cam.y) * cam.zoom + H / 2];
}

function drawLabels() {
  const placed = [];
  const fits = (r) => {
    if (r.x1 < 0 || r.x0 > W || r.y1 < 0 || r.y0 > H) return false;
    for (const p of placed) if (r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0) return false;
    placed.push(r);
    return true;
  };
  const night = mode === 'night';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // landmarks first: they win collisions
  const list = [...world.landmarks].sort((a, b) => (b === selected) - (a === selected) || (FEATURED.has(b.id) - FEATURED.has(a.id)));
  for (const lm of list) {
    const show = lm === selected || lm === hovered || cam.zoom >= 0.7 || (cam.zoom >= 0.3 && FEATURED.has(lm.id));
    if (!show) continue;
    const ci = (lm.i0 + lm.i1 + 1) / 2;
    const cj = (lm.j0 + lm.j1 + 1) / 2;
    const [wx, wy] = P(ci, cj, modelHeight(lm.id));
    const [x, y] = toScreen(wx, wy);
    ctx.font = '600 12px "Inter", system-ui, sans-serif';
    const tw = ctx.measureText(lm.name).width;
    const r = { x0: x - tw / 2 - 8, x1: x + tw / 2 + 8, y0: y - 30, y1: y - 10 };
    if (!fits(r)) continue;
    const active = lm === selected || lm === hovered;
    ctx.fillStyle = active ? (night ? '#ffd27a' : '#c2410c') : night ? 'rgba(20,26,44,0.88)' : 'rgba(255,253,248,0.92)';
    roundRect(r.x0, r.y0, r.x1 - r.x0, 20, 10);
    ctx.fill();
    ctx.strokeStyle = night ? 'rgba(255,255,255,0.15)' : 'rgba(60,40,20,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 10);
    ctx.lineTo(x, y - 5);
    ctx.lineTo(x + 4, y - 10);
    ctx.fill();
    ctx.fillStyle = active ? (night ? '#1a1206' : '#fff') : night ? '#f3ead8' : '#2b2118';
    ctx.fillText(lm.name, x, y - 20);
  }

  if (cam.zoom < 0.22 || cam.zoom > 1.8) return;
  const alpha = cam.zoom > 1.2 ? (1.8 - cam.zoom) / 0.6 : 1;
  for (const [name, lat, lon, kind] of DISTRICT_LABELS) {
    const t = llToTile(lat, lon);
    const [x, y] = toScreen(...P(t.i, t.j, 0));
    const water = kind === 'water';
    ctx.font = water ? 'italic 500 13px "Inter", system-ui, sans-serif' : '700 11px "Inter", system-ui, sans-serif';
    const label = water ? name : name.toUpperCase();
    const tw = ctx.measureText(label).width + label.length * 1.2;
    if (!fits({ x0: x - tw / 2, x1: x + tw / 2, y0: y - 8, y1: y + 8 })) continue;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 3;
    ctx.strokeStyle = night ? 'rgba(10,14,28,0.8)' : 'rgba(255,252,244,0.85)';
    ctx.fillStyle = water ? (night ? '#9cc7e0' : '#2f6f8f') : night ? '#d9d2c4' : '#5a4a3a';
    if ('letterSpacing' in ctx) ctx.letterSpacing = water ? '0px' : '1.2px';
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMinimap() {
  const ov = overview();
  const mw = mini.clientWidth;
  const mh = mini.clientHeight;
  if (mini.width !== Math.round(mw * dpr)) {
    mini.width = Math.round(mw * dpr);
    mini.height = Math.round(mh * dpr);
  }
  const k = Math.min(mw / ov.canvas.width, mh / ov.canvas.height);
  const ox = (mw - ov.canvas.width * k) / 2;
  const oy = (mh - ov.canvas.height * k) / 2;
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, mw, mh);
  mctx.drawImage(ov.canvas, ox, oy, ov.canvas.width * k, ov.canvas.height * k);
  const toM = (x, y) => [ox + (x - ov.x0) * ov.scale * k, oy + (y - ov.y0) * ov.scale * k];
  const cl = (v, m) => Math.max(1, Math.min(m - 1, v));
  let [a, b] = toM(...screenToWorld(0, 0));
  let [c, d] = toM(...screenToWorld(W, H));
  [a, c] = [cl(a, mw), cl(c, mw)];
  [b, d] = [cl(b, mh), cl(d, mh)];
  mctx.strokeStyle = mode === 'night' ? '#ffd27a' : '#c2410c';
  mctx.lineWidth = 1.5;
  mctx.strokeRect(a, b, c - a, d - b);
  mini._map = { ox, oy, k, ov };
}

// -------------------------------------------------------------- camera --

function flyTo(x, y, zoom, ms = 1100) {
  flight = { from: { ...cam }, to: { x, y, zoom }, t0: performance.now(), ms };
}

function stepFlight(now) {
  const u = Math.min(1, (now - flight.t0) / flight.ms);
  const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const { from, to } = flight;
  // zoom out a little mid-flight for long hops
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const dip = Math.min(0.5, dist / 4000) * Math.sin(Math.PI * e);
  cam.x = from.x + (to.x - from.x) * e;
  cam.y = from.y + (to.y - from.y) * e;
  cam.zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * e) * (1 - dip);
  if (u >= 1) flight = null;
}

function focusLandmark(lm, zoom = Math.max(cam.zoom, 2)) {
  const ci = (lm.i0 + lm.i1 + 1) / 2;
  const cj = (lm.j0 + lm.j1 + 1) / 2;
  const [x, y] = P(ci, cj, modelHeight(lm.id) * 0.4);
  flyTo(x, y, zoom);
}

function select(lm, fly = true) {
  selected = lm;
  const card = $('card');
  if (!lm) {
    card.hidden = true;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    renderList();
    return;
  }
  $('card-name').textContent = lm.name;
  $('card-hi').textContent = lm.hi;
  $('card-era').textContent = lm.era;
  $('card-text').textContent = lm.text;
  card.hidden = false;
  history.replaceState(null, '', '#' + lm.id);
  if (fly) focusLandmark(lm);
  renderList();
}

function pickLandmark(sx, sy) {
  const [x, y] = screenToWorld(sx, sy);
  let best = null;
  for (const lm of world.landmarks) {
    const s = lm.screen;
    if (x < s.x0 + 6 || x > s.x1 - 6 || y < s.y0 + 10 || y > s.y1) continue;
    // must be over the footprint or the model rising above it
    const g = unIso(x, y);
    const overFootprint = g.i >= lm.i0 - 0.3 && g.i <= lm.i1 + 1.3 && g.j >= lm.j0 - 0.3 && g.j <= lm.j1 + 1.3;
    const ci = (lm.i0 + lm.i1 + 1) / 2;
    const cj = (lm.j0 + lm.j1 + 1) / 2;
    const [cx] = P(ci, cj);
    const aboveIt = Math.abs(x - cx) < (lm.i1 - lm.i0 + lm.j1 - lm.j0 + 2) * 6 + 6;
    if (!overFootprint && !aboveIt) continue;
    if (!best || lm.i1 + lm.j1 > best.i1 + best.j1) best = lm;
  }
  return best;
}

// --------------------------------------------------------------- input --

function setupInput() {
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    flight = null;
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: 0 };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: cam.zoom };
      drag = null;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pinch.zoom * d) / pinch.d);
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      cam.x = drag.cx - dx / cam.zoom;
      cam.y = drag.cy - dy / cam.zoom;
      clampCam();
      canvas.classList.add('dragging');
      return;
    }
    if (e.pointerType === 'mouse') {
      const lm = pickLandmark(e.clientX, e.clientY);
      if (lm !== hovered) {
        hovered = lm;
        canvas.style.cursor = lm ? 'pointer' : '';
      }
    }
  });
  const end = (e) => {
    if (drag && drag.moved < 6 && pointers.size === 1) {
      const lm = pickLandmark(e.clientX, e.clientY);
      select(lm);
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) drag = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    hovered = null;
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      flight = null;
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      zoomAt(e.clientX, e.clientY, cam.zoom * k);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, button') && e.key !== 'Escape') return;
    const step = 80 / cam.zoom;
    if (e.key === 'ArrowLeft') cam.x -= step;
    else if (e.key === 'ArrowRight') cam.x += step;
    else if (e.key === 'ArrowUp') cam.y -= step;
    else if (e.key === 'ArrowDown') cam.y += step;
    else if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, cam.zoom * 1.3);
    else if (e.key === '-') zoomAt(W / 2, H / 2, cam.zoom / 1.3);
    else if (e.key === 'Escape') select(null);
    else return;
    clampCam();
  });

  const miniMove = (e) => {
    const m = mini._map;
    if (!m) return;
    const r = mini.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    cam.x = m.ov.x0 + (mx - m.ox) / (m.ov.scale * m.k);
    cam.y = m.ov.y0 + (my - m.oy) / (m.ov.scale * m.k);
    flight = null;
    clampCam();
  };
  mini.addEventListener('pointerdown', (e) => {
    mini.setPointerCapture(e.pointerId);
    miniMove(e);
    const mv = (ev) => miniMove(ev);
    mini.addEventListener('pointermove', mv);
    mini.addEventListener('pointerup', () => mini.removeEventListener('pointermove', mv), { once: true });
  });
}

function zoomAt(sx, sy, z) {
  const [wx, wy] = screenToWorld(sx, sy);
  cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  cam.x = wx - (sx - W / 2) / cam.zoom;
  cam.y = wy - (sy - H / 2) / cam.zoom;
  clampCam();
}

// ------------------------------------------------------------------ UI --

function renderList() {
  const ul = $('list');
  ul.replaceChildren();
  const sorted = [...world.landmarks].sort((a, b) => a.name.localeCompare(b.name));
  for (const lm of sorted) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lm' + (lm === selected ? ' on' : '');
    const n = document.createElement('span');
    n.textContent = lm.name;
    const h = document.createElement('span');
    h.className = 'hi';
    h.textContent = lm.hi;
    b.append(n, h);
    b.addEventListener('click', () => {
      select(lm);
      if (window.innerWidth < 720) document.body.classList.remove('list-open');
    });
    li.append(b);
    ul.append(li);
  }
}

function setTimeOfDay(m) {
  mode = m;
  setMode(m);
  cache.clear();
  document.documentElement.dataset.mode = m;
  for (const b of document.querySelectorAll('[data-time]')) b.setAttribute('aria-pressed', String(b.dataset.time === m));
}

function setupUI() {
  for (const b of document.querySelectorAll('[data-time]')) b.addEventListener('click', () => setTimeOfDay(b.dataset.time));
  for (const b of document.querySelectorAll('[data-toggle]')) {
    b.addEventListener('click', () => {
      const k = b.dataset.toggle;
      opts[k] = !opts[k];
      b.setAttribute('aria-pressed', String(opts[k]));
      if (k === 'metro') {
        cache.opts.metro = opts.metro;
        cache.clear();
        for (const key of Object.keys(overviews)) delete overviews[key];
      }
    });
  }
  $('zoom-in').addEventListener('click', () => zoomAt(W / 2, H / 2, cam.zoom * 1.4));
  $('zoom-out').addEventListener('click', () => zoomAt(W / 2, H / 2, cam.zoom / 1.4));
  $('home').addEventListener('click', () => {
    select(null);
    home(true);
  });
  $('card-close').addEventListener('click', () => select(null));
  $('list-toggle').addEventListener('click', () => document.body.classList.toggle('list-open'));
  renderList();
}

function home(animate) {
  const t = llToTile(28.618, 77.215);
  const [x, y] = P(t.i, t.j);
  const zoom = Math.min(1.1, Math.max(0.35, W / 1500));
  if (animate) flyTo(x, y, zoom);
  else Object.assign(cam, { x, y, zoom });
}

// ---------------------------------------------------------------- boot --

function boot() {
  resize();
  world = generateWorld();
  scene = new Scene(world);
  cache = new ChunkCache(scene);
  life = new Life(world);
  setMode(mode);
  document.documentElement.dataset.mode = mode;
  setupInput();
  setupUI();
  home(false);
  const fromHash = world.landmarks.find((l) => '#' + l.id === location.hash);
  if (fromHash) select(fromHash);

  window.addEventListener('resize', resize);
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frame(now, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__delhi = { cam, world, select, setTimeOfDay, flyTo };
}

requestAnimationFrame(() => setTimeout(boot, 0));
