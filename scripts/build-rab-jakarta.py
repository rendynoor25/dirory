#!/usr/bin/env python
"""
Build Dirory's Jakarta RAB price book - 15 architectural and 12 structural
work items, each with its AHSP coefficients and Jakarta's basic prices (HSD) -
and the national AHSP coefficients the book is built on.

Which AHSP is current: Permen PUPR 8/2023 revoked Permen PUPR 1/2022 and moved
the AHSP tables out of the regulation into circulars of the Dirjen Bina
Konstruksi, updated at least yearly. The current ones are SE No. 182/SE/Dk/2025
and No. 47/SE/Dk/2026 (with 30/SE/Dk/2025 for some items). Jakarta's published
unit rates (DCKTRP "Bangun Jakarta", dcktrp.jakarta.go.id/bangunjakarta/hsp)
apply exactly those coefficients, each analysis citing its circular, and price
them with Jakarta's HSD (wages per Kepgub DKI).

Each item's components are fetched from the public API, recomputed as
  sum(coef x price) x (1 + 15%)
and checked against Jakarta's published total, so a misread table fails here.

Outputs
  supabase/seed/rab_jakarta.json    the priced Jakarta book (seed-rab.mjs loads it)
  supabase/seed/ahsp_national.json  the same analyses without prices: the SE
                                    coefficients, for pricing another region
                                    with its own HSD

Usage
  python scripts/build-rab-jakarta.py
"""

from __future__ import annotations

import datetime
import json
import os
import sys
import urllib.request

API = "https://dcktrp.jakarta.go.id/bangunjakarta/portal/api/hsp?id=%d"
SEED = os.path.join(os.path.dirname(__file__), "..", "supabase", "seed")
OUT = os.path.join(SEED, "rab_jakarta.json")
NATIONAL = os.path.join(SEED, "ahsp_national.json")

# key, Jakarta HSP id, Dirory's name, element it prices, how its quantity is
# derived from the takeoff (see plugin/dirory_library/rab.js).
ITEMS = [
    ("wall_brick", 1044, "Red brick wall, 1/2 brick, mortar type N", "wall", "wall_core"),
    ("wall_aac", 1027, "Lightweight block (AAC) wall, 10 cm", "wall", "wall_core"),
    ("plaster", 1059, "Plaster 1SP:4PP, 15 mm", "wall", "wall_finish"),
    ("skim_coat", 1072, "Skim coat (acian)", "wall", "wall_finish"),
    ("paint_wall", 1073, "Interior paint, new wall (primer + 2 coats)", "wall", "wall_finish"),
    ("wall_tile", 2755, "Ceramic wall tile 20 x 20 cm", "wall", "wall_tiled"),
    ("floor_tile", 5497, "Ceramic floor tile 40 x 40 cm, unpolished", "floor", "floor"),
    ("skirting", 2907, "Ceramic skirting 10-15 x 20 cm", "floor", "floor_perimeter"),
    ("ceiling_frame", 1103, "Galvanised hollow 40.40 ceiling frame, 60 x 60 module", "ceiling", "ceiling"),
    ("ceiling_gypsum", 1095, "Gypsum board ceiling, 9 mm", "ceiling", "ceiling"),
    ("roof_truss", 1575, "Light-steel roof truss (gable), C75", "roof", "roof"),
    ("roof_tile", 5698, "Concrete roof tile", "roof", "roof"),
    ("frame_alu", 1375, "Aluminium door/window frame", "opening", "opening_perimeter"),
    ("door_leaf", 2013, "Panel door leaf, timber class I/II", "opening", "door_area"),
    ("glass", 1816, "Clear glass 5 mm", "opening", "window_area"),
    # Structure (Revit). Quantities come from structural elements: concrete
    # volume, formwork contact area and rebar weight per member, steel weight.
    ("concrete_rm", 5846, "Ready-mix concrete fc' 25 MPa, placed", "structure", "concrete"),
    ("concrete_site", 1135, "Site-mixed concrete fc' 25 MPa, semi-mechanical", "structure", "concrete"),
    ("concrete_vibrate", 3457, "Concrete compaction with a vibrator", "structure", "concrete"),
    ("rebar_frame", 1435, "Rebar BjTS >= 12 mm: footings, sloof, columns, beams, walls", "structure", "rebar_frame"),
    ("rebar_slab", 1415, "Rebar BjTS < 12 mm: slabs", "structure", "rebar_slab"),
    ("formwork_footing", 2445, "Formwork, pad footing (3 uses)", "structure", "formwork_footing"),
    ("formwork_tie_beam", 1017, "Formwork, sloof / tie beam (3 uses)", "structure", "formwork_tie_beam"),
    ("formwork_column", 1019, "Formwork, column (3 uses)", "structure", "formwork_column"),
    ("formwork_beam", 1020, "Formwork, beam (3 uses)", "structure", "formwork_beam"),
    ("formwork_slab", 1004, "Formwork, floor slab (3 uses)", "structure", "formwork_slab"),
    ("formwork_wall", 3421, "Formwork, shear wall (3 uses)", "structure", "formwork_wall"),
    ("steel_profile", 2361, "Structural steel profile, fabricate and erect", "structure", "steel"),
]
OVERHEAD_PCT = 15.0
KINDS = {"Tenaga Kerja": "labour", "Material": "material", "Peralatan": "equipment"}


