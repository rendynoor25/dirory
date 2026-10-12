#!/usr/bin/env python
"""
Extract Roman Ceramics tiles from the two e-booklets into the local library.

    Materials/Tiles/Roman/280823_30x60Revamp_Roman_E-Booklet.pdf   (Revamp, 2023)
    Materials/Tiles/Roman/E-Booklet_Grande_2024_281223.pdf         (Grande, 2024)

These PDFs are unlike the Jotaplast and Marks charts: they have a real text layer
and the swatches are embedded images, so nothing is read by eye and nothing is
cropped. Each product is:

    a code line   W63528T          (also G..., GT..., GTB...)
    a name line   dCopenhagen Chiaro
    an image      the tile face, already at the tile's aspect ratio

Pairing is positional: the swatch is the image whose box sits directly above the
code and whose left edge lines up with it. The tile size comes from the nearest
size token above the product (`dDanby | 30x60`, `120x60 | POLISHED GLOSSY`).

Usage
  python scripts/extract-roman-tiles.py --dry-run
  python scripts/extract-roman-tiles.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata

import fitz  # PyMuPDF

LIBRARY = r"D:\Dirory\sample_library\Materials\Tiles\Roman"
BRAND = "ROMAN"          # matches the vendor already in the catalogue
CATEGORY = "Tiles"       # matches the folder and the existing category
PDFS = ["280823_30x60Revamp_Roman_E-Booklet.pdf", "E-Booklet_Grande_2024_281223.pdf"]

CODE_RE = re.compile(r"^[WG][A-Z0-9]{5,16}$")
SIZE_RE = re.compile(r"\b(\d{2,3})\s*x\s*(\d{2,3})\b", re.IGNORECASE)


def ascii_safe(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def lines_of(page):
    out = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(sp["text"] for sp in line["spans"]).strip()
            if text:
                out.append({"text": text, "x": line["bbox"][0], "y": line["bbox"][1],
                            "y1": line["bbox"][3]})
    return out


def is_code(text: str) -> bool:
    if not CODE_RE.match(text):
        return False
    return sum(ch.isdigit() for ch in text) >= 5


def extract_pdf(path: str):
    doc = fitz.open(path)
    products, notes = [], []
    for pno in range(doc.page_count):
        page = doc[pno]
        lines = lines_of(page)
        imgs = [i for i in page.get_image_info(xrefs=True) if i.get("xref")]
        codes = [l for l in lines if is_code(l["text"])]
        if not codes:
            continue
        sizes = [(float(m.group(1)), float(m.group(2)), l["y"])
                 for l in lines for m in [SIZE_RE.search(l["text"])] if m]
        sizes.sort(key=lambda s: s[2])

        for code in codes:
            # name: the next line below, left-aligned with the code
            cands = [l for l in lines
                     if l["y"] > code["y"] - 1 and l["y"] < code["y"] + 22
                     and abs(l["x"] - code["x"]) < 4 and not is_code(l["text"])]
            cands.sort(key=lambda l: l["y"])
            name = cands[0]["text"] if cands else ""

            # On a mixed-size page the cell reads "Vivaz White | 30x30": the name
            # and its size share one line, and the generic "nearest size above"
            # rule then picks the wrong size for the second entry on the page.
            inline_size = None
            if "|" in name:
                head, _, tail = name.partition("|")
                m = SIZE_RE.search(tail)
                if m:
                    inline_size = (float(m.group(1)), float(m.group(2)))
                name = head.strip()

            # image: left-aligned, bottom closest above the code line
            above = [i for i in imgs
                     if abs(i["bbox"][0] - code["x"]) < 6 and i["bbox"][3] <= code["y"] + 2]
            above.sort(key=lambda i: -i["bbox"][3])
            image = above[0] if above else None

            # size: the line's own size, else the nearest size token above
            if inline_size:
                size = inline_size
            else:
                prev = [s for s in sizes if s[2] <= code["y"] + 2]
                size = (prev[-1][0], prev[-1][1]) if prev else None

            if not name or image is None or size is None:
                notes.append("p%d %s: name=%r image=%s size=%s" % (
                    pno + 1, code["text"], name, image is not None, size))
                continue
            products.append({
                "code": code["text"], "name": name,
                "w": int(size[0]), "h": int(size[1]),
                "xref": image["xref"], "page": pno + 1, "pdf": os.path.basename(path),
                "img_w": image.get("width"), "img_h": image.get("height"),
            })
    doc.close()
    return products, notes


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    all_products, all_notes = [], []
    for name in PDFS:
        found, notes = extract_pdf(os.path.join(LIBRARY, name))
        print("%-46s %d products" % (name, len(found)))
        all_products += found
        all_notes += [name[:12] + " " + n for n in notes]

    # de-duplicate by code, keeping the largest source image
    best: dict[str, dict] = {}
    for p in all_products:
        cur = best.get(p["code"])
        if cur is None or (p["img_w"] or 0) * (p["img_h"] or 0) > (cur["img_w"] or 0) * (cur["img_h"] or 0):
            best[p["code"]] = p
    print("\nproducts: %d   unique codes: %d" % (len(all_products), len(best)))

    # always show what could not be paired, and a sample of what could
    for n in all_notes[:12]:
        print("  UNPAIRED:", n)
    for p in list(best.values())[:6]:
        print("  %-16s %-32s %dx%d  img %sx%s" % (
            p["code"], p["name"][:32], p["w"], p["h"], p["img_w"], p["img_h"]))

    if args.dry_run:
        print("\n(dry run — nothing written)")
        return 0

    written = skipped = 0
    for code, p in best.items():
        safe = ascii_safe(p["name"])
        base = "%s - %s %dx%d" % (code, safe, p["w"], p["h"])
        folder = os.path.join(LIBRARY, base)
        if os.path.isdir(folder) and not args.force:
            skipped += 1
            continue
        os.makedirs(folder, exist_ok=True)
        doc = fitz.open(os.path.join(LIBRARY, p["pdf"]))
        raw = doc.extract_image(p["xref"])
        ext = raw["ext"] if raw["ext"] in ("jpeg", "jpg", "png") else "png"
        with open(os.path.join(folder, "%s.%s" % (base, ext)), "wb") as fh:
            fh.write(raw["image"])
        doc.close()
        with open(os.path.join(folder, "meta.json"), "w", encoding="utf-8") as fh:
            json.dump({
                "thumbnail": "%s.%s" % (base, ext),
                "name": p["name"],
                "tags": [BRAND, CATEGORY, code, p["name"]],
                "type": "material",
                "category": CATEGORY,
                "brand": BRAND,
            }, fh, ensure_ascii=False)
        written += 1
    print("Wrote %d folders, skipped %d existing." % (written, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
