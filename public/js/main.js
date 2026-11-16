import { iso, unIso, llToEs, esToLL, setMeta, worldBounds, ZK } from './proj.js';
import { LANDMARKS, DISTRICT_LABELS } from './data.js';
import { CellStore } from './cells.js';
import { City, CHUNK, LEVELS, placeLandmarks, drawLandmarkModel, loadSprites } from './city.js';
import { Life } from './life.js';
import { setMode } from './draw.js';

const DATA = 'data';
const BG = { day: '#e9e2d3', dusk: '#e2b99a', night: '#0f1526' };
const TINT = { day: null, dusk: 'rgba(255,190,150,0.28)', night: 'rgba(20,30,70,0.62)' };
const FEATURED = new Set(['india-gate', 'red-fort', 'qutub-minar', 'lotus-temple', 'akshardham', 'connaught-place', 'rashtrapati-bhavan', 'humayun-tomb', 'igi-airport', 'jama-masjid', 'signature-bridge']);
const MAX_ZOOM = 4;

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');
const mini = $('minimap');
const mctx = mini.getContext('2d');

const opts = { traffic: true, metro: true, labels: true, painted: true };
let mode = 'day';
let meta;
let bounds;
let city;
let life;
let landmarks = [];
let overview = null; // { tiles: [[img]], scale, x0, y0, size }
let minimapImg = null;
let minZoom = 0.01;
let dpr = 1;
let W = 0;
let H = 0;
const cam = { x: 0, y: 0, zoom: 1 };
let flight = null;
let glide = null; // momentum after a drag, world px per second
let zoomGoal = null; // eased wheel zoom: { z, sx, sy }
let lastMove = 0;
let viewHash = '';
let photoCredits = {}; // landmark id -> Commons author, licence and source
let painted = null; // AI-painted city tiles: { tile, size, have: Set, images: Map }
let selected = null;
let hovered = null;
let dirty = true;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  if (bounds) minZoom = Math.min(W / (bounds.x1 - bounds.x0), H / (bounds.y1 - bounds.y0)) * 0.9;
}

function screenToWorld(sx, sy) {
  return [cam.x + (sx - W / 2) / cam.zoom, cam.y + (sy - H / 2) / cam.zoom];
}

function toScreen(x, y) {
  return [(x - cam.x) * cam.zoom + W / 2, (y - cam.y) * cam.zoom + H / 2];
}

function clampCam() {
  cam.x = Math.max(bounds.x0, Math.min(bounds.x1, cam.x));
  cam.y = Math.max(bounds.y0, Math.min(bounds.y1, cam.y));
  cam.zoom = Math.max(minZoom, Math.min(MAX_ZOOM, cam.zoom));
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ------------------------------------------------------------------ draw --

function drawOverview(x0, y0, x1, y1) {
  if (!overview) return;
  const { scale, size } = overview;
  const tw = size / scale; // world px per tile
  for (let ty = Math.max(0, Math.floor((y0 - overview.y0) / tw)); ty < overview.rows && ty * tw + overview.y0 < y1; ty++) {
    for (let tx = Math.max(0, Math.floor((x0 - overview.x0) / tw)); tx < overview.cols && tx * tw + overview.x0 < x1; tx++) {
      const img = overview.tiles[ty * overview.cols + tx];
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, overview.x0 + tx * tw, overview.y0 + ty * tw, tw + 0.5 / cam.zoom, tw + 0.5 / cam.zoom);
    }
  }
}

