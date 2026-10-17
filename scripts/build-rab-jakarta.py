#!/usr/bin/env python
"""
Build Dirory's Jakarta RAB price book - 21 architectural, 13 structural,
2 railing, 87 MEP and 19 demolition work items, each with its AHSP coefficients and Jakarta's basic prices
(HSD), plus 4 split AC units at market prices - and the national AHSP
coefficients the book is built on.

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
import re
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
    # Floor and roof finishes other than ceramic and concrete tiles: rab.js
    # picks one from the floor's or roof's material (floorKind, roofKind).
    ("floor_granite", 2735, "Granite floor tile 60 x 60 cm", "floor", "floor_granite"),
    ("floor_homogeneous", 2405, "Homogeneous tile floor 60 x 60 cm, polished", "floor", "floor_homogeneous"),
    ("floor_parquet", 2199, "Solid timber parquet floor", "floor", "floor_parquet"),
    ("floor_carpet", 2194, "Carpet floor", "floor", "floor_carpet"),
    ("roof_metal", 1460, "Metal sheet roofing", "roof", "roof_metal"),
    ("roof_waterproof", 2415, "Torch-on waterproofing membrane (concrete roof deck)", "roof", "roof_concrete"),
    # Stairs and railings (Revit). Railings are filed under "wall" in the
    # book (rab_items.element); rab.js lists them in their own section.
    ("formwork_stair", 3424, "Formwork, stair (3 uses)", "structure", "formwork_stair"),
    ("railing_stair", 2095, "Stair / ramp railing and handrail", "wall", "railing_stair"),
    ("railing", 2133, "Steel guard railing, 1.2 m high", "wall", "railing"),
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
# MEP (Revit). rab.js matches each measured pipe, fixture and device to one of
# these keys (see mepKey there). Pipes are priced per metre and Jakarta's pipe
# analyses already include fittings and accessories (1.45 m of pipe "dan
# aksesoris" per m), so fittings are not counted again. A light, socket or
# detector "point" includes its cable and conduit, so conduits are not either.
PIPES = {
    # kind: (label, {DN mm: Jakarta HSP id})
    "pvc_aw": ("PVC AW pipe (clean water)", {15: 1675, 20: 1677, 25: 1678, 32: 1679, 40: 2127, 50: 2128,
                                             65: 2130, 80: 2134, 100: 2135, 125: 2139, 150: 2140, 200: 2141}),
    "pvc_d": ("PVC D pipe (waste, vent, rainwater)", {32: 2222, 40: 2223, 50: 2224, 65: 2226, 80: 2228,
                                                      100: 2230, 125: 2232, 150: 2233, 200: 2235}),
    "ppr": ("PPR PN10 pipe", {15: 2256, 20: 2257, 25: 2261, 32: 2265, 40: 2266, 50: 2267, 65: 2269,
                              80: 2270, 100: 2271}),
    "gi": ("Galvanised steel pipe SCH 40", {15: 5560, 20: 5561, 25: 5562, 32: 5563, 40: 5564, 50: 5565,
                                            65: 5566, 80: 5567, 100: 5568, 125: 5569, 150: 5575, 200: 5576}),
    "hdpe": ("HDPE pipe", {15: 5999, 20: 6000, 25: 6001, 32: 6002, 40: 6003, 50: 6004, 65: 5985,
                           80: 6005, 100: 5986, 125: 5987, 150: 5988, 200: 5989}),
}
MEP = [("pipe_%s_%d" % (kind, dn), hsp, "%s DN %d" % (label, dn), "mep", "mep")
       for kind, (label, sizes) in PIPES.items() for dn, hsp in sizes.items()] + [
    # Plumbing fixtures
    ("closet_seat", 1096, "Close-coupled / monoblock WC", "mep", "mep"),
    ("closet_squat", 1099, "Squat WC (kloset jongkok)", "mep", "mep"),
    ("closet_disabled", 4335, "Accessible WC", "mep", "mep"),
    ("washbasin", 2040, "Washbasin (wastafel)", "mep", "mep"),
    ("urinal", 1559, "Urinal", "mep", "mep"),
    ("shower_set", 2066, "Shower set", "mep", "mep"),
    ("tap", 1876, "Tap 1/2 inch", "mep", "mep"),
    ("tap_kitchen", 3764, "Kitchen sink tap", "mep", "mep"),
    ("floor_drain", 3090, "Floor drain 2 inch", "mep", "mep"),
    # Electrical: installation points (cable + conduit) and devices
    ("light_point", 1674, "Lighting point: NYM 3x2.5 cable and conduit", "mep", "mep"),
    ("socket_point", 1663, "Socket point: NYM 3x2.5 cable and conduit", "mep", "mep"),
    ("switch_single", 1635, "Single switch", "mep", "mep"),
    ("switch_double", 1636, "Double switch", "mep", "mep"),
    ("socket", 1638, "Socket outlet 1P 10A", "mep", "mep"),
    ("socket_ac", 1658, "AC socket outlet", "mep", "mep"),
    ("mcb_box", 2297, "MCB box", "mep", "mep"),
    ("panel_floor", 5359, "Floor panel, wall-mounted 600 x 400 x 200 mm", "mep", "mep"),
    ("panel_sdp", 5357, "Sub-distribution panel (SDP), wall-mounted", "mep", "mep"),
    ("panel_mdp", 5336, "Main distribution panel (MDP), wall-mounted", "mep", "mep"),
    # Light fittings
    ("downlight", 2351, "LED downlight 5 inch 12 W", "mep", "mep"),
    ("batten", 5475, "LED batten 1 x 24 W", "mep", "mep"),
    ("batten_2x", 5882, "LED batten 2 x 24 W", "mep", "mep"),
    ("spotlight", 6175, "LED spotlight 9 W", "mep", "mep"),
    ("garden_light", 3137, "Garden light 25 W with 1 m post", "mep", "mep"),
    ("exit_light", 2480, "LED exit sign with battery", "mep", "mep"),
    # Fire
    ("sprinkler_pendant", 2359, "Sprinkler head, pendant", "mep", "mep"),
    ("sprinkler_upright", 2360, "Sprinkler head, upright", "mep", "mep"),
    ("smoke_detector", 4155, "Smoke detector, conventional", "mep", "mep"),
    ("detector_point", 2327, "Detector installation point, conventional", "mep", "mep"),
    ("hydrant_box", 2376, "Indoor hydrant box", "mep", "mep"),
    # Air
    ("exhaust_fan", 5804, "Exhaust (propeller) fan 75 CFM", "mep", "mep"),
    ("grille", 3674, "Exhaust grille 200 x 200 mm", "mep", "mep"),
    ("diffuser", 6355, "Box diffuser 250 x 250 mm", "mep", "mep"),
]

# Demolition (pembongkaran), for elements a Revit phase demolishes or that a
# SketchUp model tags as demolished. rab.js maps them in demoKey.
DEMOLITION = [
    ("demo_brick", 3406, "Demolish brick masonry, manual", "demolition", "demolition"),
    ("demo_concrete", 3405, "Demolish concrete 20-40 MPa, jack hammer", "demolition", "demolition"),
    ("demo_concrete_manual", 3402, "Demolish concrete over 20 MPa, by hand", "demolition", "demolition"),
    ("demo_roof_metal", 5676, "Remove metal sheet roofing", "demolition", "demolition"),
    ("demo_ceiling", 1939, "Remove ceiling incl. frame (not reused)", "demolition", "demolition"),
    ("demo_floor_tile", 3535, "Remove ceramic floor tiles", "demolition", "demolition"),
    ("demo_roof_tile", 5670, "Remove concrete roof tiles", "demolition", "demolition"),
    ("demo_roof_frame", 1940, "Remove roof frame, battens and rafters", "demolition", "demolition"),
    ("demo_door", 5659, "Remove single door leaf with frame", "demolition", "demolition"),
    ("demo_door_double", 5660, "Remove double door leaf with frame", "demolition", "demolition"),
    ("demo_window", 5663, "Remove single window with timber frame", "demolition", "demolition"),
    ("demo_window_double", 5665, "Remove double window with timber frame", "demolition", "demolition"),
    ("demo_wc", 5642, "Remove close-coupled WC", "demolition", "demolition"),
    ("demo_wc_squat", 5640, "Remove squat WC", "demolition", "demolition"),
    ("demo_washbasin", 5643, "Remove washbasin", "demolition", "demolition"),
    ("demo_urinal", 5644, "Remove urinal", "demolition", "demolition"),
    ("demo_floor_drain", 5645, "Remove floor drain", "demolition", "demolition"),
    ("demo_light", 6135, "Remove light fitting and its wiring", "demolition", "demolition"),
    ("demo_ac", 6136, "Remove wall-mounted split AC and its installation", "demolition", "demolition"),
]
# Analyses Dirory uses although they are not on a current circular, because
# none is: Jakarta still publishes this one from its 2019 e-budgeting list.
OLDER_ANALYSES = {"demo_floor_tile"}

# Items with no Jakarta analysis, at market prices: a mid-range standard split
# AC unit plus installation with about 3 m of piping. From retail listings,
# June-October 2026 (Erablue, Ruparupa, Transmart; installation Rp 385,000
# labour + piping and cable). No overhead is added: these are prices as sold.
# Edit them in the panel to the quote you have.
MARKET = [
    ("ac_split_05", "Split AC 1/2 PK, installed", 3000000, 900000),
    ("ac_split_10", "Split AC 1 PK, installed", 4000000, 900000),
    ("ac_split_15", "Split AC 1.5 PK, installed", 5000000, 1000000),
    ("ac_split_20", "Split AC 2 PK, installed", 7200000, 1100000),
]
MARKET_REFERENCE = "Market estimate, retail listings Jun-Oct 2026 (unit + installation); not AHSP"

OVERHEAD_PCT = 15.0
KINDS = {"Tenaga Kerja": "labour", "Material": "material", "Peralatan": "equipment"}


def fetch(hsp_id: int) -> dict:
    with urllib.request.urlopen(API % hsp_id, timeout=60) as r:
        return json.load(r)["data"]


def clean_reference(text: str) -> str:
    """'SE DIRJEN SE Dirjen Binkon No. 182/SE/Dk/2025' -> 'SE Dirjen Binkon No. 182/SE/Dk/2025'."""
    t = " ".join(str(text or "").split())
    t = re.sub(r"^SE DIRJEN BINKON NO\.? ?", "SE Dirjen Binkon No. ", t)
    t = t.replace("SE DIRJEN SE Dirjen", "SE Dirjen").replace("SE DIRJEN Binkon", "SE Dirjen Binkon")
    t = t.replace("PERMEN PUPR", "Permen PUPR")
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
        } for it in items if it["jakarta_hsp_id"]],
    }


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    items, problems = [], []
    print("%-15s %-4s %14s %14s %7s  %s" % ("item", "unit", "Dirory", "Jakarta", "diff", "reference"))
    for key, hsp_id, name, element, quantity in ITEMS + MEP + DEMOLITION:
        d = fetch(hsp_id)
        components = []
        for cat in d.get("kategori_material") or []:
            kind = KINDS.get(cat["kategori_material_nama"], cat["kategori_material_nama"].lower())
            for r in cat.get("detail") or []:
                components.append({
                    "kind": kind,
                    "code": r.get("kode_material"),
                    "name": (r.get("material") or {}).get("nama_material") or "(not named in Jakarta's analysis)",
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
            "unit": d["satuan"]["nama"].strip().lower(),
            "title": d["pekerjaan"],
            "reference": clean_reference(d["reference"]),
            "jakarta_hsp_id": hsp_id,
            "components": components,
            "unit_price": round(total, 2),
        })
    for key, name, unit_cost, install in MARKET:
        items.append({
            "key": key,
            "name": name,
            "element": "mep",
            "quantity": "mep",
            "unit": "unit",
            "title": name,
            "reference": MARKET_REFERENCE,
            "jakarta_hsp_id": None,
            "components": [
                {"kind": "material", "code": None, "name": name.replace(", installed", ""), "unit": "unit",
                 "coef": 1.0, "price": float(unit_cost), "price_source": "market"},
                {"kind": "labour", "code": None, "name": "Installation incl. ~3 m piping and cable", "unit": "unit",
                 "coef": 1.0, "price": float(install), "price_source": "market"},
            ],
            "unit_price": float(unit_cost + install),
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
    current = ("/SE/Dk/", "8 Tahun 2023")
    stale = [it["key"] for it in items if it["jakarta_hsp_id"] and it["key"] not in OLDER_ANALYSES
             and not any(c in it["reference"] for c in current)]
    if stale:
        problems.append("not on a current SE: " + ", ".join(stale))
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
