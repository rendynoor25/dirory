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
process.exit(failed ? 1 : 0);
