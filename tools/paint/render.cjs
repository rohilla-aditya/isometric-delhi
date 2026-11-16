// Export clean renders from the running site for the AI painter.
//
//   node render.cjs <site-url> landmarks <out-dir>
//   node render.cjs <site-url> tiles <tiles.json> <out-dir>
//
// Landmarks: one transparent PNG per landmark plus landmarks.json with each
// sprite's world-pixel box. Tiles: one PNG per [tx, ty] in tiles.json, each
// covering TILE world px (with MARGIN extra on every side) at SIZE px.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const TILE = 1024; // world px per painted tile
const SIZE = 512; // output px per tile
const MARGIN = 64; // world px of overlap around each tile, cropped after painting

async function main() {
  const [url, mode, a, b] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(url);
  await page.waitForFunction(() => window.__delhi?.renderTile, null, { timeout: 60000 });
  const save = (file, dataUrl) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

  if (mode === 'landmarks') {
    fs.mkdirSync(a, { recursive: true });
    const ids = await page.evaluate(() => __delhi.landmarks.map((l) => [l.id, l.screen.x1 - l.screen.x0, l.screen.y1 - l.screen.y0]));
    const boxes = {};
    for (const [id, w, h] of ids) {
      // aim for ~768 px on the long side, the size the model paints best
      const scale = Math.max(0.4, Math.min(8, 768 / Math.max(w, h)));
      const r = await page.evaluate(([i, s]) => __delhi.renderLandmark(i, s), [id, scale]);
      save(path.join(a, `${id}.png`), r.png);
      boxes[id] = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
      console.log(id, Math.round(w * scale), 'x', Math.round(h * scale));
    }
    fs.writeFileSync(path.join(a, 'landmarks.json'), JSON.stringify(boxes, null, 1));
  } else if (mode === 'tiles') {
    const tiles = JSON.parse(fs.readFileSync(a, 'utf8'));
    fs.mkdirSync(b, { recursive: true });
    const span = TILE + 2 * MARGIN;
    const size = Math.round((SIZE * span) / TILE);
    for (const [tx, ty] of tiles) {
      const png = await page.evaluate(([x0, y0, sp, sz]) => __delhi.renderTile(x0, y0, sp, sz), [tx * TILE - MARGIN, ty * TILE - MARGIN, span, size]);
      save(path.join(b, `${tx}_${ty}.png`), png);
    }
    console.log('rendered', tiles.length, 'tiles');
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
