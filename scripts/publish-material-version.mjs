#!/usr/bin/env node
/**
 * Publish a new version of existing catalogue materials: upload the new image,
 * add an asset_versions row (version + 1), point the asset at it, and set its
 * real-world size. The previous version stays, so it can be rolled back.
 *
 * A new version number matters: the plugins cache downloads per version, so
 * replacing the file under the same version would leave architects with the
 * old image.
 *
 * Input: a JSON file of { "<legacy_key>": { "file": "<path>", "size_cm": [w, h] } }
 * resolved against --root (legacy keys are paths relative to that root).
 *
 *   node scripts/publish-material-version.mjs --root library-additions --spec library-additions/tiled-sizes.json [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const dryRun = Boolean(arg("dry-run", false));
const root = path.resolve(String(arg("root", "library-additions")));
const spec = JSON.parse(fs.readFileSync(path.resolve(String(arg("spec", ""))), "utf8"));
const supabase = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const mime = (f) => ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" })[path.extname(f).toLowerCase()] ?? "application/octet-stream";

for (const [legacyKey, entry] of Object.entries(spec)) {
  if (legacyKey.startsWith("_")) continue;
  const file = path.resolve(root, entry.file ?? legacyKey);
  const { data: asset, error } = await supabase
    .from("assets")
    .select("id,name,vendor_id,status,current_version_id,asset_versions!assets_current_version_fk(version)")
    .eq("legacy_key", legacyKey)
    .eq("status", "approved")
    .maybeSingle();
  if (error || !asset) {
    console.log(`  ! ${legacyKey}: ${error?.message ?? "no approved asset"}`);
    continue;
  }
  const current = Array.isArray(asset.asset_versions) ? asset.asset_versions[0] : asset.asset_versions;
  const version = (current?.version ?? 1) + 1;
  const [w, h] = entry.size_cm;
  console.log(`  · ${asset.name.padEnd(28)} v${version}  ${w} x ${h} cm  ${path.basename(file)}`);
  if (dryRun) continue;

  const key = `${asset.vendor_id}/${asset.id}/v${version}/${path.basename(file)}`;
  const up = await supabase.storage.from("materials").upload(key, fs.readFileSync(file), { upsert: true, contentType: mime(file) });
  if (up.error) throw new Error(`${asset.name}: upload: ${up.error.message}`);

  const { data: row, error: vErr } = await supabase
    .from("asset_versions")
    .insert({ asset_id: asset.id, version, file_path: key, thumbnail_path: key, file_size: fs.statSync(file).size, review_status: "approved" })
    .select("id")
    .single();
  if (vErr) throw new Error(`${asset.name}: version: ${vErr.message}`);

  const { error: aErr } = await supabase
    .from("assets")
    .update({ current_version_id: row.id, tile_w_cm: w, tile_h_cm: h, updated_at: new Date().toISOString() })
    .eq("id", asset.id);
  if (aErr) throw new Error(`${asset.name}: asset: ${aErr.message}`);
}
