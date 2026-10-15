#!/usr/bin/env node
/**
 * Load a regional RAB price book into Supabase (migration 0038).
 *
 * Reads supabase/seed/rab_<region>.json (built by scripts/build-rab-<region>.py)
 * and replaces that region's items and components. Other regions are untouched.
 *
 * Needs in the environment (or .env.local): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/seed-rab.mjs --region jakarta --dry-run
 *   node scripts/seed-rab.mjs --region jakarta
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

loadEnv();
const region = String(arg("region", "jakarta"));
const dryRun = Boolean(arg("dry-run", false));
const file = path.join("supabase", "seed", `rab_${region}.json`);
const book = JSON.parse(fs.readFileSync(file, "utf8"));

const items = book.items.map((it, i) => ({
  region_id: region,
  key: it.key,
  name: it.name,
  element: it.element,
  quantity_basis: it.quantity,
  unit: it.unit,
  title: it.title,
  reference: it.reference,
  source_ref: it.jakarta_hsp_id ? `jakarta-hsp:${it.jakarta_hsp_id}` : null,
  unit_price: it.unit_price,
  sort: i,
}));
const components = book.items.flatMap((it) =>
  it.components.map((c) => ({
    region_id: region,
    item_key: it.key,
    kind: c.kind,
    code: c.code,
    name: c.name,
    unit: c.unit,
    coef: c.coef,
    price: c.price,
    price_source: c.price_source,
  })),
);

console.log(`RAB price book: ${book.name} — ${items.length} items, ${components.length} components`);
if (dryRun) {
  for (const it of items) console.log(`  ${it.key.padEnd(15)} ${it.unit.padEnd(3)} ${Number(it.unit_price).toLocaleString("en-US").padStart(12)}`);
  console.log("Dry run: nothing written.");
  process.exit(0);
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const fail = (what, error) => {
  console.error(`${what}: ${error.message}`);
  process.exit(1);
};

let { error } = await supabase.from("rab_regions").upsert({
  id: region,
  name: book.name,
  currency: book.currency ?? "IDR",
  overhead_pct: book.overhead_pct,
  source: book.source,
  fetched: book.fetched,
  updated_at: new Date().toISOString(),
});
if (error) fail("region", error);
// Items cascade to their components, so this replaces the region cleanly.
({ error } = await supabase.from("rab_items").delete().eq("region_id", region));
if (error) fail("clear items", error);
({ error } = await supabase.from("rab_items").insert(items));
if (error) fail("items", error);
({ error } = await supabase.from("rab_components").insert(components));
if (error) fail("components", error);
console.log("Loaded.");
