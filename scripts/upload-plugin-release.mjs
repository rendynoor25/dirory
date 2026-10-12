#!/usr/bin/env node
/**
 * Upload the built plugin archive to the private `plugin-release` bucket so the
 * plugin's Update button can fetch it.
 *
 * Run after `npm run rbz:build`. The bucket is private; the `plugin-release`
 * Edge Function hands the archive to a signed-in plugin.
 *
 * Usage:
 *   node scripts/upload-plugin-release.mjs
 *   node scripts/upload-plugin-release.mjs --file dist/DiroryLibrary-0.9.0.rbz
 *   node scripts/upload-plugin-release.mjs --notes "Popup says what's new;Download progress bar" --notes-id "Popup berisi yang baru;Bilah kemajuan unduhan"
 *
 * The --notes flags publish the release-notes sidecar the update popup reads
 * (<basename>.json next to the .rbz, e.g. DiroryLibrary-0.9.9.json).
 * Semicolons separate lines; at most 8 are kept. Omit the flags and no sidecar
 * is written — older releases have none, and the plugin falls back cleanly.
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

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

// Default to the highest DiroryLibrary-*.rbz in dist/.
function newestArchive() {
  const dir = path.join(process.cwd(), "dist");
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^DiroryLibrary-[\d.]+\.rbz$/.test(f))
    .map((f) => ({ f, v: f.match(/[\d.]+/)[0].split(".").map(Number) }))
    .sort((a, b) => {
      for (let i = 0; i < 4; i++) if ((a.v[i] || 0) !== (b.v[i] || 0)) return (a.v[i] || 0) - (b.v[i] || 0);
      return 0;
    });
  return files.length ? path.join(dir, files[files.length - 1].f) : null;
}

const file = String(arg("file", "") || newestArchive() || "");
if (!file || !fs.existsSync(file)) {
  console.error(`Archive not found: ${file || "(none in dist/)"}`);
  process.exit(1);
}

const filename = path.basename(file);
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { error } = await supabase.storage
  .from("plugin-release")
  .upload(filename, fs.readFileSync(file), {
    upsert: true,
    contentType: "application/octet-stream",
  });

if (error) {
  console.error(`Upload failed: ${error.message}`);
  process.exit(1);
}
console.log(`Uploaded plugin-release/${filename} (${fs.statSync(file).size} bytes).`);
console.log("The plugin's Update button will now offer this version.");

// Release-notes sidecar for the update popup (0.9.9+). Same basename, .json.
function splitNotes(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

const notes = splitNotes(arg("notes", ""));
const notesId = splitNotes(arg("notes-id", ""));
if (notes.length || notesId.length) {
  const sidecar = filename.replace(/\.rbz$/i, ".json");
  const body = { version: filename.match(/[\d.]+/)[0], published_at: new Date().toISOString() };
  if (notes.length) body.notes = notes;
  if (notesId.length) body.notes_id = notesId;
  const { error: notesError } = await supabase.storage
    .from("plugin-release")
    .upload(sidecar, Buffer.from(JSON.stringify(body, null, 2), "utf8"), {
      upsert: true,
      // application/octet-stream: the bucket's allow-list rejects both
      // application/json and text/plain. The Edge Function downloads the
      // sidecar with the service role and parses the body itself, so the
      // stored content type is irrelevant.
      contentType: "application/octet-stream",
    });
  if (notesError) {
    console.error(`Notes sidecar failed (${sidecar}): ${notesError.message}`);
    process.exit(1);
  }
  console.log(
    `Uploaded plugin-release/${sidecar} (${notes.length} en / ${notesId.length} id lines).`,
  );
} else {
  console.log("No --notes given, so no release-notes sidecar was written.");
}
