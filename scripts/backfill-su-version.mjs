#!/usr/bin/env node
/**
 * Backfill the SketchUp version of models already in the catalogue.
 *
 * The admin upload form records the SketchUp release a `.skp` was saved in
 * (`asset_versions.su_version`) so the website can show the requirement and the
 * plugin can warn before inserting a file the running SketchUp cannot open. This
 * script fills that in for assets uploaded before the column existed, by reading
 * the header of the matching file in the local library.
 *
 * It matches an asset to a file by `legacy_key` (the path relative to the
 * library root, exactly what the uploader stored).
 *
 * Usage:
 *   node scripts/backfill-su-version.mjs --root "D:/Dirory/sample_library" --dry-run
 *   node scripts/backfill-su-version.mjs --root "D:/Dirory/sample_library"
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { suVersionForFile } from "./lib/su-version.mjs";

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
const root = path.resolve(String(arg("root", process.env.DIRORY_LIBRARY ?? "./library")));

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!fs.existsSync(root)) {
  console.error(`Library root not found: ${root}`);
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Only models have a SketchUp version. Page past PostgREST's 1,000-row cap.
const PAGE = 1000;
const assets = [];
for (let offset = 0; ; offset += PAGE) {
  const { data, error } = await supabase
    .from("assets")
    .select("id, name, legacy_key, current_version_id")
    .eq("type", "model")
    .not("legacy_key", "is", null)
    .range(offset, offset + PAGE - 1);
  if (error) {
    console.error(`Lookup failed: ${error.message}`);
    process.exit(1);
  }
  assets.push(...data);
  if (data.length < PAGE) break;
}

console.log(`Dirory SketchUp-version backfill${dryRun ? " (dry run)" : ""}`);
console.log(`  root   : ${root}`);
console.log(`  models : ${assets.length}`);

let updated = 0;
let skipped = 0;
let missing = 0;
let unknown = 0;

for (const asset of assets) {
  if (!asset.current_version_id) {
    skipped += 1;
    continue;
  }
  const file = path.join(root, asset.legacy_key.split("/").join(path.sep));
  if (!fs.existsSync(file)) {
    console.log(`  · missing file  ${asset.legacy_key}`);
    missing += 1;
    continue;
  }

  const version = suVersionForFile(file);
  if (!version) {
    console.log(`  ? no version    ${asset.legacy_key}`);
    unknown += 1;
    continue;
  }

  if (dryRun) {
    console.log(`  · ${asset.name.padEnd(28)} -> ${version.label} (${version.raw})`);
    updated += 1;
    continue;
  }

  const { error } = await supabase
    .from("asset_versions")
    .update({ su_version: version.label, su_version_raw: version.raw })
    .eq("id", asset.current_version_id);
  if (error) {
    console.error(`  ! ${asset.legacy_key}: ${error.message}`);
    continue;
  }
  console.log(`  ✓ ${asset.name.padEnd(28)} -> ${version.label}`);
  updated += 1;
}

console.log(
  `\n${dryRun ? "Would update" : "Updated"} ${updated}; skipped ${skipped} without a live version; ` +
    `${missing} file(s) not found; ${unknown} unreadable.`,
);
