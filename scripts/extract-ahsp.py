#!/usr/bin/env python
"""
Extract AHSP coefficients for Dirory's RAB from Permen PUPR No. 1 Tahun 2022.

Source: the regulation as published by BPK (peraturan.bpk.go.id/Details/216825),
1,209 pages with a text layer. Bagian IV (Cipta Karya dan Perumahan) tabulates
most building work items as A.4.x.x.x. A few of the most common ones - plaster
1SP:4PP, skim coat, painting a new wall - are not tabulated there and appear
instead as worked analyses in the general part (numbered 3.x.x.(c)); they are
read from there, with the same table layout.

Each analysis is a table: TENAGA KERJA (labour, OH per unit), BAHAN
(materials), PERALATAN (equipment, often "% of materials"). Only the
coefficients are taken; prices are local and come from the HSD table.

Output: supabase/seed/ahsp_pupr_2022.json, committed with the repo.

Usage
  python scripts/extract-ahsp.py "path/to/Permen PUPR_1 Tahun 2022.pdf"
"""

from __future__ import annotations

import json
import os
import re
import sys

import pymupdf

OUT = os.path.join(os.path.dirname(__file__), "..", "supabase", "seed", "ahsp_pupr_2022.json")

# (key, how to find the table's heading, Dirory's short name, element it prices)
ITEMS = [
    ("wall_brick", r"^A\.4\.4\.1\.9\.? ", "Red brick wall 1/2 brick, mortar type N (1:4)", "wall"),
    ("wall_aac", r"^A\.4\.4\.1\.26\.", "Lightweight block (AAC) wall 10 cm", "wall"),
    ("plaster", r"Pemasangan 1 m2 Plesteran 1SP : 4PP tebal 15 mm", "Plaster 1SP:4PP, 15 mm", "wall"),
    ("skim_coat", r"^Pemasangan ?1 m2 Acian", "Skim coat (acian)", "wall"),
    ("paint_wall", r"^3\.3\.10\.\(c\) Pengecatan 1 m2 Tembok Baru", "Paint new wall: putty, primer, 2 finish coats", "wall"),
    ("wall_tile", r"^A\.4\.4\.3\.53\.", "Ceramic wall tile 20x20", "wall"),
    ("floor_tile", r"^A\.4\.4\.3\.36\.", "Ceramic floor tile 30 to <40 cm", "floor"),
    ("skirting", r"^A\.4\.4\.3\.39\.", "Ceramic skirting 10 to <20 cm", "floor"),
    ("ceiling_frame", r"^A\.4\.2\.1\.21\.", "Hollow steel 40.40 ceiling frame, 60x60 module", "ceiling"),
    ("ceiling_gypsum", r"^A\.4\.5\.1\.7\.", "Gypsum board ceiling 9 mm", "ceiling"),
    ("roof_truss", r"^A\.4\.2\.1\.22\.", "Light-steel roof truss (gable), C75", "roof"),
    ("roof_tile", r"^A\.4\.5\.2\.32\.", "Concrete roof tile", "roof"),
    ("frame_alu", r"^A\.4\.2\.1\.24\.", "Aluminium door/window frame", "opening"),
    ("door_leaf", r"^A\.4\.6\.1\.5\.", "Panel door leaf, timber class I/II", "opening"),
    ("glass", r"^A\.4\.6\.2\.17\.", "Clear glass 5 mm", "opening"),
]

# Units of each item, stated rather than parsed: the PDF's "m’" arrives garbled.
ITEM_UNITS = {"skirting": "m'", "frame_alu": "m'"}

# Where the printed table is wrong or unparseable. Each correction is recorded
# in the output so the RAB can show it.
CORRECTIONS = {
    "ceiling_frame": [
        ("material", "Rangka metal hollow 40.40", 4.0,
         "Printed as 4000 m' per m2; a 60x60 cm grid needs about 4 m' per m2, so read as 4,000."),
    ],
}
EXTRA_ROWS = {
    "ceiling_frame": [
        ("material", {"name": "Assesoris (perkuatan, las dll)", "unit": "%", "coef": 100.0,
                      "basis": "rangka",
                      "note": "Printed as '100% x rangka' (Ls). Kept as printed; cross-check with the local HSP."}),
    ],
}

UNITS = {"oh", "kg", "m3", "m2", "m'", "m’", "m", "buah", "bh", "lbr", "lembar", "btg", "batang",
         "ltr", "liter", "unit", "set", "%", "ls", "zak", "sak", "dus", "roll", "titik", "kaleng"}
