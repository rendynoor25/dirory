// Builds a RAB workbook from a sample model (architecture, structure, MEP,
// demolition, an own price and an unpriced line) and writes it for
// scripts/check-xlsx.py, which recalculates every formula independently.
// Usage: node scripts/test-rab-xlsx.mjs [out.xlsx]
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { computeRab } = require("../plugin/dirory_library/ui/rab.js");
const { buildRabWorkbook } = require("../plugin/dirory_library/ui/rab-xlsx.js");
const X = require("../plugin/dirory_library/ui/xlsx.js");

const book = JSON.parse(fs.readFileSync(new URL("../supabase/seed/rab_jakarta.json", import.meta.url), "utf8"));
const takeoff = {
  rows: [
    { element: "wall", material: "Bata 1/2 batu", area_m2: 180 },
    { element: "wall", material: "Keramik 20x20", category: "Tiles", area_m2: 24 },
    { element: "floor", material: "Granit 60x60", category: "Tiles", area_m2: 96 },
    { element: "ceiling", material: "Gypsum", area_m2: 90 },
    { element: "roof", material: "Genteng beton", area_m2: 120 },
  ],
  totals: { wall: 204, floor: 96, ceiling: 90, roof: 120 },
  openings: [
    { kind: "door", name: "P1 90x210", width_m: 0.9, height_m: 2.1, count: 4 },
    { kind: "window", name: "J1 120x150", width_m: 1.2, height_m: 1.5, count: 6 },
  ],
  floor_perimeter_m: 64,
  structure: [
    { member: "footing", name: "P1 60x60", count: 12, concrete_m3: 2.6, formwork_m2: 14, rebar_kg: 0, rebar_ratio_m3: 2.6, steel_kg: 0 },
    { member: "column", name: "K1 15x20", count: 14, concrete_m3: 1.6, formwork_m2: 31, rebar_kg: 260, rebar_ratio_m3: 0, steel_kg: 0 },
    { member: "slab", name: "Plat 12", count: 1, concrete_m3: 11.5, formwork_m2: 96, rebar_kg: 0, rebar_ratio_m3: 11.5, steel_kg: 0 },
  ],
  mep: [
    { group: "pipe", name: "PVC", system: "Domestic Cold Water", material: "PVC", size_mm: 20, unit: "m", quantity: 42 },
    { group: "pipe", name: "PVC", system: "Sanitary", material: "PVC", size_mm: 100, unit: "m", quantity: 18 },
    { group: "plumbing_fixture", name: "TOTO CW633J : Monoblock", unit: "unit", quantity: 2 },
    { group: "plumbing_fixture", name: "Kitchen Sink : Double", unit: "unit", quantity: 1 },
    { group: "light", name: "Downlight : 12W", unit: "unit", quantity: 18 },
    { group: "socket", name: "Stop kontak : Standard", unit: "unit", quantity: 14 },
    { group: "equipment", name: "Split AC Indoor : 1 PK", unit: "unit", quantity: 3 },
  ],
  demolition: [
    { group: "masonry", name: "Bata lama", unit: "m3", quantity: 2.4, width_m: 0 },
    { group: "concrete", name: "Plat lama", unit: "m3", quantity: 1.2, width_m: 0 },
  ],
  extras: [
    { group: "railing", name: "Railing Tangga", unit: "m", quantity: 10.6, on_stair: true },
    { group: "casework", name: "Kitchen Set", unit: "m", quantity: 7.25 },
  ],
  phase: "1",
};
const rab = computeRab(takeoff, book, { prices: { "mep|closet_seat|TOTO CW633J : Monoblock": 5200000 } });
const wb = buildRabWorkbook({ rab, book, takeoff, project: "Rumah Contoh", date: "2026-10-16" });
const out = process.argv[2] || "rab-test.xlsx";
fs.writeFileSync(out, X.write(wb));
console.log(JSON.stringify({
  sheets: wb.sheets.map((s) => `${s.name}:${s.rows.length}`),
  workbookTotal: Math.round(wb.total),
  panelTotal: rab.total,
  unpriced: rab.unpriced,
}));
