#!/usr/bin/env node
/**
 * Preflight for the library upload: confirms the Supabase project is reachable,
 * the migrations are applied (tables + buckets exist) and reports what is
 * already in the catalogue. Run this before `upload-library.mjs`.
 *
 * Needs in the environment (or a .env.local next to this file):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/check-supabase.mjs
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

loadEnv();

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (put them in .env.local).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const REQUIRED_TABLES = ["vendors", "categories", "assets", "asset_versions"];
const REQUIRED_BUCKETS = ["models", "materials"];

async function main() {
  console.log(`Supabase preflight`);
  console.log(`  url    : ${url}`);
  console.log(`  key    : ${key.slice(0, 4)}… (${key.startsWith("sb_secret_") ? "new secret key" : key.startsWith("eyJ") ? "legacy JWT" : "unknown format"})`);

  let ok = true;

  for (const table of REQUIRED_TABLES) {
    const { error, count } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) {
      ok = false;
      console.log(`  table  ✗ ${table}: ${error.message}`);
    } else {
      console.log(`  table  ✓ ${table} (${count} rows)`);
    }
  }

  const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
  if (bucketErr) {
    ok = false;
    console.log(`  bucket ✗ cannot list buckets: ${bucketErr.message}`);
  } else {
    const ids = new Set((buckets ?? []).map((b) => b.id));
    for (const bucket of REQUIRED_BUCKETS) {
      if (ids.has(bucket)) console.log(`  bucket ✓ ${bucket}`);
      else {
        ok = false;
        console.log(`  bucket ✗ ${bucket} missing`);
      }
    }
  }

  if (ok) {
    const { data: vendors } = await supabase.from("vendors").select("id, brand_name, is_platform, status");
    console.log(`\n  platform vendor: ${vendors?.find((v) => v.is_platform)?.brand_name ?? "(none found)"}`);
    console.log(`  vendors        : ${vendors?.length ?? 0}`);
    for (const v of vendors ?? []) {
      const { count } = await supabase.from("assets").select("*", { count: "exact", head: true }).eq("vendor_id", v.id);
      console.log(`    - ${(v.brand_name ?? "?").padEnd(16)} ${v.status.padEnd(9)} ${count ?? 0} asset(s)`);
    }
  }

  if (!ok) {
    console.error("\nPreflight failed. Push the migrations first: docs/SETUP.md §1.3, then re-run.");
    process.exit(1);
  }
  console.log("\nPreflight OK. Safe to run scripts/upload-library.mjs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
