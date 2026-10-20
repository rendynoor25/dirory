#!/usr/bin/env node
/**
 * Upload the downloaded brand logos to the public `brands` bucket and point each
 * vendor at its logo.
 *
 * Run after `node scripts/fetch-brand-logos.mjs`. Files are matched to vendors by
 * the mapping below (filename -> brand_name in the database).
 *
 * Usage:  node scripts/upload-brand-logos.mjs
 *         node scripts/upload-brand-logos.mjs --dir .cache/brand-logos
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const file of [".env.local", "apps/web/.env.local"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const dir = path.resolve(
  process.argv.includes("--dir") ? process.argv[process.argv.indexOf("--dir") + 1] : ".cache/brand-logos",
);

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const MIME = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** filename in the logos folder -> brand_name in `vendors`. */
const BRAND_BY_FILE = {
  "taco.svg": "TACO",
  "nippon-paint.svg": "Nippon",
  "propan.png": "Propan",
  "niro-granite.svg": "NIRO GRANITE",
  "roman.svg": "ROMAN",
  "toto.svg": "Toto",
  "trilliunware.png": "Trilliunware",
};

if (!fs.existsSync(dir)) {
  console.error(`Logo folder not found: ${dir}. Run scripts/fetch-brand-logos.mjs first.`);
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

let ok = 0;
let failed = 0;
for (const [filename, brand] of Object.entries(BRAND_BY_FILE)) {
  const file = path.join(dir, filename);
  if (!fs.existsSync(file)) {
    console.log(`  ! ${filename}: missing (skipped)`);
    failed += 1;
    continue;
  }

  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("id, brand_name")
    .eq("brand_name", brand)
    .maybeSingle();
  if (error || !vendor) {
    console.log(`  ! ${brand}: vendor not found`);
    failed += 1;
    continue;
  }

  const ext = path.extname(filename).toLowerCase();
  const logoPath = `${vendor.id}/logo${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("brands")
    .upload(logoPath, fs.readFileSync(file), {
      upsert: true,
      contentType: MIME[ext] ?? "application/octet-stream",
    });
  if (uploadError) {
    console.log(`  ! ${brand}: upload failed — ${uploadError.message}`);
    failed += 1;
    continue;
  }

  const { error: updateError } = await supabase
    .from("vendors")
    .update({ logo_path: logoPath, logo_source: "upload" })
    .eq("id", vendor.id);
  if (updateError) {
    console.log(`  ! ${brand}: vendor update failed — ${updateError.message}`);
    failed += 1;
    continue;
  }

  console.log(`  ok ${brand.padEnd(14)} brands/${logoPath}`);
  ok += 1;
}

console.log(`\n${ok} logos set, ${failed} skipped/failed.`);
