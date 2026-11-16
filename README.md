# Isometric Delhi

An explorable isometric diorama of **Delhi NCR**: Delhi, Gurugram, Noida,
Greater Noida, Ghaziabad and Faridabad. Every building, road, park, canal and
stretch of the Yamuna comes from [OpenStreetMap](https://www.openstreetmap.org),
drawn in the browser as a SimCity-style city. On top of that sit 25 hand-built
landmarks at their real size, from the Qutub Minar to the Signature Bridge.

- **Drag** to pan, **scroll / pinch** to zoom from the whole region down to
  single houses, **click a landmark** for its story in English and Hindi.
  Arrow keys and `+` / `-` work too.
- **Search** any landmark or neighbourhood, and **share the view**: the
  address bar follows the camera (`#@lat,lon,zoomz`), so a copied link opens
  on the same spot.
- **Day / Dusk / Night**: buildings cast sun shadows (long at dusk); at night,
  windows, street lights and floodlit monuments come on.
- Drags glide to a stop and the wheel zooms smoothly; **Panels** (or `H`)
  hides everything but the controls for clean screenshots.
- Traffic (cars, autos, buses) keeps left on the main roads, trains run on
  the elevated metro in each line's colour, planes take off and land at IGI,
  kites fly over the colonies and black kites circle Jama Masjid.
- Deep links: `/#red-fort`, `/#lotus-temple`, … open on that landmark.
- Each landmark card shows a real photo from Wikimedia Commons, credited to
  its photographer under its free licence.

Most Delhi buildings in OpenStreetMap have no height, so heights are guessed
from the building's type and size where `height` or `building:levels` is
missing.

## Run locally

The site has no build step and no dependencies; Node 18+ runs the dev server
and tests.

```bash
npm start          # http://localhost:8080
npm test
```

## Map data

`public/data/` is generated, not hand-written:

```bash
pip install -r tools/requirements.txt          # pyosmium, shapely, pillow
osmium extract -b 76.83,28.33,77.56,28.89 india-latest.osm.pbf -o ncr.osm.pbf
python tools/build_data.py ncr.osm.pbf
```

The `data` GitHub Actions workflow does exactly this: it downloads
India from Geofabrik, cuts out the NCR, runs the pipeline and commits the
result. It runs when `tools/` changes; run it from the Actions tab to pick up
newer OpenStreetMap edits.

The pipeline writes:

- `meta.json`: bounds, projection and the list of cells.
- `cells/<x>_<y>.bin`: one 2 km × 2 km square each, holding land use, roads,
  rail, water and buildings in a compact binary format. The format is
  documented at the top of `tools/build_data.py`. The browser fetches only
  the cells in view.
- `overview/*.webp` and `minimap.webp`: the whole region pre-rendered, used
  when zoomed far out.

## Landmark photos

`public/photos/` holds one photo per landmark from
[Wikimedia Commons](https://commons.wikimedia.org), each under a free licence
(CC BY, CC BY-SA, CC0 or public domain). `credits.json` records the author,
licence and source page that the card shows under each photo. To change a
photo, edit `PHOTOS` in `tools/fetch_photos.py` and run it; it refuses files
whose licence is not free to reuse.

## How it works

| File | Role |
|---|---|
| `tools/build_data.py` | OpenStreetMap → cells + overview images. |
| `public/js/proj.js` | Lat/lon ↔ metres ↔ isometric pixels. |
| `public/js/cells.js` | Fetches and decodes cells on demand. |
| `public/js/city.js` | Paints cells into cached chunks at six zoom levels: land use, roads, bridges, extruded buildings, trees in parks, the metro viaduct and landmarks, depth-sorted. |
| `public/js/landmarks.js`, `draw.js` | Hand-built landmark models and the isometric primitives they use. |
| `public/js/life.js` | Everything that moves. |
| `public/js/main.js` | Camera, input, labels, minimap and UI. |
| `public/js/data.js` | Landmark stories and place names. |

To add a landmark: add it to `LANDMARKS` in `data.js`, give it a model in
`landmarks.js` and a real-world scale in `LANDMARK_SCALE` in `city.js`.
OpenStreetMap buildings inside its footprint are hidden automatically.

## Deploy

It is a static site. The `pages` workflow runs the tests and publishes
`public/` to GitHub Pages on every push to `main`. It reads no environment
variables or secrets, and any static host can serve `public/` as it is.

Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).