function frame(now, dt) {
  if (flight) stepFlight(now);
  if (glide && !flight) {
    cam.x += glide.vx * dt;
    cam.y += glide.vy * dt;
    const decay = Math.exp(-dt * 4.5);
    glide.vx *= decay;
    glide.vy *= decay;
    clampCam();
    lastMove = now;
    if (Math.hypot(glide.vx, glide.vy) * cam.zoom < 8) glide = null;
  }
  if (zoomGoal && !flight) {
    zoomAt(zoomGoal.sx, zoomGoal.sy, cam.zoom * Math.pow(zoomGoal.z / cam.zoom, Math.min(1, dt * 14)));
    lastMove = now;
    if (Math.abs(Math.log(zoomGoal.z / cam.zoom)) < 0.003) zoomGoal = null;
  }
  if (flight) lastMove = now;
  if (now - lastMove > 500 && !selected) writeViewHash();
  const [vx0, vy0] = screenToWorld(0, 0);
  const [vx1, vy1] = screenToWorld(W, H);
  const view = { x0: vx0, y0: vy0, x1: vx1, y1: vy1, zoom: cam.zoom };
  life.update(dt, view);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BG[mode];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = dpr * cam.zoom;
  // Pan offset in whole device pixels, so cached chunks never land between
  // pixels and shimmer while the map moves.
  const tx = Math.round(dpr * (W / 2 - cam.x * cam.zoom));
  const ty = Math.round(dpr * (H / 2 - cam.y * cam.zoom));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const level = pickLevel(s);
  if (level === null) {
    // far out: the pre-rendered overview of the whole region
    ctx.setTransform(s, 0, 0, s, tx, ty);
    drawOverview(vx0, vy0, vx1, vy1);
    tint(vx0, vy0, vx1, vy1);
  } else {
    const span = CHUNK / level;
    const budgetEnd = performance.now() + 14;
    for (let cy = Math.floor(vy0 / span); cy <= Math.floor(vy1 / span); cy++) {
      for (let cx = Math.floor(vx0 / span); cx <= Math.floor(vx1 / span); cx++) {
        const x0 = cx * span;
        const y0 = cy * span;
        if (x0 > bounds.x1 || x0 + span < bounds.x0 || y0 > bounds.y1 || y0 + span < bounds.y0) continue;
        let c = city.get(level, cx, cy);
        if (!c && performance.now() < budgetEnd) c = city.render(level, cx, cy, makeCanvas);
        const r = deviceRect(x0, y0, span, s, tx, ty);
        ctx.imageSmoothingEnabled = false; // crisp art pixels
        if (c) ctx.drawImage(c, r.x, r.y, r.w, r.h);
        else if (!drawStandIn(level, x0, y0, span, s, tx, ty, r)) {
          ctx.imageSmoothingEnabled = true;
          ctx.setTransform(s, 0, 0, s, tx, ty);
          drawOverview(x0, y0, x0 + span, y0 + span);
          tint(x0, y0, x0 + span, y0 + span);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
    }
  }

  if (opts.painted) drawPainted(vx0, vy0, vx1, vy1, s, tx, ty);
  ctx.imageSmoothingEnabled = true;
  ctx.setTransform(s, 0, 0, s, tx, ty);
  life.draw(ctx, view, opts);
  if (hovered || selected) outline(hovered || selected);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (opts.labels) drawLabels();
  drawMinimap();
  if (overview) $('loading').hidden = true;
}

// Detail level for the current scale (device px per world px). Always at least
// as sharp as the screen, and sticky: it only changes when the current level
// would blur or would waste a lot of work, so small zooms don't flip levels.
let curLevel = null;
function pickLevel(want) {
  if (want < LEVELS[0] * 0.6) return (curLevel = null);
  // with PIXEL = 2 a level up to 2x the screen scale still shows art pixels
  // at least one device pixel wide, so hard-edged scaling never drops pixels
  if (curLevel && curLevel >= want * 0.97 && curLevel <= want * 2) return curLevel;
  curLevel = LEVELS.find((l) => l >= want * 0.97) || LEVELS[LEVELS.length - 1];
  return curLevel;
}

/** A world-space square as a whole-device-pixel rectangle; neighbours share edges exactly. */
function deviceRect(x0, y0, span, s, tx, ty) {
  const x = Math.round(x0 * s + tx);
  const y = Math.round(y0 * s + ty);
  return { x, y, w: Math.round((x0 + span) * s + tx) - x, h: Math.round((y0 + span) * s + ty) - y };
}

/**
 * While a chunk is still being painted, show the same area from chunks already
 * cached at another level (nearest level first) instead of the blurry overview.
 */
function drawStandIn(level, x0, y0, span, s, tx, ty, r) {
  const others = LEVELS.filter((l) => l !== level).sort((a, b) => Math.abs(Math.log(a / level)) - Math.abs(Math.log(b / level)));
  for (const L of others) {
    const sp = CHUNK / L;
    const cx0 = Math.floor(x0 / sp);
    const cx1 = Math.floor((x0 + span - 1e-6) / sp);
    const cy0 = Math.floor(y0 / sp);
    const cy1 = Math.floor((y0 + span - 1e-6) / sp);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 16) continue;
    const parts = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = city.get(L, cx, cy);
        if (!c) break;
        parts.push([c, cx, cy]);
      }
    }
    if (parts.length !== (cx1 - cx0 + 1) * (cy1 - cy0 + 1)) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    for (const [c, cx, cy] of parts) {
      const q = deviceRect(cx * sp, cy * sp, sp, s, tx, ty);
      ctx.drawImage(c, q.x, q.y, q.w, q.h);
    }
    ctx.restore();
    return true;
  }
  return false;
}

