"""Repaint map renders as detailed pixel art with a free, open image model.

    python paint.py landmarks <render-dir> <out-dir>
    python paint.py tiles <render-dir> <out-dir> [--limit-minutes N]

Model: DreamShaper 8 (an open Stable Diffusion 1.5 model, CreativeML
OpenRAIL-M) with the LCM-LoRA speed-up (OpenRAIL++), image-to-image, on CPU.
The render fixes the layout; the model only adds texture and detail, so the
strength stays moderate. Results are reduced to a limited palette at half
resolution for a crisp pixel-art finish.
"""

import json
import os
import sys
import time

import torch
from PIL import Image, ImageFilter

GROUND = (226, 216, 194)  # the map's bare-ground colour, behind landmark sprites
STYLE = ("detailed isometric pixel art, 16-bit game art, crisp dark outlines, sharp shadows, "
         "rich texture, high detail")
NEG = "blurry, photo, photograph, 3d render, text, watermark, people close-up, distorted, smooth gradient"
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

STRENGTH = {"landmarks": 0.68, "tiles": 0.38}
# Landmarks whose defining feature (a dome, a coloured crown) gets lost at the
# usual strength are painted more gently.
GENTLE = {"humayun-tomb": 0.36, "bharat-mandapam": 0.48, "lodhi-tomb": 0.5}


def load():
    from diffusers import AutoPipelineForImage2Image, LCMScheduler

    torch.set_num_threads(os.cpu_count() or 4)
    pipe = AutoPipelineForImage2Image.from_pretrained("Lykon/dreamshaper-8", torch_dtype=torch.float32, safety_checker=None)
    pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
    pipe.load_lora_weights("latent-consistency/lcm-lora-sdv1-5")
    pipe.fuse_lora()
    pipe.set_progress_bar_config(disable=True)
    return pipe


def repaint(pipe, image, prompt, strength, seed):
    w, h = (image.width // 8) * 8, (image.height // 8) * 8
    out = pipe(prompt=prompt, negative_prompt=NEG, image=image.resize((w, h)), strength=strength,
               num_inference_steps=8, guidance_scale=1.5, generator=torch.Generator().manual_seed(seed)).images[0]
    return out.resize(image.size, Image.LANCZOS)


def pixelate(im, colors=72):
    """Half resolution, limited palette, hard edges: the pixel-art finish."""
    small = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS)
    small = small.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    return small.resize(im.size, Image.NEAREST)


def landmarks(src, dst):
    pipe = load()
    os.makedirs(dst, exist_ok=True)
    # where each sprite sits in the world, written by render.cjs
    with open(os.path.join(src, "landmarks.json")) as f, open(os.path.join(dst, "landmarks.json"), "w") as g:
        g.write(f.read())
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
        out = pixelate(repaint(pipe, base, f"{LANDMARK.get(lid, lid)}, {STYLE}", GENTLE.get(lid, STRENGTH["landmarks"]), 11))
        # keep the model's own silhouette, slightly grown, so the sprite fits its place
        mask = rgba.split()[3].point(lambda a: 255 if a > 40 else 0).filter(ImageFilter.MaxFilter(3))
        sprite = out.convert("RGBA")
        sprite.putalpha(mask)
        sprite.save(os.path.join(dst, f"{lid}.webp"), lossless=False, quality=88, method=6)
        print(lid, f"{time.time() - t:.0f}s", flush=True)


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


def tiles(src, dst, limit_minutes, order=None):
    pipe = load()
    os.makedirs(dst, exist_ok=True)
    stop = time.time() + limit_minutes * 60
    done = 0
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
        out = pixelate(harmonise(repaint(pipe, im, CITY + STYLE, STRENGTH["tiles"], tx * 7919 + ty), im))
        # crop the overlap margin; neighbours meet in the middle of it
        m = round(out.width * 64 / (1024 + 128))
        out.crop((m, m, out.width - m, out.height - m)).resize((512, 512), Image.NEAREST).save(out_path, quality=82, method=6)
        done += 1
    print("painted", done, "tiles", flush=True)


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "landmarks":
        landmarks(sys.argv[2], sys.argv[3])
    else:
        lim = float(sys.argv[sys.argv.index("--limit-minutes") + 1]) if "--limit-minutes" in sys.argv else 1e9
        order = sys.argv[sys.argv.index("--order") + 1] if "--order" in sys.argv else None
        tiles(sys.argv[2], sys.argv[3], lim, order)
