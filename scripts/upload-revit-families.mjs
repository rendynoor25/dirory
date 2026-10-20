#!/usr/bin/env node
/**
 * Add Revit families (.rfa) to the catalogue (migration 0043), from
 * library-additions/Revit/families.json:
 *
 *   attach  the family goes on an existing product's current version
 *           (asset_versions.revit_file_path), so one card serves SketchUp
 *           and Revit
 *   new     a Revit-only product: an approved model asset whose version has
 *           only a revit_file_path, with its thumbnail
 *
 * Files go to the `models` bucket at <vendor_id>/<asset_id>/<file>.rfa,
 * thumbnails to `materials` beside them. Re-running is safe: an attached
 * family is replaced, a "new" product that already exists is updated, not
 * duplicated.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).
 *
 *   node scripts/upload-revit-families.mjs --dry-run
 *   node scripts/upload-revit-families.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const ROOT = "D:/Dirory";
const MANIFEST = path.join("library-additions", "Revit", "families.json");

function loadEnv() {
  for (const file of [".env.local", "apps/web/.env.local"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv();
const dryRun = process.argv.includes("--dry-run");
// --only "Name A,Name B": just those entries (e.g. a batch added later).
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(",").map((s) => s.trim())) : null;
const families = JSON.parse(fs.readFileSync(MANIFEST, "utf8")).families.filter((f) => !only || only.has(f.name));

// Check every file first, so a typo fails before anything is uploaded.
for (const f of families) {
  f.abs = path.join(ROOT, f.file);
  if (!fs.existsSync(f.abs)) throw new Error(`missing ${f.file}`);
  if (f.thumbnail) {
    f.thumbAbs = path.join(ROOT, f.thumbnail);
    if (!fs.existsSync(f.thumbAbs)) throw new Error(`missing ${f.thumbnail}`);
  }
}
console.log(`${families.length} families: ${families.filter((f) => f.action === "attach").length} attach, ${families.filter((f) => f.action === "new").length} new`);
if (dryRun) {
  for (const f of families) {
    console.log(`  ${f.action.padEnd(6)} ${f.brand.padEnd(12)} ${f.name.padEnd(20)} ${(fs.statSync(f.abs).size / 1e6).toFixed(1)} MB`);
  }
  console.log("Dry run: nothing uploaded.");
  process.exit(0);
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const CONTENT = { ".rfa": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
async function upload(bucket, storageKey, file) {
  const { error } = await supabase.storage.from(bucket).upload(storageKey, fs.readFileSync(file), {
    upsert: true,
    contentType: CONTENT[path.extname(file).toLowerCase()] ?? "application/octet-stream",
  });
  if (error) throw new Error(`${bucket}/${storageKey}: ${error.message}`);
}

async function vendorId(brand) {
  // Several vendor rows can share a brand name ("Dirory"): prefer the platform
  // one, then an approved one.
  const { data, error } = await supabase
    .from("vendors").select("id").ilike("brand_name", brand).neq("status", "suspended")
    .order("is_platform", { ascending: false }).order("approved_at", { ascending: true, nullsFirst: false })
    .limit(1).maybeSingle();
  if (error) throw new Error(`vendor "${brand}": ${error.message}`);
  if (data) return data.id;
  // A brand seen for the first time becomes an approved vendor, as in
  // upload-library.mjs (Fortress arrived Revit-only, with no SketchUp models).
  const { data: created, error: createErr } = await supabase
    .from("vendors")
    .insert({ name: brand, brand_name: brand, is_platform: false, status: "approved", approved_at: new Date().toISOString() })
    .select("id")
    .single();
  if (createErr) throw new Error(`vendor "${brand}": ${createErr.message}`);
  console.log(`  + created vendor ${brand} (${created.id})`);
  return created.id;
}

async function categoryId(name) {
  const { data: existing } = await supabase
    .from("categories").select("id").eq("type", "model").eq("name", name).is("parent_id", null).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase.from("categories").insert({ type: "model", name }).select("id").single();
  if (error) throw new Error(`category "${name}": ${error.message}`);
  return data.id;
}

async function findAsset(vendor, name) {
  const { data } = await supabase
    .from("assets").select("id, current_version_id").eq("vendor_id", vendor).eq("type", "model").eq("name", name).maybeSingle();
  return data;
}

let done = 0;
let failed = 0;
for (const f of families) {
  try {
    const vendor = await vendorId(f.brand);
    const size = fs.statSync(f.abs).size;
    let asset = await findAsset(vendor, f.name);
    if (f.action === "attach" && !asset) throw new Error("existing product not found");

    if (!asset) {
      const { data, error } = await supabase
        .from("assets")
        .insert({
          vendor_id: vendor, type: "model", name: f.name, category_id: await categoryId(f.category),
          tags: f.tags ?? [], status: "approved", legacy_key: `revit:${f.brand}/${f.name}`,
        })
        .select("id, current_version_id")
        .single();
      if (error) throw new Error(`asset: ${error.message}`);
      asset = data;
    }

    const rfaKey = `${vendor}/${asset.id}/${path.basename(f.abs)}`;
    await upload("models", rfaKey, f.abs);

    if (asset.current_version_id) {
      const update = { revit_file_path: rfaKey, revit_file_size: size };
      if (f.thumbAbs && f.action === "new") {
        update.thumbnail_path = `${vendor}/${asset.id}/${path.basename(f.thumbAbs)}`;
        await upload("materials", update.thumbnail_path, f.thumbAbs);
      }
      const { error } = await supabase.from("asset_versions").update(update).eq("id", asset.current_version_id);
      if (error) throw new Error(`version: ${error.message}`);
    } else {
      let thumbnailPath = null;
      if (f.thumbAbs) {
        thumbnailPath = `${vendor}/${asset.id}/${path.basename(f.thumbAbs)}`;
        await upload("materials", thumbnailPath, f.thumbAbs);
      }
      const { data: version, error } = await supabase
        .from("asset_versions")
        .insert({
          asset_id: asset.id, version: 1, file_path: null, thumbnail_path: thumbnailPath,
          revit_file_path: rfaKey, revit_file_size: size, review_status: "approved",
        })
        .select("id")
        .single();
      if (error) throw new Error(`version: ${error.message}`);
      await supabase.from("assets").update({ current_version_id: version.id }).eq("id", asset.id);
    }
    // The catalogue orders and refreshes by updated_at.
    await supabase.from("assets").update({ updated_at: new Date().toISOString() }).eq("id", asset.id);
    done++;
    console.log(`  ✓ ${f.action.padEnd(6)} ${f.brand} ${f.name}`);
  } catch (err) {
    failed++;
    console.error(`  ! ${f.brand} ${f.name}: ${err.message}`);
  }
}
console.log(`${done} done, ${failed} failed`);
process.exit(failed ? 1 : 0);
