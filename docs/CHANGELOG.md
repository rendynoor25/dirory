# Changelog

## SketchUp 0.10.5 and Revit 0.1.10 (built, not released) — Quantifier and BoQ in Bahasa Indonesia

- Everything in Quantifier and BoQ follows the language setting: labels, buttons,
  the "What is this?" review, quantity tables, notes and the bottom bar.
  i18n.rb holds the Indonesian as `phrase.<English>` keys; panel.js `tx()`.
- In Indonesian, RAB lines show their AHSP job title ("Pemasangan Atap Metal
  Lembaran") instead of the English name.
- The library path no longer shows above Quantifier and BoQ, an empty
  quantity summary uses the full width, and the BoQ bar shows only its
  buttons until there is an estimate (labels were cut off).

## SketchUp 0.10.4 and Revit 0.1.9 (built, not released) — Settings and Account open again in SketchUp

SketchUp 2021 draws the panel with Chrome 64, which ignores `inset` and flex
`gap`. The Settings and Account windows used `inset: 0`, so they opened
below the bottom of the panel, out of sight. They now use top/right/bottom/left,
and the new layout gets margins where Chrome 64 has no `gap`. Checked in
SketchUp 2021's own HtmlDialog: both windows open on screen.

## SketchUp 0.10.3 and Revit 0.1.8 (built, not released) — four sections, and the BoQ in one click

- **Four sections under the header, each an icon with its name:** Models
  (water closet: sanitary is Dirory's core range), Materials (paint roller), Quantifier (calculator) and BoQ
  (scroll with a dollar sign, marked PRO). Names are always shown, not only
  on hover. Models and Materials keep All / Favourite.
- **Quantifier:** what the model is made of. It measures on opening: quantity
  cards, how Dirory reads each floor, roof and wall type, the SketchUp "What
  is this?" review, all quantities by material (CSV), and in SketchUp the
  Dirory products used, with Ask for a Quote.
- **BoQ (Pro, 2 free estimates):** location and assumptions, then one row per
  section with its subtotal, and **Export Excel** as the main button in the
  bottom bar: it measures and prices first when needed, then saves the
  workbook. Estimate, Print and RAB CSV are beside it.
- Line icons (icons.js) replace the emoji everywhere in the panel. The
  SketchUp panel opens at 400 x 640.
- **Your name:** signed-in architects can change the name Dirory shows
  (Account > Your name). It is saved on the server (profiles.full_name, via
  the new `auth-device/profile`), so the web app shows it too.
- **Settings in Revit** now shows the add-in's version and Check for updates
  says whether a newer version exists, with a link to the download page.
  The language choice is hidden in Revit, which has no translations yet.

## Unreleased (Revit + SketchUp) — RAB fixes from the Serpong renovation

Compared against an estimator's RAB for a real renovation model:

- **Demolition double count.** A demolished concrete floor was listed twice:
  as concrete (m³) and again as a floor "finish" to price. A bare concrete
  slab is now only its concrete; a tiled one also has its tiles removed.
- **Concrete demolition by hand by default** (Permen PUPR 8/2023 1.6.4,
  Rp 1.25M/m³ in Jakarta), with a jack hammer as an option (1.6.6, Rp
  146k/m³), which was the only choice before and is too cheap for most
  renovations.
- **Slabs.** A floor type whose only concrete is a thin screed under the
  tiles is no longer counted as a structural slab: concrete layers under
  50 mm are ignored (formwork and rebar with them).
- **Finishes by material.** Floors: ceramic, granite, homogeneous tile,
  timber/parquet, carpet; a bare concrete deck has no finish; others (vinyl,
  marble ...) are listed to price. Roofs: tile, metal sheet, concrete deck
  (waterproofing, no truss). Walls named hebel/AAC/bata ringan are priced as
  AAC and walls named bata/brick as brick, whatever the wall-type option
  (which now applies only to walls that say neither). Revit rows carry the
  type's layer materials for this.
- **Stairs, railings, casework (Revit).** Concrete stairs are priced as
  structure (concrete, stair formwork, rebar), unless the type says steel
  (a steel stair with concrete-filled pans); other stairs and casework
  (kitchen sets, per metre) are listed to price; railings are priced per
  metre (stair railing or guard railing). Demolished ones are listed under
  demolition.
- **MEP names.** A sink mixer is a kitchen tap, not a washbasin; appliances
  modelled as electrical or mechanical equipment (fridge, dispenser,
  microwave ...) are not priced; 2D symbol families are not counted.
- Price book: 11 new Jakarta items (granite, homogeneous, parquet, carpet,
  metal roof, waterproofing, stair formwork, two railings, manual concrete
  demolition, metal roof removal). Until the new book is loaded, the old one
  still works: those lines fall back or are listed to price. Custom prices
  saved under the old wall, floor and roof line ids still apply.

## Unreleased (SketchUp) — "What is this?" before pricing

Real models are mostly unnamed groups full of furniture, people, timber and
landscape. The SketchUp takeoff now gives every face a role and shows the
architect what it measured, per material and tag, before the RAB:

- **Left out automatically:** furniture and entourage (by name or tag); thin
  timber/steel members and open truss panels (reported as a frame: members,
  length, m³); glass; horizontal strips under 20 cm (wall tops, beam
  soffits); undersides at ground level; bare raked roof undersides.
- **Landscape:** grass/soil (softscape) and gravel/pavers (hardscape) facing
  up are no longer floor; they get their own RAB section (PEKERJAAN
  LANSEKAP), one line per material for the architect to price.
- **Corrections:** a role per material or tag (saved in the model), and
  "Mark selection as" (wall, floor, ceiling, roof, landscape, glass, frame,
  ignore, door, window) for groups, components and faces.
- Doors/windows also recognised by drawing codes (P1, PJ-2, J3, BV1).
- Skirting length counts only floor edges where a wall rises, not slab edges.

Sumedang house (architect's RAB in brackets): roof 283 m² of roof tile
(275), ceilings 286 → 206 with "Unpainted" ignored (≈270), floor finishes
223 with "Unpainted" ignored (≈218), skirting 148 m (≈109), 45 furniture
items, 92 frame pieces and 372 m² of landscape left out of the floor.

## Security hardening against the OWASP Top 10 (17 Oct 2026)

Full review and mapping in `docs/SECURITY.md`. Fixed:

- **A01** Vendors could approve themselves, their products and versions, and
  mark their own invoices paid through the API: migration 0045 pins those
  columns for non-admin users. Pending sign-in codes are no longer readable by
  every signed-in user (`approve_device_code()`). A vendor product must use the
  vendor's own storage file.
- **A05** Product links and vendor websites are http(s) only (forms, database
  constraints, and both hosts open only http(s)): a link to a program or share
  could otherwise run on an architect's computer.
- **A07** Plugin tokens expire after 90 idle days; Revit sign-out revokes the
  token on the server.
- **A06** Starting a sign-in is limited to 60 codes a minute.
- **A09** Audit entries can only be written by Dirory's functions and admins.
- **A02/A04** HSTS added. **A03** postcss inside Next pinned to a fixed version
  (`npm audit`: 0).

Test: `supabase/tests/security_hardening_test.sql`, 11 checks, run against
production in a rolled-back transaction. SketchUp 0.10.2 (download only) and
Revit 0.1.7 carry the client fixes.


## SketchUp 0.10.1 and Revit 0.1.5 — city prices, two free estimates, Revit ribbon

**Prices for any city.** Before estimating, the RAB asks for the project
location: any of the 514 kabupaten/kota. Prices are the DKI Jakarta book ×
IKK(city) / IKK(DKI Jakarta), from BPS's *Indeks Kemahalan Konstruksi
Provinsi dan Kabupaten/Kota 2025* (Kota Surabaya = 100, built by BPS from
Kemen PU's AHSP and regional prices). Kabupaten Sumedang, for example, is
101,51 / 114,50 = 0,8866 × Jakarta. AHSP coefficients do not change; unit
prices, basic prices in the Excel workbook and the live cost all follow the
city. `scripts/extract-ikk.py` reads the publication into
`plugin/dirory_library/ui/ikk.js` and `supabase/seed/ikk_2025.json`.

**Two free estimates.** An account without Pro can generate the itemised RAB
(view, print, CSV, Excel) for two projects; opening the same project again
does not use another. Then the panel asks for Dirory Pro. Counted by the
`rab` function in **migration 0044** (`rab_free_estimates`), by the model hash
the project pass already uses. Privacy policy v1.1 says so.

**Revit.** The ribbon's Dirory panel has the Dirory icon on **Dirory Library**
and a new **Check for Updates** button, which compares the add-in with
dirory.com (`/api/plugin/latest` now reports `revit_version`) and opens the
download page; a newer version is also mentioned when the panel opens. The
panel's empty-state text no longer talks about SketchUp files in Revit.

SketchUp 0.10.1 is on /download only, like 0.10.0 (unsigned, not on the
auto-updater).


## Revit families in the catalogue; Revit 0.1.4

16 Revit families (.rfa) from vendor-sources and the archived v2 website are in
the catalogue (`scripts/upload-revit-families.mjs`, list in
`library-additions/Revit/families.json`):

- **On existing products** (one card for SketchUp and Revit): TOTO CE9,
  CW 630 PJ, LW952J, U104; Trilliunware Arabian, Chrysolite, SAPPHIRA;
  ALPHAMAX MAX 1, MAX 2.
- **New, Revit only**: TOTO TX109LRS and TX123LESN (new category Faucet),
  AW115J; Trilliunware Citrine Countertop, Cobalt Above, Juniper Vessel, Opal.
  Thumbnails are the vendors' photos; the three TOTO ones are the families'
  own previews, enlarged, until product photos exist.

**Migration 0043** adds `asset_versions.revit_file_path`. `/catalog` returns
`rfa_path` (and `has_revit` for the website) and lists Revit-only products
only for `?app=revit` and the website, so SketchUp plugins never show a card
they cannot insert. `/download/<id>?format=rfa` serves the family. **Revit
0.1.4** asks for `app=revit` and loads the family when a model card is clicked.

Not added yet, brand unknown: ASTRAL STANDARD, VISCARIA, Vessel Basin Tap 2,
two Bobrick accessories, Excel Dryer ThinAir and XLERATOR. Duplicates in the
archive (older copies of the Trilliunware families, LW952J.0001 backup,
AW115J.3dm) were left out.


## 0.10.0 (SketchUp) and 0.1.2 (Revit) — published on /download, 16 Oct 2026

Everything in the "Unreleased" entries below, now downloadable from
dirory.com/download: consent before sharing, the RAB with Jakarta prices
(architecture, structure, MEP, demolition), Dirory Pro, live cost, phasing
and demolition, own unit prices, the Excel RAB, the catalogue loading state,
and (Revit) the installer that unblocks downloaded files.

**Not on the auto-updater yet**, on purpose: 0.10.0 is unsigned and has not
been tried in SketchUp. Existing 0.9.x installs are not offered it until it is
signed and published with `scripts/upload-plugin-release.mjs` (RELEASE.md §3–4).
The extension loader now reports 0.10.0 (it still said 0.9.9).


## Unreleased — RAB as an Excel workbook

**Export RAB (Excel)** in the RAB view writes a workbook organised the way
Indonesian estimators build one (modelled on a practising estimator's
"RAB Rumah Sumedang 2025"):

- **REKAP**: divisions A–H (pembongkaran, struktur, dinding, lantai, plafon,
  atap, kusen, MEP) with their share, PPN (11% effective, editable), total,
  rounded total, floor area (from the model, editable) and cost per m².
- **RAB**: work items per division: volume × unit price = amount, with a
  subtotal per division; MEP grouped into plumbing, electrical, air and fire.
- **AHS BONGKAR / AHS STR / AHS ARS / AHS MEP**: one Analisa Harga Satuan
  block per item used: labour, materials, equipment (coefficient × price),
  D = A+B+C, E = overhead and profit, F = unit price. MEP gets its own sheet.
- **HARGA UPAH BAHAN**: every basic price the analyses use, plus the overhead
  %; change a price here and the whole workbook follows.
- **VOL**: each RAB volume with how it was measured, and the model's figures.
- **CATATAN**: sources and assumptions.

Every link is a formula (RAB → VOL and AHS, AHS → HARGA UPAH BAHAN) with the
value cached. Own prices and unpriced lines are yellow input cells.
`plugin/dirory_library/ui/xlsx.js` writes the .xlsx with no library;
`rab-xlsx.js` lays out the workbook; the hosts only save the bytes
(`saveBinary`). Tests: `scripts/test-rab-xlsx.mjs` builds a sample workbook and
`scripts/check-xlsx.py` recalculates all its formulas (704, all matching).


## Unreleased — Revit phasing, demolition, and live cost

**Phasing.** The RAB prices one Revit phase, by default the last one ("New
Construction"); the panel offers the others. In that phase new and temporary
elements are counted as construction, existing ones are not counted, and
elements the phase demolishes are priced as **demolition (pembongkaran)**
(`revit/DiroryRevit/src/Phasing.cs`, used by all three measurers). Rooms are
taken from the priced phase. SketchUp has no phases, so tags do the same job:
anything on (or inside a group or component on) a tag named "Existing",
"Eksisting" or "Lama" is not measured, and "Demolish" or "Bongkar" is listed as
demolition (`takeoff.rb`, `phase_of`).

**Demolition prices.** 17 Jakarta items: brick masonry and concrete per m³,
ceiling with frame, roof tiles and roof frame, single and double doors and
windows with frames, WCs, washbasin, urinal, floor drain, light fittings and
split ACs. All on the current circulars or Permen PUPR 8/2023, except ceramic
floor removal, which only Jakarta's 2019 list has; its line says so. SketchUp
walls have no thickness, so demolished wall faces are taken as 15 cm walls.
Debris haulage is not included. **Migration 0042** allows the `demolition`
element; the Jakarta book is 135 items.

**Live cost.** A strip at the bottom of the panel shows the model's estimated
total while the architect models, for every signed-in account. The host
re-measures 1.5 s after the last change (four times the last measurement on a
big model): SketchUp through its model observers, Revit through
`DocumentChanged` and a timer on the panel. The panel prices the takeoff with
a slim price list (`GET /rab?live=1`: unit prices only, and whether the account
has Pro; it never binds a project pass), so quantities never leave the
computer. "Breakdown" opens the itemised RAB for Pro and the upgrade offer for
everyone else. It can be hidden from the strip or the RAB options.

- `rab` Edge Function: `live=1` mode.
- Tests: `scripts/test-rab.mjs`, 59 checks. Not yet run in SketchUp or Revit.


## Unreleased — MEP in the Revit RAB; your own prices on any line

**MEP takeoff (Revit).** `revit/DiroryRevit/src/MepTakeoff.cs` measures pipe
lengths per system, material and diameter, duct surface areas, cable tray
lengths, and counts plumbing fixtures, light fittings, switches, sockets,
panels, mechanical equipment, air terminals, sprinklers and fire alarm devices
per family and type. They appear in Quantities and in the quantities CSV.

**MEP prices.** 87 AHSP items from Jakarta's list, all on the current
circulars and matching Jakarta's published totals: PVC AW, PVC D, PPR,
galvanised and HDPE pipe by diameter; WCs, washbasin, urinal, shower, taps,
floor drain; lighting and socket points (cable and conduit included),
switches, sockets, MCB box and panels; downlights, battens, spotlights, garden
and exit lights; sprinklers, smoke detectors, hydrant box; exhaust fan, grille,
diffuser. `rab.js` (`mepKey`) matches each Revit row to an item by its names:
- pipes by material and system (copper or unknown water pipe is priced as PVC
  AW and the line says what was modelled) and the next priced diameter up;
  the AHSP pipe rates already include fittings, so fittings are not counted;
- each light or socket adds one installation point;
- split AC units by PK, BTU or kW; outdoor units are not priced again.

**Market prices where AHSP has none.** Split AC ½, 1, 1.5 and 2 PK, unit plus
installation, from retail listings June–October 2026; the RAB marks them as
market estimates. Ducts, kitchen sinks, pumps and anything else Dirory cannot
match are listed without a price rather than with a guessed one, highlighted,
and left out of the total until priced.

**Your own prices.** Every RAB line's unit price is a box: type a quote to
replace the book price (or to price an unpriced line), clear it to go back.
Prices are kept by line, so one WC brand can be priced apart from another,
and stored by the host (SketchUp defaults, the Revit add-in's settings), so
they survive a restart. The printout and CSV mark them as the architect's.

- **Migration 0041** allows the `mep` element. The Jakarta book is now 118
  items.
- Tests: `scripts/test-rab.mjs`, 50 checks. Not yet run on a real Revit MEP
  model.


## Unreleased — current national AHSP; structure in the Revit RAB

**National AHSP brought up to date.** Permen PUPR 1/2022 was revoked by
**Permen PUPR 8/2023**, which moved the AHSP tables into circulars of the Dirjen
Bina Konstruksi, updated at least yearly. The old extract
(`supabase/seed/ahsp_pupr_2022.json`, `scripts/extract-ahsp.py`) is removed. In
its place `scripts/build-rab-jakarta.py` now also writes
`supabase/seed/ahsp_national.json`: every item's coefficients without prices,
each citing its circular (SE 182/SE/Dk/2025 or 47/SE/Dk/2026), for pricing
another region with its own HSD. The coefficients are as Jakarta applies them
item by item; they have not been re-read from the circular PDFs themselves.
Jakarta prices for the existing 15 items are unchanged.

**Structure in the Revit RAB.** The add-in now measures structural members and
the RAB prices them (Revit only; SketchUp has no structural elements):

- `revit/DiroryRevit/src/StructureTakeoff.cs`, per member (footing, sloof,
  column, beam, slab, concrete wall): concrete volume from concrete materials,
  formwork contact area from the solid faces (sides; plus soffits for beams and
  suspended slabs), rebar weight from modelled rebar (length × bar area × 7850),
  and steel members' weight (volume × 7850).
- Where no rebar is modelled, `rab.js` estimates it per m³ of concrete:
  footing 90, sloof 130, column 180, beam 160, slab 110, wall 120 kg/m³. These
  are planning ratios, not AHSP, and the RAB says so whenever they are used.
- 12 new Jakarta items, all matching Jakarta's published totals (formwork for
  columns within 0.15%): ready-mix and site-mixed concrete fc' 25, vibrator
  compaction, rebar BjTS ≥ 12 mm (frames) and < 12 mm (slabs), formwork for
  footing, sloof, column, beam, slab and shear wall, structural steel per kg.
- A wall with concrete in it is no longer also priced as brick: its finishes
  are priced, its core is in the structure section.
- Panel: a structure table in Quantities, a ready-mix / site-mixed choice in
  the RAB, structure rows in the Revit quantities CSV.
- **Migration 0040** allows the `structure` element in `rab_items`.
- Tests: `scripts/test-rab.mjs` (31 checks). The add-in compiles against Revit
  2024 but has not been run on a structural model yet.


## Unreleased — download page lists SketchUp for Web and iPad as coming soon

`/download` shows SketchUp for Web and SketchUp for iPad next to the three
downloads, marked "Coming soon" and not selectable: those versions use the
JavaScript extension API, are still being tested (`jsa/`), and will install
from inside SketchUp rather than as a downloaded file.

## Unreleased — catalogue reachable from SketchUp for Web / iPad

`/catalog` answered the browser's CORS preflight with 405, so the JavaScript
(JSA) extension could not load the catalogue (`jsa/docs/GAPS.md` B1). It now
returns the shared CORS headers for `OPTIONS`, like the other functions.
Deployed; preflight 200, `GET` with the key from a SketchUp-for-Web origin 200
with all items, desktop plugin response unchanged (22 keys). The M0 spike is
re-packed as `dist/dirory-spike-0.0.1.zip` for a run in SketchUp for Web.

## Unreleased — final privacy policy, download choice, Revit install guide

- **Privacy policy v1.0** (`/privacy`, English and Bahasa Indonesia). The
  "Draft" label and the controller placeholder are gone. Controller: Rendy Noor
  Chandra (Dirory); privacy requests to hello@dirory.com or WhatsApp. Written
  against UU PDP: data, purpose and legal basis per item; what vendors see
  (aggregates from 5+ architects only); processors and the Singapore transfer
  (Art. 56); retention matching migration 0036; the data-subject rights and how
  to use them (3 x 24 hours); breach notice within 3 x 24 hours (Art. 46).
  `docs/PRIVACY.md` now points to the page and lists where each claim is
  enforced; the v0.1 draft it held described plugin v0.5.1 and is in history.
- **Download choice.** `/download` asks SketchUp, Revit or both; the button,
  its label and the file follow the choice, and the choice also rides the
  first-time consent form. New `/api/download/bundle` serves both in one zip
  (`scripts/build-download-bundle.ps1`). All three routes share one sign-in and
  consent gate (`lib/pluginDownload.ts`); file names live in
  `lib/pluginRelease.ts`.
- **How to install** now has a SketchUp | Revit switch and a full Revit section:
  eight steps (including Revit's "unsigned add-in" prompt), where things are,
  troubleshooting and uninstall, in both languages.

## Unreleased — signed releases: the updater replaces the extension cleanly

SketchUp showed Dirory as **Unsigned**. Signing is done per release in the
Extension Warehouse Developer Center; the new **`docs/RELEASE.md`** puts that
step between building and publishing (sign last — any change after signing
breaks the signature).

The updater was not safe for signed releases: it copied a new version **over**
the installed folder, so a file a release removed would stay behind and make
SketchUp report the extension as modified. It now:

- refuses to stage an archive that is not a whole extension
  (`dirory_library.rb` + `dirory_library/main.rb`);
- at the next start backs up the installed extension to
  `~/.dirory/previous_version`, deletes it, and copies the new one in whole;
- restores the backup if the copy fails.

## Unreleased — Dirory for Revit 0.1.0 (beta)

A Revit 2024 add-in on the same principle as the SketchUp plugin — and the
same panel. `revit/DiroryRevit` hosts `plugin/dirory_library/ui` in a WebView2
dockable pane; a bridge turns the panel's `sketchup.*` calls into messages for
the add-in, which answers through the same `window.dirory*` functions Ruby
uses. Catalogue, search, colour families, quantities and RAB are one code base.

- **Materials.** A Revit material is not an image, so Dirory builds one per
  catalogue material: the texture as the render appearance at its real size
  (the catalogue's tile size), the texture's average colour for shaded views,
  and the tile grid as a model surface pattern, so drawings show real joints.
  Click a card, then click faces to paint (`Document.Paint`), Esc to finish.
- **Models.** Families (`.rfa`) load and are placed with Revit's own placement.
  The catalogue has no `.rfa` files yet, so only materials show for now.
- **RAB.** The takeoff comes from Revit elements, not face directions: walls
  (both faces), floors, ceilings, roofs (`HOST_AREA_COMPUTED`), doors and
  windows per type with their width/height, skirting from room perimeters.
  Same shape as `takeoff.rb`, so `rab.js`, the Jakarta price book and the Pro
  gate apply unchanged; a project pass binds to a hash of the project's id.
- Sends no usage data (no usage reports, search misses or quotes yet), so it
  needs no consent switches.
- `scripts/build-revit.ps1` compiles with the Build Tools' Roslyn csc against
  .NET 4.8 and Revit's own DLLs (no SDK, no NuGet) and packages
  `DiroryRevit-2024-0.1.0.zip` with `Install-Dirory.cmd` (per user, no admin).
- **Website.** `/download` offers the Revit package (same sign-in and consent
  gate, `/api/download/revit`); the landing page and site title say "SketchUp
  and Revit" in both languages.

Compiled, not yet run in Revit.

## Unreleased — Dirory Pro for architects, paid by QRIS (RAB step 3)

The RAB cost estimate now needs Dirory Pro.

- **Plans (migration 0039, editable in `pro_plans`)**: monthly Rp 99.000 for 30
  days on every model; one-project pass Rp 49.000 for 30 days, bound to the
  first SketchUp model it is used on (only a SHA-256 of the model's guid is
  stored).
- **`/pro`**: plans, current Pro status, **Pay with QRIS**. `pro_create_order()`
  prices the order from the table (never the browser), `/api/pro/order` mints a
  dynamic QRIS (`DRP-<order>-<time>`), and the page polls until it is paid.
- **Webhook**: `DRP-` orders are settled by `mark_pro_order_paid()` with the
  same rules as vendor invoices — signature, idempotent event log, exact-amount
  match — and it grants once however often Midtrans retries. A second monthly
  payment extends from the end of the current month. Vendor invoices untouched.
- **`rab` Edge Function** answers 402 `pro_required` with the upgrade link
  unless the architect has Pro (admins pass for testing); the plugin shows
  **⭐ Get Dirory Pro**.
- Fixed in passing: the product-info "open page" button sent the URL in a form
  the plugin's `openURL` callback could not read.
- Test: `supabase/tests/dirory_pro_test.sql`.

## Unreleased — RAB step 2: Jakarta price book and cost estimate

**Coefficients: the newest official ones, via Jakarta.** Permen PUPR 1/2022 was
extracted first (`scripts/extract-ahsp.py` → `supabase/seed/ahsp_pupr_2022.json`,
15 items, kept as the national fallback). Checking it against Jakarta's own
published unit rates showed differences of up to +100%: Jakarta already uses
**SE Dirjen Bina Konstruksi 182/SE/Dk/2025 and 47/SE/Dk/2026**, which supersede
the 2022 productivity figures (ceramic floor labour 0.70 → 0.15 OH/m²). The
2022 text also has typos (AAC mortar 0.063 kg/m², hollow 40.40 at "4000 m'/m²").
So the Jakarta book is built from Jakarta's analyses: those coefficients ×
Jakarta's basic prices (HSD, wages per Kepgub DKI) + 15% overhead.

- `scripts/build-rab-jakarta.py` fetches the 15 items from the public DCKTRP
  "Bangun Jakarta" HSP API and recomputes each; all 15 match Jakarta's
  published totals to the rupiah. Output: `supabase/seed/rab_jakarta.json`.
- Items: red brick ½ batu / AAC 10 cm, plaster 1:4, skim coat, interior paint,
  wall tile 20×20, floor tile 40×40, skirting, hollow ceiling frame, gypsum 9 mm,
  light-steel truss, concrete roof tile, aluminium frame, panel door leaf,
  5 mm glass.
- **Migration 0038**: `rab_regions`, `rab_items`, `rab_components` (admin-only;
  served by the new **`rab` Edge Function** to signed-in plugins — where the Pro
  check goes in step 3). `scripts/seed-rab.mjs --region jakarta` loads it.
- **Plugin**: `ui/rab.js` (pure, `node scripts/test-rab.mjs`, 15 tests) turns
  the takeoff into volumes — masonry = wall faces / 2, finishes = untiled faces,
  tiled walls by Dirory tile category, skirting = floor perimeter, frames =
  2(W+H) per opening — and prices them. The Quantities section gains
  **💰 Estimate cost (RAB)** with brick/AAC and single/double-face options,
  subtotals per element, print (opens in the browser) and CSV.

Not deployed yet (0038, seed, `rab` function). Excludes PPN. Plugin not yet run
in SketchUp; checked in the browser with the real Jakarta book.

## Unreleased — Quantity takeoff (RAB step 1)

The first step of Dirory Pro's RAB / Bill of Quantities: measure the
architecture itself, not only the Dirory products in it. Volumes only — the
AHSP coefficients (Permen PUPR 1/2022) and Jakarta unit prices come next.

- **`plugin/dirory_library/takeoff.rb`.** Faces in the model and in groups are
  classified by world-space direction: vertical = wall, up = floor (or roof
  when tagged roof/atap), down = ceiling, sloped = roof (true area). Areas are
  summed per element and material, openings already deducted. Components are
  not measured (furniture/products); those named door/pintu, window/jendela,
  kusen — or Dirory items in such a category — are counted with their world
  width × height. Floor perimeter is reported for skirting. Tags never decide
  floor vs wall: "Lantai 1" names a storey.
- **Usage tab → 📐 Quantities.** Measure model, per-element tables with
  totals, doors & windows, notes on what was skipped, and CSV export.
- **Print schedule** now includes the quantities and openings.
- `rb:check` covers `takeoff.rb` and cross-checks `Takeoff.*` calls.

Not verified in SketchUp (no Ruby here): parse-checked and the panel checked
in a browser with sample data only.

## Unreleased — housekeeping jobs actually scheduled

pg_cron was never installed, so the "best effort" schedules in 0022 and 0036
silently did nothing: subscription statuses were never expired and nothing was
ever deleted for retention. Migration 0037 installs pg_cron and schedules
`dirory-expire-subs` (hourly at :15) and `dirory-retention` (daily 02:30 UTC =
09:30 WIB). Verified in `cron.job` on production, both active.

## Unreleased — BDA products live, Hunter Douglas ceilings extracted, vendor minimum, retention

**BDA Sanitary (live).** The 41 SketchUp files BDA sent are filed in the library
as `Model/Closet/Icepol` (11), `Model/Lavatory/Icepol` (14), `Model/Kitchen
Sink/Valpra` (13) and `Model/Kitchen Sink/Yoshimoto` (3), named by model code
("(BDA GROUP)" dropped). Each carries its official product photo: from
bdagroup.co.id (the related-product images are labelled with the model code),
Yoshimoto's from yoshimoto-sangyo.co.jp. IC-210 is no longer on BDA's site; its
photo is a retailer image cropped to the product. IC-036's x1-x3 variant files
stay in vendor-sources (no product page of their own).
**28 are live**; 13 are over the 50 MB `models` bucket limit and stay local:
the ten Valpra granite sinks (52-60 MB), V-VT 5480 GY (70 MB) and Yoshimoto
HS700/HS950 (169/208 MB). They need Purge Unused / smaller textures in
SketchUp, or a higher bucket limit. Icepol, Valpra and Yoshimoto got the usual
seeded non-expiring subscription so the catalogue shows them.

**Hunter Douglas ceilings (local, not uploaded).**
`scripts/extract-hunterdouglas-ceilings.py` reads the 404-page product guide's
reference pages into `Materials/Ceiling/Hunter Douglas`: 64 woodgrain/veneer
finishes (captions are part of the raster, so transcribed), 12 stretch-metal
meshes, 14 metal and 3 wood perforations. Perforations are rebuilt from the
vector drawing — hole lattice, smallest rectangular repeat, whole-cm tile — and
the printed diameter calibrates scale (P134 is labelled 1:4 but drawn at 1:8).
Clustered, irregular, slotted and pitch-mismatched patterns are skipped and
listed.

**Vendors see usage only above 5 architects (UU PDP A6, migration 0035).**
Totals, per-product rows, the daily trend (per product per day) and category
share withhold any figure covering fewer than 5 installs; the dashboard and
CSV say so. Quote counts are always shown. Test:
`supabase/tests/vendor_threshold_test.sql`.

**Retention (UU PDP A9, migration 0036).** `run_retention()` deletes usage
history and stale snapshots, ingest/health/unhandled logs after 12 months, raw
search misses, audit and security logs after 24. Invoices, subscriptions,
consent_log and quote_requests are never touched. Scheduled daily with pg_cron
when available.

**Plugin 0.10.0.** Size filter (tiles: "60 × 120 cm", orientation-free), an ⓘ
product-info button on every card, and **🖨 Print schedule** in the Usage tab:
a finish & fixture schedule of the open model, opened in the browser to print
or save as PDF.

## Unreleased — Plugin 0.10.0: panel fixes and paint colour families

- **Settings and account stayed out of reach on long lists.** The header was
  not pinned, only the search bar was, so after scrolling any long tab (All,
  Models, Materials) the ⚙ and account buttons had scrolled away; Favourite is
  short enough never to scroll, which is why they seemed to exist only there.
  The header is now pinned above the search bar (`--header-h`).
- **Inspector button hidden** for now (the code stays wired up). It came from
  Thudio, where it shows price and purchase details Dirory does not carry yet.
- **Search button is a magnifying-glass icon.**
- **Colour family for paint** (from Thudio's Wall Paint browser). When the list
  is paint — category "Paint", or a brand whose items are all paint — a row of
  chips (White, Cream, Yellow, Orange, Red, Pink, Purple, Blue, Green, Brown,
  Grey, Black) narrows hundreds of colours to one family, light to dark. The
  catalogue stores no colour, so each paint's colour is sampled once from its
  thumbnail (served with `Access-Control-Allow-Origin: *`) and cached in the
  panel's local storage per asset version. Neutrals are classified by chroma,
  not HSL saturation, which reads barely-tinted whites as saturated. Checked on
  400 live paints: every one landed in a family.

## Unreleased — Plugin 0.10.0: consent before sharing (UU PDP A1, A3, A4)

OpenCode started this work on 13 Oct and deployed the server half (migrations
0031/0032 and a new `events` function). The plugin half was left uncommitted and
broken: it removed `base_headers` / `request_headers` while twelve calls still
used them, so every cloud call would have raised. The released 0.9.9 predates it.

**Consent is asked on the download page, not inside SketchUp (A3).**
A popup after sign-in interrupted work and did not fit the panel. `/download`
now carries the three choices — "Share usage" and "Also send my project name"
unchecked, "Report searches that find nothing" checked — next to the privacy
notice, and records them with `record_my_consent` (migration 0034: writes
`consent_log` with `source = 'website'` and the profile, for `auth.uid()` only).
`/api/download/rbz` requires them too. "Change my choices" edits them later
without downloading again. `auth-device/poll` returns them on approval and the
plugin adopts them, so a new architect is never asked inside SketchUp.

**Plugin 0.10.0**
- Nothing is shared until choices exist for the current policy
  (`Cloud.consent_answered?` gates `share_usage?`), which also resets everyone
  upgrading from a version where usage sharing was on by default.
  `CONSENT_VERSION` re-asks everyone when the policy changes.
- Architects already signed in before this (they never pass the download page)
  get an amber dot on the account button and a "Confirm these choices" box in
  the account panel — no popup.
- **Three switches** in the account panel; the search-miss switch is separate
  from usage and gates the panel's "we've noted your search" text too.
- **A4 consent log.** The first answer logs all three choices, later changes
  log the switch that changed, as `consent_log` events (signed in only).
- **A1 anonymous misses.** Search misses go in their own envelope with no
  `install_id`, no `user` and **no sign-in token**. Each request clears only its
  own outbox entries, so one failing does not resend the other.
- `user` in the envelope is back to its committed shape (name, email, phone,
  firm) — OpenCode had added the share flags to it.

**`events` function**
- `consent_log` rows are written only for an account proven by the plugin
  token, never the email in the envelope, and mirror the choice onto
  `profiles.share_*` / `consent_version`. Unknown purposes are dropped.
- Search misses are scrubbed of emails and Indonesian phone numbers before
  storage (`node scripts/test-scrub-query.mjs`), and are logged in
  `ingest_log` with no install id, from either envelope.
- The anonymous envelope has its own global rate limit (600/min).
- A2 safety net: a snapshot from a plugin older than 0.5.2 never stores a
  project title.
- Removed debug logging that printed architects' email addresses.
- Plugins up to 0.9.9 keep working unchanged.

**Migration 0033** clears `ingest_log.install_id` on past search-miss rows (the
last join key back to an install) and revokes client writes on `consent_log`.
New test: `supabase/tests/consent_log_test.sql`; `rls_test.sql` no longer
inserts the dropped `search_misses.install_id`.

`missing_requests.distinct_installs` can no longer be counted, so the admin
column is labelled "Installs (to 13 Oct)".

## Unreleased — Kalua Studio vendor list: 30 cold-outreach proposals

A colleague at Kalua Studio shared a vendor database (42 rows). **Eight rows are not
Dirory's audience** and are deliberately excluded: Milenial Konsultan (permit
consulting), Builtycon (structural analysis / DED), Hoomix and Nuvrion (web
development), Serona Studio (interior contractor), PT Cipta Satria Informatika
(SketchUp reseller), PT Nusantara Secom Infotech (Autodesk reseller) and a signage
fabricator in China — none of them sells a product an architect can place in a
drawing. Wisma Sehati is also absent: it already has a proposal in the long series,
addressed to a different person. Two rows have no trading name in the sheet (a
marble supplier and a Chinese acoustic supplier), so they have no addressee.

- **A new short format.** `scripts/build-outreach-proposals.mjs` produces a four-page
  document — cover, the friction and the metric, how it works, the ask. The
  twelve-page format sells a subscription to a strategic target and is the wrong
  shape for thirty cold introductions; it stays for accounts pursued deliberately.
  Roman's paper opens by acknowledging the 94 products already live rather than
  offering to list them.
- **`proposals/outreach/send-list.md`**, generated by the same run: per vendor the
  PIC, the phone number, the PDF to attach, and a `wa.me` link with the opener
  already written, ready to click.
- **`proposals/whatsapp-templates.md`**: five reusable messages — first contact, a
  short version, a follow-up, and a variant for brands already in the catalogue —
  plus send-timing notes.
- Contact details are read from the spreadsheet by
  `scripts/extract-kalua-contacts.py`. Thirty numbers arrive in five formats
  (`62 878-7480-0700`, `6281110119278.0`, `86 188 3291 7521`) and one wrong digit
  sends a proposal to a stranger, so none is typed by hand.

## Unreleased — IAI Jawa Barat paper revised

The architect-facing paper (`scripts/build-iai-proposal.mjs`) was carrying figures
from a day earlier, when the library was much smaller. Its `DATA` block is read
from the live catalogue again:

| | was | now |
|---|---|---|
| produk tayang | 1.360 | **2.015** (30 models + 1.985 materials) |
| merek | 12 | **16** |
| kategori | 38 | **41** |
| asOf | Oktober 2026 | **13 Oktober 2026** |

`brands` keeps the previous edition's rule — approved, non-platform vendors,
minus the platform's own "Dirory" sample brand — which is what `/for-vendors`
counts too, and is what made the old figure 12. (Counting only the manufacturing
brands, i.e. leaving out the MATERIUM, Ellis and Tromso sample sets as well, would
be 13; the number is a one-line change.)

**Tembusan added.** `Ar. Eriko Mawanto, IAI, AA, GP` — Sekretaris, Ikatan Arsitek
Indonesia — Jawa Barat — appears on the cover under the chair, and again in the
closing note. Bapak Ar. Adrian Santoso remains the primary recipient.

**The PDF is rebuilt too.** `proposals/iai-jawa-barat.pdf` is now the revised
10-page edition (10 pages, 2.015 / 16 / 41, Tembusan present, no trace of 1.360).
The first attempt could not replace it — it was held open by another program, so
the builder wrote `iai-jawa-barat.new.pdf` instead, which is its designed
behaviour for that case; once the file was closed the swap went through.

`proposals/IAI jabar.pdf` — a copy outside the repo's naming, not byte-identical
to any committed edition — was left untouched.

## Unreleased — vendor terminology, and a proposal for BDA Group

**One name for one audience: vendor.** The landing nav pointed at `/for-vendors`
but was labelled "For brands", and the proposals told prospects to register at
`dirory.com/vendor` — the signed-in portal. `requireVendor()` redirects an
anonymous visitor to `/login?next=/vendor`, so every cold contact was being sent
to a login wall.

- `nav.forBrands` → `nav.forVendors`, "For brands" → "For vendors" in both
  locales, and the same for the `/vendor` portal tag, the pricing tag and the
  pricing CTA. A sweep of every remaining audience-facing string turned up the
  pricing gate text, the pricing page title, and the vendor dashboard, where one
  screen was labelled "Vendor onboarding" in the layout and "Register your brand"
  on the card. The card's form collects a *company* name and a *brand* name —
  which is the distinction exactly, so those now say "Register as a vendor".
- **"brand" still means the product's brand** — the library filter, the brand
  logos, "Brands on Dirory today", the brand names themselves. The split is the
  PRD's own glossary: a **vendor** is the company (web portal, subscription);
  a **brand** is what it supplies. "Vendor" was already the word in the URL, the
  portal, `fv.kicker` ("Dirory for vendors") and `pricing.personalTitle`; the nav
  label was the one place that broke rank.
- Every proposal and the pitchdeck now carry **dirory.com/for-vendors** only.
  The dashboard is referred to by name rather than by its gated URL. All 12
  existing PDFs rebuilt; none still cites `/vendor`.

**New proposal: BDA Group** — `proposals/bda-group.pdf`, 12 pages, Bahasa
Indonesia, for `marketing@bda.co.id`. PT Bangun Delta Abadi has distributed
interior and architectural finishes since 1969 and carries ten brands (COVE,
ICEPOL, VALPRA, Hansgrohe, Yoshimoto, Amadeo, Zed, Qiaohui, Core, Flexible
Stone). The framing is the distributor one: the risk is not being unknown, it is
the specification stopping at a size — so the metric is per brand *inside* the
house, which of BDA's ten actually gets written into the drawing. None of its
brands are in the catalogue, so the digitization pilot is the hook. Addressed to
the marketing team, since the site publishes no marketing contact by name.

**`send-email.mjs` now reads `.env`.** The mailbox password was documented as an
environment variable you had to export in every new shell. It is now read from
`.env` at the repo root as well — still gitignored, so it remains out of the
repository, and a real environment variable still wins. See docs/EMAIL.md §5.

## Unreleased — /library was serving a frozen catalogue

The public library page showed **1,489** products while `/for-vendors` — and the
API itself — showed **2,015**. It was not lag; the page was stuck.

- **Why.** `/library` reads the catalogue via `fetchCatalog()`, which asks for
  `next: { revalidate: 300 }`. The response has grown to **2.95 MB**
  uncompressed, past Next's hard-coded 2 MB per-entry fetch-cache limit
  (`next/dist/server/lib/incremental-cache/index.js`), so every revalidation
  write was refused:

      Failed to set Next.js data cache for .../catalog?thumbs=path,
      items over 2MB can not be cached (2627977 bytes)

  The cache entry could therefore never be replaced, and the page kept rendering
  whatever catalogue was current when it last fit — 1,489 items (30 models +
  1,459 materials), i.e. before Jotun/Jotaplast, Marks, Roman, BlueScope and
  Dulux. `/for-vendors` never had the problem: it is `force-dynamic` and counts
  the `assets` table directly, so the two pages were never reading the same
  thing.
- **Fix.** A new `fields=browse` mode on the `catalog` Edge Function returns only
  the fields the website renders. The payload drops from **2.95 MB to 0.70 MB**,
  so it caches again and the 5-minute revalidation works. `thumbnail` and
  `material_path` alone were ~15% each, and `brand_logo`, `legacy_key`, `key`,
  `vendor_id` and a duplicate `id` most of the rest.
- **The plugin contract is untouched (FR-A7/F7).** Called with no query string —
  as `cloud.rb` does — `/catalog` still returns all 22 keys, verified against the
  deployed function.
- The website's `CatalogItem` now describes the browse shape; that is all
  `/library` and `/product/[id]` ever read.

## Unreleased — Dulux: 332 colour materials

Both Dulux Indonesia colour cards under `Materials/Paint/Dulux` are now in the
catalogue, under the existing **Paint** category, brand **Dulux**.

- `dulux-e-colourcard-interior-2020.pdf` — **209** swatches from the Interior
  Wall and Interior Light & Space / Cat Kayu & Besi sections. The name and code
  come from the text layer, so nothing was read by eye; the colour is sampled
  from the swatch.
- `dulux-colour-futures-2025-colour-card.pdf` — **123** more from the bitmap
  card. That file has no text layer at all, so its captions were read off the
  rendered pages — Windows OCR for the positions, then every caption checked
  against its page — and committed as
  `scripts/data/dulux-colour-futures.json`. Codes are repaired from the OCR's
  systematic O↔0 / I↔1 / 8↔B confusions in
  `scripts/build-dulux-futures-data.py`. Colours are still sampled, never typed.
- De-duplicated **by code**: the two cards overlap and print the same code for
  the same colour, so 457 raw swatches collapse to 332. Where the cards
  disagree the 2020 card wins — its strings are exact, and it carries the names
  these colours are actually sold under (*Power Puff 24706*, not the 2025 card's
  *Powder Puff*).
- Four names deliberately carry two codes — *Apple White*, *Brilliant White*
  (2290 and LS 2290), *Beryl Green*, *Smoke Grey* — because that is what the
  cards print. Codes containing `/` are stored with `-`: a `/` is illegal in both
  a Storage object key and a filename.
- Colours are print samples, not measured values; neither card states one. Six
  shared colours print differently between the editions (by up to 34/255). Both
  cards are uniform within themselves, so that is the printing, not the sampling.

**Seeded an active subscription for Dulux** — FR-A9/FR-M6 hides a non-platform
vendor's assets without one. Same one-row change as Jotun, Marks and BlueScope.

## Unreleased — plugin 0.9.9: Enscape-style update popup

The update flow was a badge in the panel and a dead-end message. Now it mirrors
the Enscape pattern from the request: a **native popup** (`UI::Notification`,
2017+, so safe on the 2019+ floor) announcing the new version with its **release
notes**, an **Update** button that opens the panel and downloads, a **round
spinner plus progress bar** while it installs, and a **restart reminder**
notification once staged.

- Release notes ride with the release: `upload-plugin-release.mjs --notes/--notes-id`
  writes a `<basename>.json` sidecar next to the `.rbz`; `/plugin-release`
  serves them as `notes`/`notes_id` (additive — older plugins ignore the fields).
  The bucket only allows `application/octet-stream`, so the sidecar is stored as
  that; the function parses the body itself.
- `set_download_progress_callback` feeds `window.diroryUpdateProgress`; unknown
  totals show an indeterminate slide, never a fake percentage.
- Held notification references (pre-2021.1 GC crash), once-per-session popups,
  `defined?(UI::Notification)` guards throughout.
- Also fixed: the update badge click wrote the literal key `update.leading` into
  the settings message (no such i18n key existed) — it now shows the downloading
  state. New `update.popup_title/downloading/downloading_unknown/restart_popup`
  keys in both locales.
- Verified without SketchUp: `rb:check` clean, deno check clean, a contract test
  over the Ruby↔JS seam (every `window.*` push, `sketchup.*` call, `byId`, and
  update i18n key resolves on both sides), and the live endpoint round-trip
  (`0.9.9` + 3 en / 3 id notes). **In-SketchUp run still needed** — no Ruby
  interpreter on this machine and no Ruby test files exist in the repo.

## 0.18.0 — JSA port: M0 spike (SketchUp for Web and iPad)

New project in **`jsa/`**: a SketchUp **JavaScript API** extension so Dirory runs
in SketchUp for Web and on iPad. The Ruby plugin is untouched. This commit is
M0 only — the spike — and per the brief it stops here for a go-ahead.

**What the spike found before it ever ran.**

- **`/catalog` cannot be called from a browser with the `apikey` header.** It is
  the one Edge Function that does not answer `OPTIONS` (405), so the CORS
  preflight fails: reproduced in a real browser as `TypeError: Failed to fetch`,
  with `/download` under the identical header as a passing control. The fix is
  one `OPTIONS` branch in `supabase/functions/catalog/index.ts` — **not applied,
  because brief §0.2 puts the backend off-limits without asking.**
- **There is no texture-size API in the JSA.** Searched the whole 2.6 MB SDK
  bundle; `Texture` has no size/width setter and Trimble's own capability table
  says "size manipulation is future". The Ruby plugin's material feature is
  *real-world scale*, and that scale is what makes the Usage tab's m² figure
  meaningful — so this is a product-level gap, not a detail.
- **Custom tools are still not in the production JSA**, so `MaterialPaintTool`
  cannot be ported. Fallback order and the API calls for each are in
  `jsa/docs/GAPS.md`.
- Also corrected from the live backend: `/auth-device/start` does **not** return
  `verification_url_complete` (both the brief and the Ruby client name it); it
  returns `interval` and `expires_in`, which the client should honour instead of
  hardcoding.

Deliverables: a ready-to-upload spike bundle (`dist/dirory-spike-0.0.1.zip`, 11
checks, dumps API members rather than guessing them), `jsa/docs/SPIKE.md` (the
M0 table), `jsa/docs/GAPS.md`, and `jsa/docs/API.md` (the real catalogue shape,
captured: 1360 items, 2.1 MB, signed thumbnails that expire).

**M0 is not complete** — it needs a SketchUp-for-Web session to run the probe,
which I do not have.

## 0.17.21 — the SketchUp requirement was wrong in both directions

The install page said **SketchUp 2021+**. Asked to widen it to 2014+, I checked
before editing, and the claim turned out to be wrong — just not in the direction
assumed.

- **2014 is impossible.** `UI::HtmlDialog` and `Sketchup::Http::Request` were
  *both* introduced in **SketchUp 2017** (Trimble's Ruby API docs, which state the
  version on every method). On 2014 the plugin has no way to open its panel or
  reach the cloud. 2014 also ships Ruby 2.0.
- **2017 and 2018 are impossible too** — the part the old comment got wrong. It
  blamed the HTTP API, which is 2017. The real obstacle is Ruby: `updater.rb` uses
  squiggly heredocs (`<<~`, Ruby 2.3+) and `main.rb` uses `String#match?` and
  `Array#sum` (Ruby 2.4+), while 2017 and 2018 shipped **Ruby 2.2**. That is not a
  runtime failure but a **parse** failure, which is worse: the extension never
  loads, so no friendly "upgrade SketchUp" message can even run.
- **2019 is the real floor.** It is the release where Trimble upgraded Ruby to
  2.5, and the first satisfying both the 2017 APIs and the Ruby features used.

So the page now says **2019+**, which *widens* the range from 2021+ to include
2019 and 2020 — the opposite of the feared outcome, and actually true. Also
verified, so the two are not confused later: the `"2021+"` strings in
`su-version.ts`, `catalog.ts` and migration 0011 are the **`.skp` file format**
(SketchUp 2021 introduced a versionless format), which is unrelated and
deliberately untouched.

The plugin's own diagnostics in `cloud.rb` were corrected to match, but reaching
installed copies needs a version bump, rebuild and publish — not done here.

## 0.17.20 — the Wisma Sehati proposal, and a way to send it

**A proposal for a distributor, not a brand owner.** Wisma Sehati (PT Sehati Abadi,
building materials since 1976, seven showrooms) is not a manufacturer: it carries
Kohler, Hansgrohe, Porcelanosa and Atlas Concorde *alongside* its own house brand,
Sehati. That changes the argument. A brand owner worries about being unknown; a
distributor worries about the specification stopping at a size — an architect
writes "keramik 60x60", and the contractor buys whatever is cheapest. So the
proposal argues that Dirory puts a *name and type* into the drawing, and counts the
result by m² and by unit. It also means there is a missing `role`: no title for Ibu
Dederiane Hunara is published anywhere, so the template was changed to **omit the
title rather than invent one** — "Ibu X, · PT Y" reads as a mistake, and a wrong
title reads as careless.

**`docs/EMAIL.md` — sending as `rendy@dirory.com`,** which turned up something worth
knowing before the next person tries it. The mail service presents a TLS certificate
for **`mx4.mailspace.id` only**:

```
mail.dirory.com:465   CN=mx4.mailspace.id   SAN=DNS:mx4.mailspace.id
```

So `mail.dirory.com` is the right host for the *webmail website* (its HTTPS
certificate is valid) but the wrong host for SMTP/IMAP — it connects and then fails
on "hostname does not match certificate", which is the usual reason a mail client
refuses to save the account. Use `mx4.mailspace.id` in clients. The document also
records why the domain must be sent through Mailspace at all: `DMARC p=reject` means
an unauthenticated message is **dropped, not filtered**, and the VPS cannot do it
anyway (outbound port 25 blocked, no PTR).

**`scripts/send-email.mjs` — one command per proposal.** Reads
`proposals/emails/<slug>.md`, attaches the PDF that template names, and can preview
(`--dry-run`, the default) or send. The point is the pairing: recipient and
attachment come from the same file, which is the one way to be sure the Propan
proposal does not land in Wisma Sehati's inbox. No dependencies — SMTP over Node's
`tls`/`net`. Verified against the live server: TLS validates, EHLO is accepted, the
AUTH exchange runs, and a deliberately wrong password returns
`535 Incorrect authentication data`. Then tested for real against the live mailbox
— **the credential works**, the message is delivered, and the script now also files
a copy in `INBOX.Sent` over IMAP, because SMTP alone leaves no record of what went
out. The mailbox is fully accessible, which also means it is no longer what blocks
magic-link sign-in. The one link that stays unverifiable from inside the domain is
whether outbound mail to *other* servers carries a DKIM signature: local delivery
never adds one, so the delivered copy has no `DKIM-Signature` header either way.

Also fixed a typo shipped in all ten brand proposals ("Mengkurasi" → "Mengurasi"),
which is why every existing PDF is regenerated in this commit.

## 0.17.19 — the CSP that took the site down

**A self-inflicted outage, caught and fixed.** The A05 work in 0.17.18 added the
four directives that "cannot break rendering" — and then added `default-src 'self'`
next to them, which is the fallback for every fetch directive *not* named. So it
quietly became a `script-src` and `style-src` too. Next ships ~18 inline bootstrap
scripts and React writes inline styles, so **every browser refused them and nothing
hydrated**, while the server saw nothing wrong: HTTP 200, complete 54 KB body, all
routes answering. `curl` is blind to this failure mode — it was only visible in
Chrome's console (`Executing inline script violates the following Content Security
Policy`, ×18). Removed `default-src`; the remaining four directives are safe
precisely because none of them can restrict loading. `docs/SECURITY.md` now says so
explicitly, and requires header changes to be verified in a real browser with zero
`Refused to` lines — not with `curl`.

Recreating Caddy rather than reloading it is what made the fix land: the config is
bind-mounted, so its inode is pinned and `git pull` alone never reaches the running
container. That defect was fixed in 6780c7d; this is the first change to exercise it.

**Also:** `proposals/iai-jawa-barat.pdf` — an architect-facing proposal for
Ikatan Arsitek Indonesia, Jawa Barat chapter. Deliberately not built from
`build-proposals.mjs`: that document sells a subscription, quotes packages and
offers a digitization pilot, and every one of those would be wrong for an
association of architects, who pay nothing. A separate builder
(`scripts/build-iai-proposal.mjs`) argues the two frictions an architect meets
daily — models that are not the product actually sold in Indonesia, and quantities
counted by hand — and asks for a working relationship with the chapter, not a sale.

## 0.17.18 — security hardening against the OWASP Top 10

A pass over the ten categories, written up in `docs/SECURITY.md`. Real findings,
not header theatre:

**A06, and the most consequential one.** `next` 15.5.26 carried **cache-poisoning
advisories for SSG/ISR in self-hosted deployments** — directly applicable, since
Dirory is self-hosted. Upgraded to **15.5.27**; `source-map-js` DoS cleared by
`npm audit fix`. Production vulnerabilities: 3 → 2. The remainder needs Next 16
(breaking) and is a *build-time* `postcss` issue that requires attacker-controlled
CSS, which Dirory never compiles.

**A05.** The **`materials` bucket accepted any MIME type** — and that bucket is
where **payment proofs** land, which an admin opens from Admin → Payments. Now
images and PDF only, SVG excluded (0029); it is the one image format that executes.
Also: `poweredByHeader` off, and a CSP with the four directives that cannot break
rendering — `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`,
`form-action 'self'` — plus `Cross-Origin-Opener-Policy: same-origin-allow-popups`
(allow-popups, not `same-origin`, so Google sign-in survives).

A `script-src` policy is deliberately **not** shipped: a wrong source there
silently breaks the Midtrans Snap page, and a broken payment path is worse than a
looser CSP. It needs a real payment test first.

**A04.** The webhook — public by necessity, protected only by the signature — had
no body limit. Now 64 KB, enforced on the bytes received rather than on
`Content-Length`.

**A09, the previous gap.** Migration **0030** adds `security_events`, written with
the service role by the routes that see hostile input: bad signature, oversized
body, amount mismatch, and a **signed notification with no matching invoice** (a
payment taken with nothing credited). They surface at `/admin/security`, and email
to `SECURITY_ALERT_TO` (default the founder's address), throttled to one per kind
per 15 minutes so a flood becomes one mail instead of thousands.

Delivery needs `RESEND_API_KEY`. The VPS cannot send mail itself: dirory.com
publishes DMARC `p=reject`, so anything claiming to be from it without matching
DKIM is rejected by Gmail outright. Without a key the events are still recorded and
the reason is logged.

**And a deployment bug, found only by verifying the headers.** They deployed
successfully and did nothing: a **file bind-mount pins the inode**, and `git pull`
*replaces* the Caddyfile rather than editing it, so the running Caddy kept reading
the old copy. The deploy recreates `web` but never `caddy`, so **any Caddyfile
change silently never applies**. `scripts/deploy.sh` now compares the hash Caddy
holds against the file on disk and recreates it only when they differ.

## 0.17.17 - vendor approval is automatic, decided by the right signal

Approval sat in the founder's queue for anything that was not a company email, and
he cannot watch the admin dashboard during a working day. Migration **0028** moves
the decision into one rule, enforced in the database rather than the app:

| Registration | Result |
|---|---|
| Company email | **approved** |
| Personal email **+ a website / store link** | **approved** |
| Personal email, no website | **refused**, with a message and a WhatsApp route |

The reasoning: a personal domain says nothing about whether a business exists — a
small vendor on `@gmail.com` is indistinguishable from a curious individual. A
company website, store link or Instagram profile *is* evidence, and it is a field
the registration already collects. So the gate on pricing stays meaningful while
nobody has to approve anything. (`p_auto_approve` still comes from the app; the
website rule lives in the function, so the rule holds even if the app is bypassed.)

`isFreemail()` also learned about **suffixes**: Indonesian schools use
`<name>.sch.id`, so an exact-match list can never catch `sman1-bogor.sch.id`. A
school is not a building-product vendor, so `.sch.id` is now treated as personal.

Verified against the live database, all four paths:

```
company email, no website  -> created, status=approved
gmail + store link         -> created, status=approved
gmail, no website          -> REFUSED (with the message)
school email (.sch.id)     -> REFUSED
```

The registration form now marks the website field *"Required unless you use a
company email address"*, so nobody is refused after the fact.

## 0.17.16 — registration was silently broken; and the modelling service exists now

### The bug: vendor registration never appeared to work

Registering a brand looked like a no-op — the form submitted and came back empty,
with no message. The vendor **was** being created. What failed was reading it back:

```
register_vendor        -> ok, vendor 229f9766…   (row created, pending)
read back vendor_members -> ERROR: infinite recursion detected in policy
```

`vendor_members_owner` (a FOR ALL policy) tested ownership with a subquery on the
table it guards, so evaluating it re-evaluated it. PostgreSQL aborts the statement.
Every other predicate in 0002 is SECURITY DEFINER for exactly this reason; this one
escaped the rule and nothing had exercised it until a vendor account existed.

The consequence was larger than one form: `getSession()` reads `vendor_members`, so
**the entire vendor portal was unreachable** — every signed-in vendor was treated as
a stranger and sent back to the registration form. Migration **0026** replaces the
subquery with `is_vendor_owner()`, a SECURITY DEFINER helper.

### The flow now says what is happening

- The registration action **redirects with a result** instead of returning silently,
  so a rejected form shows why.
- A pending vendor gets a clear **"Your registration is being reviewed"** screen with
  their details and their status — instead of a dashboard of zeros.
- A suspended vendor is told so.
- Approval is announced: a vendor approved in the last 30 days sees a green
  **"approved"** banner. That is deliberately the notification — there is no email
  infrastructure, and this page *is* how they find out.

### Prices are for approved vendors

`/for-vendors` and `/pricing` now show prices only to a member of an **approved**
vendor, or an admin. A company email is no longer enough, and the two pages use the
same rule so they cannot disagree. Everyone else sees what each plan covers, and a
route to register.

### The modelling service exists (migration 0027)

Digitization was promised on the pricing page and in every proposal but had nothing
behind it. `service_requests` is that object:

```
requested -> quoted -> accepted -> in_progress -> delivered
```

- **Vendor** (`/vendor/services`) asks for products to be modelled, and accepts a quote.
- **Admin** (`/admin/services`) quotes it, then has a work queue: jobs that are
  **accepted AND paid** sit at the top as *ready to start*.
- Accepting a quote creates the invoice, so payment runs through the existing path
  (bank transfer or Midtrans).
- **"Paid" is not a status** — it is read from the linked invoice, so money has one
  source of truth and `mark_invoice_paid()` needed no change.
- Vendors cannot write the table at all. Accepting has a side effect (an invoice), so
  it goes through `vendor_accept_service_quote()`, which checks the caller, the status
  and the amount in one place. Verified: a vendor's self-quote attempt changes no rows.

The vendor watches a **five-step progress bar**; you get a queue with the next action
on each job.

Also: the landing page's "Brands" nav link is gone.

## 0.17.15 — catalogue corrections: TOTO's product, Dirory's samples, five new materials

Four data changes, applied to the live database (no deploy needed).

**LW952J is a TOTO product, not a Dirory sample.** Moved to the Toto vendor. A
specific brand's closet was sitting in the platform catalogue, which is exactly
what the "sample" flag is meant to rule out.

**Every Generic material became a Dirory sample.** The `Generic` vendor held 26
materials — brick, concrete, metal, paint, roof, stone, tile, wood — that were
never a brand. They now belong to the platform brand, so the plugin shows them as
Dirory free samples, and their `Generic` tag became `Dirory`. The Generic vendor
is left in place and empty.

**Five materials the catalogue could not answer a search for.** Zinc Roof,
Spandek Roof, Ceiling Tile, Gypsum Board and GRC Board, generated by
`scripts/generate-material-textures.mjs` (deterministic, no image library) and
uploaded as Dirory samples. Roofing had a clay tile, a concrete tile and one
generic "metal" sheet; zinc and Spandek are what Indonesian projects specify and
neither resolved. There was no ceiling category at all. Two new material
categories were added — `Ceiling` and `Board` — and the tags carry Indonesian and
English terms (`Atap`, `Seng`, `Plafon`, `Papan Gipsum`) because architects search
in either language.

**Dirory's samples have human names now.** The first import named every material
after its filename, so the card grid showed `brick_brown_clay` next to real
products like "PL 346 – Imperial Treasure". `scripts/normalise-sample-names.mjs`
promotes the display name the import had already recorded in `tags` — 26 renames,
idempotent, and `legacy_key` is left alone because it is the import identity.

Catalogue: **1,355 → 1,360**. The five new textures are placeholders, not
photographs; drop a real image over the same path in `library-additions/` and
re-run `upload-library.mjs` to replace one.

## 0.17.14 — vendor page: prices gated; home page: one vendor story, plugin first

Three small content corrections.

**`/for-vendors` hides prices from personal addresses.** A `@gmail.com` visitor
sees the brand wall, the real numbers, the four values and how it works — but the
**plans show coverage, not prices**. The gate is `canViewCompanyPricing()`, the
same helper `/pricing` uses, so the two pages can never disagree about who may see
what. Company addresses see the numbers. The page grows three strings
(`fv.gateTitle` / `fv.gateText` / `fv.gateCta`) in both languages.

**The "For brands" section is gone from the home page.** It duplicated
`/for-vendors`, and a half-version of the vendor story on the marketing page was
worse than none. The nav item still points at `/for-vendors`, so the path in is
unchanged.

**The home hero's primary button is now "Get the plugin".** It was "Browse the
library", which points an architect at a catalogue they cannot use until they
have the plugin. The order is now: install, then browse.

## 0.17.13 — paying an invoice never extended the subscription

Found by running the first real end-to-end payment test, and it would have been
expensive to hit in production.

`mark_invoice_paid()` guarded its extension block with `if sub is not null then`,
where `sub` is a **composite-typed** variable (`public.subscriptions`). For
composite variables, PL/pgSQL's `IS NOT NULL` is *not* the complement of
`IS NULL`. Against the live database, for a fully-populated row:

```
sub IS NULL                -> false
sub IS NOT NULL            -> false      <-- both false
sub IS DISTINCT FROM NULL  -> true
```

So the branch was never taken. An invoice could be confirmed — by the Midtrans
webhook or the admin "Mark paid" button — and become **paid**, while the
subscription stayed `trial` with a NULL `current_period_end`. Since 0022 that is
worse than a missing renewal: a vendor is only visible while it has an
active/grace subscription with a future period end, so a vendor that paid would
have been hidden again seven days later, having received nothing.

Fix: `IF FOUND THEN`, which PL/pgSQL sets from the `SELECT INTO` itself and which
does not depend on row-comparison semantics.

Verified against the live site: settle → invoice `paid`, subscription `active`,
`current_period_end` exactly one year out; a second delivery is a no-op.
`supabase/tests/mark_invoice_paid_test.sql` guards it.

The lesson: the webhook answered `{"ok":true,"settled":…}` and the invoice looked
correct the entire time. Only checking the subscription revealed it — which is why
the test asserted on the period, not just the invoice status.

## 0.17.12 — a vendor landing page, and a public-catalogue bug it exposed

**`/for-vendors`** is a dedicated page for the supply side, built on the content
principles of business.bimobject.com with "manufacturer" reading as "vendor" —
the word Dirory uses everywhere else:

- a hero addressed to the supplier, not the architect;
- a trust wall of the **real** brands in the catalogue, read from the database;
- the four things a catalogue alone cannot do: publish, be found, measure, get asked;
- the real numbers (products, brands, categories) rather than invented ones;
- how it works in four steps;
- plans read from the `plans` table, so the page cannot quote a different price
  from `/pricing`;
- a link to the working demo dashboard, then one call to action.

Bilingual via the existing dictionaries (~45 `fv.*` keys each). The home page's
"For brands" nav item now points at it.

### The bug

Rendering the page as an anonymous visitor showed **2 of 1,355 products and zero
brands**. Migration 0022 had made visibility depend on a subscription but left
`vendor_is_visible` as an ordinary invoker function, so its `subscriptions`
lookup was itself filtered by RLS — and anon has no policy on `subscriptions`. The
plugin never noticed, because it reads through the catalogue Edge Function with
the service role, and a service-role read bypasses RLS.

Migration **0024** makes `vendor_is_visible` SECURITY DEFINER, like every other
predicate in 0002, which is what that pattern exists for. Verified afterwards:
anon sees **15 brands and 1,355 products** again.

## 0.17.11 — manual bank transfer switched on as the interim method

Midtrans signup is blocked for now (the phone number is already attached to a
merchant, and the confirmation email cannot land in a mailbox nobody can open),
and Xendit requires a legal entity that Dirory does not have. The manual bank
transfer path therefore becomes the way a vendor pays.

It was **already implemented** — nothing new was written. It was hidden only
because `BILLING_BANK_*` was unset:

- `vendor_submit_payment()` (migration 0012) stores the reference and the proof path;
- `PaymentProof.tsx` uploads to `materials/<vendor_id>/proofs/<invoice_id>/…`
  (10 MB, any MIME type, permitted by the `storage_vendor_insert` policy);
- `Admin → Payments` signs the proof and shows a **View ↓** link beside **Mark paid**.

Now configured (BSI, 2511199205, Rendy Noor Chandra) in the server env, so an
unpaid invoice shows the bank details, a "Pay by transfer" selector, and an
"I've paid" form with a reference field and a receipt upload.

**The same three variables must be set in the VPS `.env`.** They are read at
runtime, so a restart is enough — no rebuild.

Caveat recorded in `docs/PAYMENTS.md`: this is a personal account, so the tax and
bookkeeping treatment should be checked with an accountant before invoicing
businesses at scale.

## 0.17.10 — Midtrans: any order for an invoice can settle it

Auditing the payment path before a real sandbox test turned up a way to lose a
payment. `buildOrderId()` embedded only the first 12 hex digits of the invoice id,
and both `POST /token` (Snap) and `POST /qris` **overwrite** `invoices.gateway_ref`.
So a vendor who clicked "Pay online" twice — or minted a QRIS after a Snap
attempt — and then paid the **first** page would have money taken against an order
the webhook could no longer match: the invoice stayed unpaid and the notification
landed as `unmatched`.

Now:

- `buildOrderId()` embeds the **full** invoice id: `DRY-<32 hex>-<epoch>`, 47
  characters (Midtrans caps order_id at 50).
- New `invoiceIdFromOrderId()` parses it back.
- The webhook falls back to that when `gateway_ref` points at a newer order, so an
  older order still settles its invoice. The old 12-hex format parses to `null`
  and behaves exactly as before.

`scripts/test-midtrans.mts` covers the round trip, the 50-char limit, a foreign
order id and the retired format; all 20 checks pass. `docs/PAYMENTS.md` also
stopped claiming the grace/expiry job is unimplemented — migration 0022 shipped it.

## 0.17.9 — proposal for Dekkson

A sixth proposal, for Mrs. Zahra at Dekkson — legally **PT Fajar Lestari Sejati
(Dekkson Group)**, Indonesia's architectural-hardware brand since 1994 (door
handles, hinges, closers, locks; newer sanitary, furniture and smart-living lines).
Not in the catalogue, so the new-vendor framing with the digitization pilot.

The angle is specific to hardware: it is the product most often dropped at the
drawing stage — the architect writes "handle standar" and leaves the choice to the
contractor. Dirory turns that into a number, per type, which is exactly what a
hardware brand cannot see once a project is built.
`proposals/dekkson.pdf`, 11 pages.

## 0.17.8 — proposal for LIXIL Indonesia

A fifth proposal, for Ms. Fitra Amalia, Specifier at LIXIL Indonesia. Unlike TOTO
and Propan, **none of LIXIL's brands are in the catalogue yet** — American Standard
and the group's other brands are absent — so this one uses the digitization pilot
rather than the "already live" framing. The angle is the specifier's real scoreboard:
a specifier wins or loses at the drawing stage, and Dirory measures precisely there,
per brand, across a multi-brand group. `proposals/lixil-indonesia.pdf`, 11 pages.

## 0.17.7 — proposal for PT Surya Toto Indonesia Tbk

A fourth personalised proposal, for Bapak Sean (Sales). TOTO is already a live
vendor — CE9 and CW 630 PJ (closets) and U104 (urinoir) are approved — so like
Propan's it opens by acknowledging what is already tayang and sells depth and data
rather than a listing. The angle for an established brand is share, not presence:
pangsa kategori, aggregate and anonymous. `proposals/surya-toto.pdf`, 11 pages.

## 0.17.6 — the brand dashboard is back in the vendor proposals

0.17.4 replaced the mock vendor dashboard with the real SketchUp screenshots, but
it **replaced** it instead of adding alongside — so the proposals lost the brand
web dashboard entirely, which is the thing a brand actually logs into. Restored as
page 6, "Dashboard brand", with the demo capture (still labelled as an illustration
so it is never confused with the real plugin data on the pages before it). The
proposals are now 11 pages.

The build also stopped failing silently. `scripts/build-proposals.mjs` renders to a
`.new.pdf` and swaps it in; if a viewer holds the target open (Nitro, Acrobat, a
browser tab) the swap is reported as `LOCKED` instead of leaving the previous PDF
in place while Chrome exits 0. That is how the stale Propan file was found: its
timestamp was hours older than the other two.

## 0.17.5 — Dirory pitch deck

Khairun (CEO, Sanbercode) asked for an updated pitch deck and offered to put it in
front of people while travelling. `scripts/build-pitchdeck.mjs` renders a 15-slide
16:9 deck to `pitchdeck/dirory-pitchdeck.pdf`, the same way the vendor proposals
are built (HTML + headless Chrome, no PDF library).

It is a **partnership deck, not a fundraising one** — the ask is introductions, to
brands and to architect communities. Bahasa Indonesia, for an Indonesian audience.

Slides: cover, problem (two sides — the architect's search, the brand's blindness),
solution, the real plugin screenshots (search, then usage/measurement), the brand
dashboard, traction, business model, opportunity, why now, differentiation, **team**
(Rendy Noor Chandra — solo founder, architect and BIM specialist, with his
headshot), growth plan, the ask, and contact.

Figures are read from the live database and stamped with the date (9 Oct 2026):
15 brands, 1,355 products, 36 categories, 53 architect accounts, 7 installs, 62
usage snapshots. The deck is honest that this is a supply-heavy, pre-revenue stage
— the catalogue is built, adoption is starting. The two SketchUp screenshots are
real (account name cropped); the dashboard is the demo mock and is labelled as an
illustration.

## 0.17.4 — FR-M6 enforced, monthly plans, real screenshots in the proposals

Three changes that all came out of the same question: what actually happens to a
brand that stops paying?

**FR-M6 was not enforced. It is now (migration 0022).** The rule says: on expiry,
7 days of grace, then the vendor's assets are hidden (not deleted) and return on
renewal. In practice nothing was gated, for two reasons:

1. `vendor_is_visible()` returned true for any vendor whose `status` was
   `'approved'`, so the subscription branch was dead code.
2. The catalogue Edge Function reads with the **service role** and filters in
   TypeScript (`status === 'approved'`), so it bypassed RLS entirely. A SQL-only
   fix would never have reached the plugin.

Both now use the same rule — platform brand, or an approved vendor with a
subscription in trial/active/grace whose period ended no more than 7 days ago (or
never ends). The date window is deliberate: visibility does not depend on the
expiry job running. `expire_subscriptions()` only keeps the status *label* honest
(grace, then expired) and is scheduled best-effort with pg_cron.

**Grandfathering.** Every vendor had `NONE` subscriptions, so enforcing the rule
would have hidden the whole catalogue. The launch brands (Propan, TACO, Nippon,
NIRO GRANITE, …) each got a non-expiring active subscription, so they stay live.
When one later buys a plan, `vendor_request_subscription()` reuses that row and
`mark_invoice_paid()` gives it a real end date. Verified after applying: all 16
vendors visible, catalogue still **1,355** items from both the SQL side and the
deployed function. `supabase/tests/vendor_visibility_test.sql` pins the rule down,
including the 7-day boundary; it passed against the linked database.

**Monthly plans (migration 0023).** Starter and Growth are sold monthly as well as
yearly, and the numbers are rational: twelve months at the monthly rate is 1.2x the
yearly price, i.e. the yearly plan is "pay 10, get 12".

| | Monthly | Yearly |
|---|---|---|
| Starter (100 products) | Rp 500.000 | Rp 5.000.000 (2 bulan gratis) |
| Growth (500 products) | Rp 2.500.000 | Rp 25.000.000 (2 bulan gratis) |

Capacity is identical across the two periods, so the vendor is choosing a
commitment, not a different product. `/pricing` groups the rows by tier and shows
both prices; the vendor plan chooser labels each row Monthly/Yearly.

**Real screenshots in the proposals.** The mock dashboard is gone. The proposals
now use the founder's actual SketchUp captures (`proposals/assets/sketchup-*.png`):
the search panel with live products, and the Usage tab showing 21.82 m² painted,
Propan 5.36 m² and the *Ask for a Quote* button. The top strip is cropped in CSS so
the founder's SketchUp account name does not travel to a vendor, and the closing
disclaimer now says the screenshots are real rather than an illustration.

A new page, "Jika berhenti berlangganan", states the FR-M6 behaviour honestly in
Bahasa Indonesia: hidden, not deleted; account and history retained; back on
renewal; already-inserted geometry is unaffected. Proposals are now 10 pages.

## 0.17.3 — vendor proposals, WhatsApp contact, business-email auto-approval, material pricing

Three things shipped together because they all touch the same vendor conversation.

**Personalised proposals.** `scripts/build-proposals.mjs` renders an eight-page
proposal in Bahasa Indonesia for each of PT Propan Raya ICC, PT Alba Unggul Metal
and PT Trilliun Prima Sukses, then prints it with headless Chrome. Output lives in
`proposals/`. The copy is data-driven per vendor:

- **Propan is already live** — 160 approved materials are in the catalogue. The
  proposal opens by saying so, and the closing offer is "activate the dashboard and
  reporting", not "let us digitize 10 products". Offering digitization to a brand
  already in the library was simply wrong.
- Alba is not in the catalogue, so the pilot digitization offer stays.
- Trilliun is left as a pilot: a brand **"Trilliunware"** with 3 models exists in the
  catalogue, but it has not been confirmed as the same company. The founder must
  confirm before any proposal claims it.

The headline no longer uses the "meja gambar" framing; SketchUp is described as
*software desain*.

**WhatsApp contact.** `apps/web/src/lib/contact.ts` holds the Dirory number
(`+62 857-1008-6041`), a formatter and a `wa.me` link helper. It is used on
`/pricing`, `/privacy` and in every proposal.

**Vendor auto-approval (migration 0020).** `register_vendor` takes
`p_auto_approve`. The vendor signup action passes `isBusinessEmail(user.email)`, so
an official company domain is approved on the spot while a freemail signup still
waits for review. Verified: `auto_approve=true` → `approved`, `false` → `pending`.
The founder's gmail is allowlisted. This is a **soft gate** and protects nothing.

**Pricing adjusted for material-heavy brands (migration 0021).** The first package
sizes were wrong for real catalogues: Starter capped at 20 products and Growth at 30,
but Propan has 160 materials and TACO has 634, and a material priced at
Rp 50.000–150.000 puts 160 colours at Rp 8–24 million. Listing and digitization are
now separated:

| | Before | Now |
|---|---|---|
| Starter (Rp 5jt/yr) | 20 products | **100 products** |
| Growth (Rp 25jt/yr) | 30 products | **500 products** |
| Full Range | 50+ | **500+**, quote |
| Material digitization | Rp 50.000–150.000 flat | **Rp 50.000 (1–49) · Rp 35.000 (50–199) · Rp 25.000 (200+)** |

Models keep the standard (Rp 400.000–750.000) and advanced (Rp 1.000.000–2.500.000)
rates. A material is a texture image — light and quick; a model is real 3D work.
Prices are proposals for the founder to confirm, not validated numbers.

## 0.17.2 — plugin 0.9.8: one clear prompt instead of a window per failure

Following the 0.9.7 token fix, the failure still produced **two** prompts: a modal
message box from `main.rb` *and* the account dialog from the panel. The modal is
now gone.

- `Cloud.unauthorized!` returns an empty message always and relies on the panel:
  it opens the account dialog on its sign-in view with a toast explaining why.
  `main.rb` already skips an empty message. With no panel open, a message box is
  still shown, because that is the only way to reach the architect.
- The Extension Manager description was stale — "Browse and insert 3D models and
  materials from your local Dirory product library" — which described the old
  local-folder build. Now: "Browse the Dirory product library inside SketchUp:
  search, insert models and paint materials from real Indonesian brands."

**The auth chain was verified end to end** with a throwaway account, because the
server had to be ruled in or out:

| Step | Result |
|---|---|
| `auth-device/start` | 200, device code issued |
| Browser approval through RLS | **updated 1 row** |
| `auth-device/poll` | **approved, token issued** |
| `GET /download` with that token | **200, signed URL** |

The test user and its tokens were deleted afterwards. Only `auth-device/revoke`
(sign-out) deletes a token; nothing expires them. So a stale token means a sign-out
happened or a sign-in never completed — not a server fault.

**Release round-trip proven:** `DiroryLibrary-0.9.8.rbz` was published by upload
alone, and `GET /plugin-release` now reports `0.9.8` with no code change, which is
the whole point of deriving the version from the bucket.

**Not verified:** the in-SketchUp apply step has still not run on a real machine.

## 0.17.1 — self-update repaired: the release version is now derived, not hardcoded

The plugin already had a self-update path — background version check, a pulsing
badge, an **Update** button, then download → extract → swap at the next SketchUp
launch. It was broken in one place:

`plugin-release/index.ts` hardcoded `PLUGIN_VERSION = "0.9.4"`, with a comment
saying to keep it in step with `apps/web/src/lib/pluginRelease.ts`. It had drifted
to 0.9.7. So the update check advertised a **stale** version, and a newer build
was never offered — while `scripts/upload-plugin-release.mjs` claimed that
uploading the archive was all that was needed.

- The function now lists the `plugin-release` bucket, parses
  `DiroryLibrary-<version>.rbz`, and serves the **highest** version found
  (numeric-aware, so 0.9.10 sorts above 0.9.9). Publishing a release is now just
  the upload, exactly as the script says.
- An empty bucket returns a loud 404 with the upload command, rather than a
  stale version that points at a missing object.
- `DiroryLibrary-0.9.7.rbz` uploaded to the bucket and the function redeployed.

**Verified end to end against the live project:**

- `GET /plugin-release` → `{"version":"0.9.7","filename":"DiroryLibrary-0.9.7.rbz"}`
- `GET /plugin-release/download` with no token → 401
- with a valid token → **200, 184,453 bytes, byte-identical to the local archive**,
  `X-Plugin-Version: 0.9.7`

**Not verified:** the in-SketchUp apply step (extract, loader, restart) has not
been exercised on a real machine.

## 0.17.0 — plugin 0.9.7: a rejected token now heals itself

**Symptom:** the panel showed the architect signed in, but every download
answered "Please sign in to Dirory to download this item." — and because each
click produced its own dialog, a row of cards became a wall of windows.

**Diagnosis, with evidence rather than a guess.** The message came from the
`download` Edge Function answering **401**, so the request was reaching the
server and being refused. Two checks settled it:

1. Calling `/download/<asset>` with a *non-JWT* bearer returned the function's own
   `{"error":"sign in required"}` — not a gateway rejection — so `verify_jwt` was
   not the cause.
2. Creating a `plugin_tokens` row with a token I chose, then calling
   `/download/<asset>` with it, returned **200 with a signed URL**. The whole
   server path works.

So the stored token was stale: the server no longer recognised it, yet the panel
still reported the architect as signed in. The two states disagreed.

**Fix (plugin 0.9.7):**

- `Cloud.unauthorized!` — on a 401, forget the token, flip the panel back to
  signed-out and open the sign-in dialog. Rate-limited to one prompt per 10
  seconds, returning an empty message afterwards.
- `Cloud.forget_token` — clears the token without calling the revoke endpoint,
  since it is already invalid server-side.
- `main.rb` no longer shows a message box for an empty message, so a burst of
  failed clicks produces one prompt, not one per click.
- Applied to the download path and the update check.

Also recorded, and **corrected**: `config.toml` declared `verify_jwt = false` for
only `events`, `catalog` and `favourites`. `download`, `auth-device`, `quotes` and
`plugin-release` all authenticate the plugin's opaque token themselves and each
document `--no-verify-jwt`, so the declaration was added for all four. This was
not the cause of the reported 401, but a plain `supabase functions deploy` would
have broken them.

**Verified:** `scripts/check-ruby.mjs` clean (all five files parse; every
`Cloud.*` used in `main.rb` is defined). The rebuilt
`DiroryLibrary-0.9.7.rbz` was opened and confirmed to contain `forget_token`,
`unauthorized!` and the `main.rb` guard. The server path was proven end to end
with a diagnostic token, which was then deleted.

**Not verified:** the plugin has not been run inside SketchUp, so the recovery
flow itself is untested on a real machine. Existing installs must sign out and
sign in once to mint a fresh token.

## 0.16.0 — "Kerikil Sungai" material, answering a real search miss

An architect searched **kerikil** / **batu** in the plugin and got zero results.
The catalogue had stone, andesite, limestone and even a "Quarry Pebble" paint
colour, but no gravel for hardscape — so the demand had nothing to match.

Added **Kerikil Sungai** as a **Dirory free sample** in the **Stone** category,
tagged `kerikil`, `batu`, `batu kali`, `river stone`, `gravel`, `pebble`,
`small rocks`, `hardscape`, `split stone`, `kerikil sungai`, `landscape`,
`exterior`.

The plugin's search matches **name, category, brand and tags**, so "kerikil"
matches the name and "batu" matches the tags — both searches now resolve.

- `scripts/generate-kerikil-texture.mjs` writes the texture directly as a PNG
  (zlib + CRC32, no image library) and is deterministic, so re-running produces
  the identical file. It is a **placeholder texture, not a product photograph**;
  `library-additions/README.md` says how to replace it.
- `library-additions/` holds post-import source files so they can be re-uploaded
  or regenerated. Upload with `node scripts/upload-library.mjs --root library-additions`.

**Verified against the live system:** the asset is `approved`, under the platform
vendor (brand "Dirory"), category "Stone", with an approved version row and the
file at `<vendor>/<asset>/Kerikil Sungai.png`. The deployed `catalog` Edge
Function now returns **1,355 items** including it, as
`{ name: "Kerikil Sungai", brand: "Dirory", category: "Stone", type: "material", sample: true }`.

## 0.15.0 — Kuitansi (receipt) after payment, with print-to-PDF

A paid invoice now produces a Kuitansi in Bahasa Indonesia at `/receipt/[id]`,
linked from the paid banner on the invoice and from the invoice list.

- Numbered `KWT/DIR/<year>/<invoice prefix>`, dated in long Indonesian form.
- States the amount **in words as well as figures** — `lib/terbilang.ts`
  implements the Indonesian rules, including the irregular forms (sebelas,
  seratus, seribu) that naive versions get wrong.
- Shows the vendor and brand, what was paid for, the period covered, the method
  and the gateway reference.
- Signed with the supplied signature at `apps/web/public/signature.jpg`. Replace
  the file to change it; if it is absent the receipt still reads correctly.
- **PDF via the browser's print dialog.** No PDF library and no headless browser,
  so nothing new in the image. The page sets `@page { size: A4; margin: 18mm }`
  and hides its own toolbar when printing.
- The route sits **outside the vendor layout** so it prints without a sidebar, so
  it repeats the authorisation check itself: the signed-in user must be a member
  of the invoice's vendor, and RLS limits the query to their own invoices anyway.

**Verified:** `scripts/test-terbilang.mts` — 36 checks, all passing, covering
`sebelas`/`seratus`/`seribu`, the thousand and million groups, the receipt
sentence form, negatives, decimals and NaN. `tsc` clean, `next build` clean (the
`/receipt/[id]` route is registered). Local production smoke test: `/signature.jpg`
returns 200 with the 17,458-byte file, and `/receipt/<uuid>` returns 404 for an
unauthenticated request rather than a 500.

**Not verified:** no real paid invoice has been rendered — the live database has
no paid invoices yet, so the receipt has not been seen with real data.

## 0.14.2 — vendor registration bug fix, and a "For brands" nav link

**Vendor registration was broken, and this fixes it.** `registerVendor()` inserted
the vendor and then read the new row back to get its id for the membership insert.
The `vendors_public_read` policy only allows reading a vendor that is *visible*
(approved, the platform brand, or subscribed) or that the caller is already a
member of. A brand-new `pending` vendor is none of those, so the read returned no
row, `.single()` raised, and the action returned **before creating the
membership**. The form therefore appeared to do nothing, and the database was
left with a `pending` vendor that had no members.

Migration `0019` moves both inserts into one `SECURITY DEFINER` function,
`register_vendor(...)`, which needs no read-back and is atomic — a failure cannot
leave a vendor without an owner. It is idempotent per account, so a double submit
returns the existing vendor instead of creating a second one. The same migration
deletes the orphaned `pending` vendors the bug produced (pending, not the
platform brand, no members at all — a state only this failure could create).

The read policy was deliberately **not** loosened: letting every signed-in user
read every pending vendor would expose the registration pipeline (brand names,
contact details, NPWP) to anyone, which is a worse outcome than the bug.

**"For brands" in the top navigation.** The vendor section on the landing page
now has an anchor (`#for-brands`) and a nav link, so a brand can reach the
benefits summary from the header. Its CTA still goes to the gated `/pricing`.

**Verified:** migration `0019` applied to the live database and re-checked (the
function exists and refuses an anonymous caller with "not signed in"; no orphaned
pending vendors remain — the 15 vendors listed are all approved). `tsc` clean,
`next build` clean, migration lint clean over 19 files.

**Still to do on your side:** the live site is serving an older build —
`dirory.com/pricing` returns 404 and the landing page has no vendor section. A
redeploy is required for any of this to appear.

## 0.14.1 — full payment list, and the founder's pricing exception

**Payment methods stay on the full list.** `MIDTRANS_ENABLED_PAYMENTS` is left
empty, so Snap offers everything the merchant account has enabled. BCA Virtual
Account (`bca_va`) is included by default, which is what most Indonesian payers
will use. Setting `bsi_va` remains available if BSI-only is ever wanted.

**Company-pricing exception.** `canViewCompanyPricing()` in
`lib/businessEmail.ts` now allows an allowlist on top of the company-domain rule.
The founder's address (`rendynoorchandra@gmail.com`) is built in so the team can
review `/pricing` without a corporate mailbox; `PRICING_ALLOWED_EMAILS`
(comma-separated) extends it for colleagues or a demo account.

Worth recording: the **vendor portal itself has no email-domain restriction** -
`/vendor` only requires a signed-in account with a vendor membership. The only
domain gate in the app is `/pricing`, and it is a soft gate that shapes who sees
the page rather than protecting anything.

**Verified:** `scripts/test-business-email.mts` - 26 checks covering domain
parsing (`a@`, `@b.com`, a domain with no dot, mixed case, null), the freemail
list, and the allowlist, including that the founder's gmail is allowed while an
unlisted gmail is not. `tsc` clean, `next build` clean.

## 0.14.0 — live migrations, optional geography, brand pricing page, BSI and dynamic QRIS

**Migrations applied to the live database.** `0013`-`0018` are now pushed and
verified against the project: the payment tables and functions exist, `plans`
holds Starter (Rp 5.000.000/year, 20 products) and Growth (Rp 25.000.000/year, 30
products), and the profile consent and geography columns are present. Everything
built in 0.10.0-0.13.0 is live as a result.

**Optional user geography** (migration `0018`): nullable `city` and `province` on
`profiles`, asked once right after the occupation question as a skippable second
step. Admin → Analytics shows users by province and by city. Collected only if
volunteered, never guessed, never shown to a vendor, and the privacy page now
says so.

**Brand section and pricing page.** The landing page has a "For brands" section
with a CTA. `/pricing` shows the packages (read from `plans`, so it cannot quote
a different price from the vendor portal) plus digitization and add-on rates. It
is gated behind a **company email**: personal domains such as gmail.com see an
explanation instead. This is a soft gate that shapes who sees the page and
protects nothing — no RLS policy depends on it.

**BSI Virtual Account.** `MIDTRANS_ENABLED_PAYMENTS=bsi_va` restricts Snap to BSI
VA, confirmed against Midtrans' docs. Because BSI VA is payable only through the
BYOND by BSI app, the docs recommend keeping the manual transfer alongside it.
`docs/PAYMENTS.md` also spells out that a Midtrans VA pays into Midtrans, not
directly into your own BSI account — the manual path is the one that pays you
directly, configured with `BILLING_BANK_*`.

**Dynamic QRIS, unique per invoice.** Midtrans Core API `payment_type: "qris"`
returns a hosted QR per order. Stored on the invoice (`qr_string`, `qr_url`,
`qr_expires_at`), reused while still valid, and settled by the same webhook as
Snap.

**Testing.** `scripts/test-midtrans.mts` runs under Node's type stripping and
checks the signature verification (accepts a correct signature; rejects a
tampered amount, order id, status code, foreign signature, empty and short
signatures), the status mapping, order-id generation and method parsing — 26
checks, all passing. `scripts/midtrans-sandbox-test.mjs` creates a real sandbox
Snap transaction, or signs and posts a settlement notification to a running
webhook.

**Verified:** migrations applied and re-checked against the live database; `tsc`
clean; `next build` clean; migration lint clean over 18 files; Midtrans unit
tests pass. **Not verified:** no live sandbox payment was made (no merchant keys
here), and the QRIS charge and BSI VA have not been exercised against Midtrans.

## 0.13.0 — admin analytics and the vendor category benchmark

The remaining computable metrics from the founder's document.

**Migration `0017`** adds five functions, all `SECURITY DEFINER` and each
authorising itself:

- `admin_growth_summary()` — installs, new installs, DAU/WAU/MAU, first-use rate
  and 30-day retention. "Active" means the install sent a usage snapshot in the
  window, which is the only activity signal the plugin provides.
- `admin_installs_weekly(weeks)` — new installs per week, for the trend line.
- `admin_content_coverage(target)` — published, samples, in review, draft,
  rejected, thumbnail coverage, and published-but-idle-for-30-days.
- `admin_top_categories(days)` — inserts and painted area per category.
- `admin_searches_daily(days)` — zero-result searches per day.
- `vendor_category_share(vendor, from, to)` — the vendor's own units, the
  category total and its share. **Aggregate only**: it returns no competitor's
  figures, no project and no person. Models and materials are kept apart,
  because counting models and square metres in one column would be meaningless.

**Admin → Analytics**, a new page: growth and engagement, new installs per week,
searches with no results over time, content coverage against the 250 target, and
top categories.

**Vendor → Dashboard** gains a "Category share" card.

**Verified:** `tsc --noEmit` clean, `next build` clean, migration lint clean over
17 files.

**Important, checked against the live database:** migrations `0013` through
`0017` are **not applied**. `payment_events`, `plugin_health_events` and
`unhandled_events` do not exist, `mark_invoice_paid` and `plugin_health_summary`
are absent, `plans` still holds the original seed prices, and
`profiles.plugin_consent_at` does not exist. So none of the payment gateway, the
consent gate, the new packages, plugin health or analytics is live yet — the site
will show their empty states until `npx supabase db push` is run.

## 0.12.0 — plugin health metrics, and a forward-compatible ingest

**Plugin 0.9.6** adds the counters behind the dashboard's "Plugin health" area.
Until now those numbers never left the architect's machine, which is why that
area could not be built.

- `cloud.rb`: `health_bump` / `report_health` keep counters for load attempts,
  load failures, cumulative load time, insert failures, paint failures and API
  failures, and queue a `plugin_health` event on the existing flush timer. They
  are gated on the same sharing switch as usage snapshots.
- `main.rb`: counts a model load attempt, its duration (whether it succeeds or
  not) and its failures; counts failed inserts and failed material preparation.
- `cloud.rb`: a failed call to the Dirory API counts as a cloud failure.
- Only counters are sent: no project name, geometry or file path.

**Ingest is now forward-compatible (important).** The `/events` function used to
reject a whole batch if any event had an unknown kind. That is a rollout trap:
shipping a newer plugin before the server knew its new kind would fail every
batch and stop all data collection. Unknown kinds are now accepted and stored in
`unhandled_events`, so the batch succeeds and nothing is lost while the server
catches up.

**Schema** (migration `0016`): `plugin_health_events`, `unhandled_events` (both
admin-readable only) and `plugin_health_summary(p_days)` for the rollup.

**Admin → Overview** gains a "Plugin health" card: per plugin version, installs,
loads, failure percentage, average load time, and insert/paint/cloud failures.
It stays empty until 0.9.6 reports, because earlier versions never sent it.

**Verified:** `node scripts/check-ruby.mjs` clean (all five Ruby files parse, and
every `Cloud.*` used in `main.rb` is defined), Edge Functions typecheck clean,
`tsc` clean, `next build` clean, migration lint clean over 16 files. The packaged
`DiroryLibrary-0.9.6.rbz` was opened and confirmed to contain the new health code.
**Not verified:** none of this has run inside SketchUp. The health counters are
the one part of this change that only a real SketchUp session can prove.

## 0.11.0 — vendor packages, download consent, and the .env answer

**Pricing: the founder chose the package model** from the metrics document
(Table B) over PRD Q4's flat-tier hypothesis.

- Migration `0014`: Starter (Rp 5.000.000/year, 20 products) and Growth
  (Rp 25.000.000/year, 30 products) are the self-serve packages. Full Range is a
  negotiated quote, so it is stored **inactive** and cannot be bought online.
  The two old monthly tiers are deactivated, not deleted, so existing
  subscriptions keep their history. The vendor subscription page reads plans
  from the database, so it picks this up with no code change.
- Still not modelled, because they are one-off invoices rather than
  subscriptions: the per-product digitization fee (Table A), annual listing as a
  percentage of it (Table C) and the add-ons (Table D).
- PRD Q4 still says "flat tiers"; it now disagrees with the database and needs
  updating to record this decision.

**Consent before the plugin download (UU 27/2022).**

- Migration `0015` adds `profiles.plugin_consent_at` and
  `profiles.plugin_consent_version`.
- `/download` now shows the privacy summary and requires an explicit,
  check-boxed agreement before offering the RBZ. The agreement is recorded
  against the profile with the policy version.
- `/api/download/rbz` re-checks the consent version, so a direct link to the file
  cannot skip the dialog. Bumping `PLUGIN_CONSENT_VERSION`
  (`apps/web/src/lib/consent.ts`) requires everyone to agree again.
- The privacy page gained a "Consent before download" section and was rewritten
  in plain ASCII: an earlier edit had mojibake in it (a mangled arrow and middle
  dot).

**Verified:** `tsc --noEmit` clean, `next build` clean, migration lint clean over
15 files, `node scripts/check-ruby.mjs` clean. **Not verified:** migrations
`0014` and `0015` are not applied to the live database, and the consent flow has
not been clicked through in a browser.

## 0.10.0 — Midtrans Snap payments, plus revenue and catalog metrics

**Payment gateway (Midtrans Snap).** A vendor can now pay an invoice online —
QRIS, bank transfer (VA), GoPay, OVO, DANA, ShopeePay or card — instead of only
sending transfer proof. See `docs/PAYMENTS.md`.

- `POST /api/payments/midtrans/token` mints a Snap token for one of the vendor's
  own unpaid invoices and records the order id on it.
- `POST /api/payments/midtrans/webhook` verifies the SHA-512 signature, records
  the notification, and settles the invoice only when the amount matches.
- `public.mark_invoice_paid()` (migration `0013`) is now the single settlement
  path, so the admin "Mark paid" button and the webhook cannot diverge. It is
  idempotent: a retry cannot extend a subscription twice.
- `public.payment_events` (migration `0013`) logs every notification with a
  unique `(gateway, order_id, transaction_status)` key for idempotency and
  reconciliation. Admin-readable, service-role-writable.
- `apps/web/src/lib/midtrans.ts` holds the adapter, the constant-time signature
  check and the status mapping. `MIDTRANS_*` are read at runtime, so the client
  key is not baked into the browser bundle.
- The manual bank-transfer path is unchanged and still works.

**Metrics** (`docs/METRICS.md` reconciles the founder's document against the
schema, metric by metric):

- Admin → Overview: a **Revenue** card (MRR, ARR, collected, overdue, revenue by
  plan) and a **Vendor pipeline** card (pending / approved / suspended).
- Vendor → Dashboard: a **Catalog status** card (live / in review / draft /
  rejected).
- `lib/payments.ts` no longer treats `MIDTRANS_SERVER_KEY` as enabling the
  direct-QRIS path, which would have shown a "scan this QR" box with no QR in it.
  Snap already covers QRIS; that path is Xendit-only.

**Two conflicts with the PRD are recorded, not silently built** (`docs/METRICS.md`):
the document asks vendors to see unmet searches, which PRD §241 and Q12 forbid in
v1; and it proposes a different pricing model from PRD Q4/Q5. Both need a
decision before implementation.

**Verified:** `tsc --noEmit` clean, `next build` clean (both payment routes
registered), migration lint clean over 13 files. **Not verified:** no Midtrans
sandbox transaction was run from here, and migration `0013` has not been applied
to the live database.

## 0.9.11 — mobile-friendly admin and vendor shell, clearer sign-in errors

The admin and vendor layouts rendered a fixed 256px sidebar at every screen
width, so on a phone the content had almost no room. Replaced `Sidebar`/`Topbar`
with a responsive `Shell`:

- `lg` and up: the sidebar stays exactly as it was.
- below `lg`: navigation moves into a slide-over drawer opened from a hamburger
  in the top bar. It closes on navigation, backdrop click and Escape, and locks
  background scrolling while open. Adds `aria-current`, `aria-expanded` and a
  labelled close button.
- Content padding is now `p-4 sm:p-6` instead of a fixed `p-6`, and the top bar
  is sticky.

Also:
- The auth callback now distinguishes an expired/used one-time link from a
  missing code, instead of always reporting "Missing code". An expired link now
  says to request a new one; a missing code points at the Supabase Site URL.
- Added a `/no-access` page. A signed-in non-admin who opens `/admin` is sent
  there with an explanation instead of being bounced into vendor onboarding,
  which read as a broken login.

Verified: `tsc --noEmit` clean, `next build` clean. Not verified on a physical
phone, and not deployed from this session.

## 0.9.10 — the Materium catalogue, plus generic Indonesian materials

**19 MATERIUM models** uploaded from `sample_library/Model/3D MATERIUM 2020
CATALOGUE/` under a new **MATERIUM** brand, with categories Accessories,
Cabinetry, Lighting, Partition, Seating, Table and Workstation. The catalogue is
now **1,354 assets / 30 models**.

The `.skp` files shipped without previews, so the thumbnails were fetched from
the brand's product pages on malka.co.id by a new script,
`scripts/fetch-materium-thumbnails.mjs` (the site rejects requests without a
browser User-Agent). `library-overrides.json` grew a **`thumbnail`** field
pointing at an image outside the library, plus `sku` and `product_url`, so the
uploader can attach a preview and a product link without the source folder
having to change. The brand logo was set from the same site, into the public
`brands` bucket.

The catalogue folder nests category under a catalogue name, so without the
overrides the scanner would have read the category as "3D MATERIUM 2020
CATALOGUE" and the brand as the sub-folder. **`D:\Dirory` was not modified.**

**Malka retired.** Polonium Credenza and Ottium existed twice (they are Materium
products): the old Malka copies and their stored files were removed and the
Malka vendor deleted, so each product appears once.

**26 generic Indonesian materials** (Roof, Stone, Tile, Wood, Metal, Brick,
Concrete, Paint) were uploaded too. They live in the category folders under
`Materials/` with `meta.json` setting `brand: "Generic"` — they had simply never
been uploaded. Note: `Materials/Dirory_Free_Indonesian_Materials` itself is
**empty**, so if that folder was meant to hold a different set, it needs
re-checking.

**Verified:** catalogue returns 1,354 items with the MATERIUM brand logo; every
Materium model has a thumbnail and a SketchUp version (2013, or 2018 for the
workstations); `dirory.com/library` lists MATERIUM and no Malka; a product page
and its thumbnail both return 200. No web code changed, so no redeploy was
needed — the catalogue is served live and the site picks changes up within its
5-minute cache.

## 0.9.9 — vendor dashboard that works, and subscription payments

**Why the old dashboard showed nothing.** `/vendor` read `daily_asset_usage`, the
nightly rollup, which had **0 rows** — it needs `pg_cron`, which was never
installed. The real data was in `usage_snapshots` all along. There was also a
bug: "Projects using your products" counted *products*, not projects.

**Vendor dashboard (M7, FR-V4/V5).** Rebuilt on three new SECURITY DEFINER
functions that aggregate live from the snapshot tables, so it no longer depends
on the rollup:

- `vendor_usage_totals` — projects, units, painted area, distinct architects,
  quote requests.
- `vendor_usage_by_asset` — the same per product, plus quotes matched from the
  quote items.
- `vendor_usage_daily` — the trend series from the append-only `usage_history`.

Every function checks membership itself and returns **counts only** — never a
project name or an architect identity (PRD §9). The screen gains six KPI tiles, a
vendor-wide activity chart, per-product sparklines, server-side sorting, a
7/30/90/custom range, and **CSV export** for both usage and leads.

**Subscription and payment (M8, FR-V6/FR-M5).** The vendor side had no way to
pay at all. Now:

- `/vendor/subscription` — pick a plan (or switch/renew); the RPC
  `vendor_request_subscription` creates the subscription and an **unpaid
  invoice**, and is idempotent (re-running reuses the invoice rather than
  stacking duplicates).
- `/vendor/subscription/invoice/<id>` — the amount, due date, **bank transfer
  details**, and an **"I've paid"** form that uploads the receipt and records a
  reference (`vendor_submit_payment`). The invoice stays unpaid until the admin
  confirms it.
- Admin *Mark paid* now extends by the **plan's** period (it assumed monthly)
  and extends from the later of now and the current period end.

**QRIS — scaffolded, not switched on.** Dynamic QRIS needs a gateway merchant
account and API keys, which do not exist yet. `lib/payments.ts` holds the
adapter (`qrisConfigured`, `createQrisCharge`) and the invoice page says the QR
is coming, so switching it on later is a small, contained change.

**Migration `0012_vendor_portal.sql`** (functions + invoice columns).
**Test `supabase/tests/vendor_portal_test.sql`** — 10 checks covering the
aggregates, cross-vendor isolation, the subscribe/proof flow, and that a vendor
still cannot read search misses. Runs in a transaction and rolls back.

**Not changed:** visibility gating. An approved vendor is still visible whether
or not it pays (FR-M6 would hide every seeded brand, so that stays a separate
decision).

**Verified:** migration pushed; the test suite passes and leaves no residue;
`next build` passes.

## 0.9.8 — admin product upload, and SketchUp-version awareness

**Admin — Products (`/admin/products`, FR-M12 / FR-V3).** A new section with a
list (search by name, filter by type, paginated) and an upload form. The form
carries the same detail the plugin's Inspector shows — name, brand, category,
tags, SKU, product URL, dimensions (models) or tile size (materials) — and lets
the brand and category be created inline, so nothing is a dead end. A file goes
**straight from the browser to the private `models` / `materials` bucket**; only
the metadata passes through a server action (`registerProduct`), because a `.skp`
can be tens of megabytes. New uploads publish immediately (like a Dirory sample)
unless "Publish now" is unticked, which sends them to the review queue instead.
The dead `/admin/samples/new` link now points here with the Dirory brand
preselected.

**SketchUp version (FR-V3).** A model saved in a newer SketchUp cannot be opened
by an older one. The upload form now reads the version out of the `.skp` header
(`{18.0.16975}` → SketchUp 2018; 21+ → the versionless "2021+"), stores it on the
version (`asset_versions.su_version` / `su_version_raw`, migration `0011`), and
shows it on the product page. The plugin carries it on the entity and, before
inserting a model, warns and asks for confirmation when the running SketchUp is
older than the file. The Inspector gained **Dimensions** and **SketchUp** rows
and its labels are now translated.

**Backfill.** `scripts/backfill-su-version.mjs` (`npm run library:backfill-su`)
set the version on all 13 existing models by reading the matching file in the
library: 2013 (Polonium Credenza, Ottium), 2015 (Arabian, LW952J, SAPPHIRA),
2016 (Ellis 3 Seater, Tromso), 2018 (CE9, CW 630 PJ, Chrysolite, MAX 1, MAX 2,
U104). The bulk uploader records it too.

**Plugin 0.9.5** built and published to `plugin-release`; the website's
`/download` serves the same archive.

**Verified:** migration `0011` pushed; catalogue returns `su_version` and
`dimensions`; a throwaway asset created through the exact storage + DB path was
served by the catalogue and then removed; `next build` passes; the Ruby plugin
parses clean.

## 0.9.7 — five new models, plus a name override and a removal tool

**Library.** Five models were added to `sample_library/Model` and pushed to
Supabase: **Polonium Credenza** (Malka / Cabinet), **Ellis 3 Seater**
(Ellis / Chair), **MAX 1** and **MAX 2** (ALPHAMAX / Doors), and
**Tromso Coffee Table** (Tromso / Table). The catalogue is now **1,311 assets,
13 models**. New vendors created: Ellis, ALPHAMAX, Tromso.

**`--overrides` for the uploader.** The two ALPHAMAX door folders would have
become their own brands and both taken the name "Panel Door A" from a leftover
scaffold `meta.json`. `scripts/library-overrides.json` maps a path to
`{ brand, name, category }`, applied before upload:

```
node scripts/upload-library.mjs --root "D:/Dirory/sample_library" \
  --overrides scripts/library-overrides.json
```

The source folder is left untouched (`D:\Dirory` is read-only input).

**`scripts/remove-library-item.mjs`** (`npm run library:remove`). Removes an
item whose source folder was renamed or deleted — the asset row plus its stored
files, matched by `legacy_key`. Used to retire the old **Panel Door A**, whose
folder no longer exists.

**Verified:** upload reported "Uploaded 5, skipped 1306, 0 failed"; the catalogue
returns 13 models and Panel Door A is gone; `dirory.com/library` lists the new
brands (ALPHAMAX, Tromso, Ellis) and a new product page returns 200.
**Note:** Tromso Coffee Table has no thumbnail image, so its card shows a
placeholder until one is added.

## 0.9.6 (web) — user metrics and a one-time "what do you do?" question

**Admin — Users (`/admin/users`, brief §4.6 / FR-M9).** New screen with:
- KPIs: total users, architects, designers, students, plus "joined in the last
  30 days" and how many answered.
- A breakdown strip by occupation.
- A table of every account: name, email, occupation, role, joined, last seen
  (from the plugin installs).

**Admin — Overview.** Added a **Users** KPI (the first tile) linking to the
screen, and the grid is now five columns on wide screens.

**Ask once, after the first sign-in.** A new `/welcome` page asks "What best
describes you?" — Architect / Designer / Student / Other — and saves it to the
profile. It is optional ("Skip for now") and asked only once.
- Web sign-in: `/auth/callback` sends a first-time user to `/welcome`.
- **Plugin sign-in:** `/auth/device` asks the same question after approving the
  device, because most people sign in from SketchUp and would otherwise never
  see it.
- The account menu has "Your profile" (`/welcome?edit=1`) so an answer can be
  changed later.

**Schema (`0010_profiles_occupation.sql`)**
- `profiles.occupation` (`architect | designer | student | other`, NULL until
  answered — never guessed).
- `profiles.email`, mirrored from `auth.users`: that table is not reachable
  through PostgREST with the anon key, so the admin dashboard could not otherwise
  show which account is which. Backfilled for existing rows and kept up to date
  by the sign-up trigger.
- `user_occupation_counts()` helper for the dashboard.

**Verified:** migration applied; emails backfilled for all three existing
accounts; typecheck and build clean; `/welcome` and `/admin/users` both build.
**Not verified:** the picker click and the admin screen in a browser (needs the
admin account to be signed in).

## 0.9.5 (web) — English / Bahasa Indonesia toggle

The public site can now be read in Indonesian. English stays the default.

- **Toggle** (EN / ID) in the header of every public page — landing, library,
  product, how-to-install, download, login — and in the footers.
- **Cookie-based, not URL-based.** The choice is stored in a `locale` cookie, so
  every existing route and link is unchanged and pages keep server-rendering.
  A server action writes it and the toggle refreshes; unknown values fall back
  to English.
- Translations live in `lib/i18n.ts` as flat key→string dictionaries for both
  languages. `t()` falls back English → key, so a missing string shows up rather
  than rendering blank.
- Translated: the whole landing page (hero, how-it-works, inside-SketchUp,
  brands, CTA, footer), the library (search, filters, sort, cards, counts), the
  product page (specs, CTA, related), the install guide (steps, version checker,
  troubleshooting), download, login, and the account menu.
- **Not translated yet:** `/privacy` (a legal draft) and the admin/vendor
  back-office (internal tools).

**Verified locally:** with no cookie the pages render English; with
`locale=id` the landing, library, product, how-to-install, download and login
pages all render Indonesian with no English leaking through. Typecheck and build
clean.

## 0.9.4 (plugin) — fix: favourites did nothing, and the star was hidden

Two real bugs meant the Favourite feature could not work at all.

1. **The catalogue had no `key` field.** The panel keys favourites by `item.key`,
   but `catalog` returned only `asset_id` / `legacy_key`, so `item.key` was
   `undefined`. Tapping the star added `undefined` and Ruby dropped it
   (`key.to_s.empty?`), so nothing was ever saved. `catalog` now returns
   `key: asset_id`, which is also what the `/favourites` endpoint expects for
   account-wide sync.

2. **The star sat underneath the download badge.** Both were pinned to the
   thumbnail's top-right, and the badge had the higher z-index, so on every cloud
   card the star was invisible and unclickable.

**Card layout** (founder request): the per-card product-info button (ⓘ) is
removed — product details already live in the Inspector (🔍), which shows the
same information for the selected item. The star takes the thumbnail's
bottom-right, where the ⓘ used to be:

| Corner | Element |
|---|---|
| top-right | download badge (⤓ / ✓) |
| bottom-left | brand logo chip |
| **bottom-right** | **Favourite star (☆ / ★)** |

The unused product-info modal, its handlers and its CSS were removed too.

**Verified:** `catalog` returns `key` equal to `asset_id` for all 1,307 items;
`plugin-release` reports 0.9.4; Ruby and panel.js parse clean; web build clean.
**Not verified:** the star tap in SketchUp — needs a human click.

## 0.9.3 — deployed to the VPS (certificate pending DNS)

The app now runs on the Sumopod VPS behind Caddy. Verified on the server:

- `tsc` + Docker build succeed; containers `web` (healthy) and `caddy` (up) run.
- Routes from inside the container: `/api/health`, `/`, `/library`, `/login`,
  `/download`, `/api/plugin/latest`, `/privacy` all **200**; `/admin` **307** to
  `/login` when signed out; an unknown product **404**.
- The VPS reaches the Supabase catalogue (1,307 items) and the RBZ is in the image.

Server hardening applied: ufw (22/80/443 only), fail2ban, root login refused,
password login refused, key login working.

**Fixed a false-positive in `scripts/deploy.sh`:** the post-deploy check fetched
`https://$DOMAIN/api/health` over the public internet, which silently tested
whatever DNS pointed at — the old Netlify site — and reported success while the
VPS certificate was still failing. It now tests Caddy locally with
`--resolve $DOMAIN:443:127.0.0.1` and explains a pending certificate instead of
exiting with an error.

**Not yet verified:** the public HTTPS certificate. Caddy's ACME challenge fails
while `dirory.com` resolves to Netlify (`75.2.60.5`). It retries automatically;
once the A record points at `129.226.208.234` the certificate is issued with no
further action.

## 0.9.2 — single domain: dirory.com (admin at /admin)

The earlier plan used `admin.dirory.com` as a separate host with middleware that
rewrote `/` to `/admin`. That split caused a real problem: **cookies do not cross
hostnames**, so signing in on one host did not carry to the other. It also needed
host-routing code and two certificates for no benefit.

**Decision (founder):** one domain, everything on the VPS.

- `middleware.ts` no longer does host routing. It only refreshes the Supabase
  session and redirects signed-out visitors from `/admin` and `/vendor` to
  `/login`. The security boundary remains RLS plus `requireAdmin()`.
- Removed `NEXT_PUBLIC_ADMIN_HOST` everywhere (Dockerfile, docker-compose,
  `.env.example`, `apps/web/.env.example`, docs).
- `NEXT_PUBLIC_SITE_URL` and `DOMAIN` are `https://dirory.com` / `dirory.com`.
- `docs/DNS.md` rewritten for one domain: `A @ → 129.226.208.234`, `www` CNAME,
  email records untouched.
- `docs/DEPLOY.md` updated: DNS points the apex at the VPS, and `/admin` is the
  dashboard (no subdomain).
- Repaired lingering mojibake in `apps/web/.env.example`.

**Not verified:** nothing has been deployed to the VPS yet — the runbook still
needs SSH access.

## 0.9.1 — M5: VPS deployment artefacts and runbook

The brief's M5 deliverables (Dockerfile, docker-compose, Caddyfile, .env.example,
scripts/deploy.sh, docs/DEPLOY.md) existed only as a runbook; the files did not.
All are now present and verified as far as this machine allows.

**New files**
- `Dockerfile` — three-stage build, `output: "standalone"`, runs as a non-root
  user, with a HEALTHCHECK on `/api/health`. The service-role key is a RUNTIME
  env var, never a build arg, so it cannot be baked into an image layer.
- `docker-compose.yml` — `web` + `caddy` (automatic HTTPS), named volumes for
  certificates, `web` healthcheck gating Caddy.
- `Caddyfile` — reverse proxy to `web:3000`, domain from `$DOMAIN`, security
  headers, access logs.
- `.env.example` — every variable name with a comment; no values.
- `scripts/deploy.sh` — preflight checks, pull, build, health-gated restart and
  an HTTPS check. LF endings, marked executable in git.
- `.dockerignore` — keeps node_modules/.next/.env out of the build context.

**App changes required for the image**
- `next.config.mjs`: enabled `output: "standalone"`, and fixed
  `outputFileTracingRoot` to an absolute monorepo path. The previous
  `new URL(...).pathname` form produced **no** standalone output, which would
  have broken the Docker build (silently: `server.js` would not exist).
- New `GET /api/health` (brief §120).
- `catalog` gained `?thumbs=path`, and the web uses it: the catalogue dropped from
  **1.71 MB to 1.01 MB** and no longer carries short-lived signed URLs. New
  `/api/thumb/<asset_id>` proxies thumbnail images for the (private) storage
  bucket with a long cache header, so a cached page does not show broken images.
- Removed 10 stale `DiroryLibrary-*.rbz` copies from `apps/web/private/`; the image
  was tracing all of them. Only the current version ships.

**Verified on this machine** (no Docker available here)
- `tsc` and `next build` clean; standalone output produced at
  `apps/web/.next/standalone/apps/web/server.js`.
- The **standalone server** was actually run: `/api/health` → 200 with
  `{"status":"ok"}`, `/api/thumb/<id>` → 200 `image/jpeg`, `/library` → 200.
- `docker-compose.yml` structure and the six env names cross-checked against
  `.env.example`; `deploy.sh` is LF-only.

**Not verified:** the Docker build itself, Caddy's certificate issuance, and the
server hardening steps — these need the VPS. Run `docs/DEPLOY.md` from step 1.

## 0.9.0 — in-plugin update button and Settings (English / Bahasa Indonesia)

**Plugin update, without the Extension Manager.**
- New **Update** badge in the toolbar appears when a newer version is published.
- Clicking it downloads the new archive and **stages** it; the swap happens
  automatically on the next SketchUp launch, then SketchUp is restarted by the
  user. Settings and sign-in survive because they live in SketchUp defaults and
  `~/.dirory`, not in the plugin folder.
- A running extension cannot overwrite its own code (the Ruby is loaded and, on
  Windows, the files are locked), so the swap is deferred to startup by design.
- The plugin checks `GET /plugin-release` (no auth) and downloads from
  `GET /plugin-release/download` with its device token.

**Settings.**
- New Settings dialog with **Language: English / Bahasa Indonesia**. The whole
  panel UI is translated (`i18n.rb`); missing keys fall back to English, so a
  partial translation is safe.

**Infrastructure.**
- Migration `0009_plugin_bucket.sql`: private `plugin-release` Storage bucket.
- Edge Function `plugin-release`: version check + gated download (401 without a
  plugin token). Verified live: 0.9.0 reported, 401 unauth, 182,446-byte ZIP
  authenticated, and every .rb in the downloaded archive parses.
- `scripts/upload-plugin-release.mjs` (`npm run rbz:publish`) uploads the built
  archive; `apps/web/src/lib/pluginRelease.ts` is the single version constant.
- `GET /api/plugin/latest` on the website for a browser-side version check.

**Not verified:** the Update button and the language switch have not been clicked
in SketchUp. The download/version endpoints are verified against the live project.

## 0.8.3 — search only on Enter (so Dirory learns the query the user meant)

**Why:** the panel filtered live as the architect typed, and a zero-result
search is only reported after a pause. Backspacing ("toto closet" → "toto")
silently changed the results and could erase the term the architect actually
wanted, so the demand signal was lost.

**Plugin 0.8.3**
- The search box no longer filters as you type. Results appear when the query is
  **committed** — press Enter or click the new **Search** button.
- The whole catalogue stays visible until a search is run (unchanged).
- Only committed zero-result searches are reported (PRD FR-A14 unchanged), so the
  term reported is exactly the one the user committed.
- The Search button is dimmed until there is typed text that has not been run
  yet, so it is clear that typing alone does nothing.

**Verified:** panel.js parses, every `sketchup.*` call still has a Ruby callback,
Prism parses all plugin sources, web build clean.
**Not verified:** the interaction itself (Enter/backspace behaviour) has not been
exercised in SketchUp.

## 0.8.2 — web product catalogue, product pages, simpler plugin sign-in

**Web (new pages, modelled on Dekoruma's supply warehouse):**
- `/library`: a public product catalogue — search, All/Models/Materials tabs,
  brand and category filters, sort, and a responsive grid. Browsing needs no
  account; "Free sample" is badged.
- `/product/<asset_id>`: a product page with a large image, specifications
  (brand, category, type, tile size, SKU, tags) and related products from the
  same brand/category.
- The product page's action is **"install Dirory to use this in SketchUp"**, not
  a file download. No file is offered on the web; the plugin fetches assets on
  demand. Signed-out visitors are sent to sign in first.

**Plugin 0.8.2:**
- Sign-in is now a single **"Sign in with Google"** button. The device code is no
  longer shown — the browser step auto-approves and the panel connects by itself.
- Clicking a model/material card while signed out shows a short notice
  ("Sign in to load this model…" / "…paint this material…") and opens the
  in-panel sign-in, instead of appearing to do nothing.

**Not verified:** the two new pages render and typecheck, but they have not been
reviewed in a browser by the founder, and the plugin changes have not been run
in SketchUp.

## 0.8.1 — fix: plugin sign-in never completed, so cards never loaded

**Symptom:** in plugin 0.8.0 clicking a model/material card asked to sign in;
after signing in with Google, clicking a card still did nothing (it just asked to
sign in again). No `plugin_token` was ever stored by the plugin.

**Cause (web):** `/auth/device` sent Google/email straight back to
`/auth/device?code=<device code>`. Nothing on that page exchanges the OAuth
`?code=` for a session, and Supabase appends its own `code=`, giving
`?code=ABCD-EFGH&code=<oauth>` — which crashed the page (HTTP 500, `code` was an
array). The device code was never approved, the plugin's poll stayed `pending`,
and the sign-in gate blocked every insert/paint.

**Fix**
- `DeviceSignIn.tsx`: return through `/auth/callback?next=/auth/device?code=…`
  (the same path `/login` uses), so the session is created first.
- `auth/device/page.tsx`: tolerate a repeated `code` param and pick the one
  shaped like a device code instead of crashing.
- Plugin 0.8.1: repaired `main.rb` text that 0.8.0 saved with broken encoding
  (menu showed "Sign in to Diroryâ€¦"); no behaviour change.

## 0.6.0 — M6: plugin cloud catalogue, verified login, downloads, quotes

Adds the client side of the cloud (PRD M6, FR-A4/A7/A10/A11/A20/A22) and the
backend it needs. The local-folder library still works when no server URL is set,
so existing users are unaffected until they opt in.

**Backend**
- Migration `0007_plugin_auth.sql`: `plugin_device_codes` and `plugin_tokens`
  (SHA-256 hashes at rest only). RLS locked down; the single approval policy can
  only bind a live pending code to the caller's own profile.
- `auth-device`: `POST /auth-device/{start,poll,revoke}` — device-code login.
  `poll` returns `pending` until the browser approves, then issues an opaque token.
- `download`: `GET /download/<asset_id>` — short-lived signed URL (≤ 10 min) for
  the current approved version; only visible vendors or the Dirory samples.
- `quotes`: `POST /quotes` — one `quote_requests` row per vendor with only that
  vendor's items, plus the consent form (project, city, timeline, note, phone).
  Samples are never quotable.
- `catalog`: now also returns a signed `thumbnail_url` per item, because the
  `models`/`materials` buckets are private.
- `favourites`: accepts the plugin's opaque token instead of a user JWT.
- `_shared/plugin-auth.ts`: token hashing, service client, identity resolution.

**Web**
- `/auth/device` page + action: the architect signs in and approves the code the
  plugin shows.

**Plugin v0.6.0 (`plugin/`, packaged to `dist/DiroryLibrary-0.6.0.rbz`)**
- `cloud.rb`: verified device sign-in (`sign_in_start`/poll/`sign_out`), opaque
  token in `request_headers`, `fetch_catalog` with a `~/.dirory` cache,
  `download_asset` into `~/.dirory/cache/<asset_id>/<version>/`, favourites
  pull/push, and `post_quote`.
- `main.rb`: `send_library` renders the cloud catalogue and falls back to the
  local scan; `insert_model`/`apply_material` download on demand (FR-A11); entities
  are tagged with `asset_id` (FR-A12); tile size prefers the server value (FR-A13).
- Panel: device-code sign-in UI, a quote consent modal, cloud thumbnail URLs.

**Tooling**
- `scripts/check-ruby.mjs` (`npm run rb:check`) now uses Ruby's own **Prism**
  parser via `@ruby/prism` (WASM), so the plugin files are checked with the same
  parser Ruby ships — no Ruby interpreter on the machine needed.
- `npm run fn:check` typechecks every Edge Function; `npm run rbz:build` packages.
- An earlier regex-based "checker" passed a `main.rb` with a duplicated `def` line
  and a missing `end`, which made SketchUp reject the whole extension with
  "unexpected end-of-input, expecting `end`". That is why the check is now a real
  parse, and the packaged RBZ is re-parsed from the archive before shipping.

**Verified**
- `npm run build` clean, 26 routes (up from 25: `/auth/device`).
- `npx tsc --noEmit` clean.
- `deno check` clean on all six Edge Functions.
- `node scripts/check-ruby.mjs` clean; every `Cloud.*` call resolves.
- RBZ rebuilt and inspected: 9 entries, forward-slash names, loader at root.

**Deployed and run against `ajlmncbzufagplbaaukv` (Singapore), 4 Oct 2026**
- Migrations 0007 and 0008 applied; six Edge Functions deployed.
- `auth-device/start` returns a device code and verification URL (HTTP 200).
- `catalog` returns 200; `download`, `quotes` and `favourites` return 401 without
  a token, as designed.
- **The RLS suite ran for the first time** and passed all checks 1–10. It caught
  two real defects:
  1. The 0007 device-code SELECT policy hid the pending row, so approval could
     never match a row — **fixed in migration 0008**.
  2. Check 8 wrote to `storage.objects` directly, which Supabase now blocks
     (`storage.protect_delete()`) — the test was wrong, not the policy; it now
     skips the fixture when the guard is present.
- **The library uploaded:** 1,307 assets (9 models, 1,298 materials) across 11
  brands, 1,306 with thumbnails, 272 with tile sizes. `catalog` returns all 1,307.

**Three plugin/upload bugs found by actually running things (all fixed)**
1. **Ruby syntax error** — a duplicated `def self.defer_folder_picker` line left
   `main.rb` missing an `end`, so SketchUp refused the whole extension
   ("unexpected end-of-input"). My regex-based "checker" had passed it; the check
   is now a real parse with Ruby's own Prism parser (`npm run rb:check`).
2. **The panel never received the catalogue** — `Sketchup::Http::Request` is
   asynchronous and a request held in a *local variable* is garbage-collected
   when the method returns, so its callback never fires. All ten HTTP calls now
   go through `Cloud.new_request`, which keeps in-flight requests reachable, and
   catalogue errors are surfaced on the panel instead of being swallowed.
3. **Only 1 of 1,307 assets was visible** — two causes: the uploader marked every
   per-brand asset `pending_review` (the fix approves seed-library assets), and
   `catalog` read a single PostgREST page capped at 1,000 rows (now paged).
4. **Clicking a card did nothing** — no component followed the cursor and the
   Paint tool never activated. Two known SketchUp quirks, both confirmed in the
   API tracker/forums: `place_component` and `send_action('selectPaintTool:')`
   do not take effect when invoked directly inside an HtmlDialog/HTTP callback.
   Fixed by deferring the insert/paint to a main-thread timer
   (`run_on_main_thread`, which also calls `Sketchup.focus`), and by preferring
   Dirory's own `MaterialPaintTool` over the flaky native `send_action`.

**Sign-in (added after the first test)**
- "Continue with Google" on `/login`, alongside the email link.
- `/auth/device` auto-approves a live code for an already-signed-in user, so a
  returning user connects with no extra click.
- **Requires you to enable the Google provider in Supabase** (Client ID/Secret
  from Google Cloud); the email path works without it.


**Still not verified**
- No Ruby interpreter here, so the plugin was **not** executed. Load
  `dist/DiroryLibrary-0.6.0.rbz` in SketchUp to run the M6 acceptance test
  (sign in → browse cloud → insert a model and paint a material; a sample cannot
  be quoted). This is the one remaining gate on Phase 1.
- The `/auth/device` web page has not been exercised end-to-end in a browser
  against the live project.
- `SITE_URL` was set to `https://dirory.id`; change it if the web app is hosted
  elsewhere.


## 0.5.0 — architect landing page, email signup, protected RBZ delivery

- Created the public architect/designer landing page at `/`, using the supplied
  transparent Dirory mark in the header, product preview, favicon and Open Graph
  metadata.
- Fixed the `/login` React #321 crash by keeping Next.js 15 `searchParams`
  resolution in a server component and moving hooks into `SignInForm`.
- Passwordless email-link sign-in supports Gmail. Supabase creates an architect
  profile on first sign-in; this is email OTP, not Google OAuth.
- Added `/download` and `/api/download/rbz`: an authenticated profile gets
  DiroryLibrary v0.5.2; unauthenticated requests are redirected to sign-in. The
  RBZ is included in Next's server trace and is not under the public static path.
- Added a public privacy-policy draft at `/privacy` and made callback `next`
  redirects local-path-only.
- Added migration `0006_admin_bootstrap.sql` to let the trusted SQL Editor
  promote the founder while authenticated non-admin users remain unable to self-
  promote. Extended the RLS suite to test the role trigger.
- Netlify remains blocked by its private-repository "Unrecognized Git
  contributor" limit. Source is ready, but this version will not be live until
  Netlify accepts the commit and a production deployment succeeds.

**Verified:** TypeScript strict check, Next.js production build (24 routes),
local production smoke test (`/`, `/login`, `/download`, `/privacy` all HTTP 200;
unauthenticated `/api/download/rbz` redirects to sign-in), and RBZ artifact is
present in the route output trace.

**Not verified:** Netlify production deployment, migration 0006 on Supabase, the
full RLS suite, or public SMTP delivery. Supabase's built-in email sender may
only deliver to project-team addresses; configure custom SMTP before inviting
architects publicly.

## 0.4.0 — public architect site and protected RBZ download

- Replaced the scaffold homepage with a public landing page for architects and
  designers, using the supplied Dirory mark as the header/hero brand, favicon
  and Open Graph page thumbnail.
- Split the broken async client login into a Next.js 15 server page and an
  interactive client form. `searchParams` is awaited on the server, so React
  hooks are no longer called after an `await` (the source of React error #321).
- Login clearly supports Gmail via passwordless email link. On first use,
  Supabase Auth creates an architect profile (`disable_signup=false`, email
  provider enabled). This is email OTP, not Google OAuth.
- Added `/download` and `/api/download/rbz`; unauthenticated requests go to
  sign-in, authenticated users receive RBZ v0.5.2. The package is server-traced,
  not placed in the public static directory.
- Added a public privacy-policy draft page and safer local-only callback paths.
- Added migration `0006_admin_bootstrap.sql`: the previous profile-role trigger
  prevented the trusted SQL Editor from promoting the founder to admin because
  it treated a null `auth.uid()` as a regular user. It still blocks authenticated
  users from self-promoting.
- Extended the RLS test with admin-fixture verification and tests for preventing
  self-promotion while allowing a trusted bootstrap operation.

**Verified:** strict TypeScript check and Next.js production build pass (24 app
routes); RBZ appears in the download route's output trace; local production
smoke test returned 200 for `/` and `/login`, and an unauthenticated download
request redirected to `/login`.

**Not verified:** Netlify has been blocking builds from GitHub with its
"Unrecognized Git contributor" private-repository limit. This code is not live
until that Netlify contributor/account issue is fixed and a deployment succeeds.
The new migration and expanded RLS test have not yet been pushed/run on Supabase.

## 0.3.0 — privacy, consent (UU 27/2022) and v0.5.2

Founder decisions this session: option C (policy now, consent UI as a separate
RBZ), project-title sharing **off by default**, scaffold moved to `D:\Dirory\dirory`.

**Docs**
- `docs/PRIVACY.md` — draft privacy policy for UU 27/2022, checked against the
  actual wire format. Includes Appendix A listing the exact payloads. Marked
  DRAFT; needs legal review.
- `docs/RECONCILIATION.md` — brief §32 deliverable: PRD v1.2 vs scaffold, with six
  gaps (G1–G6), three brief conflicts (C1–C3) and five assumptions.
- `docs/DEPLOY.md` — Sumopod VPS runbook, starting from "no domain yet".

**Plugin v0.5.2 (`plugin/`, packaged to `dist/DiroryLibrary-0.5.2.rbz`)**
- Split consent: `share_usage` (anonymous usage + search misses, on by default)
  and **`share_project` (project titles, OFF by default)**. One switch could not
  lawfully cover both: a project title is often personal data.
- `cloud.rb`: new `share_project?` / `set_share_project`. Both the snapshot and the
  quote payload now send `project: ''` unless consent is given. Turning the
  feature on re-marks every model dirty so it applies without waiting for an edit.
- Panel: explicit "What you share" block, a "See exactly what is sent" disclosure
  listing what is and is not transmitted, and a privacy-policy link.
- `main.rb`: `setShareProject` and `openPrivacy` callbacks; `PRIVACY_URL` constant.
- Version bumped to 0.5.2 in `dirory_library.rb` and `cloud.rb`.

**Edge Functions**
- `events`: new `nonEmptyString()` — an opted-out (or blank) `project` is stored as
  `NULL`, not `''`. This was a real bug: `typeof '' === 'string'` would have
  written an empty string, making "not consented" indistinguishable from "no
  title". Applied to both `usage_snapshots.project` and `quote_requests.project_name`.

**Tooling**
- `scripts/build-rbz.ps1` — builds the RBZ. **Necessary, not cosmetic:**
  PowerShell's `ZipFile::CreateFromDirectory` writes entries with backslashes on
  Windows, producing an archive where SketchUp extracts one file literally named
  `dirory_library\cloud.rb` and the extension fails to load. The script writes
  forward-slash entries and verifies the result (loader at root, no backslashes).

**Tests**
- `rls_test.sql` check 9: a non-consented snapshot stores `NULL` not `''`, and a
  vendor still cannot read `usage_snapshots`.

**Verified**
- `supabase/functions/**` typechecks clean under `--strict`.
- RBZ rebuilt and inspected: 9 entries, forward-slash names, loader at root, and
  the project-title gates present inside the *packaged* `cloud.rb`.
- Every panel JS callback has a matching Ruby handler (15/15, no orphans).
- `cloud.rb` is byte-clean ASCII again — my first edit introduced a mojibake `§`
  (U+00A7 written as one byte), which is fixed and re-verified at 0 non-ASCII.

**Not verified**
- No Ruby interpreter on this machine, so the `.rb` files were **not** parsed by
  Ruby. Comments and balance were checked by inspection only. Load the RBZ in
  SketchUp to confirm.
- The RLS suite still has **not been run** (no Docker/WSL/psql; brief §126).
- The privacy policy has not been reviewed by a lawyer.

## 0.2.0 — PRD v1.2 / plugin v0.5.1 reconciliation

Reconciled the backend against PRD v1.2 and RBZ v0.5.1.

**Finding: the plugin's server contract did not change.**
`cloud.rb` is byte-identical between v0.5.0 and v0.5.1 (17,793 bytes). The four
event kinds (`account`, `search_miss`, `usage_snapshot`, `quote_request`), the
envelope and `POST /events` are unchanged, so the ingest function needed no
compatibility work. The v0.5.1 features are local-only.

Changed files in the RBZ: `main.rb` (+3,341, favourites + brand logos),
`ui/panel.js` (+5,771, Favourite tab + pinned controls), `ui/panel.css` (+2,383),
`ui/panel.html` (+325). Three PNGs and `cloud.rb` unchanged.

**Schema (`0001_schema.sql`)**
- New `favourites` table (FR-A22 / Q15): per-profile starred + "Used before",
  keyed by `asset_id` once linked, or `legacy_key` before M6.
- `assets.legacy_key` — the plugin's local relative path (`relative_key` in
  main.rb), so pre-M6 favourites and usage rows can be linked to real assets.
- `vendors.logo_path` + `logo_source` enum, and `miss_tab` gains `favourite`.

**RLS (`0002_rls.sql`)**
- `favourites`: owner-only read/write, admin all. **Vendors and anon read
  nothing** — a favourite is a private demand signal, so it is treated like
  `search_misses`.
- `vendors_public_read` already exposed `logo_url`; no change needed there.

**Storage (`0004_storage.sql`)**
- New **public** `brands` bucket (FR-A24), 200 KB cap, image MIME allow-list.
  Public because the plugin draws logos on every card and cannot sign URLs for
  them. Write access stays with the owning vendor or an admin (FR-M13).
- `models` / `materials` remain private.

**Edge Functions**
- `catalog`: returns `brand_logos` (brand banner + Usage tab) and per-item
  `brand_logo`, `legacy_key` and `vendor_id` (FR-A24), matching the keys the
  v0.5.1 panel already reads from `send_library`.
- `events`: links `usage_snapshot_items.asset_id` via `assets.legacy_key`
  (PRD §9 mapping note) instead of leaving it null until M6. Wire format
  unchanged; header documents v0.5.0/v0.5.1 parity.
- `favourites` (new): `GET` / `POST` sync for M6. Not called by v0.5.1.

**Tests (`supabase/tests/rls_test.sql`)**
- Added check 7: favourites are invisible to other architects, to vendors and to
  anonymous callers, and cannot be written on another profile's behalf.
- Added check 8: brand logos are readable by anyone, but a non-owning vendor
  cannot delete one.

**Verified**
- `supabase/functions/**` typechecks clean under `--strict` (Deno URL imports
  and the `Deno` global stubbed for the check only).
- `apps/web` `npm run build` clean, 21 routes.
- `rls_test.sql` structure validated (balanced dollar-quotes, single top-level
  `declare`, well-formed exception block).

**Not verified — no local Postgres**
Docker, WSL and psql are all unavailable on this machine, so `supabase db push`
and the RLS suite were **not executed**. They must be run before relying on them
(see docs/SETUP.md §6).

## 0.1.0 — scaffold (M0–M5, M7 partial)

Initial monorepo scaffold built from PRD v1.1.

**Database (`supabase/migrations`)**
- `0001_schema.sql` — every table from PRD §9: profiles, installs, vendors,
  vendor_members, categories, assets, asset_versions, plans, subscriptions,
  invoices, ingest_log, search_misses, missing_requests, usage_snapshots,
  usage_snapshot_items, usage_history, daily_asset_usage, quote_requests,
  audit_log.
- `0002_rls.sql` — RLS on every table. Vendor isolation, admin-only demand
  tables, architect read rules, storage policies, auto-profile trigger, and a
  role-escalation guard.
- `0003_functions.sql` — `set_vendor_status`, `review_asset`,
  `submit_asset_version`, `rollup_daily_usage`, `write_audit`, plus an audit
  trigger on vendor status.
- `0004_storage.sql` — private `models` / `materials` buckets and per-vendor path
  policies.
- `0005_seed.sql` — platform brand "Dirory", taxonomy, four plans.

**Edge Functions (`supabase/functions`)**
- `events/index.ts` — `POST /events` per PRD §10: batch validation, event-id
  idempotency, per-install rate limit, snapshot upsert + history, search-miss
  aggregation into `missing_requests`, quote fan-out to vendors.
  v0.5.0-compatible.
- `catalog/index.ts` — `GET /catalog` returning the same hash shape as
  `scan_library` plus `asset_id`, `version`, `tile_size_cm` (FR-A7).

**Web app (`apps/web`)**
- Next.js 15 App Router, React 19, Tailwind. Magic-link auth, session middleware,
  role gates for `/admin` and `/vendor`.
- Admin: overview (KPIs, MRR, demand, audit), vendors (FR-M1), review queue
  (FR-M2), Dirory samples (FR-M12), taxonomy (FR-M3), plans (FR-M4), payments
  (FR-M5/M6), missing requests (FR-M10), usage explorer (FR-M11), quotes.
- Vendor: onboarding (FR-V1), dashboard with range selector (FR-V4), products
  with direct-to-storage upload and versioning (FR-V3), leads inbox (FR-V5),
  subscription + invoices (FR-V6), team (FR-V2), settings.

**Tooling**
- `scripts/upload-library.mjs` — push a local `Model/<Category>/<Brand>` /
  `Materials/...` tree into Supabase, with `--dry-run` and `--vendor`.
- `supabase/tests/rls_test.sql` — the M1 acceptance suite.
- `docs/SETUP.md`, `docs/PRD.md`, `AGENTS.md`, `README.md`.

**Verified**
- `npm run build` — clean, 21 routes.
- `npx tsc --noEmit` — clean.

**Not yet done (see PRD §13.3)**
- M6 device-code login (soft sign-in still the gate), signed download endpoint,
  server-side quotes with the consent form.
- M8 payment gateway webhook and the grace/expiry job.
- M9 hardening: emails, rate-limit tuning, privacy pages, signed `.rbz`,
  update banner.
