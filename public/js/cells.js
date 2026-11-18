// Loads and decodes the 2 km data cells written by tools/build_data.py.

export const AREA_NAMES = [null, 'residential', 'commercial', 'industrial', 'farmland', 'grass', 'park', 'forest', 'sand',
  'cemetery', 'military', 'aerodrome', 'apron', 'pitch', 'water', 'railway', 'construction', 'plaza'];
export const LINE_NAMES = [null, 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street', 'service', 'rail',
  'runway', 'taxiway', 'river', 'canal', 'drain', 'metro', 'pedestrian'];
export const KIND_NAMES = ['other', 'house', 'apartments', 'commercial', 'industrial', 'religious', 'civic', 'school', 'hut'];

/** Decode one cell file. Coordinates come back as metres in map space. */
export function decodeCell(buf, cx, cy, cell) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'DLH2') throw new Error('not a cell file');
  const ox = cx * cell;
  const oy = cy * cell;
  let p = 4;
  const nA = dv.getUint16(p, true);
  const nL = dv.getUint16(p + 2, true);
  const nB = dv.getUint32(p + 4, true);
  p += 8;
  const readPts = (n) => {
    const out = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      out[k * 2] = ox + dv.getInt16(p, true) / 10;
      out[k * 2 + 1] = oy + dv.getInt16(p + 2, true) / 10;
      p += 4;
    }
    return out;
  };

  const areas = [];
  for (let a = 0; a < nA; a++) {
    const cls = dv.getUint8(p);
    const nr = dv.getUint8(p + 1);
    p += 2;
    const rings = [];
    for (let r = 0; r < nr; r++) {
      const n = dv.getUint16(p, true);
      p += 2;
      rings.push(readPts(n));
    }
    areas.push({ cls, rings, bbox: ringBox(rings[0]) });
  }

  const lines = [];
  for (let l = 0; l < nL; l++) {
    const cls = dv.getUint8(p);
    const flags = dv.getUint8(p + 1);
    const n = dv.getUint16(p + 2, true);
    p += 4;
    const pts = readPts(n);
    lines.push({ cls, flags, pts, bbox: ringBox(pts) });
  }

  const buildings = [];
  for (let b = 0; b < nB; b++) {
    const h = dv.getUint8(p);
    const kind = dv.getUint8(p + 1);
    const n = dv.getUint8(p + 2);
    p += 3;
    const pts = readPts(n);
    let ce = 0;
    let cs = 0;
    let area2 = 0;
    for (let k = 0; k < n; k++) {
      const x0 = pts[k * 2];
      const y0 = pts[k * 2 + 1];
      const x1 = pts[((k + 1) % n) * 2];
      const y1 = pts[((k + 1) % n) * 2 + 1];
      ce += x0;
      cs += y0;
      area2 += x0 * y1 - x1 * y0;
    }
    ce /= n;
    cs /= n;
    buildings.push({ h, kind, pts, bbox: ringBox(pts), ce, cs, area: Math.abs(area2) / 2, orient: Math.sign(area2) || 1, seed: (Math.round(ce * 7) * 73856093) ^ (Math.round(cs * 7) * 19349663) });
  }
  return { cx, cy, areas, lines, buildings };
}

function ringBox(pts) {
  let e0 = Infinity;
  let s0 = Infinity;
  let e1 = -Infinity;
  let s1 = -Infinity;
  for (let k = 0; k < pts.length; k += 2) {
    if (pts[k] < e0) e0 = pts[k];
    if (pts[k] > e1) e1 = pts[k];
    if (pts[k + 1] < s0) s0 = pts[k + 1];
    if (pts[k + 1] > s1) s1 = pts[k + 1];
  }
  return [e0, s0, e1, s1];
}

/** Fetches cells on demand; tells the caller when new ones arrive. */
export class CellStore {
  constructor(meta, base, onLoad) {
    this.meta = meta;
    this.base = base;
    this.onLoad = onLoad;
    this.known = new Set(meta.cells.map(([cx, cy]) => cx + ',' + cy));
    this.cells = new Map();
    this.pending = new Map();
    this.inflight = 0;
    this.queue = [];
  }

  /** The cell if loaded, null if empty or missing, undefined while loading. */
  get(cx, cy) {
    const k = cx + ',' + cy;
    if (!this.known.has(k)) return null;
    if (this.cells.has(k)) return this.cells.get(k);
    if (!this.pending.has(k)) {
      this.pending.set(k, true);
      this.queue.push([cx, cy]);
      this.pump();
    }
    return undefined;
  }

  pump() {
    while (this.inflight < 6 && this.queue.length) {
      const [cx, cy] = this.queue.pop(); // newest first: what the viewer looks at now
      const k = cx + ',' + cy;
      this.inflight++;
      fetch(`${this.base}/cells/${cx}_${cy}.bin`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((buf) => this.cells.set(k, decodeCell(buf, cx, cy, this.meta.cell)))
        .catch(() => this.cells.set(k, null))
        .finally(() => {
          this.inflight--;
          this.pending.delete(k);
          this.onLoad?.(cx, cy);
          this.pump();
        });
    }
  }
}
