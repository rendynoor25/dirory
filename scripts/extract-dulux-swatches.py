#!/usr/bin/env python
"""
Extract Dulux colour swatches into the material library.

Two sources, both under Materials/Paint/Dulux:

  dulux-e-colourcard-interior-2020.pdf      structured: every swatch is a vector
                                            rectangle with its colour name and
                                            code printed underneath, so the name
                                            and code come straight from the text
                                            layer and the colour is sampled from
                                            the page.
  dulux-colour-futures-2025-colour-card.pdf a bitmap: one image per page, no text
                                            layer at all. Its captions were read
                                            off the rendered pages once and are
                                            kept in scripts/data/ — the colour is
                                            still sampled from the page, never
                                            typed in.

Both cards are published by Dulux Indonesia and overlap heavily. Where they do,
the structured card wins: its strings come from a text layer rather than from
reading a bitmap, and it is the card that matches the names these colours are
sold under.

Output follows the existing paint convention (see Nippon/Propan/Jotun):

  Materials/Paint/Dulux/<code> - <name>/<code> - <name> - flat.jpeg   256x256
  Materials/Paint/Dulux/<code> - <name>/meta.json

Usage
  python scripts/extract-dulux-swatches.py --report      # list, write nothing
  python scripts/extract-dulux-swatches.py               # write the library
  python scripts/extract-dulux-swatches.py --only-structured
"""

from __future__ import annotations

import argparse
import json
import os
import re
import struct
import sys
import unicodedata
import zlib

import fitz
import numpy as np

LIBRARY = r"D:\Dirory\sample_library\Materials\Paint\Dulux"
STRUCTURED_PDF = "dulux-e-colourcard-interior-2020.pdf"
FUTURES_PDF = "dulux-colour-futures-2025-colour-card.pdf"
FUTURES_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "data", "dulux-colour-futures.json")
BRAND = "Dulux"
CATEGORY = "Paint"

# Swatches on the structured card: pages 2-3-4 are 99.2x56.7pt, page 5 is
# 85.0x42.5pt. Nothing else on those pages falls in this range.
SWATCH_MIN_W, SWATCH_MAX_W = 70, 110
SWATCH_MIN_H, SWATCH_MAX_H = 30, 65
ZOOM = 4.0                     # render scale for the structured card
FUTURES_DPI = 300.0            # the bitmap card's data is in 300 DPI pixels
PATCH = 7                      # half-size of the sampled patch, in pixels
NEAR_DUP = 10                  # per-channel tolerance when collapsing duplicates


def sanitise(text: str) -> str:
    """Filename-safe, and de-ligatured: the PDFs use 'ﬁ'/'ﬂ' glyphs."""
    out = unicodedata.normalize("NFKC", text)
    for ch in '/\\:*?"<>|':
        out = out.replace(ch, "-")
    out = re.sub(r"\s+", " ", out).strip()
    return re.sub(r"[\s\-.]+$", "", out).strip("- ")


def sample(arr: np.ndarray, x: float, y: float) -> tuple[int, int, int]:
    """Median colour of a small patch, so a soft edge or grain cannot skew it."""
    xi, yi = int(round(x)), int(round(y))
    a = arr[max(0, yi - PATCH):yi + PATCH + 1, max(0, xi - PATCH):xi + PATCH + 1]
    med = np.median(a.reshape(-1, a.shape[-1])[:, :3], axis=0)
    return tuple(int(round(v)) for v in med)


def render(page, scale: float) -> np.ndarray:
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)


# --------------------------------------------------------------------------
# The structured card
# --------------------------------------------------------------------------

def structured_page(doc, pno: int) -> list[dict]:
    """Read one page: colour + name + code per swatch."""
    page = doc[pno]
    arr = render(page, ZOOM)

    seen: dict[tuple[float, float], fitz.Rect] = {}
    for dr in page.get_drawings():
        r = dr["rect"]
        if (dr.get("fill") and SWATCH_MIN_W < r.width < SWATCH_MAX_W
                and SWATCH_MIN_H < r.height < SWATCH_MAX_H):
            seen[(round(r.x0, 1), round(r.y0, 1))] = r

    spans = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                text = span["text"].strip()
                if text:
                    spans.append((tuple(span["bbox"]), text, round(span["size"], 1)))

    items = []
    for rect in seen.values():
        # The caption sits directly under the swatch, left-aligned with it:
        # the name first, then the code on the next line.
        captions = [s for s in spans
                    if abs(s[0][0] - rect.x0) < 4 and (rect.y1 - 8) < s[0][1] < (rect.y1 + 12)]
        captions.sort(key=lambda s: s[0][1])
        if not captions:
            continue
        items.append({"name": captions[0][1],
                      "code": captions[1][1] if len(captions) > 1 else "",
                      "rgb": sample(arr, (rect.x0 + rect.width / 2) * ZOOM,
                                    (rect.y0 + rect.height / 2) * ZOOM)})
    return items


