"""Repaint map renders as detailed pixel art with a free, open image model.

    python paint.py landmarks <render-dir> <out-dir> [landmark-id ...]
    python paint.py tiles <render-dir> <out-dir> [--order tiles.json] [--context painted-tiles-dir] [--limit-minutes N]

Model: FLUX.1 [schnell] (Black Forest Labs, Apache 2.0), 4-bit GGUF, run on
CPU with stable-diffusion.cpp; text encoders CLIP-L and T5-XXL (4-bit). The
render fixes the layout; the model adds texture and detail, so the strength
stays low for the city. Results are reduced to a limited palette at half
resolution for a crisp pixel-art finish. get_models.sh fetches the weights.
"""

import json
import os
import sys
import time

from PIL import Image, ImageFilter

MODELS = os.path.expanduser(os.environ.get("FLUX_DIR", "~/models/flux"))
THREADS = int(os.environ.get("PAINT_THREADS", os.cpu_count() or 4))
GROUND = (226, 216, 194)  # the map's bare-ground colour, behind landmark sprites
STYLE = ("detailed isometric pixel art, 16-bit game art, crisp dark outlines, sharp shadows, "
         "rich texture, high detail")
CITY = ("isometric pixel art of a dense Indian city, Delhi, weathered flat concrete rooftops with black "
        "water tanks, colourful plaster walls with small windows, street vendors, neem trees, ")

# What each landmark is made of, so the painter keeps its materials right.
LANDMARK = {
    "india-gate": "India Gate, a tall buff sandstone triumphal arch with a shallow dome on top, in green lawns",
    "rashtrapati-bhavan": "Rashtrapati Bhavan palace, cream and red sandstone, colonnaded facade, copper-brown central dome, Mughal garden",
    "north-block": "colonial secretariat building, red sandstone base, cream upper floors, central dome, chhatris",
    "south-block": "colonial secretariat building, red sandstone base, cream upper floors, central dome, chhatris",
    "parliament": "Indian parliament, circular cream colonnaded building and a triangular modern building with a dome",
    "connaught-place": "circular green park with a giant Indian flag and a fountain",
    "jantar-mantar": "Jantar Mantar observatory, giant terracotta red masonry sundial with stairs and curved instruments",
    "bangla-sahib": "Sikh gurudwara, white marble with golden onion domes, holy water tank in front",
    "birla-mandir": "Hindu temple, yellow cream base with maroon red curved spires with white bands",
    "new-delhi-station": "railway station with long platform canopies and red brick buildings",
    "red-fort": "Red Fort, red sandstone Mughal fort walls with crenellations, Lahori Gate with white marble domed pavilions, lawns inside",
    "jama-masjid": "Jama Masjid mosque, red sandstone with three white marble onion domes with black stripes, two tall minarets, courtyard",
    "rajghat": "Raj Ghat memorial, black marble platform with an eternal flame in green lawns",
    "bharat-mandapam": "modern convention centre, elliptical building with a tall orange ribbed crown over a beige base",
    "purana-qila": "Purana Qila old fort, brown stone walls with bastions and domed gateways, red sandstone pavilion",
    "humayun-tomb": "Humayun's Tomb, red sandstone Mughal tomb with white marble dome and chhatris on a high platform, charbagh garden with water channels",
    "lodhi-tomb": "grey stone octagonal Lodi dynasty tomb with a dome, in a park",
    "jln-stadium": "large sports stadium with a white tensile roof, red running track and green football field",
    "lotus-temple": "Lotus Temple, white marble petals shaped like a lotus flower, surrounded by blue pools",
    "akshardham": "Akshardham temple, ornate pink sandstone and marble with many domes, surrounded by a red colonnade and gardens",
    "qutub-minar": "Qutub Minar, a tall fluted red sandstone minaret with balconies, ancient stone ruins and an iron pillar",
    "hauz-khas": "ruined grey stone madrasa with arches and small domes beside a lake",
    "tughlakabad": "ruined massive rubble-stone fort walls with round bastions, scrubland",
    "signature-bridge": "steel cable-stayed bridge pylon over a river, white cables",
    "igi-airport": "modern airport terminal with glass facade, control tower and parked white airplanes",
}

# Strength and sampling steps. FLUX follows the render closely at 0.3 for the
# city (higher and it invents its own buildings); landmarks take more freedom.
CITY_PAINT = dict(strength=0.30, steps=8)
LANDMARK_PAINT = dict(strength=0.60, steps=4)
DETAIL_PAINT = dict(strength=0.25, steps=4)