/**
 * The AI-painted city (tools/paint), laid over the map from mid zoom down to
 * street level wherever tiles exist. Closer in, the drawn map's finer detail
 * takes over; further out there are too many tiles to show at once.
 */
function drawPainted(vx0, vy0, vx1, vy1, s, tx, ty) {
  if (!painted || s < 0.16 || s > 1.4) return;
  const span = painted.tile;
  const M = painted.margin;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = s < 0.5; // shrink smoothly, enlarge as crisp pixels
  // row by row, left to right: each tile fades in over the right and bottom
  // margins of the tiles already drawn, so neighbours crossfade, not butt-join
  for (let cy = Math.floor((vy0 - M) / span); cy <= Math.floor((vy1 + M) / span); cy++) {
    for (let cx = Math.floor((vx0 - M) / span); cx <= Math.floor((vx1 + M) / span); cx++) {
      const key = cx + '_' + cy;
      if (!painted.have.has(key)) continue;
      let img = painted.images.get(key);
      if (!img) {
        img = new Image();
        img.decoding = 'async';
        img.src = `painted/tiles/${key}.webp`;
        painted.images.set(key, img);
        if (painted.images.size > 260) painted.images.delete(painted.images.keys().next().value);
      }
      if (!img.complete || !img.naturalWidth) continue;
      // tiles painted before the overlap was kept are exactly `size` px wide
      const m = img.naturalWidth > painted.size ? M : 0;
      const r = deviceRect(cx * span - m, cy * span - m, span + 2 * m, s, tx, ty);
      ctx.drawImage(paintedTile(img, key, m), r.x, r.y, r.w, r.h);
    }
  }
}

