#!/usr/bin/env node
/**
 * Give Dirory's own sample materials human display names.
 *
 * The first library import named every material after its *filename*, so the
 * plugin's card grid shows `brick_brown_clay` next to real products like
 * "PL 346 – Imperial Treasure". The import also wrote the intended display name
 * into `tags`, which is where these values come from — this is not new naming,
 * it is promoting the name that was already recorded.
 *
 * Only the platform brand's materials are touched. Brand products keep their
 * names, because those come from the vendor.
 *
 *   node scripts/normalise-sample-names.mjs --dry-run
 *   node scripts/normalise-sample-names.mjs
 *
 * Idempotent: a name already renamed no longer matches an old key, so a second
 * run changes nothing. `legacy_key` is left alone — it is the import identity.
 *
 * Needs in the environment (or .env.local):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PLATFORM_VENDOR_ID = "00000000-0000-0000-0000-0000000000d1";

/**
 * filename-name -> display name.
 *
 * The two tiles keep their size, moved to the end: "30x60 White Ceramic" reads
 * like a stock line, and architects search the size as a suffix ("keramik 60x60").
 */
const RENAMES = {
  brick_brown_clay: "Brown Clay Brick",
  brick_exposed_red: "Exposed Red Brick",
  brick_white: "White Brick",

  concrete_fair_face: "Fair Face Concrete",
  concrete_paving: "Concrete Paving",
  concrete_screed: "Concrete Screed",

  metal_brushed_aluminium: "Brushed Aluminium",
  metal_galvanized: "Galvanized Steel",
  metal_matte_black: "Matte Black Metal",

  paint_charcoal: "Charcoal Paint",
  paint_light_grey: "Light Grey Paint",
  paint_terracotta: "Terracotta Paint",
  paint_warm_white: "Warm White Paint",

  roof_clay_tile: "Clay Tile Roof",
  roof_concrete_tile: "Concrete Roof Tile",
  roof_metal: "Metal Roof",

  stone_andesite: "Andesite Stone",
  stone_black_granite: "Black Granite",
  stone_limestone: "Cream Limestone",

  tile_30x60_white: "White Ceramic 30x60",
  tile_60x60_light_grey: "Light Grey Porcelain 60x60",
  tile_terrazzo: "Terrazzo Speckle",
  tile_wood_look: "Wood Look Porcelain",

  wood_light_oak: "Light Oak",
  wood_teak: "Natural Teak",
  wood_walnut: "Dark Walnut",
};

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const dryRun = process.argv.includes("--dry-run");
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const entries = Object.entries(RENAMES);
const { data: rows, error } = await supabase
  .from("assets")
  .select("id, name, categories(name)")
  .eq("vendor_id", PLATFORM_VENDOR_ID)
  .eq("type", "material")
  .in("name", entries.map(([old]) => old));
if (error) {
  console.error(error.message);
  process.exit(1);
}

const found = new Map((rows ?? []).map((r) => [r.name, r]));
console.log(`Dirory sample materials to rename: ${found.size} of ${entries.length}${dryRun ? " (dry run)" : ""}`);

let changed = 0;
for (const [oldName, newName] of entries) {
  const row = found.get(oldName);
  if (!row) {
    console.log(`  · ${oldName} -> already renamed or absent`);
    continue;
  }
  const category = row.categories?.name ?? "?";
  if (dryRun) {
    console.log(`  · [${category}] ${oldName}  ->  ${newName}`);
    continue;
  }
  const { error: upErr } = await supabase.from("assets").update({ name: newName }).eq("id", row.id);
  if (upErr) {
    console.error(`  ! ${oldName}: ${upErr.message}`);
    continue;
  }
  changed++;
  console.log(`  ✓ [${category}] ${oldName}  ->  ${newName}`);
}

if (dryRun) console.log("\nDry run complete. Nothing was written.");
else console.log(`\nRenamed ${changed} material(s).`);
