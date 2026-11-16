// Real-world projection for the OpenStreetMap city.
//
// Ground coordinates are metres east (e) and south (s) of the north-west
// corner of the data bounds. World pixels at zoom 1 put one metre on the
// e axis at ~1.1 px; north points up and to the right, as in a 2:1 dimetric
// game view.

export const ZK = 1.0; // px per metre of height

let meta = null;

export function setMeta(m) {
  meta = m;
}

export function getMeta() {
  return meta;
}

export function iso(e, s, z = 0) {
  return [e - s, (e + s) / 2 - z * ZK];
}

/** World pixels on the ground plane back to metres. */
export function unIso(x, y) {
  return { e: (2 * y + x) / 2, s: (2 * y - x) / 2 };
}

export function llToEs(lat, lon, m = meta) {
  return { e: (lon - m.bounds.lonMin) * m.mx, s: (m.bounds.latMax - lat) * m.my };
}

export function esToLL(e, s, m = meta) {
  return { lat: m.bounds.latMax - s / m.my, lon: m.bounds.lonMin + e / m.mx };
}

/** World-pixel bounds of the whole map (ground plane, plus headroom for towers). */
export function worldBounds(m = meta) {
  const c = [iso(0, 0), iso(m.width, 0), iso(m.width, m.height), iso(0, m.height)];
  const xs = c.map((p) => p[0]);
  const ys = c.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys) - 320, y1: Math.max(...ys) + 40 };
}