SKIP = re.compile(r"^(=== PAGE \d+ ===|-\s?\d+\s?-|jdih\.pu\.go\.id|No|Uraian|Kode|Satuan|Koefisien|Harga|"
                  r"Satuan|\(Rp\)|Jumlah\s*|Harga Satuan|Harga Satuan \(Rp\))$", re.I)
NUM = re.compile(r"^\d+(?:[.,]\d+)?$")


def number(text: str) -> float:
    t = text.strip()
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    return float(t)


def parse_table(lines: list[str], start: int) -> dict:
    title = [lines[start].strip()]
    i = start + 1
    while i < len(lines) and lines[i].strip() not in ("No",):
        title.append(lines[i].strip())
        i += 1
    section = None
    out = {"labour": [], "material": [], "equipment": []}
    pending: list[str] = []
    while i < len(lines):
        raw = lines[i].strip()
        i += 1
        if not raw or SKIP.match(raw):
            continue
        if re.match(r"^(F|Harga Satuan Pekerjaan)", raw) and section:
            break
        if raw in ("A", "B", "C", "D", "E"):
            pending = []
            continue
        if re.match(r"^TENAGA", raw, re.I):
            section, pending = "labour", []
            continue
        if re.match(r"^BAHAN", raw, re.I):
            section, pending = "material", []
            continue
        if re.match(r"^PERALATAN", raw, re.I):
            section, pending = "equipment", []
            continue
        if re.match(r"^(JUMLAH|Jumlah)", raw):
            pending = []
            continue
        if section is None:
            continue
        if raw.lower() in UNITS:
            # Next meaningful line is the coefficient (or "(bahan)" then it).
            j = i
            basis = None
            while j < len(lines) and not lines[j].strip():
                j += 1
            nxt = lines[j].strip() if j < len(lines) else ""
            if nxt.startswith("(") and nxt.endswith(")"):
                basis = nxt.strip("()").lower()
                j += 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                nxt = lines[j].strip() if j < len(lines) else ""
            if NUM.match(nxt):
                code = next((p for p in pending if re.match(r"^[LM]\.\d+$", p)), None)
                name = " ".join(p for p in pending if not re.match(r"^[LM]\.\d+$", p)).strip(" *")
                row = {"name": name, "unit": "m'" if raw in ("m’",) else raw, "coef": number(nxt)}
                if code:
                    row["code"] = code
                if basis:
                    row["basis"] = basis
                out[section].append(row)
                pending = []
                i = j + 1
                continue
        pending.append(raw)
    unit = re.search(r"\b1\s*(m2|m3|m’|m'|m|buah|bh)\b", " ".join(title), re.I)
    return {"title": re.sub(r"\s+", " ", " ".join(title)).strip(),
            "unit": (unit.group(1).replace("’", "'") if unit else "m2"), **out}


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    doc = pymupdf.open(sys.argv[1])
    lines: list[str] = []
    for p in doc:
        lines.append("=== PAGE ===")
        lines.extend(p.get_text().split("\n"))
    result = {"source": "Permen PUPR No. 1 Tahun 2022 (BPK copy, peraturan.bpk.go.id/Details/216825)",
              "items": []}
    problems = []
    for key, pattern, name, element in ITEMS:
        rx = re.compile(pattern)
        found = None
        for idx, l in enumerate(lines):
            if rx.search(l.strip()):
                # The real table, not a table-of-contents line: "Koefisien"
                # follows within a few lines.
                if any(lines[k].strip() == "Koefisien" for k in range(idx, min(idx + 14, len(lines)))):
                    found = idx
        if found is None:
            problems.append(f"{key}: heading not found")
            continue
        t = parse_table(lines, found)
        if key in ITEM_UNITS:
            t["unit"] = ITEM_UNITS[key]
        for section, name, coef, note in CORRECTIONS.get(key, []):
            for row in t[section]:
                if row["name"].startswith(name):
                    row["printed_coef"], row["coef"], row["note"] = row["coef"], coef, note
        for section, row in EXTRA_ROWS.get(key, []):
            t[section].append(row)
        for section in ("labour", "material", "equipment"):
            for row in t[section]:
                row["name"] = re.sub(r"\s+", " ", row["name"].replace("�", '"')).strip()
        if not t["labour"] or not t["material"]:
            problems.append(f"{key}: labour {len(t['labour'])}, materials {len(t['material'])}")
        result["items"].append({"key": key, "name": name, "element": element, **t})
        print(f"{key:15} {t['unit']:3} L{len(t['labour'])} M{len(t['material'])} E{len(t['equipment'])}  {t['title'][:70]}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
