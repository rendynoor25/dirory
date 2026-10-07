#!/usr/bin/env node
/**
 * Download the MATERIUM product thumbnails from malka.co.id.
 *
 * The Materium `.skp` files shipped without preview images, and their product
 * photos live on the brand's website rather than beside the model. This fetches
 * them into a local folder that `library-overrides.json` points at, so the
 * uploader can attach a real thumbnail to each product.
 *
 * The images are third-party product photos, so the output folder (`.cache/`) is
 * git-ignored — they are uploaded to Supabase Storage, not committed here.
 *
 * Usage:
 *   node scripts/fetch-materium-thumbnails.mjs
 *   node scripts/fetch-materium-thumbnails.mjs --out D:/tmp/thumbs
 *
 * The site rejects requests without a browser User-Agent (403), hence the header.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const outDir = path.resolve(
  String(
    process.argv.includes("--out")
      ? process.argv[process.argv.indexOf("--out") + 1]
      : ".cache/materium-thumbs",
  ),
);
fs.mkdirSync(outDir, { recursive: true });

/** The MATERIUM brand listing on malka.co.id (pages 1 and 2), name -> image path. */
const PRODUCTS = {
  Bookend: "/uploads/produk_gambar/produk_gambar-20221123160147-71161.jpg",
  "Bored Not Bored": "/uploads/produk_gambar/produk_gambar-20211006093235-14547.jpg",
  Coaster: "/uploads/produk_gambar/produk_gambar-20230220115135-80267.jpg",
  "Coat Hanger": "/uploads/produk_gambar/produk_gambar-20231030140333-72658.jpg",
  "Dominium Desk": "/uploads/produk_gambar/produk_gambar-20210802075102-57222.jpg",
  "Exilium Coffee Table": "/uploads/produk_gambar/produk_gambar-20210802073919-24955.jpg",
  "Exilium Round Table": "/uploads/produk_gambar/produk_gambar-20210802072837-39689.jpg",
  Folium: "/uploads/produk_gambar/produk_gambar-20210924070850-30337.jpg",
  "Francium Chair": "/uploads/produk_gambar/produk_gambar-20210924062809-28554.jpg",
  "Hang up": "/uploads/produk_gambar/produk_gambar-20230220101425-76704.jpg",
  "Imperium Meeting Table": "/uploads/produk_gambar/produk_gambar-20210802072257-53339.jpg",
  "Levisium Side Table": "/uploads/produk_gambar/produk_gambar-20210802074541-96788.jpg",
  "Luxium Lamp": "/uploads/produk_gambar/produk_gambar-20210924053147-71018.jpg",
  "Magis Table": "/uploads/produk_gambar/produk_gambar-20230220112943-37324.jpg",
  "Otium Ottoman": "/uploads/produk_gambar/produk_gambar-20230217155920-76596.jpg",
  "Partium Partition": "/uploads/produk_gambar/produk_gambar-20210924055607-93895.jpg",
  Peponium: "/uploads/produk_gambar/produk_gambar-20210924064525-21719.jpg",
  "Polonium Cabinet": "/uploads/produk_gambar/produk_gambar-20230217161753-44777.jpg",
  "Polonium Credenza": "/uploads/produk_gambar/produk_gambar-20221010093559-68284.jpg",
  "Polonium Locker": "/uploads/produk_gambar/produk_gambar-20230220084418-37392.jpg",
  "Solatium Low Sofa": "/uploads/produk_gambar/produk_gambar-20221004103915-40038.jpg",
  "Solatium Privacy Chair": "/uploads/produk_gambar/produk_gambar-20230217153817-51019.jpg",
  "Solatium Privacy Sofa": "/uploads/produk_gambar/produk_gambar-20230217151719-30431.jpg",
  "Table Taco": "/uploads/produk_gambar/produk_gambar-20230220103928-12076.jpg",
  Traxium: "/uploads/produk_gambar/produk_gambar-20230220094541-48739.jpg",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

let ok = 0;
let failed = 0;
for (const [name, url] of Object.entries(PRODUCTS)) {
  const safe = name.replace(/[^a-zA-Z0-9]+/g, "_");
  const file = path.join(outDir, `${safe}.jpg`);
  const res = await fetch(`https://malka.co.id${url}`, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    console.log(`  ! ${name}: HTTP ${res.status}`);
    failed += 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  console.log(`  ok ${name.padEnd(24)} ${buf.length} bytes`);
  ok += 1;
}

console.log(`\n${ok} downloaded, ${failed} failed -> ${outDir}`);
if (failed) process.exitCode = 1;
