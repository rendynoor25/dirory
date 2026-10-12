#!/usr/bin/env python
"""
Build scripts/data/dulux-colour-futures.json from the OCR of the bitmap card.

One-off provenance for the committed JSON. The card has no text layer, so its
pages were OCR'd with the Windows engine
(`Windows.Media.Ocr` — see the per-page dump described below), and every caption
was then checked against the rendered page. This script holds that check: the
NAME_FIX map is what the eye caught that the OCR did not, and the code repair
handles the two confusions the OCR makes systematically.

It expects the OCR dump at `D:\\Dirory\\dirory\\.tmpdulux\\cf\\p<N>.txt` (a
scratch directory, not in the repo); the committed output is the JSON, which is
what the extractor reads.

Run:  python scripts/build-dulux-futures-data.py
"""
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
OCR = r"D:\Dirory\dirory\.tmpdulux\cf"
OUT = r"D:\Dirory\dirory\scripts\data\dulux-colour-futures.json"

# Card pages: five columns of ten. Positions in pixels of a 300 DPI render.
COLS = {2: [121, 578, 1035, 1484, 1948], 3: [122, 578, 1035, 1485, 1950],
        4: [122, 579, 1036, 1484, 1949], 5: [122, 578, 1035, 1484, 1950]}
ROW0, PITCH = 420, 324

# Names the OCR misread, checked against the rendered pages.
NAME_FIX = {
    "Drum Beot": "Drum Beat", "Muted Tongo": "Muted Tango", "L'Oronge": "L'Orange",
    "Padang Boy": "Padang Bay", "Toupe Pink": "Taupe Pink", "Light Toupe": "Light Taupe",
    "Afternoon Teo": "Afternoon Tea",
    "Pomindo": "Paminda", "SUnny Breeze": "Sunny Breeze", "Mocodemio": "Macademia",
    "Morning Stor": "Morning Star", "Ponna Cotto": "Panna Cotta", "Teratai": "Terotai",
    "Comelcoot": "Camelcoat",
    "Peacock Fon": "Peacock Fan", "Bali Hoi": "Bali Hai", "Lokestone DWS": "Lakestone DWS",
    "Shady Lodg": "Shady Lady", "Golont Grey": "Gallant Grey", "Dust Doy": "Dust Day",
    "Kilolo Bay": "Kilala Bay", "Cleon Waters": "Clean Waters", "Clew Boy": "Clew Bay",
    "Pole Diamond": "Pale Diamond", "Doy Break": "Day Break", "Whole woll": "Whole Wall",
    "Block Mico": "Black Mica", "Sovono Green": "Savana Green", "Dork Grey Roof": "Dark Grey Roof",
    "Block": "Black", "Orchid Donce": "Orchid Dance", "Morina Boy": "Marina Bay",
    "Crystal Cleor": "Crystal Clear", "Green Teo": "Green Tea", "Fairylight": "Fairylight",
    "Auntumn Walks": "Auntumn Walks", "Green Seeweed": "Green Seeweed",
}

# Codes the OCR dropped entirely, read off the page.
CODE_FIX = {
    ("Smoke Grey", 4): "40346",
    ("Sky Way", 5): "41344",
    ("Aqua Blue", 5): "41422",
}

HUE = ("RR", "YR", "YY", "GY", "GG", "BG", "BB", "RB")
DIGITS = str.maketrans({"O": "0", "I": "1", "S": "5", "B": "8", "G": "6", "Z": "2", "l": "1"})
LETTERS = str.maketrans({"8": "B", "0": "O", "6": "G", "5": "S", "3": "B", "1": "I"})


def fix_code(code: str) -> str:
    """Repair the two ways the OCR mangles Dulux codes: a zero read as an O or
    an I, and a hue letter read as a digit (`15BB` -> `158B`, `10GY` -> `IOGY`)."""
    s = code.strip().upper().replace(" ", "")
    m = re.match(r"^([0-9OISB]{2})([A-Z0-9]{2})(\d{2})/(\d{3})$", s)
    if m:
        head = m.group(1).translate(DIGITS)
        hue = m.group(2)
        if hue not in HUE:
            hue = hue.translate(LETTERS)
        tail = m.group(3).translate(DIGITS) + "/" + m.group(4).translate(DIGITS)
        return head + hue + " " + tail
    if re.match(r"^\d{3,6}[A-Z]?$", s.translate(DIGITS)):
        return s.translate(DIGITS)
    return code.strip()


def load_ocr(page: int):
    raw = open(os.path.join(OCR, "p%d.txt" % page), "rb").read()
    txt = (raw.decode("utf-16", errors="replace") if raw[:2] in (b"\xff\xfe", b"\xfe\xff")
           else raw.decode("utf-8", errors="replace"))
    out = []
    for ln in txt.splitlines():
        m = re.match(r"\s*([\d,.]+)\t\s*([\d,.]+)\t(.+)$", ln)
        if m:
            out.append((float(m.group(1).replace(",", "")), float(m.group(2).replace(",", "")),
                        m.group(3).strip()))
    return out


