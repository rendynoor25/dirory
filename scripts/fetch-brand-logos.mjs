#!/usr/bin/env node
/**
 * Download the official brand logos used on the landing page.
 *
 * Each URL is the brand's own asset (its website, or Wikimedia Commons for
 * Nippon Paint), so the marks are the real ones rather than a logo-aggregator's
 * guess. The files are third-party trademarks: they are uploaded to the public
 * `brands` bucket and are NOT committed to this repository (`.cache/` is
 * git-ignored).
 *
 * Usage:  node scripts/fetch-brand-logos.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const outDir = path.resolve(
  process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : ".cache/brand-logos",
);
fs.mkdirSync(outDir, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** brand name -> [source URL, output filename] */
const LOGOS = {
  TACO: ["https://taco.co.id/taco-icon.svg", "taco.svg"],
  "Nippon Paint": [
    "https://upload.wikimedia.org/wikipedia/commons/b/b3/Nippon_Paint_company_logo.svg",
    "nippon-paint.svg",
  ],
  Propan: [
    "https://www.propanraya.com/wp-content/uploads/2025/04/cropped-logo-purple-large-2.png",
    "propan.png",
  ],
  "NIRO GRANITE": ["https://img.nirogranite.co.id/2019/06/Nirogranite-logo-min.svg", "niro-granite.svg"],
  ROMAN: ["https://roman.co.id/wp-content/themes/roman/img/logo/roman.svg", "roman.svg"],
  TOTO: ["https://www.toto.com/global_common_2019/images/logo.svg", "toto.svg"],
  Trilliunware: ["https://trilliunware.com/assets/front/global/img/logo.png", "trilliunware.png"],
  ALPHAMAX: [
    "https://playwithidea.wordpress.com/wp-content/uploads/2014/12/alphamax-logo-preview-01.jpg",
    "alphamax.jpg",
  ],
};

let ok = 0;
let failed = 0;
for (const [brand, [url, filename]] of Object.entries(LOGOS)) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      console.log(`  ! ${brand}: HTTP ${res.status}`);
      failed += 1;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(outDir, filename), buf);
    console.log(`  ok ${brand.padEnd(14)} ${filename.padEnd(20)} ${buf.length} bytes`);
    ok += 1;
  } catch (e) {
    console.log(`  ! ${brand}: ${e.message}`);
    failed += 1;
  }
}

console.log(`\n${ok} downloaded, ${failed} failed -> ${outDir}`);
