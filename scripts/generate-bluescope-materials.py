#!/usr/bin/env python
"""
Generate BlueScope "Baja Lapis Warna" materials: every colour as a roof sheet and
as wall cladding.

The two PDFs give exact colours but no usable surface texture — the swatches are
flat fills and the profile dimensions are not stated. So the surface is
synthesised from the colour, in the two forms the coil actually takes:

  * Atap (roof)   the coil is roll-formed into a tile-look profile: a raised,
                  shadowed step at each course and a rib between tile columns, so
                  the sheet reads as tiles across the slope. Repeats both ways.
  * Dinding (wall) the same coil as standing-seam / tray cladding: flat pans with
                  a joint at fixed centres. A pan is continuous, so the pattern
                  repeats horizontally only — there is no vertical repeat.

Sizes come from the profile module and are written in centimetres, matching the
library convention (`... 60x120.jpeg` is a 60x120 cm tile): a 400 mm tile module
is `40x40`, a 400 mm rib with a 1000 mm sample length is `40x100`.

Colours: Colorbond Matt prints RGB/HEX in the PDF (cross-checked against the
swatch pixels); the Zacs swatches have no printed values, so their colours are
sampled from the swatch bodies.

Usage
  python scripts/generate-bluescope-materials.py --preview
  python scripts/generate-bluescope-materials.py
"""

from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import zlib

import fitz
import numpy as np

LIBRARY = r"D:\Dirory\sample_library\Materials\Roof"
OUT_ROOT = os.path.join(LIBRARY, "BlueScope")
BRAND = "BlueScope"
CATEGORY = "Baja Lapis Warna"

ROOF_RIB_MM = 200             # roof rib centres — not published by BlueScope
WALL_JOINT_MM = 400           # wall pan joint centres
SAMPLE_LENGTH_MM = 1000       # both sheets are linear, so there is no vertical repeat
PX_PER_MM = 1.5               # denser than the flat-colour samples: these are profiles

COLOURS = [
    # range, colour, hex  (Colorbond values are printed in the PDF)
    ("Colorbond Matt", "Monument", "#292E2A"),
    ("Colorbond Matt", "Dune", "#BDB3A7"),
    ("Colorbond Matt", "Winter", "#F9FBF1"),
    ("Colorbond Matt", "Iron", "#666C6F"),
    ("Colorbond Matt", "Granite", "#3E434C"),
    # Zacs values sampled from the swatch bodies (no printed values in that PDF)
    ("Zacs Minimalist", "Wampu Black", "#3E3F3D"),
    ("Zacs Minimalist", "Shutter Grey", "#898A8A"),
    ("Zacs Minimalist", "Asian White", "#E2E2DD"),
    ("Zacs Minimalist", "Nuvo Blue", "#3A4485"),
    ("Zacs Minimalist", "Natural Brown", "#583823"),
    ("Zacs Minimalist", "Peanut Butter", "#C7AF88"),
    ("Zacs Minimalist", "BangChak Green", "#44A399"),
]


def rgb(hexcode: str):
    h = hexcode.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def shade(base: np.ndarray, factor: np.ndarray) -> np.ndarray:
    """Multiply a base colour by a per-pixel factor, clamped to 0-255."""
    out = base[None, None, :] * factor[:, :, None]
    return np.clip(out, 0, 255)


def _wrap_gauss(U: np.ndarray, centre: float, sigma: float) -> np.ndarray:
    """A Gaussian that wraps around the module edge, so tiles join seamlessly."""
    d = np.minimum(np.abs(U - centre), 1 - np.abs(U - centre))
    return np.exp(-(d ** 2) / (2 * sigma ** 2))


def roof_rib(base: np.ndarray, w: int, h: int) -> np.ndarray:
    """One rib of the roof sheet: clean parallel ribs running down the slope.

    Not a tile. The Zacs booklet describes this product as "tampilan bersih dan
    garis yang sederhana" (clean appearance, simple lines), and its own roof
    photograph shows narrow, evenly spaced ribs running down the slope — there is
    no moulded tile profile anywhere in this product. The rib spacing is not
    published, so it is set below and flagged.
    """
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    U, V = np.meshgrid(u, v, indexing="xy")
    f = np.ones_like(U)

    # One rib per module, sitting on the module edge so the repeat is even:
    # a lit crest with a shadow down its right-hand flank.
    f += 0.15 * _wrap_gauss(U, 0.00, 0.055)      # crest catches the light
    f -= 0.26 * _wrap_gauss(U, 0.075, 0.040)     # shadow on the right flank
    f -= 0.05 * _wrap_gauss(U, 0.93, 0.060)      # pan falls away on the left

    # Flat pans either side; a matt sheet, so keep any sheen very slight.
    f += 0.015 * (0.5 - U)

    # Fine grain, so large flat areas do not band.
    rng = np.random.default_rng(7)
    f += rng.normal(0, 0.004, size=f.shape)
    return shade(base, np.clip(f, 0.4, 1.6))


