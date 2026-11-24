#!/usr/bin/env node
/**
 * Delete old plugin archives from the private `plugin-release` bucket.
 *
 * The `plugin-release` Edge Function always serves the HIGHEST version in the
 * bucket (`latestRelease()`), so every older RBZ is dead weight — but each one
 * is several MB and the Free plan allows only 1 GB of file storage. The update
 * popup never offers an old release, so keeping two is enough for a rollback.
 *
 * Safe by default: without `--yes` it only prints what it would delete.
 *
 * Usage:
 *   npm run rbz:prune                 # dry run, keep the newest 2
 *   npm run rbz:prune -- --yes        # actually delete
 *   npm run rbz:prune -- --keep 1 --yes
 *
 * Only objects named `DiroryLibrary-<version>.rbz` and their `.json` notes
 * sidecars are considered. Anything else in the bucket is left alone.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "plugin-release";

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
  console.error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const keep = Number(arg("keep", "2"));
if (!Number.isInteger(keep) || keep < 1) {
  console.error("--keep must be a whole number, at least 1.");
  process.exit(1);
}
const confirmed = process.argv.includes("--yes");

const supabase = createClient(url, key, { auth: { persistSession: false } });

function compareVersions(a, b) {
  const av = a.split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
  const bv = b.split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const d = (av[i] ?? 0) - (bv[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const human = (n) =>
  n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;

const { data, error } = await supabase.storage.from(BUCKET).list("", { limit: 1000 });
if (error) {
  console.error(`Could not list ${BUCKET}: ${error.message}`);
  console.error("If the project is restricted for quota, upgrade/restore it first.");
  process.exit(1);
}

const groups = new Map();
const ignored = [];
for (const item of data ?? []) {
  const m = /^DiroryLibrary-(.+)\.(rbz|json)$/i.exec(item.name);
  if (!m) {
    if (item.id != null) ignored.push(item.name);
    continue;
  }
  const version = m[1];
  if (!groups.has(version)) groups.set(version, { version, objects: [], size: 0 });
  const g = groups.get(version);
  g.objects.push(item.name);
  g.size += Number(item.metadata?.size ?? 0);
}

if (!groups.size) {
  console.log(`No DiroryLibrary-<version>.rbz objects in ${BUCKET}. Nothing to do.`);
  process.exit(0);
}

const releases = [...groups.values()].sort((a, b) => compareVersions(b.version, a.version));
const kept = releases.slice(0, keep);
const doomed = releases.slice(keep);
const paths = doomed.flatMap((g) => g.objects);
const bytes = doomed.reduce((n, g) => n + g.size, 0);

console.log(`Dirory plugin releases — ${new URL(url).host}\n`);
console.log(`Keeping the newest ${kept.length}:`);
for (const g of kept) console.log(`  keep    ${g.version.padEnd(10)} ${human(g.size)}`);

if (!doomed.length) {
  console.log(`\nNo older releases to delete.`);
  process.exit(0);
}

console.log(`\n${confirmed ? "Deleting" : "Would delete"} ${doomed.length} release(s), ${human(bytes)}:`);
for (const g of doomed) {
  console.log(`  ${confirmed ? "delete" : "would"}  ${g.version.padEnd(10)} ${human(g.size)}  (${g.objects.join(", ")})`);
}
if (ignored.length) {
  console.log(`\nIgnoring ${ignored.length} object(s) that are not DiroryLibrary releases:`);
  for (const name of ignored.slice(0, 10)) console.log(`  ${name}`);
}

if (!confirmed) {
  console.log("\nDry run only. Re-run with --yes to delete:");
  console.log("  npm run rbz:prune -- --yes");
  process.exit(0);
}

const CHUNK = 200;
for (let i = 0; i < paths.length; i += CHUNK) {
  const slice = paths.slice(i, i + CHUNK);
  const { error: removeError } = await supabase.storage.from(BUCKET).remove(slice);
  if (removeError) {
    console.error(`Delete failed after ${i} object(s): ${removeError.message}`);
    process.exit(1);
  }
}

console.log(`\nDeleted ${paths.length} object(s), freed ${human(bytes)}.`);
console.log("The plugin's update popup still serves the newest release.");
