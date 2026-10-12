#!/usr/bin/env python
"""
Extract the Jotaplast colour chart (page 2) into the local sample library.

Unlike the Nuances PDF — which has vector swatches and a text layer — this page is
a single 4724x1754 raster. So the two halves are obtained differently:

  * COLOURS are computed. The chart is a regular grid (14 columns x 8 rows, plus a
    2 x 6 "Popular colours" card), so each swatch colour is the pixel at its cell
    centre. Exact and repeatable.
  * LABELS are read by eye and transcribed into LABELS below, because there is no
    OCR here. They are checked against the geometry, not trusted blindly: a cell is
    only published if it has its own printed label (dark pixels in the band 72-82px
    below the swatch top). That test is what rejects a flat patch inside the
    Midnight Floss room photo, which is uniform enough to fool a colour check.

Cells occupied by the four room photos are dropped automatically; the label test
then confirms nothing else is spurious.

Usage
  python scripts/extract-jotaplast-swatches.py --dry-run
  python scripts/extract-jotaplast-swatches.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import unicodedata

import fitz  # PyMuPDF
import numpy as np

LIBRARY = r"D:\Dirory\sample_library\Materials\Paint\Jotun"
PDF = os.path.join(LIBRARY, "jotaplast-colour-chart-indonesia.pdf")

# Grid geometry, measured from page 2.
COLS = [282, 412, 573, 702, 831, 961, 1199, 1328, 1457, 1587, 1748, 1878, 2006, 2136]
ROWS = [66, 160, 253, 348, 441, 536, 629, 723]
PANEL_COLS = [24, 153]
PANEL_ROWS = [254, 348, 442, 536, 630, 724]
W = 108
SAMPLE_DY = 26
LABEL_BAND = (72, 83)
LABEL_MIN_PX = 40

# Transcribed from the page-2 chart, keyed "<kind>:<col>:<row>". The panel card
# repeats eleven chart colours plus one of its own (Lemon Zest 7408).
LABELS: dict[str, tuple[str, str]] = {
    "chart:1:1": ("Hint of Green", "7001"), "chart:1:2": ("Glacier", "6011"),
    "chart:1:3": ("Bacchus", "6250"), "chart:1:4": ("Aroma Garden", "6263"),
    "chart:1:5": ("Beryl Charm", "6191"), "chart:1:6": ("Platinum Blue", "5394"),
    "chart:1:7": ("Whisper Blue", "6009"), "chart:1:8": ("Arctic Water", "5396"),
    "chart:2:1": ("Coral Blue", "7255"), "chart:2:2": ("Baby Cabbage", "7307"),
    "chart:2:3": ("Mint Leaf", "7382"), "chart:2:4": ("Cool Benji", "7378"),
    "chart:2:5": ("Jade Green", "7055"), "chart:2:6": ("Hay Kingfisher", "7409"),
    "chart:3:1": ("Apple White", "8190"), "chart:3:2": ("Apple Frost", "7270"),
    "chart:3:3": ("Herbal Fusion", "8237"), "chart:3:4": ("Light Folia", "8027"),
    "chart:3:5": ("Fresh Day", "8239"), "chart:3:6": ("Clover Lane", "8323"),
    "chart:4:1": ("Cornsilk", "1356"), "chart:4:2": ("Light Canyon", "8399"),
    "chart:4:3": ("Vanilla Essence", "8189"), "chart:4:4": ("Orifield", "8349"),
    "chart:4:5": ("Rosey", "1003"), "chart:4:6": ("Citronella", "1633"),
    "chart:5:1": ("Vanilla", "1453"), "chart:5:2": ("Old Lace", "1574"),
    "chart:5:3": ("Desert Sand", "1037"), "chart:5:4": ("Elfenben", "1012"),
    "chart:5:5": ("Candle Light", "1052"), "chart:5:6": ("Milkshake", "1776"),
    "chart:5:7": ("Sun", "1369"), "chart:5:8": ("Petals", "1156"),
    "chart:6:1": ("Ale Tangy", "2249"), "chart:6:2": ("Wiltshire Cream", "1648"),
    "chart:6:3": ("Sand Pebble", "1006"), "chart:6:4": ("Frosty Peach", "2021"),
    "chart:6:5": ("Star Champagne", "2568"), "chart:6:6": ("Candy", "2127"),
    "chart:6:7": ("Jewel White", "2029"), "chart:6:8": ("Discus", "2035"),
    "chart:7:1": ("Vision", "2228"), "chart:7:2": ("Pink Shawl", "2590"),
    "chart:7:3": ("Cotton Candy", "2453"), "chart:7:4": ("Cotton Lace", "2594"),
    "chart:7:5": ("Salsify", "2535"), "chart:7:6": ("Old Bristre", "2226"),
    "chart:7:7": ("Sahar", "2041"), "chart:7:8": ("Demi-Rosa", "0763"),
    "chart:8:1": ("Off-Blush", "2593"), "chart:8:2": ("Tender Pink", "2396"),
    "chart:8:3": ("Musk Lather", "2450"), "chart:8:4": ("Pulp Fairy", "3256"),
    "chart:8:5": ("Heavy Cream", "2595"), "chart:8:6": ("Orchid Heart", "2537"),
    "chart:8:7": ("Plumtic", "3214"), "chart:8:8": ("Smooth Latte", "2542"),
    "chart:9:1": ("White Malva", "3144"), "chart:9:2": ("English Rose", "3183"),
    "chart:9:3": ("Pink Cloud", "3192"), "chart:9:4": ("Pretty Pink", "3194"),
    "chart:9:5": ("Cantay", "3241"), "chart:9:6": ("Pink Lady", "3147"),
    "chart:10:1": ("Chiffon Drapes", "3182"), "chart:10:2": ("Musk", "4447"),
    "chart:10:3": ("Soft Lilac", "4448"), "chart:10:4": ("Lavender Drops", "4391"),
    "chart:10:5": ("Trend", "4136"), "chart:10:6": ("Whisper", "3268"),
    "chart:11:1": ("French Poodle", "4390"), "chart:11:2": ("Urban Light", "4507"),
    "chart:11:3": ("Mistral", "4011"), "chart:11:4": ("Reflection", "4446"),
    "chart:11:5": ("Violet Peace", "4326"), "chart:11:6": ("Midnight Floss", "4521"),
    "chart:12:1": ("Pale Folie", "4277"), "chart:12:2": ("Clear Blue", "4093"),
    "chart:12:3": ("Stonewash Denim", "4401"), "chart:12:4": ("Swiss Iris", "4198"),
    "chart:12:5": ("Eternal Blue", "4108"), "chart:12:6": ("Fountain", "4325"),
    "chart:13:1": ("Light Cyan", "5199"), "chart:13:2": ("Blue Ash", "4399"),
    "chart:13:3": ("Mermaid Green", "5168"), "chart:13:4": ("Marine Bay", "5140"),
    "chart:13:5": ("Ice Turquoise", "5136"), "chart:13:6": ("Hollow Laps", "5395"),
    "chart:13:7": ("Iceberg", "5231"), "chart:13:8": ("Persia", "5010"),
    "chart:14:1": ("Morning Fog", "9918"), "chart:14:2": ("Early Rain", "0486"),
    "chart:14:3": ("Timeless", "1024"), "chart:14:4": ("Twilight", "9904"),
    "chart:14:5": ("Oxford River", "9915"), "chart:14:6": ("Empire", "0520"),
    "chart:14:7": ("Ramad", "4200"), "chart:14:8": ("Pewter", "4175"),
    "panel:1:1": ("Cornsilk", "1356"), "panel:1:2": ("Twilight", "9904"),
    "panel:1:3": ("Blue Ash", "4399"), "panel:1:4": ("Apple White", "8190"),
    "panel:1:5": ("Mint Leaf", "7382"), "panel:1:6": ("Musk", "4447"),
    "panel:2:1": ("Vanilla", "1453"), "panel:2:2": ("Desert Sand", "1037"),
    "panel:2:3": ("Marine Bay", "5140"), "panel:2:4": ("Vanilla Essence", "8189"),
    "panel:2:5": ("Lemon Zest", "7408"), "panel:2:6": ("Pink Cloud", "3192"),
}


def title_case(name: str) -> str:
    small = {"and", "of", "the", "in", "on", "a", "to"}
    words = []
    for i, w in enumerate(name.split()):
        lw = w.lower()
        if i and lw in small:
            words.append(lw)
        elif "-" in w:
            words.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
        else:
            words.append(w[:1].upper() + w[1:].lower())
    return " ".join(words)


def ascii_safe(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def solid_jpeg(path: str, rgb, size: int = 256) -> None:
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, size, size))
    pix.set_rect(pix.irect, tuple(int(v) for v in rgb))
    pix.save(path, jpg_quality=90)


def extract():
    doc = fitz.open(PDF)
    page = doc[1]
    s = 2
    pix = page.get_pixmap(matrix=fitz.Matrix(s, s))
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
    lum = arr.mean(axis=2)

    out = []
    grid = [(("chart", ci + 1, ri + 1, x, y) for ci, x in enumerate(COLS) for ri, y in enumerate(ROWS))]
    grid += [(("panel", ci + 1, ri + 1, x, y) for ci, x in enumerate(PANEL_COLS) for ri, y in enumerate(PANEL_ROWS))]
    for group in grid:
        for kind, col, row, x0, y0 in group:
            key = "%s:%d:%d" % (kind, col, row)
            label = LABELS.get(key)
            if not label:
                continue
            # Must have its own printed label, else it is a patch of a room photo.
            band = lum[(y0 + LABEL_BAND[0]) * s : (y0 + LABEL_BAND[1]) * s, x0 * s : (x0 + W) * s]
            if int((band < 170).sum()) < LABEL_MIN_PX:
                print("  skipped %s: no printed label (photo area)" % key)
                continue
            cx, cy = (x0 + W // 2) * s, (y0 + SAMPLE_DY) * s
            rgb = arr[cy, cx]
            out.append({"key": key, "name": title_case(label[0]), "code": label[1],
                        "rgb": tuple(int(v) for v in rgb),
                        "hex": "#%02X%02X%02X" % tuple(int(v) for v in rgb)})
    doc.close()
    return out


def meta(code: str, name: str, safe_name: str) -> dict:
    base = "%s - %s" % (code, safe_name)
    return {"thumbnail": base + " - flat.jpeg", "name": name,
            "tags": ["Jotun", "Paint", code, name], "type": "material",
            "category": "Paint", "brand": "Jotun"}


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    found = extract()
    seen, unique = set(), []
    for c in found:
        if c["code"] in seen:
            continue
        seen.add(c["code"])
        unique.append(c)

    print("swatches with a label: %d -> unique codes: %d" % (len(found), len(unique)))
    if args.dry_run:
        for c in unique:
            print("  %-8s %-20s %s" % (c["code"], c["name"], c["hex"]))
        print("\n(dry run — nothing written)")
        return 0

    written = skipped = 0
    for c in unique:
        safe = ascii_safe(c["name"])
        base = "%s - %s" % (c["code"], safe)
        folder = os.path.join(LIBRARY, base)
        if os.path.isdir(folder) and not args.force:
            skipped += 1
            continue
        os.makedirs(folder, exist_ok=True)
        solid_jpeg(os.path.join(folder, base + " - flat.jpeg"), c["rgb"])
        with open(os.path.join(folder, "meta.json"), "w", encoding="utf-8") as fh:
            json.dump(meta(c["code"], c["name"], safe), fh, ensure_ascii=False)
        if safe != c["name"]:
            print("  note: '%s' stored as '%s'" % (c["name"], safe))
        written += 1
    print("\nWrote %d folders, skipped %d existing." % (written, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
