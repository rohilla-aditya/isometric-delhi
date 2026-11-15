import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../public/js/world.js';
import { llToTile } from '../public/js/geo.js';
import { LANDMARKS } from '../public/js/data.js';
import { MODELS } from '../public/js/landmarks.js';

const world = generateWorld();
const tileAt = (lat, lon) => {
  const t = llToTile(lat, lon);
  return world.at(Math.floor(t.i), Math.floor(t.j));
};

test('generation is deterministic', () => {
  const again = generateWorld();
  const sig = (w) => w.tiles.map((t) => `${t.g}${t.zone}${t.b ? t.b.h : ''}${t.trees}`).join('|');
  assert.equal(sig(again), sig(world));
});

test('every landmark is on the map, owns its footprint and has a model', () => {
  for (const lm of world.landmarks) {
    assert.ok(lm.i0 >= 0 && lm.j0 >= 0 && lm.i1 < world.N && lm.j1 < world.N, lm.id);
    assert.ok(MODELS[lm.id], `no model for ${lm.id}`);
    for (let j = lm.j0; j <= lm.j1; j++) {
      for (let i = lm.i0; i <= lm.i1; i++) {
        const t = world.at(i, j);
        assert.equal(t.lm, lm.id, `${lm.id} footprint at ${i},${j}`);
        assert.equal(t.b, null);
        if (!lm.onWater) assert.notEqual(t.g, 'water', `${lm.id} is in the river`);
      }
    }
  }
  assert.equal(world.landmarks.length, LANDMARKS.length);
});

test('landmark footprints do not overlap', () => {
  const owner = new Map();
  for (const lm of world.landmarks) {
    for (let j = lm.j0; j <= lm.j1; j++) {
      for (let i = lm.i0; i <= lm.i1; i++) {
        const k = `${i},${j}`;
        assert.ok(!owner.has(k), `${lm.id} overlaps ${owner.get(k)}`);
        owner.set(k, lm.id);
      }
    }
  }
});

test('the Yamuna runs through the map and the Signature Bridge spans it', () => {
  const water = world.tiles.filter((t) => t.g === 'water').length;
  assert.ok(water > 400, `only ${water} water tiles`);
  const sb = world.landmarks.find((l) => l.id === 'signature-bridge');
  assert.equal(world.at(sb.i0, sb.j0).g, 'water');
  // the walled city is west of the river, Akshardham east of it
  const rf = world.landmarks.find((l) => l.id === 'red-fort');
  const ak = world.landmarks.find((l) => l.id === 'akshardham');
  const riverI = (j) => world.tiles.filter((t) => t.j === j && t.g === 'water').map((t) => t.i);
  assert.ok(rf.i1 < Math.min(...riverI(rf.j0 + 2)));
  assert.ok(ak.i0 > Math.max(...riverI(ak.j0 + 1).filter((i) => i < ak.i0 + 10)));
});

test('land use lands in the right places', () => {
  assert.equal(tileAt(28.565, 77.085).zone, 'airport');
  assert.equal(tileAt(28.66, 77.225).zone, 'old');
  assert.ok(['lutyens', 'park'].includes(tileAt(28.6, 77.2).zone));
  assert.equal(tileAt(28.49, 77.08).zone, 'towers');
  assert.equal(tileAt(28.49, 77.23).zone, 'forest');
});

test('nothing is built on major roads and towers stay plausible', () => {
  for (const t of world.tiles) {
    if (t.road === 'major') assert.equal(t.b, null);
    if (t.b) assert.ok(t.b.h > 0 && t.b.h < 160, `height ${t.b.h}`);
  }
  const runways = world.tiles.filter((t) => t.g === 'runway').length;
  assert.ok(runways > 30);
});

test('metro lines have stations in order', () => {
  const yellow = world.metro.find((m) => m.id === 'yellow');
  assert.ok(yellow.pts.length >= 10);
  for (let k = 1; k < yellow.cum.length; k++) assert.ok(yellow.cum[k] > yellow.cum[k - 1]);
});
