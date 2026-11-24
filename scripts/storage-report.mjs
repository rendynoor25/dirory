#!/usr/bin/env node
/**
 * Read-only storage report for the Dirory Supabase project.
 *
 * File storage on the Free plan is 1 GB, and the 1,300 material textures plus
 * every published plugin release add up quickly. This script tells you what is
 * actually stored, what is referenced by the database, what is an old version,
 * and what is unreferenced, WITHOUT deleting anything.
 *
 * It needs the service-role key (the buckets are private):
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run storage:report
 *
 * Review the "unreferenced" and "old versions" sections before deleting
 * anything; an upload in progress is unreferenced until its database row is
 * written. The safe cleanup is:
 *   npm run rbz:prune                 # old plugin releases (dry run)
 *   node scripts/remove-library-item.mjs <asset_id>
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

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const PAGE = 1000;
const MB = 1024 * 1024;

const human = (n) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GB`
    : n >= MB
      ? `${(n / MB).toFixed(1)} MB`
      : `${(n / 1024).toFixed(1)} KB`;

/** List every object in a bucket, walking nested folders and paging. */
async function walk(bucket, prefix = "", depth = 0, out = []) {
  if (depth > 8) return out;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`${bucket}/${prefix || ""}: ${error.message}`);
    if (!data?.length) break;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders come back with id === null; files have an id and metadata.
      if (item.id == null) {
        await walk(bucket, full, depth + 1, out);
      } else {
        out.push({
          bucket,
          path: full,
          size: Number(item.metadata?.size ?? 0),
          mime: item.metadata?.mimetype ?? "",
        });
      }
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** Page through a PostgREST table (the API caps a response at 1,000 rows). */
async function selectAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

function groupReleases(objects) {
  const groups = new Map();
  for (const o of objects) {
    const m = /^DiroryLibrary-(.+)\.(rbz|json)$/i.exec(o.path);
    if (!m) continue;
    const version = m[1];
    if (!groups.has(version)) groups.set(version, { version, objects: [], size: 0 });
    const g = groups.get(version);
    g.objects.push(o.path);
    g.size += o.size;
  }
  return [...groups.values()].sort((a, b) => compareVersions(b.version, a.version));
}