# --------------------------------------------------------------------------
# The bitmap card
# --------------------------------------------------------------------------

def futures_items() -> list[dict]:
    with open(FUTURES_DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    doc = fitz.open(os.path.join(LIBRARY, FUTURES_PDF))
    scale = FUTURES_DPI / 72.0
    items = []
    for spec in data["pages"]:
        page = doc[spec["page"] - 1]
        arr = render(page, scale)
        off = data["layouts"][spec["layout"]]
        for name, code, x, y in spec["items"]:
            items.append({"name": name, "code": code,
                          "rgb": sample(arr, x + off["dx"], y + off["dy"]),
                          "src": "futures p%d" % spec["page"]})
        print("page %-2d (%s): %3d swatches" % (spec["page"], spec["layout"], len(spec["items"])))
    doc.close()
    return items


# --------------------------------------------------------------------------
# Writing the library
# --------------------------------------------------------------------------

def write_png(path: str, arr: np.ndarray) -> None:
    h, w, _ = arr.shape
    raw = b"".join(b"\x00" + arr[y].tobytes() for y in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n"
                 + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                 + chunk(b"IDAT", zlib.compress(raw, 9))
                 + chunk(b"IEND", b""))


def write_flat(path: str, rgb: tuple[int, int, int], size: int = 256) -> None:
    flat = np.zeros((size, size, 3), dtype=np.uint8)
    flat[:, :] = rgb
    tmp = path + ".png"
    write_png(tmp, flat)
    fitz.Pixmap(tmp).save(path, jpg_quality=92)
    os.remove(tmp)


def item_key(item: dict) -> tuple[str, str]:
    return sanitise(item["code"]) or "no-code", sanitise(item["name"])


def write_item(item: dict, force: bool) -> bool:
    code, name = item_key(item)
    base = "%s - %s" % (code, name)
    folder = os.path.join(LIBRARY, base)
    image = os.path.join(folder, base + " - flat.jpeg")
    if os.path.exists(image) and not force:
        return False
    os.makedirs(folder, exist_ok=True)
    write_flat(image, item["rgb"])
    with open(os.path.join(folder, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump({"thumbnail": base + " - flat.jpeg", "name": name,
                   "tags": [BRAND, CATEGORY, code, name],
                   "type": "material", "category": CATEGORY, "brand": BRAND},
                  fh, ensure_ascii=False)
    return True


def merge(items: list[dict]) -> tuple[list[dict], list[str]]:
    """One material per code.

    The two cards overlap heavily and print the same code for the same colour,
    so a later item is dropped when its code is already taken. Structured items
    are merged first: their names come from a text layer rather than from reading
    a bitmap, and they match the names these colours are sold under.
    """
    kept: dict[str, dict] = {}
    dropped = []
    for it in items:
        key = item_key(it)
        if key in kept:
            dropped.append(key[0] + " - " + key[1])
            continue
        kept[key] = it
    return list(kept.values()), dropped


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="print what would be written")
    ap.add_argument("--page", type=int, help="only this page of the structured card")
    ap.add_argument("--only-structured", action="store_true", help="skip the bitmap card")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    items: list[dict] = []
    doc = fitz.open(os.path.join(LIBRARY, STRUCTURED_PDF))
    for pno in ([args.page - 1] if args.page else range(doc.page_count)):
        got = structured_page(doc, pno)
        if got:
            print("page %-2d (structured): %3d swatches" % (pno + 1, len(got)))
            items.extend(got)
    doc.close()

    if not args.only_structured:
        items.extend(futures_items())

    unique, dropped = merge(items)
    print("\nread %d swatches; %d after de-duplication" % (len(items), len(unique)))
    for d in dropped:
        print("   dropped: %s" % d)

    if args.report:
        for it in sorted(unique, key=item_key):
            code, name = item_key(it)
            print("   %-42s #%02X%02X%02X   %s" % (code + " - " + name, *it["rgb"],
                                                   it.get("src", "structured")))
        return 0

    written = skipped = 0
    for it in unique:
        if write_item(it, args.force):
            written += 1
        else:
            skipped += 1
    print("wrote %d materials, skipped %d already present" % (written, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
