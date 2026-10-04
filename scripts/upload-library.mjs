#!/usr/bin/env node
/**
 * Push a local folder of models/materials to Supabase Storage and register the
 * matching rows in the database.
 *
 * Layout expected (same convention as the SketchUp plugin, PRD §2):
 *
 *   <root>/Model/<Category>/<Brand>/<file>.skp
 *   <root>/Materials/<Category>/<Brand>/<image>.jpg
 *
 * An item with no brand folder becomes a Dirory free sample (brand "Dirory").
 *
 * Usage:
 *   node scripts/upload-library.mjs --dry-run
 *   node scripts/upload-library.mjs --root "D:/Dirory/sample_library"
 *   node scripts/upload-library.mjs --vendor <vendor-uuid>   # a real vendor
 *
 * Needs in the environment (or a .env.local next to this file):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const PLATFORM_VENDOR_ID = "00000000-0000-0000-0000-0000000000d1";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const dryRun = Boolean(arg("dry-run", false));
const root = String(arg("root", process.env.DIRORY_LIBRARY ?? "./library"));
const vendorId = String(arg("vendor", PLATFORM_VENDOR_ID));

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!url || !key)) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. See docs/SETUP.md.");
  process.exit(1);
}

const supabase = dryRun ? null : createClient(url, key, { auth: { persistSession: false } });

const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else {
      const rel = path.relative(base, full).split(path.sep).join("/");
      if (/\.skp$/i.test(entry.name) || IMAGE_RE.test(entry.name)) {
        out.push({ full, rel, size: fs.statSync(full).size });
      }
    }
  }
  return out;
}

function parse(rel) {
  // Model/<Category>/<Brand>/<file>  or  Model/<Category>/<file>
  const parts = rel.split("/");
  const kind = /^materials/i.test(parts[0]) ? "material" : "model";
  const body = parts.slice(1);
  const file = body.pop();
  const brand = body.length > 1 ? body[body.length - 1] : null;
  const category = body.length > 1 ? body.slice(0, -1).join(" › ") : body[0] ?? "";
  return { kind, file, brand, category };
}

async function main() {
  console.log(`Dirory library upload${dryRun ? " (dry run)" : ""}`);
  console.log(`  root   : ${path.resolve(root)}`);
  console.log(`  vendor : ${vendorId}${vendorId === PLATFORM_VENDOR_ID ? " (Dirory platform brand)" : ""}`);

  const files = walk(root);
  if (!files.length) {
    console.error("No .skp or image files found. Check --root.");
    process.exit(1);
  }

  let done = 0;
  for (const f of files) {
    const meta = parse(f.rel);
    const name = meta.file.replace(/\.[^.]+$/, "");
    console.log(
      `  · ${meta.kind.padEnd(8)} ${name.padEnd(34)} brand=${meta.brand ?? "Dirory"} category=${meta.category}`,
    );
    if (dryRun) continue;

    // 1. Upload to the private bucket under "<vendor>/<asset>/<file>".
    const bucket = meta.kind === "material" ? "materials" : "models";
    const assetId = crypto.randomUUID();
    const storageKey = `${vendorId}/${assetId}/${meta.file}`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(storageKey, fs.readFileSync(f.full), { upsert: true });
    if (upErr) {
      console.error(`    ! upload failed: ${upErr.message}`);
      continue;
    }

    // 2. Find or create the category.
    let categoryId = null;
    if (meta.category) {
      const { data: existing } = await supabase
        .from("categories")
        .select("id")
        .eq("type", meta.kind)
        .eq("name", meta.category)
        .is("parent_id", null)
        .maybeSingle();
      if (existing) categoryId = existing.id;
      else {
        const { data: created } = await supabase
          .from("categories")
          .insert({ type: meta.kind, name: meta.category })
          .select("id")
          .single();
        categoryId = created?.id ?? null;
      }
    }

    // 3. Insert the asset + its first approved version.
    const { data: asset, error: assetErr } = await supabase
      .from("assets")
      .insert({
        vendor_id: vendorId,
        type: meta.kind,
        name,
        category_id: categoryId,
        status: vendorId === PLATFORM_VENDOR_ID ? "approved" : "pending_review",
      })
      .select("id")
      .single();
    if (assetErr) {
      console.error(`    ! asset insert failed: ${assetErr.message}`);
      continue;
    }

    const { data: version, error: versionErr } = await supabase
      .from("asset_versions")
      .insert({
        asset_id: asset.id,
        version: 1,
        file_path: storageKey,
        file_size: f.size,
        review_status: vendorId === PLATFORM_VENDOR_ID ? "approved" : "pending",
      })
      .select("id")
      .single();
    if (versionErr) {
      console.error(`    ! version insert failed: ${versionErr.message}`);
      continue;
    }

    await supabase
      .from("assets")
      .update({ current_version_id: version.id })
      .eq("id", asset.id);

    done++;
  }

  console.log(dryRun ? "\nDry run complete. Nothing was written." : `\nUploaded ${done} item(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