function compareVersions(a, b) {
  const av = a.split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
  const bv = b.split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const d = (av[i] ?? 0) - (bv[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

console.log(`Dirory storage report — ${new URL(url).host}\n`);

const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) {
  console.error(`Could not list buckets: ${bucketError.message}`);
  console.error("If the project is restricted for quota, upgrade/restore it first.");
  process.exit(1);
}

const objects = [];
for (const bucket of buckets) {
  try {
    await walk(bucket.name, "", 0, objects);
  } catch (err) {
    console.error(`Could not list ${bucket.name}: ${err.message}`);
  }
}

const byBucket = new Map(buckets.map((b) => [b.name, []]));
for (const o of objects) byBucket.get(o.bucket)?.push(o);

const total = objects.reduce((n, o) => n + o.size, 0);
console.log("Bucket                 Objects        Size");
console.log("--------------------------------------------------");
for (const [name, list] of byBucket) {
  const bytes = list.reduce((n, o) => n + o.size, 0);
  console.log(`${name.padEnd(22)} ${String(list.length).padStart(8)}  ${human(bytes).padStart(12)}`);
}
console.log("--------------------------------------------------");
console.log(`${"TOTAL".padEnd(22)} ${String(objects.length).padStart(8)}  ${human(total).padStart(12)}\n`);

console.log("Largest objects");
console.log("--------------------------------------------------");
for (const o of [...objects].sort((a, b) => b.size - a.size).slice(0, 25)) {
  console.log(`${human(o.size).padStart(10)}  ${o.bucket}/${o.path}`);
}
console.log();

// ---- current vs old asset versions -----------------------------------------
let assets = [];
let versions = [];
let vendors = [];
let catalogueLoaded = false;
try {
  assets = await selectAll("assets", "id,type,status,current_version_id");
  versions = await selectAll(
    "asset_versions",
    "id,asset_id,version,file_path,thumbnail_path,revit_file_path,review_status",
  );
  vendors = await selectAll("vendors", "id,logo_path");
  catalogueLoaded = true;
} catch (err) {
  console.error(`Could not read the catalogue tables: ${err.message}`);
  console.error("The storage report above is still valid; the orphan analysis is skipped.\n");
}

const typeById = new Map(assets.map((a) => [a.id, a.type]));
const statusById = new Map(assets.map((a) => [a.id, a.status]));
const currentIds = new Set(assets.map((a) => a.current_version_id).filter(Boolean));
const referenced = { models: new Set(), materials: new Set(), brands: new Set() };
const currentPaths = new Set();
const oldPaths = new Set();
const retiredPaths = new Set();

function addPath(set, bucket, p) {
  if (p) {
    set.add(`${bucket}:${p}`);
  }
}

for (const v of versions) {
  const fileBucket = typeById.get(v.asset_id) === "material" ? "materials" : "models";
  const target = currentIds.has(v.id) ? currentPaths : oldPaths;
  if (v.file_path) {
    addPath(target, fileBucket, v.file_path);
    addPath(referenced[fileBucket], fileBucket, v.file_path);
  }
  if (v.thumbnail_path) {
    addPath(target, "materials", v.thumbnail_path);
    addPath(referenced.materials, "materials", v.thumbnail_path);
  }
  if (v.revit_file_path) {
    addPath(target, "models", v.revit_file_path);
    addPath(referenced.models, "models", v.revit_file_path);
  }

  // A rejected upload or an archived product will never be served, but its
  // objects may still sit in the bucket. List them for review; they may be a
  // resubmission in progress, so do not delete automatically.
  const assetStatus = statusById.get(v.asset_id);
  if (assetStatus === "rejected" || assetStatus === "archived" || v.review_status === "rejected") {
    if (v.file_path) addPath(retiredPaths, fileBucket, v.file_path);
    if (v.thumbnail_path) addPath(retiredPaths, "materials", v.thumbnail_path);
    if (v.revit_file_path) addPath(retiredPaths, "models", v.revit_file_path);
  }
}
for (const v of vendors) {
  if (v.logo_path) {
    referenced.brands.add(v.logo_path);
  }
}

const sizeOf = new Map(objects.map((o) => [`${o.bucket}:${o.path}`, o.size]));
const sumPaths = (set) => [...set].reduce((n, k) => n + (sizeOf.get(k) ?? 0), 0);

if (catalogueLoaded && versions.length) {
  console.log("Asset versions");
  console.log("--------------------------------------------------");
  console.log(`current versions   ${String(currentPaths.size).padStart(6)} paths  ${human(sumPaths(currentPaths)).padStart(12)}`);
  console.log(`older versions     ${String(oldPaths.size).padStart(6)} paths  ${human(sumPaths(oldPaths)).padStart(12)}`);
  console.log(
    "Older versions are still downloadable history. Review them before deleting;",
  );
  console.log("remove a whole retired product with scripts/remove-library-item.mjs.");
  if (retiredPaths.size) {
    console.log(
      `\nrejected/archived  ${String(retiredPaths.size).padStart(6)} paths  ${human(sumPaths(retiredPaths)).padStart(12)}`,
    );
    console.log("(review; these may be a resubmission in progress, and some overlap older versions)");
  }
  console.log();
}

// ---- unreferenced objects --------------------------------------------------
if (catalogueLoaded) {
  for (const bucket of ["models", "materials", "brands"]) {
    const refs = referenced[bucket];
    const orphans = (byBucket.get(bucket) ?? [])
      .filter((o) => !refs.has(o.path))
      .sort((a, b) => b.size - a.size);
    if (!orphans.length) continue;
    const bytes = orphans.reduce((n, o) => n + o.size, 0);
    console.log(`Unreferenced in ${bucket}: ${orphans.length} objects, ${human(bytes)}`);
    console.log("(an upload in progress is unreferenced until its database row is written)");
    for (const o of orphans.slice(0, 15)) console.log(`  ${human(o.size).padStart(10)}  ${o.path}`);
    if (orphans.length > 15) console.log(`  ... and ${orphans.length - 15} more`);
    console.log();
  }
}

// ---- plugin releases -------------------------------------------------------
const releases = groupReleases(byBucket.get("plugin-release") ?? []);
if (releases.length) {
  const keep = releases.slice(0, 2);
  const old = releases.slice(2);
  console.log("Plugin releases (newest first)");
  console.log("--------------------------------------------------");
  for (const g of releases.slice(0, 8)) {
    console.log(`${human(g.size).padStart(10)}  ${g.version}`);
  }
  if (releases.length > 8) console.log(`  ... and ${releases.length - 8} more versions`);
  console.log(
    `\nKeep the newest ${keep.length} for rollback; ${old.length} older release(s), ${human(
      old.reduce((n, g) => n + g.size, 0),
    )}, are never downloaded.`,
  );
  console.log("Run `npm run rbz:prune` to see exactly what would be deleted.\n");
}

console.log("Nothing was deleted. The update function serves only the newest plugin release.");
