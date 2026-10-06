#!/usr/bin/env node
/**
 * Remove one library item from Supabase: its asset row and the files it points
 * at in Storage.
 *
 * For cleaning up an item whose source folder was renamed or deleted, so it does
 * not linger in the catalogue. Matching is by `legacy_key` (the item's path
 * relative to the library root), which is how the uploader identifies items.
 *
 * Usage:
 *   node scripts/remove-library-item.mjs --legacy-key "Model/Doors/Panel Door A/ALPHAMAX- MAX 1.skp" --dry-run
 *   node scripts/remove-library-item.mjs --legacy-key "…"
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

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

const dryRun = Boolean(arg("dry-run", false));
const legacyKey = String(arg("legacy-key", "") || "");
if (!legacyKey) {
  console.error('Missing --legacy-key "Model/…/file.skp"');
  process.exit(1);
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: assets, error } = await supabase
  .from("assets")
  .select("id, name, type, vendor_id, vendors(brand_name)")
  .eq("legacy_key", legacyKey);

if (error) {
  console.error(`Lookup failed: ${error.message}`);
  process.exit(1);
}
if (!assets?.length) {
  console.log(`Nothing found for legacy_key: ${legacyKey}`);
  process.exit(0);
}

for (const asset of assets) {
  const vendor = Array.isArray(asset.vendors) ? asset.vendors[0] : asset.vendors;
  console.log(`Found: ${asset.name} (${asset.type}) — brand ${vendor?.brand_name ?? "?"} — ${asset.id}`);
  if (dryRun) {
    console.log("  dry run: nothing removed");
    continue;
  }

  // Remove stored files first, so a failure leaves a row we can retry from.
  // Queried separately: PostgREST cannot embed asset_versions here because
  // `assets` and `asset_versions` reference each other twice.
  const { data: versionRows } = await supabase
    .from("asset_versions")
    .select("file_path, thumbnail_path")
    .eq("asset_id", asset.id);
  const versions = versionRows ?? [];
  for (const v of versions) {
    for (const [bucket, objectPath] of [
      [asset.type === "material" ? "materials" : "models", v.file_path],
      ["materials", v.thumbnail_path],
    ]) {
      if (!objectPath) continue;
      const { error: removeError } = await supabase.storage.from(bucket).remove([objectPath]);
      if (removeError) console.warn(`  ! could not remove ${bucket}/${objectPath}: ${removeError.message}`);
      else console.log(`  removed ${bucket}/${objectPath}`);
    }
  }

  // The asset row cascades to asset_versions.
  const { error: deleteError } = await supabase.from("assets").delete().eq("id", asset.id);
  if (deleteError) {
    console.error(`  ! could not delete asset row: ${deleteError.message}`);
    process.exitCode = 1;
  } else {
    console.log(`  deleted asset ${asset.id}`);
  }
}

console.log(dryRun ? "\nDry run complete." : "\nDone.");