def wall_pan(base: np.ndarray, w: int, h: int) -> np.ndarray:
    """One pan: a shadow-line joint at the left edge, flat otherwise."""
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    U, V = np.meshgrid(u, v, indexing="xy")
    f = np.ones_like(U)

    # Expressed joint. The reference photo shows a shadow line rather than a deep
    # standing seam, so this is a narrow groove with a soft highlight beside it.
    groove = np.exp(-((U - 0.010) ** 2) / (2 * 0.009 ** 2)) * -0.28
    edge = np.exp(-((U - 0.030) ** 2) / (2 * 0.014 ** 2)) * 0.09
    f += groove + edge

    # Light falls across the flat pan; keep it subtle, this is a matt finish.
    f += 0.030 * (0.5 - U)
    f += 0.010 * np.sin(2 * np.pi * V)

    rng = np.random.default_rng(11)
    f += rng.normal(0, 0.005, size=f.shape)
    return shade(base, f)


def write_png(path: str, arr: np.ndarray) -> None:
    h, w, _ = arr.shape
    raw = b"".join(b"\x00" + arr[y].tobytes() for y in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n"
                 + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                 + chunk(b"IDAT", zlib.compress(raw, 6))
                 + chunk(b"IEND", b""))


def save_jpeg(path: str, arr: np.ndarray) -> None:
    tmp = path + ".png"
    write_png(tmp, arr.astype(np.uint8))
    fitz.Pixmap(tmp).save(path, jpg_quality=90)
    os.remove(tmp)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true", help="write two samples only")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    roof_w = int(ROOF_RIB_MM * PX_PER_MM)
    wall_w = int(WALL_JOINT_MM * PX_PER_MM)
    sheet_h = int(SAMPLE_LENGTH_MM * PX_PER_MM)
    roof_cm = "%dx%d" % (ROOF_RIB_MM / 10, SAMPLE_LENGTH_MM / 10)
    wall_cm = "%dx%d" % (WALL_JOINT_MM / 10, SAMPLE_LENGTH_MM / 10)
    print("atap rib %s cm -> %dx%dpx   dinding %s cm -> %dx%dpx" % (
        roof_cm, roof_w, sheet_h, wall_cm, wall_w, sheet_h))

    if args.preview:
        os.makedirs(OUT_ROOT, exist_ok=True)
        save_jpeg(os.path.join(OUT_ROOT, "preview-atap.jpg"), roof_rib(rgb("#3E434C"), roof_w, sheet_h))
        save_jpeg(os.path.join(OUT_ROOT, "preview-dinding.jpg"), wall_pan(rgb("#292E2A"), wall_w, sheet_h))
        print("wrote preview-atap.jpg and preview-dinding.jpg to", OUT_ROOT)
        return 0

    written = skipped = 0
    for range_name, colour, hexcode in COLOURS:
        for kind, variant, (w, h), cm in (
            ("atap", "Atap", (roof_w, sheet_h), roof_cm),
            ("dinding", "Dinding", (wall_w, sheet_h), wall_cm),
        ):
            base = "%s %s - %s %s" % (range_name.split()[0], colour, variant, cm)
            folder = os.path.join(OUT_ROOT, base)
            if os.path.isdir(folder) and not args.force:
                skipped += 1
                continue
            os.makedirs(folder, exist_ok=True)
            arr = roof_rib(rgb(hexcode), w, h) if kind == "atap" else wall_pan(rgb(hexcode), w, h)
            save_jpeg(os.path.join(folder, base + ".jpeg"), arr)
            with open(os.path.join(folder, "meta.json"), "w", encoding="utf-8") as fh:
                json.dump({
                    "thumbnail": base + ".jpeg",
                    "name": "%s - %s" % (colour, variant),
                    "tags": [BRAND, CATEGORY, range_name, colour, hexcode,
                             "atap" if kind == "atap" else "dinding",
                             "tile %s cm" % cm],
                    "type": "material",
                    "category": CATEGORY,
                    "brand": BRAND,
                }, fh, ensure_ascii=False)
            written += 1
    print("Wrote %d folders, skipped %d existing." % (written, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