def card_page(page: int):
    """Return 50 (name, code, x, y) in row-major order."""
    cols = COLS[page]
    grid = {}
    for x, y, t in load_ocr(page):
        c = min(range(5), key=lambda k: abs(cols[k] - x))
        if abs(cols[c] - x) > 40:
            continue
        r = round((y - ROW0) / PITCH)
        if not (0 <= r <= 9) or abs(ROW0 + PITCH * r - y) > 60:
            continue
        slot = 0 if abs(y - (ROW0 + PITCH * r)) < 16 else 1
        grid[(r, c, slot)] = t
    items = []
    for r in range(10):
        for c in range(5):
            name = grid.get((r, c, 0), "")
            code = grid.get((r, c, 1), "")
            name = NAME_FIX.get(name, name)
            code = CODE_FIX.get((name, page), code)
            items.append([name, fix_code(code), cols[c], ROW0 + PITCH * r])
    return items


# --- page 6: two product sections, read off the page ----------------------
P6_COLS_G, P6_COLS_R = [123, 620, 1089, 1550, 2016], [112, 494, 871, 1247, 1627, 2005]
P6_GLOSS = [
    ["Coral Sands", "46643"], ["Magnolia WSGL", "45460"], ["Portland", "40395"],
    ["Loud Stone", "40703"], ["White WSGL", "9001"],
    ["Wooden Brown", "46640"], ["Liberty Harbor", "46639"], ["Farmhouse", "46642"],
    ["Andesit Grey", "40704"], ["Savana Green", "42628"],
    ["Black", "122"], ["Granito Brown", "46638"], ["Walnut", "46461"],
    ["Steel Fusion", "40705"], ["Pine Green", "42627"],
]
P6_ROOF = [
    ["Terracotta", "43044"], ["Red Oxide", "43031"], ["Mission Brown", "46503"],
    ["Dark Brown", "46047"], ["Dark Grey Roof", "40504"], ["Leaf Green", "42501"],
]


def page6():
    items = []
    for i, (n, c) in enumerate(P6_GLOSS):
        r, col = divmod(i, 5)
        items.append([n, c, P6_COLS_G[col], [2140, 2463, 2790][r]])
    for i, (n, c) in enumerate(P6_ROOF):
        items.append([n, c, P6_COLS_R[i], 3292])
    return items


# --- page 7: the combination guide, read off the page --------------------
P7_COLS = [287, 522, 762, 1001, 1278, 1513, 1752, 1990]
P7_ROWS = [794, 1606, 2430, 3238]
# slot -> (name, code); a slot with None is a band the card leaves unlabelled
P7 = {
    0: [(0, "Wool White", "57YY 72/138"), (1, "Gold Curry", "40YY 49/546"),
        (2, "Blue Moment", "04BB 34/244"), (3, "Rich Navy", "50BB 08/171"),
        (4, "Noble Grey", "30BB 10/019"), (5, "Gold Curry", "40YY 49/546"),
        (6, "Green Seeweed", "52YY 26/275"), (7, "White on White", "30GY 88/014")],
    1: [(0, "Executive", "70RR 64/034"), (1, "Toasty Grey", "30YY 51/098"),
        (2, "Mild Mocha", "66YR 33/286"), (3, "Auntumn Walks", "48YR 26/519"),
        (4, "Brownington Court", "90YR 36/203"), (5, "Toasty Grey", "30YY 51/098"),
        (6, "Nature's Choice", "64YY 83/058"), (7, "White on White", "30GY 88/014")],
    2: [(0, "Plantation Green", "90YY 13/177"), (1, "Winter's Silence", "50YY 49/191"),
        (2, "Habitat", "70YY 66/130"), (4, "Lagoon Green", "90GG 74/092"),
        (6, "Silky Ice", "36GG 87/038")],
    3: [(0, "Blueberry Mash", "14BB 55/113"), (2, "Purest Frost", "71YY 90/027"),
        (4, "Magnetic Field", "78BG 12/032"), (5, "Drum Beat", "00YR 08/409"),
        (6, "Silver Pendant", "34YR 35/025"), (7, "Dewdrop Grey", "11YY 85/016")],
}


def page7():
    items = []
    for r, entries in P7.items():
        for col, n, c in entries:
            items.append([n, c, P7_COLS[col], P7_ROWS[r]])
    return items


def main():
    data = {"source": "dulux-colour-futures-2025-colour-card.pdf",
            "note": "names read off the rendered pages; colours are sampled, never typed",
            "layouts": {"card": {"dx": 150, "dy": -130}, "band": {"dx": 50, "dy": -10}},
            "pages": []}
    for p in (2, 3, 4, 5):
        data["pages"].append({"page": p, "layout": "card", "items": card_page(p)})
    data["pages"].append({"page": 6, "layout": "card", "items": page6()})
    data["pages"].append({"page": 7, "layout": "band", "items": page7()})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    total = sum(len(p["items"]) for p in data["pages"])
    print("wrote %s: %d pages, %d entries" % (OUT, len(data["pages"]), total))
    for p in data["pages"]:
        bad = [i for i in p["items"] if not i[0] or not i[1]]
        print("   page %-2d %3d entries, %d blank" % (p["page"], len(p["items"]), len(bad)))


if __name__ == "__main__":
    main()
