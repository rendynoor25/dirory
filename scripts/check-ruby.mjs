#!/usr/bin/env node
/**
 * Real Ruby syntax check for the plugin, using Ruby's own Prism parser compiled
 * to WASM (@ruby/prism). No Ruby interpreter required.
 *
 * Why this exists: an earlier heuristic checker (regex depth-counting) passed a
 * main.rb that had a duplicated `def` line and was missing an `end`. SketchUp then
 * failed the whole extension with "unexpected end-of-input, expecting `end`". A
 * heuristic cannot be trusted for Ruby; this uses the same parser Ruby ships.
 *
 * It also cross-checks that every `Cloud.*` method called from main.rb is defined
 * in cloud.rb.
 *
 * Usage: node scripts/check-ruby.mjs
 * Exit code is non-zero when any file fails to parse.
 */

import fs from "node:fs";
import path from "node:path";
import { loadPrism } from "@ruby/prism";

const FILES = [
  "plugin/dirory_library.rb",
  "plugin/dirory_library/main.rb",
  "plugin/dirory_library/cloud.rb",
];

const parse = await loadPrism();
let failed = false;

for (const rel of FILES) {
  const full = path.join(process.cwd(), rel);
  const source = fs.readFileSync(full, "utf8");
  const result = parse(source);
  const errors = (result.errors ?? []).filter((e) => e.type !== "warning");

  if (errors.length) {
    failed = true;
    console.log(`✗ ${rel}`);
    for (const e of errors) {
      const line = (e.location?.startLine ?? 0) + 1;
      const col = (e.location?.startColumn ?? 0) + 1;
      console.log(`    line ${line}:${col}  ${e.message}`);
    }
  } else {
    console.log(`✓ ${rel} — parses clean (${source.split(/\r?\n/).length} lines)`);
  }
}

// Cross-file: every `Cloud.xxx` used in main.rb must be defined in cloud.rb.
const main = fs.readFileSync("plugin/dirory_library/main.rb", "utf8");
const cloud = fs.readFileSync("plugin/dirory_library/cloud.rb", "utf8");
const used = new Set([...main.matchAll(/\bCloud\.([a-z_][a-z0-9_]*[?!]?)/g)].map((m) => m[1]));
const defined = new Set([...cloud.matchAll(/def self\.([a-z_][a-z0-9_]*[?!]?)/g)].map((m) => m[1]));
const missing = [...used].filter((m) => !defined.has(m) && m !== "module" && m !== "self");

if (missing.length) {
  failed = true;
  console.log(`✗ main.rb calls Cloud.${missing.join(", Cloud.")} which cloud.rb does not define`);
} else {
  console.log(`✓ every Cloud.* called from main.rb is defined in cloud.rb (${used.size} methods)`);
}

process.exit(failed ? 1 : 0);