/** A painted tile ready to draw: tinted for the time of day, edges faded. */
function paintedTile(img, key, m) {
  const [kx, ky] = key.split('_').map(Number);
  const want = mode + (m && painted.have.has(`${kx - 1}_${ky}`) ? 'L' : '') +
    (m && painted.have.has(`${kx}_${ky - 1}`) ? 'T' : '');
  if (img.ready && img.ready.want === want) return img.ready;
  if (want === mode && !TINT[mode]) return img;
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  if (TINT[mode]) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = TINT[mode];
    g.fillRect(0, 0, w, h);
  }
  if (m) {
    // fade in across the whole overlap (twice the margin) on the left and top
    // edges, where the previous tiles' margins lie underneath
    const fade = (w * 2 * m) / (painted.tile + 2 * m);
    g.globalCompositeOperation = 'destination-in';
    if (want.includes('L')) {
      const gr = g.createLinearGradient(0, 0, fade, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    if (want.includes('T')) {
      const gr = g.createLinearGradient(0, 0, 0, fade);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  }
  c.want = want;
  img.ready = c;
  return c;
}

function tint(x0, y0, x1, y1) {
  if (!TINT[mode]) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = TINT[mode];
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

function outline(lm) {
  const [e0, s0, e1, s1] = lm.rect;
  const pad = 6;
  const pts = [iso(e0 - pad, s0 - pad), iso(e1 + pad, s0 - pad), iso(e1 + pad, s1 + pad), iso(e0 - pad, s1 + pad)];
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.strokeStyle = mode === 'night' ? 'rgba(255,214,140,0.95)' : 'rgba(214,72,30,0.95)';
  ctx.lineWidth = 1.6 / cam.zoom;
  ctx.setLineDash([4 / cam.zoom, 3 / cam.zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
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

  const list = [...landmarks].sort((a, b) => (b === selected) - (a === selected) || FEATURED.has(b.id) - FEATURED.has(a.id));
  for (const lm of list) {
    const show = lm === selected || lm === hovered || cam.zoom >= 0.18 || (cam.zoom >= 0.05 && FEATURED.has(lm.id));
    if (!show) continue;
    const [x, y] = toScreen(...iso(lm.e, lm.s, lm.top));
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

  if (cam.zoom > 0.6) return;
  for (const [name, lat, lon, tier] of DISTRICT_LABELS) {
    // tier 1: cities, always; tier 2: districts once closer in
    if (tier === 2 && cam.zoom < 0.045) continue;
    if (tier === 1 && cam.zoom > 0.12) continue;
    const p = llToEs(lat, lon);
    const [x, y] = toScreen(...iso(p.e, p.s));
    const water = tier === 'water';
    ctx.font = water ? 'italic 500 13px "Inter", system-ui, sans-serif' : tier === 1 ? '700 14px "Inter", system-ui, sans-serif' : '700 11px "Inter", system-ui, sans-serif';
    const label = water ? name : name.toUpperCase();
    const tw = ctx.measureText(label).width + label.length * 1.4;
    if (!fits({ x0: x - tw / 2, x1: x + tw / 2, y0: y - 9, y1: y + 9 })) continue;
    ctx.lineWidth = 3;
    ctx.strokeStyle = night ? 'rgba(10,14,28,0.8)' : 'rgba(255,252,244,0.85)';
    ctx.fillStyle = water ? (night ? '#9cc7e0' : '#2f6f8f') : night ? '#d9d2c4' : '#5a4a3a';
    if ('letterSpacing' in ctx) ctx.letterSpacing = water ? '0px' : '1.3px';
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
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
  if (!minimapImg || !minimapImg.complete || !minimapImg.naturalWidth) return;
  const mw = mini.clientWidth;
  const mh = mini.clientHeight;
  if (mini.width !== Math.round(mw * dpr)) {
    mini.width = Math.round(mw * dpr);
    mini.height = Math.round(mh * dpr);
  }
  const iw = minimapImg.naturalWidth;
  const ih = minimapImg.naturalHeight;
  const k = Math.min(mw / iw, mh / ih);
  const ox = (mw - iw * k) / 2;
  const oy = (mh - ih * k) / 2;
  const sc = meta.minimap.scale;
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, mw, mh);
  mctx.drawImage(minimapImg, ox, oy, iw * k, ih * k);
  const toM = (x, y) => [ox + (x - meta.minimap.x0) * sc * k, oy + (y - meta.minimap.y0) * sc * k];
  const cl = (v, m) => Math.max(1, Math.min(m - 1, v));
  let [a, b] = toM(...screenToWorld(0, 0));
  let [c, d] = toM(...screenToWorld(W, H));
  [a, c] = [cl(a, mw), cl(c, mw)];
  [b, d] = [cl(b, mh), cl(d, mh)];
  mctx.strokeStyle = mode === 'night' ? '#ffd27a' : '#c2410c';
  mctx.lineWidth = 1.5;
  mctx.strokeRect(a, b, Math.max(2, c - a), Math.max(2, d - b));
  mini._map = { ox, oy, k, sc };
}

// -------------------------------------------------------------- camera --

function flyTo(x, y, zoom, ms = 1300) {
  flight = { from: { ...cam }, to: { x, y, zoom }, t0: performance.now(), ms };
}

function stepFlight(now) {
  const u = Math.min(1, (now - flight.t0) / flight.ms);
  const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const { from, to } = flight;
  const dist = Math.hypot(to.x - from.x, to.y - from.y) * Math.min(from.zoom, to.zoom);
  const dip = Math.min(0.75, dist / 3000) * Math.sin(Math.PI * e);
  cam.x = from.x + (to.x - from.x) * e;
  cam.y = from.y + (to.y - from.y) * e;
  cam.zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * e) * (1 - dip);
  if (u >= 1) flight = null;
}

function focusLandmark(lm) {
  const [x, y] = iso(lm.e, lm.s, lm.top * 0.4);
  const fit = Math.min(W, H) / (Math.max(lm.hw, lm.hd) * 2 + lm.top) / 1.6;
  flyTo(x, y, Math.max(0.5, Math.min(3, fit)));
}

function select(lm, fly = true) {
  selected = lm;
  const card = $('card');
  if (!lm) {
    card.hidden = true;
    setHash('');
    renderList();
    return;
  }
  showPhoto(lm);
  $('card-name').textContent = lm.name;
  $('card-hi').textContent = lm.hi;
  $('card-era').textContent = lm.era;
  $('card-text').textContent = lm.text;
  card.hidden = false;
  setHash(lm.id);
  if (fly) focusLandmark(lm);
  renderList();
}

/** Real photo of the landmark from Wikimedia Commons, credited as its licence asks. */
function showPhoto(lm) {
  const fig = $('card-photo');
  const c = photoCredits[lm.id];
  if (!c) {
    fig.hidden = true;
    return;
  }
  const img = $('card-img');
  img.src = `photos/${lm.id}.jpg`;
  img.alt = `Photo of ${lm.name}`;
  const cap = $('card-credit');
  cap.replaceChildren();
  const link = (text, href) => {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    return a;
  };
  cap.append('Photo: ', link(c.author, c.source), ', ');
  cap.append(c.licenseUrl ? link(c.license, c.licenseUrl) : c.license);
  cap.append(', via Wikimedia Commons');
  fig.hidden = false;
}

function setHash(id) {
  // some embedding frames refuse history changes; the map works without them
  try {
    history.replaceState(null, '', id ? '#' + id : location.pathname + location.search);
  } catch {
    /* ignore */
  }
}

function pickLandmark(sx, sy) {
  const [x, y] = screenToWorld(sx, sy);
  let best = null;
  for (const lm of landmarks) {
    const s = lm.screen;
    if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) continue;
    if (!best || lm.e + lm.s > best.e + best.s) best = lm;
  }
  return best;
}

// --------------------------------------------------------------- input --

function zoomAt(sx, sy, z) {
  const [wx, wy] = screenToWorld(sx, sy);
  cam.zoom = Math.max(minZoom, Math.min(MAX_ZOOM, z));
  cam.x = wx - (sx - W / 2) / cam.zoom;
  cam.y = wy - (sy - H / 2) / cam.zoom;
  clampCam();
}

function setupInput() {
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    flight = null;
    glide = null;
    zoomGoal = null;
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: 0, trail: [[performance.now(), e.clientX, e.clientY]] };
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
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pinch.zoom * Math.hypot(a[0] - b[0], a[1] - b[1])) / pinch.d);
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      const t = performance.now();
      drag.trail.push([t, e.clientX, e.clientY]);
      while (drag.trail.length > 2 && t - drag.trail[0][0] > 120) drag.trail.shift();
      lastMove = t;
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
    if (drag && drag.moved < 6 && pointers.size === 1) select(pickLandmark(e.clientX, e.clientY));
    else if (drag && pointers.size === 1) {
      // keep gliding in the direction of the throw
      const [t0, x0, y0] = drag.trail[0];
      const ms = performance.now() - t0;
      if (ms > 0 && ms < 200) {
        const vx = (-(e.clientX - x0) / cam.zoom) * (1000 / ms);
        const vy = (-(e.clientY - y0) / cam.zoom) * (1000 / ms);
        if (Math.hypot(vx, vy) * cam.zoom > 120) glide = { vx, vy };
      }
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
      glide = null;
      if (e.ctrlKey) {
        // trackpad pinch: follow the fingers directly
        zoomGoal = null;
        zoomAt(e.clientX, e.clientY, cam.zoom * Math.exp(-e.deltaY * 0.01));
        return;
      }
      const from = zoomGoal ? zoomGoal.z : cam.zoom;
      const z = Math.max(minZoom, Math.min(MAX_ZOOM, from * Math.exp(-e.deltaY * 0.0022)));
      zoomGoal = { z, sx: e.clientX, sy: e.clientY };
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
    else if (e.key === 'h' || e.key === 'H') togglePanels();
    else return;
    clampCam();
  });
  const miniMove = (e) => {
    const m = mini._map;
    if (!m) return;
    const r = mini.getBoundingClientRect();
    cam.x = meta.minimap.x0 + (e.clientX - r.left - m.ox) / (m.sc * m.k);
    cam.y = meta.minimap.y0 + (e.clientY - r.top - m.oy) / (m.sc * m.k);
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

// ------------------------------------------------------------------ UI --

function renderList() {
  const ul = $('list');
  ul.replaceChildren();
  const q = ($('search')?.value || '').trim().toLowerCase();
  const match = (...names) => !q || names.some((n) => n && n.toLowerCase().includes(q));
  for (const lm of [...landmarks].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!match(lm.name, lm.hi)) continue;
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
  if (!q) return;
  // neighbourhoods and cities
  for (const [name, lat, lon, tier] of DISTRICT_LABELS) {
    if (!match(name)) continue;
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lm';
    const n = document.createElement('span');
    n.textContent = name;
    const h = document.createElement('span');
    h.className = 'hi';
    h.textContent = tier === 1 ? 'city' : tier === 'water' ? 'river' : 'area';
    b.append(n, h);
    b.addEventListener('click', () => {
      select(null);
      const p = llToEs(lat, lon);
      const [x, y] = iso(p.e, p.s);
      flyTo(x, y, tier === 1 ? 0.12 : 0.45);
      if (window.innerWidth < 720) document.body.classList.remove('list-open');
    });
    li.append(b);
    ul.append(li);
  }
  if (!ul.children.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = `Nothing called “${q}” yet`;
    ul.append(li);
  }
}

/** Keep the address bar on the current view, so a copied link opens here. */
function writeViewHash() {
  const g = unIso(cam.x, cam.y);
  const ll = esToLL(g.e, g.s);
  const h = `@${ll.lat.toFixed(5)},${ll.lon.toFixed(5)},${cam.zoom.toFixed(3)}z`;
  if (h === viewHash) return;
  viewHash = h;
  setHash(h);
}

function readViewHash() {
  const m = /^#@(-?[\d.]+),(-?[\d.]+),([\d.]+)z$/.exec(location.hash);
  if (!m) return false;
  const p = llToEs(+m[1], +m[2]);
  const [x, y] = iso(p.e, p.s);
  Object.assign(cam, { x, y, zoom: +m[3] });
  clampCam();
  viewHash = location.hash.slice(1);
  return true;
}

function togglePanels() {
  const on = document.body.classList.toggle('clean');
  $('panels').setAttribute('aria-pressed', String(!on));
}

function setTimeOfDay(m) {
  mode = m;
  setMode(m);
  city.clear();
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
        city.opts.metro = opts.metro;
        city.clear();
      }
    });
  }
  $('zoom-in').addEventListener('click', () => zoomAt(W / 2, H / 2, cam.zoom * 1.5));
  $('zoom-out').addEventListener('click', () => zoomAt(W / 2, H / 2, cam.zoom / 1.5));
  $('home').addEventListener('click', () => {
    select(null);
    home(true);
  });
  $('card-close').addEventListener('click', () => select(null));
  $('list-toggle').addEventListener('click', () => document.body.classList.toggle('list-open'));
  $('search').addEventListener('input', () => renderList());
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('list').querySelector('button')?.click();
  });
  $('panels').addEventListener('click', togglePanels);
  renderList();
}

