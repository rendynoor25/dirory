#!/usr/bin/env python
"""
Extract the Marks ACP colour chart into the local sample library as materials.

Source: Materials/ACP/Marks/MARKS ACP 3mm.pdf — four raster pages, no text layer,
so the same split as the Jotaplast job:
  * the swatch IMAGES are cropped from the page (these are real finishes: wood,
    stone and brushed metal, not flat colours);
  * the CODE + NAME pairs are transcribed by eye into PAGES below.

ACP sizing. A panel is 1220 x 2440 mm (122 x 244 cm), joined with a ~12 mm open
joint. The plugin reads the tile size from the file name and adds its own fixed
3 mm, and the texture is expected to carry the joint on its top/left edge — so
each image here is the panel plus a 12 mm joint, and the file name carries the
module (panel + joint).

Usage
  python scripts/extract-marks-acp.py --dry-run
  python scripts/extract-marks-acp.py
"""

from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import unicodedata
import zlib

import fitz  # PyMuPDF
import numpy as np

LIBRARY = r"D:\Dirory\sample_library\Materials\ACP\Marks"
PDF = os.path.join(LIBRARY, "MARKS ACP 3mm.pdf")

PANEL_W_MM, PANEL_H_MM, JOINT_MM = 1220.0, 2440.0, 12.0
MODULE_W_CM = (PANEL_W_MM + JOINT_MM) / 10.0   # 123.2
MODULE_H_CM = (PANEL_H_MM + JOINT_MM) / 10.0   # 245.2
PX_PER_CM = 2.93                                # matches the existing tile images
JOINT_RGB = (32, 32, 32)                        # dark gasket, as ACP joints read

STYLE = "ACP"
BRAND = "Marks"

# Read from the chart pages (page 2 of the PDF onwards), row-major.
PAGES: dict[int, list[tuple[str, str]]] = {
    1: [
        ("HS401", "Carolina Oak"), ("HS402", "Carolina Beech"), ("HS403", "Grape Rose"),
        ("HS404", "Cherry Maple"), ("HS405", "Red Oak"), ("HS406", "Sedona Red"),
        ("HS407", "Sienna Wood"), ("HS408", "Expresso Wood"), ("HS409", "Ebony Wood"),
        ("HS410", "Red Chestnut"), ("HS411", "Golden Oak"), ("HS412", "Golden Pecan"),
        ("HS413", "Seaside Maple"), ("HS414", "Colonial Maple"), ("HS415", "Natural Maple"),
        ("HS416", "Savin Golden"), ("HS417", "Winter Golden"), ("HS418", "Hazel Bright"),
        ("HS419", "Ebony Oak"), ("HS420", "Horse Chestnut"), ("HS421", "Dark Walnut"),
    ],
    2: [
        ("HS501", "Georgia Granite"), ("HS502", "Rose Granite"), ("HS503", "Rainbow Granite"),
        ("HS504", "Brown Granite"), ("HS505", "Mahogany Granite"), ("HS506", "Sylvia Granite"),
        ("HS507", "Sierra Granite"), ("HS508", "Bianca Granite"), ("HS509", "Cherokee Marble"),
        ("HS510", "Pearl Granite"), ("HS511", "Alaska Granite"), ("HS512", "Sapphire Granite"),
        ("HS513", "Baltic Granite"), ("HS514", "Amber Granite"), ("HS515", "Canadian Granite"),
        ("HS516", "Vermont Marble"), ("HS517", "Marble Granite"), ("HS518", "Galaxy Marble"),
        ("HS519", "Pink Marble"), ("HS520", "Emerald Granite"), ("HS521", "White Granite"),
    ],
    3: [
        ("HS701", "Bright Silver"), ("HS703", "White"), ("HS737", "Red"),
        ("HS712", "Light Almond"), ("HS713", "Milk White"), ("HS717", "Metallic Black"),
        ("HS718", "China Grey"), ("HS755", "Black"), ("HS708", "Green"),
        ("HS731", "Light Green"), ("HS732", "Brilliant Orange"), ("HS738", "Cooper"),
        ("HS739", "Pearl Orange"), ("HS740", "Pink Rose"), ("HS741", "Brown"),
        ("HS742", "Coffee"), ("HS744", "Olive Brown"), ("HS745", "Yellow"),
        ("HS746", "Blue"), ("HS750", "Sparkling Purple"), ("HS751", "Sparkling Violet"),
    ],
    4: [
        ("HS601", "Brush Silver"), ("HS602", "Brush Gold"), ("HS603", "Brush Bronze"),
        ("HS604", "Brush Black"), ("HS605", "Brush Ruby"), ("HS606", "Brush Pink"),
        ("HS607", "Brush Ocean"), ("HS608", "Brush Grey"), ("HS726", "White Glossy"),
        ("HS730", "Blue Glossy"), ("HS723", "Yellow Glossy"), ("HS728", "Green Glossy"),
        ("HS705", "Red Glossy"), ("HS725", "Black Glossy"),
    ],
}


