import { test } from 'node:test';
import assert from 'node:assert/strict';
import { llToTile, tileToLL, iso, unIso, pointInPoly, hash2 } from '../public/js/geo.js';
import { BOUNDS, GRID } from '../public/js/data.js';

test('lat/lon round-trips through tile space', () => {
  const t = llToTile(28.6129, 77.2295);
  const ll = tileToLL(t.i, t.j);
  assert.ok(Math.abs(ll.lat - 28.6129) < 1e-9);
  assert.ok(Math.abs(ll.lon - 77.2295) < 1e-9);
});

test('grid corners map to the bounds; east is +i and south is +j', () => {
  assert.deepEqual(llToTile(BOUNDS.latMax, BOUNDS.lonMin), { i: 0, j: 0 });
  const se = llToTile(BOUNDS.latMin, BOUNDS.lonMax);
  assert.ok(Math.abs(se.i - GRID) < 1e-9 && Math.abs(se.j - GRID) < 1e-9);
});

test('iso and unIso are inverses on the ground plane', () => {
  for (const [i, j] of [[0, 0], [12.5, 80.25], [159, 3]]) {
    const [x, y] = iso(i, j);
    const g = unIso(x, y);
    assert.ok(Math.abs(g.i - i) < 1e-9 && Math.abs(g.j - j) < 1e-9);
  }
  assert.deepEqual(iso(1, 1, 10), [0, 16 - 10]);
});

test('pointInPoly and hash2 behave', () => {
  const sq = [[0, 0], [4, 0], [4, 4], [0, 4]];
  assert.ok(pointInPoly(2, 2, sq));
  assert.ok(!pointInPoly(5, 2, sq));
  assert.equal(hash2(3, 4, 1), hash2(3, 4, 1));
  const h = hash2(7, 9);
  assert.ok(h >= 0 && h < 1);
});