function home(animate) {
  const p = llToEs(28.6129, 77.2295); // India Gate
  const [x, y] = iso(p.e, p.s);
  const zoom = 0.35;
  if (animate) flyTo(x, y, zoom);
  else Object.assign(cam, { x, y, zoom });
}

// ---------------------------------------------------------------- boot --

function loadImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}

async function boot() {
  meta = await (await fetch(`${DATA}/meta.json`)).json();
  setMeta(meta);
  bounds = worldBounds(meta);
  resize();
  const ov = meta.overview;
  overview = { ...ov, tiles: [] };
  for (let ty = 0; ty < ov.rows; ty++) for (let tx = 0; tx < ov.cols; tx++) overview.tiles.push(loadImage(`${DATA}/overview/${tx}_${ty}.webp`));
  minimapImg = loadImage(`${DATA}/minimap.webp`);

  landmarks = placeLandmarks(LANDMARKS);
  loadSprites('sprites', () => city?.clear());
  try {
    const idx = await (await fetch('painted/index.json')).json();
    painted = { tile: idx.tile, size: idx.size, margin: idx.margin || 0, have: new Set(idx.tiles), images: new Map() };
    if (!painted.have.size) painted = null;
  } catch {
    painted = null;
  }
  if (!painted) document.querySelector('[data-toggle="painted"]')?.remove();
  try {
    photoCredits = await (await fetch('photos/credits.json')).json();
  } catch {
    photoCredits = {};
  }
  const store = new CellStore(meta, DATA, () => {
    dirty = true;
  });
  city = new City(meta, store, landmarks, meta.metroColours);
  life = new Life(meta, store, meta.metroColours);
  setMode(mode);
  document.documentElement.dataset.mode = mode;
  setupInput();
  setupUI();
  home(false);
  readViewHash();
  const fromHash = landmarks.find((l) => '#' + l.id === location.hash);
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
  window.__delhi = {
    cam, select, setTimeOfDay, flyTo, landmarks,
    get city() {
      return city;
    },
    // Hooks for tools/paint: clean renders (no labels, traffic or UI) as PNG data URLs.
    async renderTile(x0, y0, span, size) {
      const plain = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
      for (let k = 0; k < 600; k++) {
        const cv = city.renderRect(x0, y0, span, size, plain);
        if (cv) return cv.toDataURL('image/png');
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('cells did not load');
    },
    renderLandmark(id, scale) {
      const lm = landmarks.find((l) => l.id === id);
      const { x0, y0, x1, y1 } = lm.screen;
      const cv = Object.assign(document.createElement('canvas'), { width: Math.ceil((x1 - x0) * scale), height: Math.ceil((y1 - y0) * scale) });
      const c = cv.getContext('2d');
      c.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
      drawLandmarkModel(c, lm, false);
      return { png: cv.toDataURL('image/png'), x0, y0, x1, y1 };
    },
  };
  void dirty;
  void unIso;
  void ZK;
}

boot().catch((err) => {
  $('loading').querySelector('p').textContent = 'Could not load the map data. ' + err.message;
});
