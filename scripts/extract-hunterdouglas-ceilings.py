#!/usr/bin/env python
"""
Extract the Hunter Douglas ceiling patterns into the local sample library.

Source: vendor-sources/Commercial-Ceilings-and-Walls-Product-Guide-2019-and-2020.pdf
(404 pages). The "Resources" pages at the back are the reference sheets every
product page points to ("See page 390 for all perforation patterns"):

  PDF p.392-393  Woodgrain / veneer finishes  - raster swatches with captions
  PDF p.394      Perforation patterns, metal  - VECTOR drawings at 1:1 (or 1:4)
                 Stretch metal meshes         - raster photos at 1:4
  PDF p.395      Perforation patterns, wood   - VECTOR drawings at 1:5 / 1:1

Perforations are rebuilt, not cropped. A crop of the drawing does not tile, and
a ceiling texture must. The hole centres are read from the drawing, their
lattice is found (two shortest independent steps), and the smallest
rectangular repeat of that lattice is rendered at true scale, repeated until it
lands on a whole number of centimetres (the uploader reads the size from the
name). Diameter and pitch therefore come from the drawing itself; the printed
spec is kept in the tags as a cross-check. Clustered or irregular patterns,
which have no single lattice, are reported and skipped.

Stretch-metal photos are small (137 x 66 px for ~14 x 7 cm), so each is
mirror-tiled 2 x 2: an expanded-metal mesh is symmetric, so the mirror is
invisible and the result tiles without a seam. Woodgrain swatches are cropped
per swatch and book-matched side to side (mirrored once, horizontally). Their real
scale is not printed; a 30 cm wide repeat is assumed and recorded in the tags.

Output: sample_library/Materials/Ceiling/Hunter Douglas/<CODE - Name WxH>/
        <same>.jpeg + meta.json   (the layout scripts/upload-library.mjs reads)

Usage
  python scripts/extract-hunterdouglas-ceilings.py --dry-run
  python scripts/extract-hunterdouglas-ceilings.py
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import os
import re
import sys

import numpy as np
import pymupdf

PDF = r"D:\Dirory\vendor-sources\Commercial-Ceilings-and-Walls-Product-Guide-2019-and-2020.pdf"
LIBRARY = r"D:\Dirory\sample_library\Materials\Ceiling\Hunter Douglas"
BRAND = "Hunter Douglas"
CATEGORY = "Ceiling"

MM_PER_PT = 25.4 / 72.0
PANEL_RGB = (238, 237, 232)   # RAL 9010-ish pure white, as the guide's standard
WOOD_PANEL_RGB = (196, 160, 112)  # light oak veneer for the wood tiles
HOLE_RGB = (40, 40, 42)       # the dark plenum seen through the holes
PX_PER_MM = 6.0               # perforation texture resolution
WOOD_TILE_CM = 30             # assumed real size of one mirrored woodgrain tile

WOOD_PAGES = (392, 393)       # 1-based
METAL_PAGE = 394
WOOD_PERF_PAGE = 395


def ascii_safe(text: str) -> str:
    text = text.replace("\u00d8", "").replace("\u00ae", "").replace("\u2122", "")
    return re.sub(r"[^A-Za-z0-9 .&'()-]+", " ", text).strip()


def save_jpeg(path: str, rgb: np.ndarray) -> None:
    rgb = np.ascontiguousarray(rgb.astype(np.uint8))
    h, w, _ = rgb.shape
    pix = pymupdf.Pixmap(pymupdf.csRGB, w, h, rgb.tobytes(), False)
    with open(path, "wb") as fh:
        fh.write(pix.tobytes("jpg", jpg_quality=90))


def mirror_tile(img: np.ndarray) -> np.ndarray:
    top = np.concatenate([img, img[:, ::-1]], axis=1)
    return np.concatenate([top, top[::-1, :]], axis=0)


def page_pixels(page, scale: float) -> np.ndarray:
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]


def words(page):
    return [(w[0], w[1], w[2], w[3], w[4]) for w in page.get_text("words")]


# ---------------------------------------------------------------------------
# Woodgrain / veneer
# ---------------------------------------------------------------------------

# The captions on these two pages are part of the raster, not text, so they
# are transcribed here (row-major, as printed) and checked against the number
# of swatch cells found on each page.
WOOD_LABELS = {
    392: [
        ("50107", "Bamboo Skin", "Woodgrain"), ("50108", "Bamboo Skin", "Woodgrain"),
        ("50159", "Bamboo Skin", "Woodgrain"), ("50163", "Bamboo Skin", "Woodgrain"),
        ("50170", "Bamboo Skin", "Woodgrain"), ("50202", "Zebra Wood", "Woodgrain"),
        ("50203", "Pear Wood", "Woodgrain"), ("50207", "Pear Wood", "Woodgrain"),
        ("50213", "Pear Wood", "Woodgrain"), ("50236", "Pear Wood", "Woodgrain"),
        ("50253", "Teak", "Woodgrain"), ("50254", "White Cork", "Woodgrain"),
        ("50264", "Red Rose", "Woodgrain"), ("50301", "Teak", "Woodgrain"),
        ("50314", "Wood", "Woodgrain"), ("50318", "Teak", "Woodgrain"),
        ("50336", "Black Walnut", "Woodgrain"), ("50337", "Black Walnut", "Woodgrain"),
        ("50344", "Teak", "Woodgrain"), ("50345", "Pear Wood", "Woodgrain"),
        ("50401", "Ebony", "Woodgrain"), ("50423", "Teak", "Woodgrain"),
        ("50426", "Teak", "Woodgrain"), ("50602", "Teak", "Woodgrain"),
        ("50610", "Bamboo Skin", "Woodgrain"), ("50613", "Bamboo Skin", "Woodgrain"),
        ("50621", "Teak", "Woodgrain"), ("50628", "Black Oak", "Woodgrain"),
        ("50635", "Oak", "Woodgrain"), ("50648", "Golden Maple", "Woodgrain"),
        ("50649", "Teak", "Woodgrain"), ("50651", "Teak", "Woodgrain"),
        ("50103", "Bamboo Skin", "VX Woodgrain"), ("50105", "Bamboo Skin", "VX Woodgrain"),
        ("50302", "Teak", "VX Woodgrain"),
        ("50320", "Teak", "PVDF"), ("51301", "Teak", "PVDF"), ("51302", "Teak", "PVDF"),
        ("51320", "Catalpa Wood", "PVDF"), ("51603", "Walnut", "PVDF"),
        ("51604", "Black Walnut", "PVDF"), ("50113", "Bamboo Skin", "F2"),
        ("51405", "Teak", "F2"),
    ],
    393: [
        ("50902", "Magri Wood", "Veneer"), ("50903", "Cherry Wood", "Veneer"),
        ("50904", "Black Walnut", "Veneer"), ("50905", "Ash", "Veneer"),
        ("50906", "Pear", "Veneer"), ("50907", "Rosewood", "Veneer"),
        ("50908", "Golden Silk Pomelo", "Veneer"), ("50909", "Red Oak", "Veneer"),
        ("50910", "Red Walnut", "Veneer"), ("50911", "Bamboo Skin", "Veneer"),
        ("50912", "Wash White Oak", "Veneer"),
        ("50913", "Black Walnut", "Engineered Veneer"), ("50914", "Black Walnut", "Engineered Veneer"),
        ("50915", "Black Walnut", "Engineered Veneer"), ("50916", "Ash", "Engineered Veneer"),
        ("50917", "Ebony", "Engineered Veneer"), ("50918", "Cherry Wood", "Engineered Veneer"),
        ("50919", "Apple Wood", "Engineered Veneer"), ("50920", "Silver Pear", "Engineered Veneer"),
        ("50921", "Pear", "Engineered Veneer"), ("50922", "Teak", "Engineered Veneer"),
    ],
}


def runs(row: np.ndarray, min_len: int):
    """[start, end) of True runs at least min_len long."""
    out, start = [], None
    for i, v in enumerate(list(row) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def swatch_cells(px: np.ndarray, scale: float):
    """Swatch squares (>= 30 pt) in reading order, from runs of non-white."""
    mask = px.min(axis=2) < 232
    mask[:, int(520 * scale):] = False  # the green "Resources" tab down the edge
    min_len = int(30 * scale)
    long_rows = np.array([bool(runs(mask[y], min_len)) for y in range(mask.shape[0])])
    cells = []
    for (y0, y1) in runs(long_rows, min_len):
        mid = (y0 + y1) // 2
        for (x0, x1) in runs(mask[mid], min_len):
            if x1 - x0 < 30 * scale or x1 - x0 > 70 * scale:
                continue  # skip the wide green rules and headers
            cells.append((x0, y0, x1, y1))
    return cells


def wood_swatches(doc):
    """Yield (code, name, finish, rgb crop) per swatch, or raise on a mismatch."""
    scale = 4.0
    for pno, labels in WOOD_LABELS.items():
        px = page_pixels(doc[pno - 1], scale)
        cells = swatch_cells(px, scale)
        if len(cells) != len(labels):
            raise SystemExit("page %d: %d swatch cells but %d labels" % (pno, len(cells), len(labels)))
        for (x0, y0, x1, y1), (code, name, finish) in zip(cells, labels):
            inset = int(1.5 * scale)
            yield code, name, finish, px[y0 + inset:y1 - inset, x0 + inset:x1 - inset]


# ---------------------------------------------------------------------------
# Perforations (vector)
# ---------------------------------------------------------------------------

def circles(page):
    out = []
    for d in page.get_drawings():
        items = d["items"]
        r = d["rect"]
        if items and all(i[0] == "c" for i in items) and abs(r.width - r.height) < 0.15 and r.width < 40:
            out.append(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.width))
    return out


def frames(page):
    """The thin grey square each pattern is drawn in."""
    out = []
    for d in page.get_drawings():
        r = d["rect"]
        if len(d["items"]) == 1 and d["items"][0][0] == "re" and 25 < r.width < 120 and abs(r.width - r.height) < 3:
            out.append(r)
    return out


def lattice(points: list[tuple[float, float]], tol: float):
    """Two independent short steps that generate (nearly) every point.

    Drawings carry the odd extra circle (a dimension marker), so the basis
    that explains the most holes wins, provided it explains 75% of them.
    """
    if len(points) < 3:
        return None
    vecs = []
    for (ax, ay), (bx, by) in itertools.combinations(points, 2):
        v = (bx - ax, by - ay)
        if v[1] < -tol or (abs(v[1]) <= tol and v[0] < 0):
            v = (-v[0], -v[1])
        vecs.append(v)
    vecs.sort(key=lambda v: math.hypot(*v))
    short = vecs[:12]
    best = None
    for v1 in short:
        if math.hypot(*v1) < tol * 3:
            continue
        for v2 in short:
            det = v1[0] * v2[1] - v1[1] * v2[0]
            if abs(det) < tol * math.hypot(*v1) * 2:
                continue
            for (ox, oy) in points[:6]:
                fit = 0
                for (x, y) in points:
                    dx, dy = x - ox, y - oy
                    i = (dx * v2[1] - dy * v2[0]) / det
                    j = (v1[0] * dy - v1[1] * dx) / det
                    if abs(i - round(i)) < 0.08 and abs(j - round(j)) < 0.08:
                        fit += 1
                area = abs(det)
                # More holes explained first; then the smaller (primitive) cell.
                key = (fit, -area)
                if best is None or key > best[0]:
                    best = (key, v1, v2)
    if best is None or best[0][0] < 0.75 * len(points):
        return None
    return best[1], best[2]


def rect_repeat(v1, v2, tol: float):
    """Smallest W, H such that (W,0) and (0,H) are lattice vectors."""
    W = H = None
    for i in range(-8, 9):
        for j in range(-8, 9):
            x = i * v1[0] + j * v2[0]
            y = i * v1[1] + j * v2[1]
            if abs(y) <= tol and x > tol and (W is None or x < W - tol):
                W = x
            if abs(x) <= tol and y > tol and (H is None or y < H - tol):
                H = y
    return W, H


def whole_cm(period_mm: float, minimum_mm: float = 100.0):
    """Repeat count whose length is a whole number of cm, within 0.4%."""
    best = None
    for n in range(1, 400):
        length = n * period_mm
        if length < minimum_mm:
            continue
        cm = round(length / 10.0)
        if cm > 999:
            break
        err = abs(length - cm * 10.0) / length
        if err < 0.004:
            return n, cm
        if best is None or err < best[2]:
            best = (n, cm, err)
    return (best[0], best[1]) if best else (1, max(1, round(period_mm / 10)))


def render_perforation(v1, v2, W, H, d_mm, nx, ny, panel_rgb=PANEL_RGB):
    """Seamless texture: nx*W by ny*H mm of panel with holes of d_mm."""
    w_px = max(8, round(nx * W * PX_PER_MM))
    h_px = max(8, round(ny * H * PX_PER_MM))
    sx = w_px / (nx * W)
    sy = h_px / (ny * H)
    ss = 3  # supersampling for clean edges
    yy, xx = np.mgrid[0:h_px * ss, 0:w_px * ss]
    xs = (xx + 0.5) / (sx * ss)
    ys = (yy + 0.5) / (sy * ss)
    inside = np.zeros(xs.shape, dtype=bool)
    r = d_mm / 2.0
    # Every lattice point that can touch the tile, wrapped by the tile size.
    tw, th = nx * W, ny * H
    span = int(math.ceil((tw + th) / min(math.hypot(*v1), math.hypot(*v2)))) + 3
    seen = set()
    for i in range(-span, span + 1):
        for j in range(-span, span + 1):
            cx = (i * v1[0] + j * v2[0]) % tw
            cy = (i * v1[1] + j * v2[1]) % th
            key = (round(cx, 3), round(cy, 3))
            if key in seen:
                continue
            seen.add(key)
            for ox in (-tw, 0, tw):
                for oy in (-th, 0, th):
                    px_, py_ = cx + ox, cy + oy
                    if px_ < -r or px_ > tw + r or py_ < -r or py_ > th + r:
                        continue
                    x0 = max(0, int((px_ - r) * sx * ss) - 1)
                    x1 = min(xs.shape[1], int((px_ + r) * sx * ss) + 2)
                    y0 = max(0, int((py_ - r) * sy * ss) - 1)
                    y1 = min(xs.shape[0], int((py_ + r) * sy * ss) + 2)
                    sub = (xs[y0:y1, x0:x1] - px_) ** 2 + (ys[y0:y1, x0:x1] - py_) ** 2 <= r * r
                    inside[y0:y1, x0:x1] |= sub
    cover = inside.reshape(h_px, ss, w_px, ss).mean(axis=(1, 3))[..., None]
    panel = np.array(panel_rgb, dtype=float)
    hole = np.array(HOLE_RGB, dtype=float)
    return panel * (1 - cover) + hole * cover


def perforations(doc, pno: int, default_scale: int, kind: str):
    page = doc[pno - 1]
    ws = words(page)
    cs = circles(page)
    headers = [(w[1], int(m.group(1))) for w in ws
               for m in [re.match(r"1:(\d+)\)?", w[4])] if m and "(Scale" in " ".join(
                   v[4] for v in ws if abs(v[1] - w[1]) < 1 and v[0] < w[0] and w[0] - v[0] < 40)]
    for fr in frames(page):
        label = sorted((w for w in ws if fr.y1 < w[1] < fr.y1 + 14 and fr.x0 - 3 < w[0] < fr.x0 + 12),
                       key=lambda w: (w[1], w[0]))
        if not label:
            continue
        code = label[0][4]
        if not re.fullmatch(r"[A-Z]{1,2}\d{1,5}[A-Z]?", code):
            continue
        line = [w for w in ws if abs(w[1] - label[0][1]) < 1.5 and fr.x0 - 3 < w[0] < fr.x1 + 30]
        own = re.search(r"1:(\d+)", " ".join(w[4] for w in line))
        above = [s for (y, s) in headers if y < fr.y0]
        scale = int(own.group(1)) if own else (above[-1] if above and kind == "Wood" else default_scale)
        block = " ".join(w[4] for w in ws if fr.x0 - 3 < w[0] < fr.x1 and fr.y1 < w[1] < fr.y1 + 48)
        openness = re.search(r"Openness\s*(\d+(?:[.,]\d+)?)\s*%", block)
        pts = [(x, y) for (x, y, d) in cs if fr.x0 - 1 < x < fr.x1 + 1 and fr.y0 - 1 < y < fr.y1 + 1]
        dia = [d for (x, y, d) in cs if fr.x0 - 1 < x < fr.x1 + 1 and fr.y0 - 1 < y < fr.y1 + 1]
        yield code, scale, pts, dia, block, (openness.group(1) if openness else None)


def stretch_metal(doc):
    page = doc[METAL_PAGE - 1]
    ws = words(page)
    for info in page.get_image_info(xrefs=True):
        x0, y0, x1, y1 = info["bbox"]
        label = sorted((w for w in ws if y1 < w[1] < y1 + 14 and x0 - 3 < w[0] < x0 + 10), key=lambda w: w[1])
        if not label or not label[0][4].startswith("CLS"):
            continue
        code = label[0][4]
        block = " ".join(w[4] for w in ws if x0 - 3 < w[0] < x1 and y1 < w[1] < y1 + 60)
        img = pymupdf.Pixmap(doc, info["xref"])
        if img.n > 3 or img.alpha:
            img = pymupdf.Pixmap(pymupdf.csRGB, img)
        arr = np.frombuffer(img.samples, dtype=np.uint8).reshape(img.height, img.width, img.n)[:, :, :3]
        w_mm = (x1 - x0) * MM_PER_PT * 4
        h_mm = (y1 - y0) * MM_PER_PT * 4
        yield code, arr, w_mm, h_mm, block


# ---------------------------------------------------------------------------

def write(folder_root, base, rgb, meta, dry):
    if dry:
        print("   ", base)
        return
    folder = os.path.join(folder_root, base)
    os.makedirs(folder, exist_ok=True)
    save_jpeg(os.path.join(folder, base + ".jpeg"), rgb)
    meta = dict(meta, thumbnail=base + ".jpeg", type="material", category=CATEGORY, brand=BRAND)
    with open(os.path.join(folder, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    doc = pymupdf.open(PDF)
    counts = {}
    skipped = []

    print("Woodgrain / veneer")
    seen = set()
    for code, name, finish, crop in wood_swatches(doc):
        if code in seen:
            continue
        seen.add(code)
        label = ascii_safe(name)
        # Book-matched side to side only: a top-to-bottom mirror reads as a
        # seam across the grain, which a real veneer never has.
        pair = np.concatenate([crop, crop[:, ::-1]], axis=1)
        h_cm = round(WOOD_TILE_CM * pair.shape[0] / pair.shape[1])
        base = "%s - %s %s %dx%d" % (code, label, finish, WOOD_TILE_CM, h_cm)
        write(LIBRARY, base, pair, {
            "name": "%s %s" % (label, code),
            "tags": [BRAND, "ceiling", "woodgrain", finish, code, name,
                     "assumed %d cm wide book-matched repeat" % WOOD_TILE_CM],
        }, args.dry_run)
        counts["wood"] = counts.get("wood", 0) + 1

    print("Stretch metal")
    for code, arr, w_mm, h_mm, block in stretch_metal(doc):
        tw, th = round(2 * w_mm / 10), round(2 * h_mm / 10)
        base = "%s - Stretch Metal Mesh %dx%d" % (code, tw, th)
        write(LIBRARY, base, mirror_tile(arr), {
            "name": "Stretch Metal %s" % code,
            "tags": [BRAND, "ceiling", "stretch metal", "expanded metal", code, block[:120]],
        }, args.dry_run)
        counts["stretch"] = counts.get("stretch", 0) + 1

    for pno, default_scale, kind in ((METAL_PAGE, 1, "Metal"), (WOOD_PERF_PAGE, 5, "Wood")):
        print("Perforations -", kind)
        for code, scale, pts, dia, block, openness in perforations(doc, pno, default_scale, kind):
            if code.startswith("CLS"):
                continue
            if kind == "Wood" and code.startswith("D"):
                skipped.append("%s %s: irregular layout, no single repeat" % (kind, code))
                continue
            if re.search(r"\d+S$", code):
                skipped.append("%s %s: slotted, not round holes" % (kind, code))
                continue
            spec = re.search(r"(\d+(?:[.,]\d+)?)\s*mm", block)
            spec_d = float(spec.group(1).replace(",", ".")) if spec else None
            # Keep the circles of the hole size; drawings also carry markers.
            groups = {}
            for pt, d in zip(pts, dia):
                groups.setdefault(round(d, 1), []).append((pt, d))
            if not groups:
                skipped.append("%s %s: no holes drawn" % (kind, code))
                continue
            if spec_d:
                key = min(groups, key=lambda k: abs(k * MM_PER_PT * scale - spec_d))
            else:
                key = max(groups, key=lambda k: len(groups[k]))
            pts = [g[0] for g in groups[key]]
            dia = [g[1] for g in groups[key]]
            # The printed diameter is the authority on scale: P134 is labelled
            # 1:4 but drawn at 1:8.
            mm = MM_PER_PT * scale
            if spec_d:
                measured = float(np.median(dia)) * mm
                if abs(measured - spec_d) / spec_d > 0.08:
                    mm *= spec_d / measured
            tol = 0.6
            lat = lattice(pts, tol)
            if not lat or not dia:
                skipped.append("%s %s: no single hole lattice (%d holes)" % (kind, code, len(pts)))
                continue
            v1 = (lat[0][0] * mm, lat[0][1] * mm)
            v2 = (lat[1][0] * mm, lat[1][1] * mm)
            W, H = rect_repeat(v1, v2, tol * mm)
            if not W or not H:
                skipped.append("%s %s: no rectangular repeat" % (kind, code))
                continue
            d_mm = float(np.median(dia)) * mm
            # Cross-check against the printed pitch ("<> 16 <> 16"): every
            # number after the diameter. A drawing that disagrees is skipped
            # rather than shipped at the wrong size.
            after = block.split("mm", 1)[1] if "mm" in block else ""
            pitches = [float(x.replace(",", ".")) for x in re.findall(r"\d+(?:[.,]\d+)?", after.split("Openness")[0])]
            steps = [math.hypot(*v1), math.hypot(*v2), W, H]
            if pitches and not any(abs(st - pt) / pt < 0.05 for st in steps for pt in pitches):
                skipped.append("%s %s: drawn pitch %s mm does not match printed %s" % (
                    kind, code, "/".join("%.1f" % x for x in steps), pitches))
                continue
            nx, wcm = whole_cm(W)
            ny, hcm = whole_cm(H)
            name = "%s Perforation %s %s mm" % (kind, code, ("%.1f" % d_mm).rstrip("0").rstrip("."))
            base = "%s - %s Perforation %dx%d" % (code, kind, wcm, hcm)
            if args.dry_run:
                print("    %-7s scale 1:%-2d hole %.2f mm (spec %s)  step %.2f/%.2f mm  repeat %.2f x %.2f -> %dx%d cm  open %s%%" % (
                    code, scale, d_mm, spec.group(1) if spec else "?", math.hypot(*v1), math.hypot(*v2),
                    W, H, wcm, hcm, openness))
                counts[kind] = counts.get(kind, 0) + 1
                continue
            rgb = render_perforation(v1, v2, W, H, d_mm, nx, ny,
                                     WOOD_PANEL_RGB if kind == "Wood" else PANEL_RGB)
            write(LIBRARY, base, rgb, {
                "name": name,
                "tags": [BRAND, "ceiling", "perforation", kind.lower(), code,
                         "hole %.2f mm" % d_mm, "openness %s%%" % openness if openness else "",
                         "drawn at 1:%d" % scale],
            }, False)
            counts[kind] = counts.get(kind, 0) + 1

    print("\nwritten:", counts)
    for s in skipped:
        print("  SKIPPED:", s)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
