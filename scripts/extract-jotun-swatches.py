#!/usr/bin/env python
"""
Extract Jotun paint swatches from the colour-chart PDFs into the local sample
library, in the same shape the rest of the library uses:

    Materials/Paint/Jotun/<CODE> - <Name>/
        <CODE> - <Name> - flat.jpeg     256x256 solid colour
        meta.json                       brand "Jotun", category "Paint"

Why Python: the PDFs need a real PDF reader. PyMuPDF gives the vector swatch
fill colours directly, so the swatch colour is *exact* rather than eyeballed.
This is the only Python in the repository; the Node tooling does the uploading
(scripts/upload-library.mjs), so nothing else depends on it.

Sources
  nuances-2025-indonesia.pdf    26 pages, vector swatches + a text layer.
                                Pages 12-14 hold 12 + 12 + 6 labelled colours,
                                paired by position with their fill colour.
  jotaplast-colour-chart-*.pdf  2 raster pages. Page 2 is a full chart with no
                                text layer; those labels cannot be read
                                programmatically, so this script does NOT
                                invent them. Only Nuances is generated.

Usage
  python scripts/extract-jotun-swatches.py --dry-run
  python scripts/extract-jotun-swatches.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata

import fitz  # PyMuPDF

LIBRARY = r"D:\Dirory\sample_library\Materials\Paint\Jotun"
NUANCES = "nuances-2025-indonesia.pdf"
LABEL = re.compile(r"JOTUN\s+(\d+)\s+(.+)$", re.IGNORECASE)

# The PDF's encoding mangles a few letters (its "MALMÖ" arrives as "MALM\x9d").
# Repair by code rather than guessing from the broken string.
NAME_FIXES = {"8124": "Malmö"}

PAGES = (11, 12, 13)  # zero-based: pages 12, 13, 14


def title_case(name: str) -> str:
    """Chart labels are SHOUTED; the rest of the library is Title Case."""
    small = {"and", "of", "the", "in", "on", "a", "to"}
    words = []
    for i, w in enumerate(name.split()):
        lw = w.lower()
        if i and lw in small:
            words.append(lw)
        elif "-" in w:  # keep hyphenated parts capitalised: "Demi-Rosa"
            words.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
        else:
            words.append(w[:1].upper() + w[1:].lower())
    return " ".join(words)


def ascii_safe(text: str) -> str:
    """Transliterate to ASCII for the folder and file names.

    Supabase Storage rejects non-ASCII object keys ("Invalid key: ... 8124 -
    Malmö - flat.jpeg"), and for materials the *file name* is what the uploader
    uses as the catalogue name. So 'Malmö' is stored as 'Malmo' on disk; the
    accented form survives in meta.json, which is data, not a key.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    return decomposed.encode("ascii", "ignore").decode("ascii")


def broken_encoding(name: str) -> bool:
    """True only for *mangled* text.

    A name may legitimately contain accented letters ("Malmö"), so plain
    non-ASCII is not a problem. What matters is the C1 control range and the
    replacement character, which is what a mis-decoded PDF glyph looks like.
    """
    return any(0x80 <= ord(ch) <= 0x9F or ch == "\ufffd" for ch in name)


def extract() -> list[dict]:
    doc = fitz.open(os.path.join(LIBRARY, NUANCES))
    out: list[dict] = []
    for pno in PAGES:
        page = doc[pno]
        swatches = []
        for d in page.get_drawings():
            if d.get("fill") is None:
                continue
            r = d["rect"]
            if r.width >= 25 and r.height >= 25:
                swatches.append(
                    {"fill": d["fill"], "cx": (r.x0 + r.x1) / 2, "cy": (r.y0 + r.y1) / 2}
                )

        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                text = "".join(sp["text"] for sp in line["spans"]).strip()
                m = LABEL.match(text)
                if not m:
                    continue
                bbox = fitz.Rect(line["bbox"])
                cx, cy = (bbox.x0 + bbox.x1) / 2, (bbox.y0 + bbox.y1) / 2
                if not swatches:
                    raise RuntimeError("no swatches on page %d" % (pno + 1))
                best = min(swatches, key=lambda s: (s["cx"] - cx) ** 2 + (s["cy"] - cy) ** 2)
                r, g, b = best["fill"][:3]
                code = m.group(1)
                name = NAME_FIXES.get(code) or title_case(m.group(2).strip())
                out.append(
                    {
                        "code": code,
                        "name": name,
                        "rgb": (round(r * 255), round(g * 255), round(b * 255)),
                        "page": pno + 1,
                    }
                )
    doc.close()
    return out


def solid_jpeg(path: str, rgb: tuple[int, int, int], size: int = 256) -> None:
    """A 256x256 flat swatch, matching the existing Paint samples (~1 KB).

    Filled with `set_rect` rather than by hand-building the sample buffer: the
    Pixmap constructor's third positional argument is `alpha`, not `samples`, so
    passing bytes there produces a very noisy failure.
    """
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, size, size))
    pix.set_rect(pix.irect, rgb)
    pix.save(path, jpg_quality=90)


def meta(code: str, name: str) -> dict:
    safe_name = ascii_safe(name)
    base = "%s - %s" % (code, safe_name)
    return {
        "thumbnail": base + " - flat.jpeg",
        "name": name,
        "tags": ["Jotun", "Paint", code, name],
        "type": "material",
        "category": "Paint",
        "brand": "Jotun",
    }


def main() -> int:
    # The Windows console defaults to a legacy codepage and turns "ö" into a
    # question mark, which then looks exactly like a decoding failure.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="overwrite existing folders")
    args = ap.parse_args()

    colours = extract()
    print("Extracted %d Nuances colours:" % len(colours))
    for c in colours:
        bad = broken_encoding(c["name"])
        flag = "  <-- MANGLED, refusing" if bad else ""
        print("  %-8s %-22s #%02X%02X%02X  p%d%s" % (c["code"], c["name"], *c["rgb"], c["page"], flag))
        if bad:
            print("     code %s: %r" % (c["code"], c["name"]), file=sys.stderr)
            return 1

    if args.dry_run:
        print("\n(dry run — nothing written)")
        return 0

    written = skipped = 0
    for c in colours:
        safe_name = ascii_safe(c["name"])
        base = "%s - %s" % (c["code"], safe_name)
        folder = os.path.join(LIBRARY, base)
        if os.path.isdir(folder) and not args.force:
            skipped += 1
            continue
        os.makedirs(folder, exist_ok=True)
        solid_jpeg(os.path.join(folder, base + " - flat.jpeg"), c["rgb"])
        with open(os.path.join(folder, "meta.json"), "w", encoding="utf-8") as fh:
            json.dump(meta(c["code"], c["name"]), fh, ensure_ascii=False)
        if safe_name != c["name"]:
            print("  note: '%s' stored as '%s' (Storage keys must be ASCII)" % (c["name"], safe_name))
        written += 1
    print("\nWrote %d folders, skipped %d existing." % (written, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