def load():
    from stable_diffusion_cpp import StableDiffusion

    return StableDiffusion(
        diffusion_model_path=os.path.join(MODELS, "flux1-schnell-Q4_K_S.gguf"),
        clip_l_path=os.path.join(MODELS, "clip_l.safetensors"),
        t5xxl_path=os.path.join(MODELS, "t5-Q4_K_M.gguf"),
        vae_path=os.path.join(MODELS, "ae.safetensors"),
        n_threads=THREADS,
        verbose=False,
        # keeps a 768 x 768 picture within ~13 GB, so it fits a 16 GB runner
        diffusion_flash_attn=True,
        enable_mmap=True,
    )


def repaint(pipe, image, prompt, strength, steps, seed):
    w, h = max(64, (image.width // 64) * 64), max(64, (image.height // 64) * 64)
    out = pipe.generate_image(prompt=prompt, init_image=image.resize((w, h), Image.LANCZOS), strength=strength,
                              width=w, height=h, sample_steps=steps, cfg_scale=1.0, seed=seed, vae_tiling=True)[0]
    return out.convert("RGB").resize(image.size, Image.LANCZOS)


def pixelate(im, colors=72):
    """Half resolution, limited palette, hard edges: the pixel-art finish."""
    small = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS)
    small = small.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    return small.resize(im.size, Image.NEAREST)


def landmarks(src, dst):
    pipe = load()
    os.makedirs(dst, exist_ok=True)
    # where each sprite sits in the world, written by render.cjs
    with open(os.path.join(src, "landmarks.json")) as f:
        boxes = json.load(f)
    with open(os.path.join(dst, "landmarks.json"), "w") as g:
        json.dump(boxes, g, indent=1)
    only = set(sys.argv[4:])  # optionally repaint just these landmarks
    for name in sorted(os.listdir(src)):
        if not name.endswith(".png"):
            continue
        lid = name[:-4]
        if only and lid not in only:
            continue
        rgba = Image.open(os.path.join(src, name)).convert("RGBA")
        base = Image.new("RGB", rgba.size, GROUND)
        base.paste(rgba, mask=rgba.split()[3])
        t = time.time()
        prompt = f"{LANDMARK.get(lid, lid)}, {STYLE}"
        out = repaint(pipe, base, prompt, seed=11, **LANDMARK_PAINT)
        # Big sites (Red Fort is 1.4 km across) get few sprite pixels per metre
        # and turn blocky when zoomed in, so enlarge and paint in more detail.
        b = boxes[lid]
        k = min(DETAIL_PX_PER_M * (b["x1"] - b["x0"]) / out.width, DETAIL_MAX_PX / max(out.size))
        if k > 1.25:
            out = refine(pipe, out.resize((round(out.width * k), round(out.height * k)), Image.LANCZOS), prompt)
        out = pixelate(out)
        # keep the model's own silhouette, slightly grown, so the sprite fits its place
        mask = (rgba.split()[3].point(lambda a: 255 if a > 40 else 0).resize(out.size, Image.NEAREST)
                .filter(ImageFilter.MaxFilter(3 if k <= 1.25 else 5)))
        sprite = out.convert("RGBA")
        sprite.putalpha(mask)
        sprite.save(os.path.join(dst, f"{lid}.webp"), lossless=False, quality=88, method=6)
        print(lid, f"{time.time() - t:.0f}s", flush=True)


# Landmark sprites aim for this many image px per metre of map (pixelated
# blocks of about 0.7 m), capped at DETAIL_MAX_PX on the long side so the
# biggest (Red Fort) still paints within one 6-hour runner job.
DETAIL_PX_PER_M = 3.0
DETAIL_MAX_PX = 3584


def refine(pipe, big, prompt, tile=768, overlap=160):
    """Paint detail into an enlarged painting, in overlapping sections.

    Low strength keeps every section true to the enlarged picture, so they
    agree with each other; feathered weights blend the overlaps.
    """
    import numpy as np

    W, H = big.size
    acc = np.zeros((H, W, 3), np.float32)
    wsum = np.zeros((H, W, 1), np.float32)
    def starts(n_px):
        # as few sections as cover the side with at least `overlap` between them
        n = max(1, -(-(n_px - overlap) // (tile - overlap)))
        return [round(k * (n_px - tile) / (n - 1)) for k in range(n)] if n > 1 else [0]

    xs, ys = starts(W), starts(H)
    ramp = np.minimum(np.arange(tile) + 1, overlap) / overlap
    ramp = np.minimum(ramp, ramp[::-1])
    for i, y in enumerate(ys):
        for j, x in enumerate(xs):
            box = (x, y, min(W, x + tile), min(H, y + tile))
            part = big.crop(box)
            out = repaint(pipe, part, prompt, seed=101 + i * 31 + j, **DETAIL_PAINT)
            a = np.asarray(out, np.float32)
            wy, wx = ramp[: a.shape[0]].copy(), ramp[: a.shape[1]].copy()
            # outer edges of the picture get full weight
            if y == 0: wy[: overlap] = 1
            if box[3] == H: wy[-overlap:] = 1
            if x == 0: wx[: overlap] = 1
            if box[2] == W: wx[-overlap:] = 1
            w = (wy[:, None] * wx[None, :])[..., None] + 1e-4
            acc[box[1]:box[3], box[0]:box[2]] += a * w
            wsum[box[1]:box[3], box[0]:box[2]] += w
    return Image.fromarray(np.clip(acc / wsum, 0, 255).astype(np.uint8))


def harmonise(out, src, amount=0.55):
    """Pull the painted tile's colour balance partway toward its own render.

    Renders are continuous across tile edges, so matching each tile's
    per-channel mean and spread to its render makes neighbours agree in tone
    and hides the seams, while keeping most of the painted palette.
    """
    import numpy as np

    o = np.asarray(out, dtype=np.float32)
    r = np.asarray(src.resize(out.size), dtype=np.float32)
    om, osd = o.mean((0, 1)), o.std((0, 1)) + 1e-3
    rm, rsd = r.mean((0, 1)), r.std((0, 1)) + 1e-3
    tm = om + (rm - om) * amount
    tsd = osd + (rsd - osd) * amount
    o = (o - om) / osd * tsd + tm
    return Image.fromarray(np.clip(o, 0, 255).astype(np.uint8))


# ------------------------------------------------------------ city tiles --
# Rules, not more AI (Pixel Chennai's lesson): water is never painted, tiles
# painted second see their neighbours' finished art at the edges, and every
# tile is checked against its render and repainted if the painter strayed.

WATER_RGB = (79, 156, 196)  # #4f9cc4, the map's water (public/js/city.js)
STRIP = 64  # image px along each edge that a neighbour also covers (2 x 64 m margins)
RETRIES = 2


def _small(im, n=144):
    import numpy as np

    return np.asarray(im.convert("RGB").resize((n, n), Image.BOX), np.float32)


def water_mask(render):
    """Soft mask of the render's water, slightly grown so banks stay clean."""
    import numpy as np

    a = np.asarray(render.convert("RGB"), np.int16)
    m = (np.abs(a - np.array(WATER_RGB)).max(2) < 26).astype(np.uint8) * 255
    return Image.fromarray(m, "L").filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))


def keep_water(out, render):
    """The painter gets shorelines wrong; the map's own water goes back on top."""
    return Image.composite(render.convert("RGB"), out, water_mask(render))


def _edge_weights(n, s):
    """1 at the outer edge falling to 0 at s px in (for one side of an n px image)."""
    import numpy as np

    w = np.zeros(n, np.float32)
    w[:s] = np.linspace(1, 0, s)
    return w


def neighbours(context, tx, ty):
    """Finished art of the four edge neighbours, where it exists."""
    if not context:
        return {}
    found = {}
    for side, (dx, dy) in {"left": (-1, 0), "right": (1, 0), "top": (0, -1), "bottom": (0, 1)}.items():
        p = os.path.join(context, f"{tx + dx}_{ty + dy}.webp")
        if os.path.exists(p):
            found[side] = Image.open(p).convert("RGB")
    return found


def with_neighbours(im, nb):
    """Lay each neighbour's art over the strip it shares with this tile, fading inward."""
    import numpy as np

    if not nb:
        return im
    a = np.asarray(im.convert("RGB"), np.float32)
    h, w = a.shape[:2]
    s = round(STRIP * w / 576)
    for side, n in nb.items():
        b = np.asarray(n.resize((w, h), Image.LANCZOS), np.float32)
        if side == "left":
            wt = _edge_weights(w, s)[None, :, None]
            src = np.zeros_like(a); src[:, :s] = b[:, w - s:]
        elif side == "right":
            wt = _edge_weights(w, s)[::-1][None, :, None]
            src = np.zeros_like(a); src[:, w - s:] = b[:, :s]
        elif side == "top":
            wt = _edge_weights(h, s)[:, None, None]
            src = np.zeros_like(a); src[:s] = b[h - s:]
        else:
            wt = _edge_weights(h, s)[::-1][:, None, None]
            src = np.zeros_like(a); src[h - s:] = b[:s]
        a = a * (1 - wt) + src * wt
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def check(out, render):
    """What went wrong, judged against the render: a list of problems (empty = fine)."""
    import numpy as np

    p, r = _small(out), _small(render)
    problems = []
    gp, gr = p.mean(2), r.mean(2)
    ep = np.abs(np.diff(gp, axis=1))[:-1] + np.abs(np.diff(gp, axis=0))[:, :-1]
    er = np.abs(np.diff(gr, axis=1))[:-1] + np.abs(np.diff(gr, axis=0))[:, :-1]
    corr = float(np.corrcoef(ep.ravel(), er.ravel())[0, 1]) if er.std() > 0 else 1.0
    hp = np.asarray(Image.fromarray(p.astype(np.uint8)).convert("HSV"), np.float32)
    hr = np.asarray(Image.fromarray(r.astype(np.uint8)).convert("HSV"), np.float32)

    def green(h):
        return (h[..., 0] > 40) & (h[..., 0] < 120) & (h[..., 1] > 60) & (h[..., 2] > 60)

    def water(h):
        return (h[..., 0] > 128) & (h[..., 0] < 160) & (h[..., 1] > 70) & (h[..., 2] > 90)

    if np.abs(p - r).mean() < 6:
        problems.append("barely changed")
    if corr < 0.2:
        problems.append(f"layout drifted (edges {corr:.2f})")
    rg = green(hr)
    if rg.sum() > 200 and (green(hp) & rg).sum() / rg.sum() < 0.7:
        problems.append("built on parks")
    if (water(hp) & ~water(hr)).mean() > 0.004:
        problems.append("invented water")
    return problems, corr


def paint_tile(pipe, im, tx, ty, nb):
    """Paint one tile, retrying with new seeds while the checks fail; keep the best."""
    init = with_neighbours(im, nb)
    best = None
    for attempt in range(RETRIES + 1):
        out = repaint(pipe, init, CITY + STYLE, seed=tx * 7919 + ty + attempt * 104729, **CITY_PAINT)
        out = keep_water(harmonise(out, im), im)
        out = with_neighbours(out, nb)  # meet the neighbours exactly at the outer edge
        problems, corr = check(out, im)
        score = (len(problems), -corr)
        if best is None or score < best[0]:
            best = (score, out, problems, attempt + 1)
        if not problems:
            break
    return pixelate(best[1]), best[2], best[3]


def tiles(src, dst, limit_minutes, order=None, context=None):
    pipe = load()
    os.makedirs(dst, exist_ok=True)
    stop = time.time() + limit_minutes * 60
    report = {}
    # paint in priority order (nearest Connaught Place first), not by file name,
    # so a runner that hits its time limit leaves only the outskirts undone
    names = [f"{tx}_{ty}.png" for tx, ty in json.load(open(order))] if order else sorted(os.listdir(src))
    for name in names:
        if not name.endswith(".png") or time.time() > stop or not os.path.exists(os.path.join(src, name)):
            continue
        out_path = os.path.join(dst, name[:-4] + ".webp")
        if os.path.exists(out_path):
            continue
        im = Image.open(os.path.join(src, name)).convert("RGB")
        tx, ty = (int(v) for v in name[:-4].split("_"))
        nb = neighbours(context, tx, ty)
        out, problems, tries = paint_tile(pipe, im, tx, ty, nb)
        # keep the overlap margin: the viewer crossfades neighbours across it
        out.save(out_path, quality=82, method=6)
        report[name[:-4]] = {"tries": tries, "problems": problems, "neighbours": sorted(nb)}
        print(name[:-4], f"tries={tries}", "ok" if not problems else "; ".join(problems), flush=True)
    with open(os.path.join(dst, "qa.json"), "w") as f:
        json.dump(report, f, indent=0)
    bad = sum(1 for v in report.values() if v["problems"])
    print(f"painted {len(report)} tiles, {bad} still flagged after retries", flush=True)


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "landmarks":
        landmarks(sys.argv[2], sys.argv[3])
    else:
        lim = float(sys.argv[sys.argv.index("--limit-minutes") + 1]) if "--limit-minutes" in sys.argv else 1e9
        order = sys.argv[sys.argv.index("--order") + 1] if "--order" in sys.argv else None
        context = sys.argv[sys.argv.index("--context") + 1] if "--context" in sys.argv else None
        tiles(sys.argv[2], sys.argv[3], lim, order, context)