def fetch(hsp_id: int) -> dict:
    with urllib.request.urlopen(API % hsp_id, timeout=60) as r:
        return json.load(r)["data"]


def clean_reference(text: str) -> str:
    """'SE DIRJEN SE Dirjen Binkon No. 182/SE/Dk/2025' -> 'SE Dirjen Binkon No. 182/SE/Dk/2025'."""
    t = " ".join(str(text or "").split())
    t = t.replace("SE DIRJEN SE Dirjen", "SE Dirjen").replace("SE DIRJEN Binkon", "SE Dirjen Binkon")
    return t.replace("No.182", "No. 182")


def national(items: list[dict]) -> dict:
    """The analyses without Jakarta's prices: the national SE coefficients."""
    return {
        "source": "AHSP Bidang Cipta Karya per Permen PUPR 8/2023 and its circulars "
                  "(SE Dirjen Bina Konstruksi 182/SE/Dk/2025, 47/SE/Dk/2026), as applied "
                  "item by item in Jakarta's published analyses. Prices are regional and not included.",
        "replaces": "Permen PUPR 1/2022, revoked by Permen PUPR 8/2023.",
        "fetched": datetime.date.today().isoformat(),
        "items": [{
            "key": it["key"], "name": it["name"], "element": it["element"], "unit": it["unit"],
            "title": it["title"], "reference": it["reference"],
            "components": [{k: c[k] for k in ("kind", "code", "name", "unit", "coef")} for c in it["components"]],
        } for it in items],
    }


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    items, problems = [], []
    print("%-15s %-4s %14s %14s %7s  %s" % ("item", "unit", "Dirory", "Jakarta", "diff", "reference"))
    for key, hsp_id, name, element, quantity in ITEMS:
        d = fetch(hsp_id)
        components = []
        for cat in d.get("kategori_material") or []:
            kind = KINDS.get(cat["kategori_material_nama"], cat["kategori_material_nama"].lower())
            for r in cat.get("detail") or []:
                components.append({
                    "kind": kind,
                    "code": r.get("kode_material"),
                    "name": (r.get("material") or {}).get("nama_material"),
                    "unit": (r.get("satuan") or {}).get("nama"),
                    "coef": float(r["koefisien"]),
                    # The API names it the other way round: total_harga is the
                    # resource's unit price, harga_satuan is coef x price.
                    "price": float(r["total_harga"]),
                    "price_source": (r.get("merk") or {}).get("name"),
                })
        base = sum(c["coef"] * c["price"] for c in components)
        total = base * (1 + OVERHEAD_PCT / 100)
        published = float(d["total_harga_semua"])
        diff = (total - published) / published * 100
        if abs(diff) > 0.5:
            problems.append(f"{key}: recomputed {total:,.0f} vs published {published:,.0f}")
        print("%-15s %-4s %14s %14s %+6.2f%%  %s" % (
            key, d["satuan"]["nama"], f"{total:,.0f}", f"{published:,.0f}", diff, clean_reference(d["reference"])[:44]))
        items.append({
            "key": key,
            "name": name,
            "element": element,
            "quantity": quantity,
            "unit": d["satuan"]["nama"].replace("M2", "m2").replace("M3", "m3").replace("M", "m").replace("Kg", "kg"),
            "title": d["pekerjaan"],
            "reference": clean_reference(d["reference"]),
            "jakarta_hsp_id": hsp_id,
            "components": components,
            "unit_price": round(total, 2),
        })
    out = {
        "region": "jakarta",
        "name": "DKI Jakarta",
        "currency": "IDR",
        "overhead_pct": OVERHEAD_PCT,
        "source": "DCKTRP Bangun Jakarta HSP, public API (dcktrp.jakarta.go.id/bangunjakarta/hsp); "
                  "coefficients per SE Dirjen Bina Konstruksi 182/SE/Dk/2025 and 47/SE/Dk/2026; "
                  "wages per Kepgub DKI.",
        "fetched": datetime.date.today().isoformat(),
        "items": items,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    with open(NATIONAL, "w", encoding="utf-8") as fh:
        json.dump(national(items), fh, ensure_ascii=False, indent=1)
    print("\n%d items -> %s, %s" % (len(items), os.path.relpath(OUT), os.path.relpath(NATIONAL)))
    stale = [it["key"] for it in items if "/SE/Dk/" not in it["reference"]]
    if stale:
        problems.append("not on a current SE: " + ", ".join(stale))
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
