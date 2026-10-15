// Unit tests for the plugin's RAB calculator (plugin/dirory_library/ui/rab.js).
// Usage: node scripts/test-rab.mjs
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { computeRab, quantities } = require("../plugin/dirory_library/ui/rab.js");
const book = JSON.parse(fs.readFileSync(new URL("../supabase/seed/rab_jakarta.json", import.meta.url), "utf8"));
// The Edge Function serves `quantity_basis`; the seed file calls it `quantity`.
book.items = book.items.map((it) => ({ ...it, quantity_basis: it.quantity }));

let failed = 0;
const eq = (label, got, want) => {
  const ok = Math.abs(got - want) < 0.01;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
};

// A 4 x 5 m room, 3 m high, walls drawn with both faces, one door, one window,
// a bathroom wall tiled with a Dirory tile.
const takeoff = {
  rows: [
    { element: "wall", material: "Warm White", area_m2: 100 },
    { element: "wall", material: "Roman Granit 20x20", category: "Tiles", area_m2: 8 },
    { element: "floor", material: "Roman 40x40", category: "Tiles", area_m2: 20 },
    { element: "ceiling", material: "Unpainted", area_m2: 20 },
    { element: "roof", material: "Genteng", area_m2: 26 },
  ],
  openings: [
    { kind: "door", name: "P1", width_m: 0.9, height_m: 2.1, count: 1 },
    { kind: "window", name: "J1", width_m: 1.2, height_m: 1.5, count: 2 },
  ],
  floor_perimeter_m: 18,
};

const q = quantities(takeoff);
eq("wall core = all wall faces / 2", q.wall_core, 54);
eq("wall finish = untiled faces", q.wall_finish, 100);
eq("wall tiled", q.wall_tiled, 8);
eq("frame length 2(W+H) x n", q.opening_perimeter, 2 * (0.9 + 2.1) + 2 * 2 * (1.2 + 1.5));
eq("door leaf area", q.door_area, 1.89);
eq("window glass area", q.window_area, 3.6);
eq("single-face walls are not halved", quantities(takeoff, { wallsBothSides: false }).wall_core, 108);

const rab = computeRab(takeoff, book);
const line = (key, basis) => rab.lines.find((l) => l.key === key && (!basis || l.basis === basis));
const price = (key) => book.items.find((i) => i.key === key).unit_price;
eq("brick line = 54 m2 x unit price", line("wall_brick").amount, Math.round(54 * price("wall_brick")));
eq("no AAC line by default", rab.lines.filter((l) => l.key === "wall_aac").length, 0);
eq("ceiling gets its own paint line", line("paint_wall", "ceiling").quantity, 20);
eq("total = sum of lines", rab.total, rab.lines.reduce((s, l) => s + l.amount, 0));
eq("subtotals add up to total", Object.values(rab.subtotals).reduce((a, b) => a + b, 0), rab.total);
eq("AAC option swaps the masonry", computeRab(takeoff, book, { wallType: "aac" }).lines.filter((l) => l.key === "wall_brick").length, 0);
eq("an empty takeoff costs nothing", computeRab({ rows: [], openings: [] }, book).total, 0);
eq("an item missing from the book is reported", computeRab(takeoff, { items: [] }).missing.length > 0 ? 1 : 0, 1);

console.log(`\nTotal for the sample room: Rp ${rab.total.toLocaleString("id-ID")}`);
// Structure (Revit): a column with modelled rebar, a slab without, a steel
// beam, and a concrete wall whose core must not be priced as brick too.
const frame = {
  rows: [
    { element: "wall", material: "Brick 150", area_m2: 40 },
    { element: "wall", material: "Concrete 200", core: "concrete", area_m2: 20 },
  ],
  openings: [],
  structure: [
    { member: "column", name: "K1 30x30", count: 4, concrete_m3: 1.08, formwork_m2: 14.4, rebar_kg: 200, rebar_ratio_m3: 0, steel_kg: 0 },
    { member: "slab", name: "Plat 12", count: 1, concrete_m3: 6, formwork_m2: 52, rebar_kg: 0, rebar_ratio_m3: 6, steel_kg: 0 },
    { member: "wall", name: "Concrete 200", count: 1, concrete_m3: 2, formwork_m2: 20, rebar_kg: 0, rebar_ratio_m3: 2, steel_kg: 0 },
    { member: "steel", name: "Beam: WF 200", count: 2, concrete_m3: 0, formwork_m2: 0, rebar_kg: 0, rebar_ratio_m3: 0, steel_kg: 358 },
  ],
};
const fq = quantities(frame);
eq("concrete wall core is not masonry", fq.wall_core, 20);
eq("concrete wall still gets finishes", fq.wall_finish, 60);
eq("modelled rebar is used as-is", fq.rebar_column, 200);
eq("unmodelled rebar uses the slab ratio", fq.rebar_slab, 6 * 110);
eq("ratio can be overridden", quantities(frame, { rebarRatio: { slab: 100 } }).rebar_slab, 600);
eq("all concrete is compacted", fq.concrete, 9.08);
eq("steel weight", fq.steel, 358);
const frab = computeRab(frame, book);
const fline = (key, basis) => frab.lines.find((l) => l.key === key && l.basis === basis);
eq("column concrete priced as ready-mix", fline("concrete_rm", "concrete_column").amount, Math.round(1.08 * price("concrete_rm")));
eq("slab rebar uses the slab item", fline("rebar_slab", "rebar_slab").quantity, 660);
eq("column rebar uses the frame item", fline("rebar_frame", "rebar_column").quantity, 200);
eq("slab formwork", fline("formwork_slab", "formwork_slab").quantity, 52);
eq("steel line", fline("steel_profile", "steel").amount, Math.round(358 * price("steel_profile")));
eq("site-mixed option swaps the concrete item",
  computeRab(frame, book, { concrete: "site" }).lines.filter((l) => l.key === "concrete_rm").length, 0);
eq("structure subtotal is its lines", frab.subtotals.structure,
  frab.lines.filter((l) => l.element === "structure").reduce((s, l) => s + l.amount, 0));
eq("nothing missing from the Jakarta book", frab.missing.length, 0);
eq("a SketchUp takeoff has no structure lines", rab.lines.filter((l) => l.element === "structure").length, 0);
console.log(`Structure sample: Rp ${frab.subtotals.structure.toLocaleString("id-ID")}`);

process.exit(failed ? 1 : 0);
