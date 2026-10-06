#!/usr/bin/env node
/**
 * Push a local folder of models/materials to Supabase Storage and register the
 * matching rows in the database.
 *
 * This mirrors the plugin's own `Dirory::Library.scan_library` (main.rb) so the
 * cloud catalogue contains exactly the items the plugin would show locally:
 *
 *   - Models    : every `.skp` anywhere under the root.
 *   - Materials : every jpg/jpeg/png that sits under a folder named
 *                 `Material` / `Materials` (case-insensitive).
 *   - `meta.json` next to a file / in its folder can set `brand`, `category`,
 *     `name` (models only), `tags` and `thumbnail`.
 *   - The `.dirory_thumbnails` cache is ignored: it holds generated previews,
 *     not library items.
 *
 * Category = the folder under `Model`/`Materials`. Brand = the folder that
 * directly holds the file, unless `meta.json` says otherwise. A file with no
 * brand becomes part of the Dirory platform brand.
 *
 * Brands are real vendors in the database (an asset's `brand` comes from its
 * vendor). Unless `--vendor` forces everything onto one vendor, this script
 * finds or creates one approved vendor per brand.
 *
 * Usage:
 *   node scripts/upload-library.mjs --dry-run
 *   node scripts/upload-library.mjs --root "D:/Dirory/sample_library"
 *   node scripts/upload-library.mjs --root "D:/Dirory/sample_library" --limit 5
 *   node scripts/upload-library.mjs --root "D:/Dirory/TOTO" --vendor <vendor-uuid>
 *
 * Needs in the environment (or a .env.local next to this file):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const PLATFORM_VENDOR_ID = "00000000-0000-0000-0000-0000000000d1";
const DIRORY_BRAND = "Dirory";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png"]);
const MODEL_EXT = new Set([".skp"]);
const MODEL_FOLDER_NAMES = new Set(["model", "models"]);
const MATERIAL_FOLDER_NAMES = new Set(["material", "materials"]);
const IGNORED_DIRS = new Set([".dirory_thumbnails"]);

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".skp": "application/octet-stream",
};

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
const root = path.resolve(String(arg("root", process.env.DIRORY_LIBRARY ?? "./library")));
const forcedVendor = arg("vendor", null);
const limit = Number(arg("limit", 0)) || 0;
const only = String(arg("only", "") || "").toLowerCase() || null;

/**
 * Optional corrections, keyed by the item's legacy key (its path relative to
 * the library root). Use when a folder or its meta.json is misleading — for
 * example a product folder that would otherwise become its own brand:
 *
 *   { "Model/Doors/ALPHAMAX- MAX 1/ALPHAMAX- MAX 1.skp": { "brand": "ALPHAMAX", "name": "MAX 1" } }
 *
 * Fields not present are left as scanned.
 */
