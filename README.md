# Isometric Delhi

An explorable isometric diorama of Delhi, drawn live in the browser. The city
is generated from real geography: the Yamuna, the Ring Roads, four metro
lines, rail lines, ridge forests, the airport's runways and the land use of
each neighbourhood. Then 25 hand-built landmarks are placed on top, from the
Qutub Minar to the Signature Bridge.

- **Drag** to pan, **scroll / pinch** to zoom, **click a landmark** for its
  story (in English and Hindi). Arrow keys and `+`/`-` work too.
- **Day / Dusk / Night**: at night, windows, street lights and floodlit
  monuments come on.
- Traffic (cars, autos, DTC buses) keeps left on the main roads, metro trains
  run the Yellow, Blue, Violet and Airport Express lines, planes take off and
  land at IGI, kites fly over Old Delhi, and black kites circle above Jama
  Masjid.
- Deep links: `/#red-fort`, `/#lotus-temple`, … open with that landmark
  selected.

It is a stylised map: one tile is about 185 m, and positions are good to a
tile or two.

## Run locally

No build step and no dependencies, just Node 18+ for the dev server and tests.

```bash
cd isometric-delhi
npm start          # http://localhost:8080
npm test
```

## How it works

| File | Role |
|---|---|
| `public/js/data.js` | Geography as `[lat, lon]`: river, lakes, land-use zones, roads, rails, metro stations, landmarks and labels. |
| `public/js/geo.js` | Projections: lat/lon ↔ tile grid ↔ isometric pixels, plus deterministic noise. |
| `public/js/world.js` | Builds the 160 × 160 tile grid: zones, water, landmark footprints, rasterised roads, street grids, buildings and trees. Pure, so it runs in the tests. |
| `public/js/draw.js` | Isometric primitives (boxes, prisms, domes, shikharas, trees) and day/dusk/night colour. |
| `public/js/landmarks.js` | Models of each landmark. |
| `public/js/renderer.js` | Depth-sorted scene and a chunk cache at several resolutions, so the static city is painted once and blitted each frame. |
| `public/js/anim.js` | Everything that moves. |
| `public/js/main.js` | Camera, input, labels, minimap and UI. |

To add a landmark, add an entry to `LANDMARKS` in `data.js` and a model under
the same id in `landmarks.js`. The tests check that every landmark has a model,
stays off the river and does not overlap another landmark's footprint.

## Deploy

It is a static site: the root `render.yaml` publishes `public/` as a Render
static site (`isometric-delhi`), with `npm test` as the build step. It reads no
environment variables or secrets.