def ascii_safe(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def swatch_cells(page_pix, scale: float):
    """Find the swatch grid from background gaps.

    Earlier attempts looked for runs of "not background". That breaks on pale
    finishes, and it also picks up the label text lines as if they were swatch
    rows. Working the other way round is stable: a swatch row is a tall band that
    is not entirely background, and the gaps between swatches are columns that
    ARE background for the whole band.
    """
    arr = np.frombuffer(page_pix.samples, dtype=np.uint8).reshape(
        page_pix.height, page_pix.width, page_pix.n
    )[:, :, :3].astype(int)
    h, w = arr.shape[0], arr.shape[1]

    q = (arr // 8) * 8
    vals, counts = np.unique(q.reshape(-1, 3), axis=0, return_counts=True)
    bg = vals[counts.argmax()]
    is_bg = np.abs(arr - bg).max(axis=2) <= 25

    # A swatch row is mostly finish (three panels across ~75% of the width); a
    # label line is mostly paper. A density threshold separates them; testing for
    # "not entirely background" does not, because the labels between swatches are
    # not background either, so every band merges into one tall strip.
    frac = (~is_bg).sum(axis=1) / float(w)
    tall = frac > 0.45

    bands, start = [], None
    for y in range(h):
        if tall[y] and start is None:
            start = y
        elif not tall[y] and start is not None:
            bands.append((start, y))
            start = None
    if start is not None:
        bands.append((start, h - 1))

    # A pale finish can dip below the threshold mid-swatch and split its row in
    # two. Rejoin bands separated by a hairline, or each half fails the height
    # check and the whole row is lost.
    merged: list[tuple[int, int]] = []
    for b in bands:
        if merged and b[0] - merged[-1][1] <= int(10 * scale):
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(b)

    min_h, max_h = int(120 * scale / 3), int(340 * scale / 3)
    cells = []
    for (y0, y1) in merged:
        if not (min_h <= y1 - y0 <= max_h):
            continue
        # Gaps are columns that are background across the whole band.
        col_bg = is_bg[y0:y1].all(axis=0)
        runs, cs = [], None
        for x in range(w):
            if not col_bg[x] and cs is None:
                cs = x
            elif col_bg[x] and cs is not None:
                runs.append((cs, x))
                cs = None
        if cs is not None:
            runs.append((cs, w - 1))
        min_w = int(200 * scale / 3)
        runs = [r for r in runs if r[1] - r[0] >= min_w]
        if len(runs) < 2:          # the full-width black banner is not a swatch row
            continue
        for (x0, x1) in runs:
            cells.append((x0, y0, x1, y1))
    return sorted(cells, key=lambda c: (c[1] / 100, c[0])), bg


def build_face(crop, target_w, target_h):
    """Tile the swatch to the panel's aspect so the grain keeps its density."""
    src = np.frombuffer(crop.samples, dtype=np.uint8).reshape(crop.height, crop.width, crop.n)[:, :, :3]
    sh, sw = src.shape[0], src.shape[1]
    reps_y = max(1, int(np.ceil(target_h / sh)))
    reps_x = max(1, int(np.ceil(target_w / sw)))
    tiled = np.tile(src, (reps_y, reps_x, 1))[:target_h, :target_w]
    return np.ascontiguousarray(tiled)


def solid_png(path: str, arr: np.ndarray) -> None:
    """Write an RGB array as PNG.

    This PyMuPDF build rejects raw `samples` in the Pixmap constructor, so the
    bytes go out as PNG (zlib + struct, no dependencies) and PyMuPDF re-encodes
    that to JPEG. Writing JPEG directly would need an encoder we do not have.
    """
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


def write_texture(path: str, face: np.ndarray, joint_w: int, joint_h: int) -> None:
    """Panel finish plus a joint band on the top and left edges.

    The plugin adds its own joint allowance on the assumption that the image
    carries one, so the band is not decoration — without it the panels would
    butt together with no joint at all.
    """
    h, w = face.shape[0], face.shape[1]
    canvas = np.empty((h + joint_h, w + joint_w, 3), dtype=np.uint8)
    canvas[:, :] = JOINT_RGB
    canvas[joint_h:, joint_w:] = face
    tmp = path + ".png"
    solid_png(tmp, canvas)
    fitz.Pixmap(tmp).save(path, jpg_quality=88)
    os.remove(tmp)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    module_w = round(MODULE_W_CM * PX_PER_CM)
    module_h = round(MODULE_H_CM * PX_PER_CM)
    joint_w = max(2, round(module_w * JOINT_MM / (PANEL_W_MM + JOINT_MM)))
    joint_h = max(2, round(module_h * JOINT_MM / (PANEL_H_MM + JOINT_MM)))
    face_w, face_h = module_w - joint_w, module_h - joint_h
    print("module %.1f x %.1f cm -> %dx%d px (face %dx%d, joint %dpx)" % (
        MODULE_W_CM, MODULE_H_CM, module_w, module_h, face_w, face_h, joint_w))

    doc = fitz.open(PDF)
    total = 0
    written = skipped = 0
    problems = []

    for pageno, labels in PAGES.items():       # chart pages start at PDF page 2
        page = doc[pageno]
        scale = 3.0
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        cells, _bg = swatch_cells(pix, scale)
        print("\npage %d: %d cells detected, %d labels read" % (pageno + 1, len(cells), len(labels)))
        if len(cells) != len(labels):
            problems.append("page %d: %d cells vs %d labels" % (pageno + 1, len(cells), len(labels)))
        for (x0, y0, x1, y1), (code, name) in zip(cells, labels):
            total += 1
            inset = max(2, int(3 * scale))
            clip = fitz.Rect((x0 + inset) / scale, (y0 + inset) / scale,
                             (x1 - inset) / scale, (y1 - inset) / scale)
            crop = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip)
            if crop.width < 30 or crop.height < 20:
                problems.append("%s: crop too small (%dx%d)" % (code, crop.width, crop.height))
                continue
            safe_name = ascii_safe(name)
            # Integer size in the file name: the uploader's parser only accepts
            # 2-3 digit integers, and the plugin reads the same figure back. The
            # exact module (123.2 x 245.2) is recorded in the tags instead.
            base = "%s - %s %dx%d" % (code, safe_name, round(MODULE_W_CM), round(MODULE_H_CM))
            folder = os.path.join(LIBRARY, base)
            if args.dry_run:
                print("   %-8s %-20s %s" % (code, name, base))
                continue
            if os.path.isdir(folder) and not args.force:
                skipped += 1
                continue
            os.makedirs(folder, exist_ok=True)
            face = build_face(crop, face_w, face_h)
            write_texture(os.path.join(folder, base + ".jpeg"), face, joint_w, joint_h)
            with open(os.path.join(folder, "meta.json"), "w", encoding="utf-8") as fh:
                json.dump({
                    "thumbnail": base + ".jpeg",
                    "name": name,
                    "tags": ["Marks", "ACP", code, name,
                             "panel 122x244 cm", "joint 12 mm",
                             "module 123.2x245.2 cm"],
                    "type": "material",
                    "category": "ACP",
                    "brand": BRAND,
                }, fh, ensure_ascii=False)
            written += 1
    doc.close()

    print("\nswatches: %d   written: %d   skipped: %d" % (total, written, skipped))
    for p in problems:
        print("  PROBLEM:", p)
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