const overrides = (() => {
  const file = arg("overrides", null);
  if (!file) return {};
  const p = path.resolve(String(file));
  if (!fs.existsSync(p)) {
    console.error(`Overrides file not found: ${p}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    console.error(`Could not read overrides: ${err.message}`);
    process.exit(1);
  }
})();

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!url || !key)) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. See docs/SETUP.md §5.2.");
  process.exit(1);
}

const supabase = dryRun ? null : createClient(url, key, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Scanning — a direct port of main.rb#scan_library / #category_brand_for.
// ---------------------------------------------------------------------------

function toPosix(p) {
  return path.resolve(p).split(path.sep).join("/");
}

function relativeParts(full, base) {
  const normalized = toPosix(full);
  const baseNormalized = toPosix(base);
  if (!normalized.toLowerCase().startsWith(baseNormalized.toLowerCase())) return [];
  return normalized
    .slice(baseNormalized.length)
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean);
}

function categoryBrandFor(full, base, folderNames) {
  let parts = relativeParts(full, base);
  const marker = parts.findIndex((part) => folderNames.has(part.toLowerCase()));
  if (marker !== -1) parts = parts.slice(marker + 1);
  const folders = parts.slice(0, -1);
  const category = folders[0] || "Uncategorized";
  const brand = folders.length > 1 ? folders[folders.length - 1] : "";
  return { category, brand };
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".dirory_thumbnails") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function readMeta(directory) {
  const file = path.join(directory, "meta.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function imageFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .map((name) => path.join(directory, name))
    .filter((p) => fs.statSync(p).isFile() && IMAGE_EXT.has(path.extname(p).toLowerCase()));
}

function sidecarThumbnail(skpPath, meta) {
  const directory = path.dirname(skpPath);
  const explicit = meta.thumbnail;
  if (explicit && String(explicit).trim()) {
    const candidate = path.resolve(directory, String(explicit));
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  const base = path.basename(skpPath, path.extname(skpPath));
  const sameName = [...IMAGE_EXT].map((ext) => path.join(directory, base + ext));
  const thumbnails = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((n) => /^thumbnail\./i.test(n)).map((n) => path.join(directory, n))
    : [];
  const exact = [...sameName, ...thumbnails].find(
    (p) => fs.existsSync(p) && fs.statSync(p).isFile() && IMAGE_EXT.has(path.extname(p).toLowerCase()),
  );
  if (exact) return exact;

  const key = base.toLowerCase().replace(/[^a-z0-9]/g, "");
  const matches = imageFiles(directory).filter((image) => {
    const imageKey = path.basename(image, path.extname(image)).toLowerCase().replace(/[^a-z0-9]/g, "");
    return imageKey && (key.includes(imageKey) || imageKey.includes(key));
  });
  if (matches.length === 1) return matches[0];

  const images = imageFiles(directory);
  if (fs.readdirSync(directory).filter((n) => n.toLowerCase().endsWith(".skp")).length === 1 && images.length === 1) {
    return images[0];
  }
  return null;
}

/** `... 60x120.jpeg` / `... 120x60 ...` -> { w, h } in cm; null when absent. */
function tileSize(base) {
  const m = base.match(/(\d{2,3})\s*[x×X]\s*(\d{2,3})/);
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

/** Full item list, de-duplicated by legacy key (relative path). */
function scan(base) {
  const files = walk(base);
  const metadata = new Map();
  for (const file of files) {
    if (path.basename(file).toLowerCase() === "meta.json") {
      metadata.set(path.dirname(file).toLowerCase(), readMeta(path.dirname(file)));
    }
  }
  const items = [];
  const seen = new Set();

  const push = (item) => {
    // Apply any manual correction for this path before de-duplicating.
    const override = overrides[item.legacyKey];
    if (override) {
      if (override.brand) item.brand = String(override.brand);
      if (override.name) item.name = String(override.name);
      if (override.category) item.category = String(override.category);
    }
    const dedupe = item.legacyKey.toLowerCase();
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    items.push(item);
  };

  // Models: every .skp anywhere under the root.
  for (const skpPath of files.filter((f) => MODEL_EXT.has(path.extname(f).toLowerCase()))) {
    const directory = path.dirname(skpPath);
    const meta = metadata.get(directory.toLowerCase()) ?? {};
    const { category: inferredCategory, brand: inferredBrand } = categoryBrandFor(skpPath, base, MODEL_FOLDER_NAMES);
    const brand = String(meta.brand ?? inferredBrand).trim() || DIRORY_BRAND;
    const skps = fs.readdirSync(directory).filter((n) => n.toLowerCase().endsWith(".skp"));
    const name =
      skps.length === 1
        ? String(meta.name ?? path.basename(skpPath, path.extname(skpPath)))
        : path.basename(skpPath, path.extname(skpPath));
    push({
      kind: "model",
      abs: skpPath,
      legacyKey: relativeParts(skpPath, base).join("/"),
      name,
      category: String(meta.category ?? inferredCategory),
      brand,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      thumbnailAbs: sidecarThumbnail(skpPath, meta),
      size: fs.statSync(skpPath).size,
      tile: null,
    });
  }

  // Materials: images under a Material/Materials folder.
  for (const imgPath of files) {
    if (!IMAGE_EXT.has(path.extname(imgPath).toLowerCase())) continue;
    const folders = relativeParts(imgPath, base).slice(0, -1);
    if (!folders.some((part) => MATERIAL_FOLDER_NAMES.has(part.toLowerCase()))) continue;
    const directory = path.dirname(imgPath);
    const meta = metadata.get(directory.toLowerCase()) ?? {};
    const { category: inferredCategory, brand: inferredBrand } = categoryBrandFor(imgPath, base, MATERIAL_FOLDER_NAMES);
    const brand = String(meta.brand ?? inferredBrand).trim() || DIRORY_BRAND;
    const baseName = path.basename(imgPath, path.extname(imgPath));
    push({
      kind: "material",
      abs: imgPath,
      legacyKey: relativeParts(imgPath, base).join("/"),
      name: baseName,
      category: String(meta.category ?? inferredCategory),
      brand,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      thumbnailAbs: imgPath,
      size: fs.statSync(imgPath).size,
      tile: tileSize(baseName),
    });
  }

  items.sort((a, b) => (a.kind + a.category + a.name).localeCompare(b.kind + b.category + b.name));
  return items;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

function mimeFor(file) {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

async function resolveVendor(brand, cache) {
  if (forcedVendor) return String(forcedVendor);
  const cacheKey = brand.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  if (brand === DIRORY_BRAND) {
    const { data } = await supabase.from("vendors").select("id").eq("is_platform", true).maybeSingle();
    const id = data?.id ?? PLATFORM_VENDOR_ID;
    cache.set(cacheKey, id);
    return id;
  }

  const { data: existing } = await supabase
    .from("vendors")
    .select("id")
    .eq("brand_name", brand)
    .maybeSingle();
  if (existing) {
    cache.set(cacheKey, existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("vendors")
    .insert({ name: brand, brand_name: brand, is_platform: false, status: "approved", approved_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw new Error(`vendor "${brand}": ${error.message}`);
  console.log(`  + created vendor ${brand} (${created.id})`);
  cache.set(cacheKey, created.id);
  return created.id;
}

async function resolveCategory(kind, name, cache) {
  if (!name) return null;
  const cacheKey = `${kind}:${name.toLowerCase()}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("type", kind)
    .eq("name", name)
    .is("parent_id", null)
    .maybeSingle();
  if (existing) {
    cache.set(cacheKey, existing.id);
    return existing.id;
  }
  const { data: created, error } = await supabase
    .from("categories")
    .insert({ type: kind, name })
    .select("id")
    .single();
  if (error) throw new Error(`category "${name}": ${error.message}`);
  cache.set(cacheKey, created.id);
  return created.id;
}

async function uploadFile(bucket, storageKey, file) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storageKey, fs.readFileSync(file), { upsert: true, contentType: mimeFor(file) });
  if (error) throw new Error(`${bucket}/${storageKey}: ${error.message}`);
}

async function main() {
  console.log(`Dirory library upload${dryRun ? " (dry run)" : ""}`);
  console.log(`  root   : ${root}`);
  console.log(`  vendor : ${forcedVendor ?? "one approved vendor per brand"}`);

  if (!fs.existsSync(root)) {
    console.error(`Root not found: ${root}`);
    process.exit(1);
  }

  let items = scan(root);
  if (only) items = items.filter((i) => i.kind === only);
  if (limit) items = items.slice(0, limit);
  if (!items.length) {
    console.error("No model/.skp or material images found. Check --root.");
    process.exit(1);
  }

  const byKind = { model: 0, material: 0 };
  const byBrand = new Map();
  const byCategory = new Map();
  for (const i of items) {
    byKind[i.kind]++;
    byBrand.set(i.brand, (byBrand.get(i.brand) ?? 0) + 1);
    const ck = `${i.kind}: ${i.category}`;
    byCategory.set(ck, (byCategory.get(ck) ?? 0) + 1);
  }
  console.log(`  found  : ${items.length} item(s) — ${byKind.model} model, ${byKind.material} material`);
  console.log(`  brands : ${[...byBrand.entries()].map(([b, n]) => `${b} (${n})`).join(", ")}`);
  console.log(`  cats   : ${[...byCategory.entries()].map(([c, n]) => `${c} (${n})`).join(", ")}`);

  if (dryRun) {
    for (const i of items) {
      const tile = i.tile ? ` ${i.tile.w}x${i.tile.h}` : "";
      const thumb = i.thumbnailAbs ? "" : " (no thumbnail)";
      console.log(`  · ${i.kind.padEnd(8)} ${i.name.padEnd(40)} brand=${i.brand} category=${i.category}${tile}${thumb}`);
    }
    console.log("\nDry run complete. Nothing was written.");
    return;
  }

  const vendorCache = new Map();
  const categoryCache = new Map();
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const vendorId = await resolveVendor(item.brand, vendorCache);

      const { data: existing } = await supabase
        .from("assets")
        .select("id")
        .eq("vendor_id", vendorId)
        .eq("legacy_key", item.legacyKey)
        .limit(1)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }

      const assetId = crypto.randomUUID();
      const fileName = path.basename(item.abs);
      const filePath = `${vendorId}/${assetId}/${fileName}`;
      const bucket = item.kind === "material" ? "materials" : "models";

      await uploadFile(bucket, filePath, item.abs);

      // Models store their sidecar preview in the `materials` bucket (that is
      // where the admin review screen signs thumbnails from). Materials reuse
      // the texture image itself so the card has something to show.
      let thumbnailPath = null;
      if (item.kind === "material") {
        thumbnailPath = filePath;
      } else if (item.thumbnailAbs) {
        thumbnailPath = `${vendorId}/${assetId}/${path.basename(item.thumbnailAbs)}`;
        await uploadFile("materials", thumbnailPath, item.thumbnailAbs);
      }

      const categoryId = await resolveCategory(item.kind, item.category, categoryCache);

      // Status rule:
      //   * Forced onto the platform vendor -> approved (a Dirory sample).
      //   * An explicitly forced real vendor (--vendor <uuid>) -> pending_review,
      //     as if the vendor had uploaded it.
      //   * Anything reached by the default per-brand resolution is a seed sample
      //     for the catalogue, so it is approved and immediately visible. Without
      //     this the whole first library lands in the review queue and the plugin
      //     sees an empty catalogue — which is what happened on the first run
      //     (1,306 assets stuck in pending_review).
      const assetStatus = forcedVendor && forcedVendor !== PLATFORM_VENDOR_ID ? "pending_review" : "approved";

      const { data: asset, error: assetErr } = await supabase
        .from("assets")
        .insert({
          vendor_id: vendorId,
          type: item.kind,
          name: item.name,
          category_id: categoryId,
          tags: item.tags,
          tile_w_cm: item.tile?.w ?? null,
          tile_h_cm: item.tile?.h ?? null,
          status: assetStatus,
          legacy_key: item.legacyKey,
        })
        .select("id")
        .single();
      if (assetErr) throw new Error(`asset: ${assetErr.message}`);

      const { data: version, error: versionErr } = await supabase
        .from("asset_versions")
        .insert({
          asset_id: asset.id,
          version: 1,
          file_path: filePath,
          thumbnail_path: thumbnailPath,
          file_size: item.size,
          review_status: assetStatus === "approved" ? "approved" : "pending",
        })
        .select("id")
        .single();
      if (versionErr) throw new Error(`version: ${versionErr.message}`);

      await supabase.from("assets").update({ current_version_id: version.id }).eq("id", asset.id);

      uploaded++;
      console.log(`  ✓ ${item.kind.padEnd(8)} ${item.name}`);
    } catch (err) {
      failed++;
      console.error(`  ! ${item.legacyKey}: ${err.message}`);
    }
  }

  console.log(`\nUploaded ${uploaded} item(s); skipped ${skipped} already present; ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
