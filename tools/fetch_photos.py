"""Download the landmark photos shown in the info cards, with their credits.

    python tools/fetch_photos.py

Every photo comes from Wikimedia Commons under a free licence (CC BY,
CC BY-SA, CC0 or public domain). PHOTOS below names the exact Commons file
for each landmark, chosen by hand. The script saves a 960 px wide JPEG to
public/photos/<id>.jpg and writes public/photos/credits.json with the
author, licence and source page that the card shows under each photo.
"""

import html
import io
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

PHOTOS = {
    "india-gate": "File:India Gate, New Delhi from West.jpg",
    "rashtrapati-bhavan": "File:Front Facade of Rashtrapati Bhavan.jpg",
    "north-block": "File:North Block, Raisina Hill, New Delhi 06.jpg",
    "south-block": "File:North & South Block, New Delhi (29473966070).jpg",
    "parliament": "File:Sansad Bhavan, New Delhi.jpg",
    "connaught-place": "File:Colonnade of f block.JPG",
    "jantar-mantar": "File:Jantar Mantar Samrat Yantra.jpg",
    "bangla-sahib": "File:Front view of Gurudwara Bangla Sahib, Delhi.jpg",
    "birla-mandir": "File:Birla Mandir, New Delhi, India.JPG",
    "new-delhi-station": "File:New Delhi railway station at night 01.jpg",
    "red-fort": "File:Lahori Gate, Red Fort, Delhi, India - September 2014.jpg",
    "jama-masjid": "File:Jama Masjid, Delhi, India.jpg",
    "rajghat": "File:Raj Ghat – Memorial of Mahatma Gandhi.jpg",
    "bharat-mandapam": "File:Bharat Mandapam view from East.jpg",
    "purana-qila": "File:Purana Qila, Delhi 2.jpg",
    "humayun-tomb": "File:Humayun's Tomb-Delhi front view.jpg",
    "lodhi-tomb": "File:The tombs of Muhammad Shah and Sikandar Lodhi.jpg",
    "jln-stadium": "File:Jawaharlal Nehru Stadium Delhi outside view, July 2016.jpg",
    "lotus-temple": "File:The Lotus temple in Delhi, India (7).jpg",
    "akshardham": "File:Swaminarayan Akshardham New Delhi - Visit During WCI 2016 (1).jpg",
    "qutub-minar": "File:Qutub Minar Yashasvi.jpg",
    "hauz-khas": "File:Hauz Khas Complex Madrasa (3547640804).jpg",
    "tughlakabad": "File:Outside view of Tughlaqabad Fort in Tughlakabad 05.jpg",
    "igi-airport": "File:Delhi airport terminal 3.jpg",
}

UA = {"User-Agent": "isometric-delhi-map/1.0 (open-source map; photo credits build script)"}
API = "https://commons.wikimedia.org/w/api.php?"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "photos")
FREE = re.compile(r"^(CC BY(-SA)? [0-9.]+( .*)?|CC0|Public domain|PD.*)$", re.I)


def _open(url):
    for k in range(8):
        try:
            time.sleep(1.5)
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 0) or 10 * (k + 1))
    raise RuntimeError("rate limited: " + url)


def text(value):
    """Commons metadata is HTML; keep the readable text."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", value or ""))).strip()


def main():
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "credits.json")
    credits = json.load(open(path)) if os.path.exists(path) else {}
    for lid, title in PHOTOS.items():
        if credits.get(lid, {}).get("file") == title and os.path.exists(os.path.join(OUT, f"{lid}.jpg")):
            continue
        q = {"action": "query", "format": "json", "titles": title, "prop": "imageinfo",
             "iiprop": "url|extmetadata", "iiurlwidth": 960}
        page = next(iter(json.loads(_open(API + urllib.parse.urlencode(q)))["query"]["pages"].values()))
        ii = page["imageinfo"][0]
        md = ii["extmetadata"]
        lic = text(md.get("LicenseShortName", {}).get("value"))
        if not FREE.match(lic):
            raise SystemExit(f"{lid}: {title} has licence {lic!r}, which is not free to reuse")
        url = ii["thumburl"].split("?")[0].replace("://thumb.wikimedia.org/", "://upload.wikimedia.org/")
        im = Image.open(io.BytesIO(_open(url))).convert("RGB")
        im.thumbnail((960, 960))
        im.save(os.path.join(OUT, f"{lid}.jpg"), quality=82, optimize=True, progressive=True)
        credits[lid] = {
            "file": title,
            "author": text(md.get("Artist", {}).get("value")) or "Unknown author",
            "license": lic,
            "licenseUrl": md.get("LicenseUrl", {}).get("value", ""),
            "source": ii["descriptionurl"],
        }
        print(lid, "-", credits[lid]["author"], "-", lic, flush=True)
    json.dump(credits, open(path, "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
