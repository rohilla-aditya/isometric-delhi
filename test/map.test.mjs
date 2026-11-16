import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, unIso, llToEs, esToLL, setMeta, worldBounds } from '../public/js/proj.js';
import { decodeCell } from '../public/js/cells.js';
import { LANDMARKS, DISTRICT_LABELS } from '../public/js/data.js';
import { MODELS } from '../public/js/landmarks.js';
import { placeLandmarks, LANDMARK_SCALE } from '../public/js/city.js';

// Same bounds and projection constants as tools/build_data.py.
const bounds = { latMin: 28.33, latMax: 28.89, lonMin: 76.83, lonMax: 77.56 };
const lat0 = (bounds.latMin + bounds.latMax) / 2;
const mx = 111320 * Math.cos((lat0 * Math.PI) / 180);
const my = 110574;
const meta = { bounds, mx, my, cell: 2000, width: (bounds.lonMax - bounds.lonMin) * mx, height: (bounds.latMax - bounds.latMin) * my, cells: [] };
setMeta(meta);

test('iso and unIso are inverses on the ground', () => {
  for (const [e, s] of [[0, 0], [1234.5, 987.25], [70000, 3]]) {
    const [x, y] = iso(e, s);
    const g = unIso(x, y);
    assert.ok(Math.abs(g.e - e) < 1e-6 && Math.abs(g.s - s) < 1e-6);
  }
  assert.deepEqual(iso(10, 10, 5), [0, 5]);
});

test('lat/lon round-trips through map metres; east is +e and south is +s', () => {
  const p = llToEs(28.6129, 77.2295);
  const ll = esToLL(p.e, p.s);
  assert.ok(Math.abs(ll.lat - 28.6129) < 1e-9 && Math.abs(ll.lon - 77.2295) < 1e-9);
  assert.deepEqual(llToEs(bounds.latMax, bounds.lonMin), { e: 0, s: 0 });
  const se = llToEs(bounds.latMin, bounds.lonMax);
  assert.ok(se.e > 70000 && se.s > 60000, 'NCR is roughly 72 x 62 km');
  const wb = worldBounds();
  assert.ok(wb.x0 < 0 && wb.x1 > 0 && wb.y1 > wb.y0);
});

test('decodeCell reads the format written by build_data.py', () => {
  const bytes = [];
  const u8 = (v) => bytes.push(v & 255);
  const u16 = (v) => {
    u8(v);
    u8(v >> 8);
  };
  const u32 = (v) => {
    u16(v);
    u16(v >>> 16);
  };
  const i16 = (v) => u16(v < 0 ? v + 65536 : v);
  for (const ch of 'DLH2') u8(ch.charCodeAt(0));
  u16(1);
  u16(1);
  u32(1);
  // area: class 6 (park), one ring of 3 points, decimetres from the cell corner
  u8(6);
  u8(1);
  u16(3);
  for (const [x, y] of [[0, 0], [100, 0], [100, 100]]) {
    i16(x);
    i16(y);
  }
  // line: class 3 (primary), on a bridge
  u8(3);
  u8(1);
  u16(2);
  for (const [x, y] of [[-50, 10], [200, 10]]) {
    i16(x);
    i16(y);
  }
  // building: 12 m house, a 10 m square
  u8(12);
  u8(1);
  u8(4);
  for (const [x, y] of [[10, 10], [110, 10], [110, 110], [10, 110]]) {
    i16(x);
    i16(y);
  }
  const c = decodeCell(new Uint8Array(bytes).buffer, 2, 3, 2000);
  assert.equal(c.areas[0].cls, 6);
  assert.deepEqual([...c.areas[0].rings[0].slice(0, 2)], [4000, 6000]);
  assert.equal(c.lines[0].flags & 1, 1);
  assert.equal(c.lines[0].pts[0], 4000 - 5);
  const b = c.buildings[0];
  assert.equal(b.h, 12);
  assert.ok(Math.abs(b.area - 100) < 1e-3, `area ${b.area}`);
  assert.ok(Math.abs(b.ce - 4006) < 1e-3 && Math.abs(b.cs - 6006) < 1e-3);
});

test('every landmark has a model and a real-world scale, and sits inside the NCR', () => {
  const placed = placeLandmarks(LANDMARKS);
  for (const lm of placed) {
    assert.ok(MODELS[lm.id], `no model for ${lm.id}`);
    assert.ok(LANDMARK_SCALE[lm.id], `no scale for ${lm.id}`);
    assert.ok(lm.e > 0 && lm.e < meta.width && lm.s > 0 && lm.s < meta.height, lm.id);
    assert.ok(lm.top > 5 && lm.top < 200, `${lm.id} is ${lm.top} m tall`);
  }
  // real heights: Qutub Minar ~73 m, India Gate ~42 m
  const h = (id) => placed.find((l) => l.id === id).top;
  assert.ok(Math.abs(h('qutub-minar') - 73) < 6);
  assert.ok(Math.abs(h('india-gate') - 42) < 5);
});

test('landmark footprints do not overlap', () => {
  const placed = placeLandmarks(LANDMARKS);
  for (let a = 0; a < placed.length; a++) {
    for (let b = a + 1; b < placed.length; b++) {
      const [ax0, ay0, ax1, ay1] = placed[a].rect;
      const [bx0, by0, bx1, by1] = placed[b].rect;
      const overlap = ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1;
      assert.ok(!overlap, `${placed[a].id} overlaps ${placed[b].id}`);
    }
  }
});

test('place labels are inside the NCR', () => {
  for (const [name, lat, lon] of DISTRICT_LABELS) {
    assert.ok(lat > bounds.latMin && lat < bounds.latMax && lon > bounds.lonMin && lon < bounds.lonMax, name);
  }
});
