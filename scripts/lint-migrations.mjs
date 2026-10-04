#!/usr/bin/env node
/**
 * Static checks on supabase/migrations before pushing.
 *
 * These catch the failures that only surface at `supabase db push`, where a
 * half-run migration is slow to diagnose:
 *
 *   1. Duplicate CREATE TABLE / CREATE INDEX across the migration set.
 *      Found for real: assets_legacy_key_idx was declared twice in
 *      0001_schema.sql after a block was moved. Postgres rejects the second
 *      with "already exists" (42P07).
 *
 *   2. Forward foreign-key references: a table referencing a table created
 *      later in the same run. Found for real: favourites referenced assets
 *      before assets existed (42P01). Self-references are legal and skipped.
 *
 *   3. uuid_generate_v4() without a usable uuid-ossp setup. Found for real:
 *      the extension is not visible to statements later in the same batch, so
 *      this must be gen_random_uuid() instead.
 *
 *   4. Non-ASCII bytes in a migration. Harmless to Postgres, but a sign that an
 *      editor or script rewrote the file with the wrong encoding.
 *
 * Usage:  node scripts/lint-migrations.mjs
 * Exit:   0 = clean, 1 = problems found
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const dir = path.join(process.cwd(), "supabase", "migrations");
if (!fs.existsSync(dir)) {
  console.error(`No migrations directory at ${dir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const problems = [];
const warnings = [];
const tables = [];
const indexes = [];

for (const file of files) {
  const full = path.join(dir, file);
  const raw = fs.readFileSync(full, "utf8");
  const lines = raw.split(/\r?\n/);

  // --- 4. encoding ---------------------------------------------------------
  // Reported as a warning, not a failure: non-ASCII in a comment (an arrow, a
  // section sign) is harmless to Postgres. It is worth knowing because it often
  // means a script rewrote the file with the wrong encoding, which *is* a bug —
  // that happened once in this repo, mangling a section sign into mojibake.
  const buf = fs.readFileSync(full);
  const nonAscii = [...buf].filter((b) => b > 127).length;
  if (nonAscii > 0) {
    warnings.push(`${file}: ${nonAscii} non-ASCII byte(s) — verify the encoding is intentional`);
  }

  // --- 3. uuid function ----------------------------------------------------
  // Ignore comment lines: this file legitimately mentions the old function name
  // in prose explaining why it was replaced.
  lines.forEach((line, i) => {
    const isComment = /^\s*--/.test(line);
    if (!isComment && /\buuid_generate_v4\s*\(/.test(line)) {
      problems.push(
        `${file}:${i + 1}: uuid_generate_v4() — use gen_random_uuid() instead`,
      );
    }
  });

  lines.forEach((line, i) => {
    // --- 1. collect declarations -------------------------------------------
    let m = line.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/i);
    if (m) tables.push({ file, line: i + 1, name: m[1].toLowerCase(), refs: [] });

    m = line.match(/create\s+index\s+(?:if\s+not\s+exists\s+)?(\w+)/i);
    if (m) indexes.push({ file, line: i + 1, name: m[1].toLowerCase() });

    // --- 2. collect FK references, attributed to the current table ---------
    if (tables.length) {
      const refs = [...line.matchAll(/references\s+public\.(\w+)/gi)];
      for (const r of refs) tables[tables.length - 1].refs.push(r[1].toLowerCase());
    }
  });
}

// --- 1. duplicates ---------------------------------------------------------
for (const [kind, list] of [["table", tables], ["index", indexes]]) {
  const seen = new Map();
  for (const item of list) {
    if (seen.has(item.name)) {
      const first = seen.get(item.name);
      problems.push(
        `duplicate ${kind} "${item.name}": ${first.file}:${first.line} and ${item.file}:${item.line}`,
      );
    } else {
      seen.set(item.name, item);
    }
  }
}

// --- 2. forward references -------------------------------------------------
for (const t of tables) {
  const declaredBefore = new Set(
    tables.filter((o) => o.line < t.line || (o.line === t.line && o.name !== t.name))
      .map((o) => o.name),
  );
  for (const ref of new Set(t.refs)) {
    if (ref === t.name) continue; // self-reference: legal
    if (tables.some((o) => o.name === ref) && !declaredBefore.has(ref)) {
      problems.push(
        `${t.file}:${t.line}: table "${t.name}" references "${ref}" which is created later`,
      );
    }
  }
}

// --- report ----------------------------------------------------------------
if (warnings.length) {
  console.log("Warnings (not failures):");
  for (const w of warnings) console.log(`  - ${w}`);
  console.log("");
}

if (problems.length) {
  console.error("Migration lint FAILED:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log("Migration lint OK");
console.log(`  files   : ${files.length}`);
console.log(`  tables  : ${tables.length}`);
console.log(`  indexes : ${indexes.length}`);
console.log("  no duplicates, no forward references, no uuid_generate_v4");
