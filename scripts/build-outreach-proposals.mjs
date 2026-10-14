#!/usr/bin/env node
/**
 * Build the short cold-outreach proposal — the Kalua Studio vendor list.
 *
 *   node scripts/build-outreach-proposals.mjs              # every vendor
 *   node scripts/build-outreach-proposals.mjs roman        # one, by slug
 *
 * Why a second builder instead of reusing `build-proposals.mjs`: that document is
 * twelve pages and sells a subscription to a strategic target (Propan, TOTO,
 * LIXIL). These are thirty cold contacts arriving from a colleague's list, so the
 * shape is different — four pages, one argument, one ask. The long format stays
 * for the accounts we pursue deliberately.
 *
 * Same pipeline as everything else: HTML plus headless Chrome, no PDF library.
 * Output: proposals/outreach/<slug>.{html,pdf}
 *
 * The vendor data comes from "Database Vendor (by Kalua Studio).xlsx". Eight rows
 * there are not Dirory's audience and are deliberately absent: permit consultants,
 * structural analysis, web developers, an interior contractor, two Autodesk /
 * SketchUp resellers and a signage fabricator — none of them sells a product an
 * architect can place in a drawing. Wisma Sehati is also absent because it already
 * has a proposal in the long series, addressed to a different person.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "proposals", "outreach");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const WHATSAPP = "+62 857-1008-6041";
const EMAIL = "hello@dirory.com";
const SITE = "dirory.com/for-vendors";

const BRAND = "#2f3f96";
const INK = "#0f172a";
const MUTED = "#5b6478";

// ---------------------------------------------------------------------------
// Vendors. `pic` is the contact name from the sheet as given — we do not invent
// titles for these people, so `role` is empty and the cover shows the company.
// `existing` records products already live in Dirory, which the copy must
// acknowledge rather than offer to list again.
// ---------------------------------------------------------------------------
const VENDORS = [
  {
    slug: "surya-utama-fibertek", company: "PT Surya Utama Fibertek", short: "Biorich", pic: "Biorich",
    focus: "Saniter & septic tank",
    relevance:
      "Septic tank dan toilet portabel dipilih di awal proyek, lalu hilang dari gambar begitu " +
      "kontraktor mulai membandingkan harga. Di Dirory produk Biorich masuk ke file proyek " +
      "sebagai unit dengan merek dan tipe, sehingga terlihat tipe mana yang dipakai berulang, " +
      "dan di kota mana.",
    metric: "Unit terpasang per tipe, sebaran proyek dan kota, permintaan penawaran",
  },
  {
    slug: "waveboard", company: "Waveboard", short: "Waveboard", pic: "Saldy",
    focus: "Panel akustik dekoratif",
    relevance:
      "Panel akustik dipilih karena tampilannya, bukan hanya karena performanya — dan justru itu " +
      "yang membuatnya mudah digantikan panel yang mirip tapi lebih murah. Di Dirory yang " +
      "tercatat adalah luas terpasang per motif, jadi Bapak/Ibu tahu motif mana yang benar-benar " +
      "masuk ke ruang.",
    metric: "Luas terpasang (m²) per motif, sebaran proyek dan kota",
  },
  {
    slug: "duma", company: "Duma", short: "Duma", pic: "Irvan",
    focus: "WPC & UPVC",
    relevance:
      "WPC dan UPVC sering hanya tertulis di gambar sebagai 'plafon WPC' tanpa merek, dan " +
      "pembeliannya jatuh ke harga terendah. Di Dirory produk Duma masuk sebagai merek dan tipe, " +
      "dan luas terpasangnya dihitung per produk, dari proyek nyata.",
    metric: "Luas terpasang (m²) per tipe, sebaran proyek dan kota",
  },
  {
    slug: "immortal-marble-granite", company: "Immortal Marble & Granite", short: "Immortal", pic: "Jason",
    focus: "Marmer & granit",
    relevance:
      "Batu alam dipilih dari contoh fisik, jadi arsitek sering menulis 'marmer' saja di gambar " +
      "dan asalnya hilang. Di Dirory yang tercatat adalah slab dengan nama produknya, sehingga " +
      "terlihat material mana yang benar-benar dipakai di proyek nyata.",
    metric: "Luas terpasang (m²) per jenis batu, sebaran proyek dan kota",
  },
  {
    slug: "panelku", company: "Panelku", short: "Panelku", pic: "Chandra",
    focus: "Wall panel & soffit",
    relevance:
      "Panel dinding dan soffit dipilih karena tampilan akhir, dan arsitek biasanya menuliskannya " +
      "sebagai 'wall panel' tanpa merek. Di Dirory Panelku masuk ke gambar sebagai produk " +
      "bertipe, dengan luas terpasang yang bisa dihitung per produk dan per kota.",
    metric: "Luas terpasang (m²) per produk, sebaran proyek dan kota",
  },
  {
    slug: "muda-mandiri-perkasa", company: "Muda Mandiri Perkasa", short: "Muda Mandiri", pic: "Chacha",
    focus: "Pintu HDF & WPC",
    relevance:
      "Pintu adalah produk yang dipilih berkali-kali di setiap proyek, dan jumlahnya selalu bisa " +
      "dihitung — tapi hampir tidak pernah dicatat sebagai angka. Di Dirory jumlah itu tercatat: " +
      "berapa unit per tipe yang benar-benar terpasang, dan di berapa proyek.",
    metric: "Unit terpasang per tipe pintu, jumlah proyek, permintaan penawaran",
  },
  {
    slug: "putra-glass-bandung", company: "Putra Glass Bandung", short: "Putra Glass", pic: "",
    focus: "Cermin LED custom",
    relevance:
      "Cermin LED hampir selalu custom, dan justru karena itu spesifikasinya paling cepat hilang " +
      "setelah serah terima. Di Dirory produknya tercatat sebagai unit per tipe, sehingga terlihat " +
      "tipe mana yang paling sering diminta arsitek.",
    metric: "Unit terpasang per tipe, sebaran proyek dan kota",
  },
  {
    slug: "modico", company: "Modico", short: "Modico", pic: "Sucita",
    focus: "Loose furniture",
    relevance:
      "Loose furniture dipilih di akhir proyek, saat anggaran sudah menipis dan keputusan dibuat " +
      "cepat. Di Dirory furnitur Modico masuk ke gambar sebagai unit, sehingga terlihat tipe mana " +
      "yang bertahan sampai benar-benar dibeli.",
    metric: "Unit terpasang per tipe, sebaran proyek dan kota",
  },
  {
    slug: "greenpro-indonesia", company: "Greenpro Indonesia", short: "Greenpro", pic: "Annisa",
    focus: "Lighting & greenwall",
    relevance:
      "Armatur dan sistem kontrol cahaya biasanya hanya tertulis di gambar sebagai 'downlight LED', " +
      "tanpa merek yang ikut terbawa ke pembelian. Di Dirory yang tercatat adalah produk dengan " +
      "merek dan tipe, per unit terpasang.",
    metric: "Unit terpasang per tipe, sebaran proyek dan kota, permintaan penawaran",
  },
  {
    slug: "reholz", company: "ReHolz", short: "ReHolz", pic: "Safira",
    focus: "Finishing kayu",
    relevance:
      "Finishing kayu menyentuh hampir setiap permukaan, tapi paling jarang disebut mereknya di " +
      "gambar. Di Dirory luas terpasangnya terhitung per produk, jadi nilai yang terlihat " +
      "sebanding dengan luas yang benar-benar dikerjakan.",
    metric: "Luas terpasang (m²) per produk, sebaran proyek dan kota",
  },
  {
    slug: "astral-aluminium", company: "Astral Aluminium", short: "Astral", pic: "Haneke",
    focus: "Aluminium",
    relevance:
      "Aluminium ditulis di gambar sebagai dimensi profil, bukan merek — dan di situ nama " +
      "Bapak/Ibu hilang. Di Dirory profil masuk sebagai produk dengan merek dan tipe, dan panjang " +
      "terpasangnya bisa dihitung dari proyek nyata.",
    metric: "Panjang terpasang per tipe profil, sebaran proyek dan kota",
  },
  {
    slug: "onna-prima-utama", company: "PT Onna Prima Utama", short: "Onna Prima", pic: "Dyna",
    focus: "Blinds, gorden & kasa nyamuk",
    relevance:
      "Blinds dan gorden dipilih di akhir, sering langsung oleh pemilik, sementara arsitek hanya " +
      "menulis 'blinds' tanpa merek. Di Dirory produk Onna tercatat per tipe dan per unit, sehingga " +
      "terlihat produk mana yang menang di proyek nyata.",
    metric: "Unit dan luas terpasang per tipe, sebaran proyek dan kota",
  },
  {
    slug: "atipa", company: "Atipa", short: "Atipa", pic: "Yosephine",
    focus: "Modified clay & flexible tile",
    relevance:
      "Material fleksibel dipilih karena bisa mengikuti bidang lengkung — keunggulan yang mudah " +
      "dijelaskan tapi sulit dibuktikan. Di Dirory yang tercatat adalah luas terpasang per produk, " +
      "jadi keunggulan itu berubah menjadi angka.",
    metric: "Luas terpasang (m²) per produk, sebaran proyek dan kota",
  },
  {
    slug: "skayu-international", company: "Skayu International", short: "Skayu", pic: "Kezia",
    focus: "Material",
    relevance:
      "Produk yang jarang dipakai biasanya bukan karena kurang bagus, melainkan karena arsitek " +
      "tidak menemukannya saat menggambar. Di Dirory produk Skayu masuk ke pencarian dan ke dalam " +
      "gambar, dan pemakaiannya tercatat sebagai angka.",
    metric: "Luas dan unit terpasang per produk, sebaran proyek dan kota",
  },
  {
    slug: "alubeen", company: "Alubeen", short: "Alubeen", pic: "Felia",
    focus: "Aluminium dekoratif",
    relevance:
      "Aluminium dekoratif bersaing pada tampilan, dan arsitek memilihnya dari katalog yang mudah " +
      "dibayangkan hasil akhirnya. Di Dirory produknya masuk ke gambar sebagai merek dan tipe, " +
      "dengan luas terpasang yang bisa dihitung per proyek.",
    metric: "Luas terpasang (m²) per tipe, sebaran proyek dan kota",
  },
  {
    slug: "artgrass-asia", company: "Artgrass Asia", short: "Artgrass", pic: "Henhen",
    focus: "Rumput sintetis & vertical garden",
    relevance:
      "Rumput sintetis dan vertical garden selalu dihitung per meter persegi, jadi angka sudah " +
      "menjadi bahasa sehari-hari Bapak/Ibu. Di Dirory angka itu datang dari proyek nyata: berapa " +
      "m² yang benar-benar dipasang, dan di kota mana.",
    metric: "Luas terpasang (m²) per produk, sebaran proyek dan kota",
  },
  {
    slug: "roman", company: "Roman", short: "ROMAN", pic: "Sasha",
    focus: "Keramik & granit tile",
    existing: { count: 94, type: "material" },
    relevance:
      "94 produk ROMAN sudah tayang di Dirory dan sudah dipakai arsitek di dalam SketchUp. Yang " +
      "belum ada bukan tayangnya, melainkan angkanya: berapa meter persegi per seri yang " +
      "benar-benar masuk ke proyek, dan di kota mana.",
    metric: "Luas terpasang (m²) per seri, sebaran proyek dan kota, permintaan penawaran",
  },
  {
    slug: "distributor-epoxy-789", company: "Distributor Epoxy 789", short: "Epoxy 789", pic: "Nelsa",
    focus: "Cat epoxy & polish",
    relevance:
      "Cat epoxy dijual per meter persegi, tapi di gambar sering hanya tertulis 'epoxy' tanpa " +
      "merek. Di Dirory luas tercat terhitung per produk dan per proyek, sehingga nilai yang " +
      "terlihat sebanding dengan luas yang benar-benar dikerjakan.",
    metric: "Luas tercat (m²) per produk, sebaran proyek dan kota",
  },
  {
    slug: "moire-rugs", company: "Moire Rugs", short: "Moire", pic: "Danu",
    focus: "Handtufted rugs & karpet",
    relevance:
      "Karpet custom dipilih dari contoh, dan setelah proyek selesai tidak ada catatan produk mana " +
      "yang akhirnya dipakai. Di Dirory karpet tercatat per tipe dan per unit, sehingga terlihat " +
      "desain mana yang paling sering dipilih.",
    metric: "Unit dan luas terpasang per tipe, sebaran proyek dan kota",
  },
  {
    slug: "bottega-artisan", company: "Bottega & Artisan (PT Berkat Artisan Indonesia)", short: "Bottega",
    pic: "Elisa",
    focus: "Sintered stone & porcelain tile",
    relevance:
      "Sintered stone diputuskan pada tampilan slab, bukan harga per lembar. Di Dirory slab masuk " +
      "ke gambar dengan nama produknya, dan luas terpasangnya terhitung per tipe dan per kota.",
    metric: "Luas terpasang (m²) per tipe slab, sebaran proyek dan kota",
  },
  {
    slug: "bellaquattro", company: "Bellaquattro", short: "Bellaquattro", pic: "Joshua",
    focus: "Texture paper & wallpaper",
    relevance:
      "Wallpaper dipilih karena motif, dan motif yang salah adalah pemborosan yang baru terlihat " +
      "setelah terpasang. Di Dirory yang tercatat adalah luas terpasang per motif, sehingga " +
      "terlihat motif mana yang benar-benar dipakai.",
    metric: "Luas terpasang (m²) per motif, sebaran proyek dan kota",
  },
  {
    slug: "higold-indonesia", company: "Higold Indonesia", short: "Higold", pic: "Tina",
    focus: "Hardware dapur & wardrobe",
    relevance:
      "Hardware jarang tampil di gambar, padahal justru itu yang menentukan nilai satu set " +
      "kabinet. Di Dirory hardware tercatat per unit dan per tipe, sehingga kontribusinya terlihat " +
      "di proyek nyata — bukan hanya di lembar penawaran.",
    metric: "Unit terpasang per tipe, sebaran proyek dan kota",
  },
  {
    slug: "daeji-vinyl", company: "Daeji Vinyl", short: "Daeji", pic: "Andin",
    focus: "Vinyl & SPC",
    relevance:
      "Vinyl dan SPC dijual per meter persegi dan bersaing ketat di harga. Di Dirory luas " +
      "terpasang per seri dihitung dari proyek nyata, jadi terlihat seri mana yang bertahan di " +
      "gambar arsitek, bukan hanya yang paling murah.",
    metric: "Luas terpasang (m²) per seri, sebaran proyek dan kota",
  },
  {
    slug: "altara-indonesia", company: "PT Altara Indonesia Sukses", short: "Altara", pic: "Ragil",
    focus: "Sintered stone & porcelain tile",
    relevance:
      "Bagian tersulit pada sintered stone bukan memproduksinya, tapi membuat arsitek memilih slab " +
      "yang tepat saat menggambar. Di Dirory slab masuk ke gambar dengan nama produk, dan luas " +
      "terpasangnya tercatat per tipe dan per kota.",
    metric: "Luas terpasang (m²) per tipe, sebaran proyek dan kota",
  },
  {
    slug: "berdikari-tunggal-perkasa", company: "Berdikari Tunggal Perkasa", short: "Berdikari", pic: "Vebby",
    focus: "Atap, plafon & building material",
    relevance:
      "Atap dan plafon dipilih pada tahap paling awal, ketika gambar masih berubah cepat dan " +
      "merek paling mudah tergantikan. Di Dirory produk seperti Alderon masuk ke gambar sebagai " +
      "merek dan tipe, dan luas terpasangnya bisa dihitung per proyek.",
    metric: "Luas terpasang (m²) per produk, sebaran proyek dan kota",
  },
  {
    slug: "paranti-sofa", company: "Paranti Sofa", short: "Paranti", pic: "Delfira",
    focus: "Sofa custom & reupholstery",
    relevance:
      "Sofa custom dipesan di akhir proyek dan hampir tidak pernah tercatat sebagai produk, " +
      "padahal nilainya besar per unit. Di Dirory sofa masuk ke gambar sebagai unit dengan tipe, " +
      "sehingga terlihat tipe mana yang paling sering dipesan.",
    metric: "Unit terpasang per tipe, sebaran proyek dan kota",
  },
  {
    slug: "sanwoo-electronics", company: "Sanwoo Electronics", short: "Sanwoo", pic: "Yunita",
    focus: "Peralatan dapur komersial",
    relevance:
      "Peralatan dapur komersial dipilih saat proyek F&B masih direncanakan, dan dimensinya " +
      "menentukan tata letak ruang. Di Dirory peralatan Sanwoo masuk ke gambar dalam ukuran " +
      "sebenarnya, dan jumlah terpasangnya tercatat per tipe.",
    metric: "Unit terpasang per tipe, sebaran proyek dan kota",
  },
  {
    slug: "keding-hpl-bandung", company: "Keding HPL Bandung", short: "Keding HPL", pic: "Hendrik",
    focus: "HPL",
    relevance:
      "HPL bersaing pada motif dan ketahanan, dan arsitek memilihnya dari contoh yang sulit " +
      "dibayangkan setelah terpasang. Di Dirory HPL masuk ke gambar dengan motif dan tipe, dan " +
      "luas terpasangnya terhitung per produk.",
    metric: "Luas terpasang (m²) per motif, sebaran proyek dan kota",
  },
  {
    slug: "lalapis", company: "Lalapis", short: "Lalapis", pic: "Henjelina",
    focus: "Panel dinding dekoratif 3D",
    relevance:
      "Panel dinding 3D hampir selalu dipakai sebagai titik perhatian, jadi luasnya kecil tapi " +
      "nilainya tinggi per meter persegi. Di Dirory yang tercatat adalah luas terpasang per motif, " +
      "sehingga terlihat motif mana yang benar-benar dipilih.",
    metric: "Luas terpasang (m²) per motif, sebaran proyek dan kota",
  },
  {
    slug: "solusi-atap-prima", company: "Solusi Atap Prima", short: "Solusi Atap Prima", pic: "Arby",
    focus: "Atap bitumen & genteng aspal",
    relevance:
      "Genteng aspal dipilih karena bentuk dan warnanya, dan jumlahnya selalu dihitung per meter " +
      "persegi atap. Di Dirory luas terpasang per tipe terhitung dari proyek nyata, bukan dari " +
      "perkiraan di atas kertas.",
    metric: "Luas terpasang (m²) per tipe, sebaran proyek dan kota",
  },
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function css() {
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: ${INK}; font-size: 11pt; line-height: 1.6;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .page {
      width: 210mm; min-height: 297mm; padding: 20mm 18mm 16mm;
      page-break-after: always; position: relative;
    }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 25pt; line-height: 1.18; margin: 0 0 7mm; letter-spacing: -0.4pt; }
    h2 { font-size: 16pt; margin: 0 0 4mm; letter-spacing: -0.2pt; }
    h3 { font-size: 11.5pt; margin: 0 0 2mm; }
    p  { margin: 0 0 3.5mm; }
    .lead { font-size: 12.5pt; color: ${MUTED}; line-height: 1.55; }
    .muted { color: ${MUTED}; }
    .small { font-size: 9.5pt; }
    .tag { font-size: 8.5pt; font-weight: 700; letter-spacing: 1.4pt; color: ${BRAND}; margin: 0 0 4mm; }
    .rule { height: 2px; background: ${BRAND}; width: 24mm; margin: 0 0 7mm; }
    .rule-lite { height: 1px; background: #dfe3ef; margin: 7mm 0; }
    .cover { display: flex; flex-direction: column; justify-content: space-between; }
    .cover-foot table { width: 100%; border-collapse: collapse; }
    .box { border: 1px solid #dfe3ef; border-radius: 4mm; padding: 6mm; margin: 0 0 5mm; }
    .box-accent { border-left: 3px solid ${BRAND}; }
    .metric { font-size: 13pt; font-weight: 600; color: ${BRAND}; margin: 0; }
    ol.steps { margin: 0; padding-left: 6mm; }
    ol.steps li { margin: 0 0 4mm; }
    table.plain { width: 100%; border-collapse: collapse; }
    table.plain td { padding: 1.2mm 0; vertical-align: top; border: 0; }
    table.plain td.k { width: 34mm; color: ${MUTED}; }
    .foot { position: absolute; bottom: 10mm; left: 18mm; right: 18mm;
            border-top: 1px solid #eceff7; padding-top: 2.5mm;
            font-size: 8.5pt; color: ${MUTED}; display: flex; justify-content: space-between; }
  `;
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtml(v, tanggal) {
  const addressee = v.pic ? `${v.pic}` : v.company;
  const subline = v.pic ? v.company : "Kontak dari Kalua Studio";
  const existingLine = v.existing
    ? `<div class="box box-accent">
         <p class="metric">${v.existing.count} produk ${esc(v.short)} sudah tayang di Dirory</p>
         <p class="small muted" style="margin:4mm 0 0">Sudah dipakai arsitek di dalam SketchUp.
         Yang belum ada bukan tayangnya, melainkan angkanya.</p>
       </div>`
    : `<div class="box box-accent">
         <p class="metric">${esc(v.short)} belum ada di Dirory</p>
         <p class="small muted" style="margin:4mm 0 0">Artinya produk Bapak/Ibu belum muncul saat
         arsitek mencari di dalam SketchUp — padahal keputusan produk terjadi di situ.</p>
       </div>`;

  const foot = (n) => `<div class="foot"><span>Dirory — ${SITE}</span><span>${n} / 4</span></div>`;

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Proposal Dirory — ${esc(v.company)}</title>
<style>${css()}</style></head>
<body>

  <section class="page cover">
    <div>
      <p class="tag">PROPOSAL KERJA SAMA</p>
      <h1>Produk ${esc(v.short)},<br>langsung di dalam software desain arsitek.</h1>
      <p class="lead">
        Dirory adalah pustaka produk bangunan yang berjalan di dalam SketchUp — software desain
        yang dipakai arsitek Indonesia setiap hari. Arsitek mencari produk asli di situ,
        memasukkannya ke gambar proyek, dan pemakaiannya tercatat sebagai angka.
      </p>
      <p class="muted">
        Untuk arsitek, Dirory <strong>gratis</strong>. Untuk vendor, Dirory memperlihatkan produk
        mana yang benar-benar masuk ke gambar — bukan sekadar berapa kali katalog dibuka.
      </p>
    </div>
    <div class="cover-foot">
      <table class="plain">
        <tr><td class="k">Disiapkan untuk</td><td><strong>${esc(addressee)}</strong><br>
            <span class="muted small">${esc(subline)}</span></td></tr>
        <tr><td class="k">Tanggal</td><td>${tanggal}</td></tr>
        <tr><td class="k">Fokus</td><td>${esc(v.focus)}</td></tr>
        <tr><td class="k">Sifat</td><td>Usulan kemitraan — tanpa biaya bagi arsitek</td></tr>
      </table>
    </div>
    ${foot("1")}
  </section>

  <section class="page">
    <p class="tag">01 — Kenapa ini penting</p>
    <div class="rule"></div>
    <h2>Masalahnya bukan dikenal,<br>tapi tercatat.</h2>
    <p>
      Di hampir setiap gambar, produk ditulis sebagai ukuran, bukan merek: “keramik 60x60”,
      “plafon WPC”, “downlight LED”. Spesifikasi berhenti di situ — lalu kontraktor membeli yang
      termurah, dan nama ${esc(v.short)} hilang tepat sebelum keputusan pembelian.
    </p>
    <p>
      Yang menentukan bukan apakah arsitek mengenal produk Bapak/Ibu, melainkan apakah produk itu
      <strong>masuk ke dalam gambar</strong> — dan berapa banyak yang benar-benar terpasang.
    </p>
    <div class="rule-lite"></div>
    <h3>Yang Dirory ukur untuk ${esc(v.short)}</h3>
    <p class="metric">${esc(v.metric)}</p>
    <p class="small muted">
      Semua angka bersifat agregat dan anonim. Produsen lain tidak dapat melihat angka
      Bapak/Ibu, dan Bapak/Ibu tidak melihat angka mereka. Tidak ada nama proyek, nama pemilik,
      atau lokasi yang dibagikan.
    </p>
    ${existingLine}
    ${foot("2")}
  </section>

  <section class="page">
    <p class="tag">02 — Cara kerjanya</p>
    <div class="rule"></div>
    <h2>Tiga langkah, tanpa mengubah cara kerja tim Anda.</h2>
    <ol class="steps">
      <li>
        <h3>Daftar dan unggah produk</h3>
        <p class="small muted">Nama perusahaan, nama brand, logo, dan produk Bapak/Ibu —
        model 3D atau material, dengan ukuran yang benar. Untuk produk yang belum punya file,
        kami bantu digitalkan.</p>
      </li>
      <li>
        <h3>Kami periksa, lalu tayang</h3>
        <p class="small muted">Skala, penamaan dan tag dirapikan supaya arsitek menemukannya saat
        mencari. Tidak ada merek pesaing yang menempel di produk Bapak/Ibu.</p>
      </li>
      <li>
        <h3>Angkanya berjalan sendiri</h3>
        <p class="small muted">Setiap kali arsitek memakai produk Bapak/Ibu, pemakaiannya
        tercatat. Laporan masuk tanpa perlu tim Bapak/Ibu menghitung apa pun.</p>
      </li>
    </ol>
    <div class="rule-lite"></div>
    <h3>Yang tidak Dirory lakukan</h3>
    <p class="small muted">
      Tidak menjual data arsitek. Tidak menampilkan angka Bapak/Ibu kepada vendor lain. Tidak
      meminta harga, diskon, atau data penjualan internal. Tidak menampilkan nama proyek atau
      identitas arsitek kepada siapa pun — termasuk kepada Bapak/Ibu.
    </p>
    ${foot("3")}
  </section>

  <section class="page">
    <p class="tag">03 — Langkah selanjutnya</p>
    <div class="rule"></div>
    <h2>Satu demonstrasi, 30 menit.</h2>
    <p>
      Saya dapat menunjukkan Dirory langsung di SketchUp, memakai produk ${esc(v.short)} sebagai
      contoh, supaya Bapak/Ibu menilai sendiri apakah alat ini berguna bagi tim penjualan dan
      arsitek pelanggan ${esc(v.short)} — tanpa perlu presentasi panjang.
    </p>
    <p class="muted small">
      Semua paket, cara kerja dan tombol pendaftaran ada di satu halaman:
      <strong>${SITE}</strong>.
    </p>
    <div class="rule-lite"></div>
    <h3>Hubungi</h3>
    <table class="plain">
      <tr><td class="k">WhatsApp</td><td><strong>${WHATSAPP}</strong></td></tr>
      <tr><td class="k">Email</td><td>${EMAIL}</td></tr>
      <tr><td class="k">Situs</td><td>dirory.com · ${SITE}</td></tr>
    </table>
    <p class="small muted" style="margin-top:10mm">
      Proposal ini disiapkan untuk ${esc(v.company)}. Angka pustaka dan contoh produk diambil
      dari katalog Dirory yang berjalan; rincian dapat berubah setelah diskusi pertama.
    </p>
    ${foot("4")}
  </section>

</body></html>`;
}

function chromePath() {
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

/** Chrome writes `.new.pdf` first; a locked target is reported, never hidden. */
function pdfFromHtml(chrome, htmlPath, pdfPath) {
  const tmpPath = pdfPath.replace(/\.pdf$/i, ".new.pdf");
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--no-sandbox",
    `--user-data-dir=${path.join(OUT_DIR, ".chrome-profile")}`,
    `--print-to-pdf=${tmpPath}`,
    `file:///${htmlPath.replace(/\\/g, "/")}`,
  ], { stdio: "pipe" });
  try {
    fs.renameSync(tmpPath, pdfPath);
    return { ok: true };
  } catch {
    try {
      fs.copyFileSync(tmpPath, pdfPath);
      fs.rmSync(tmpPath, { force: true });
      return { ok: true };
    } catch {
      return { ok: false, tmpPath };
    }
  }
}

/**
 * The WhatsApp opener, personalised per vendor.
 *
 * Two variants: the ordinary first contact, and one for a vendor whose products are
 * already live in Dirory (Roman) — for those the message must acknowledge what is
 * already there rather than offer to list it.
 */
function whatsappText(v, pic) {
  const greet = pic ? `Bapak/Ibu ${pic}` : "Bapak/Ibu";
  const opening =
    `Selamat pagi ${greet},\n\n` +
    `Saya Rendy Noor Chandra, pendiri Dirory. Dirory adalah pustaka produk bangunan yang ` +
    `berjalan di dalam SketchUp — software desain yang dipakai arsitek Indonesia setiap hari ` +
    `untuk menggambar.\n\n` +
    `Kontak Bapak/Ibu saya dapat dari rekan kami di Kalua Studio. Saya tertarik dengan ` +
    `${v.focus} yang ${v.company} sediakan, karena produk seperti itu justru yang paling ` +
    `sering dicari arsitek saat menggambar, tapi paling sulit ditemukan dalam bentuk yang ` +
    `siap dipakai.\n\n`;

  const body = v.existing
    ? `Saat ini ${v.existing.count} produk ${v.short} sudah tayang di Dirory dan sudah dipakai ` +
      `arsitek di dalam SketchUp. Yang belum ada bukan tayangnya, melainkan angkanya: ` +
      `${v.metric.toLowerCase()}.\n\n`
    : `Di Dirory, arsitek memasukkan produk asli ke dalam gambar proyek, dan pemakaiannya ` +
      `tercatat sebagai angka: ${v.metric.toLowerCase()}. Angkanya agregat dan anonim — ` +
      `produsen lain tidak dapat melihat angka ${v.short}, dan sebaliknya. Untuk arsitek, ` +
      `Dirory gratis.\n\n`;

  return (
    opening +
    body +
    `Proposal ringkasnya (4 halaman) saya lampirkan di pesan ini. Kalau menurut Bapak/Ibu ` +
    `menarik, saya bisa kirimkan versi lengkapnya atau kita atur demo 30 menit dengan produk ` +
    `${v.short} sebagai contoh.\n\n` +
    `Terima kasih atas waktunya.\n\n` +
    `Rendy Noor Chandra\nPendiri, Dirory\n${SITE}\nWhatsApp ${WHATSAPP}`
  );
}

function writeSendList() {
  const contactsPath = path.join(OUT_DIR, "contacts.json");
  if (!fs.existsSync(contactsPath)) {
    console.log("\n  (no contacts.json — skipping proposals/outreach/send-list.md)");
    return;
  }
  const contacts = JSON.parse(fs.readFileSync(contactsPath, "utf8"));

  const lines = [
    "# Outreach send list — Kalua Studio vendors",
    "",
    `${VENDORS.length} vendors. Contact details read from the sheet by ` +
      "`scripts/extract-kalua-contacts.py`, so no number was typed by hand.",
    "",
    "Each entry has the PDF to attach and a `wa.me` link with the opener already written — " +
      "click it, check the name, attach the PDF, send. Full message text is under each entry " +
      "if you would rather copy it manually.",
    "",
    "Two rules that apply to all of them: attach the **right** PDF, and send in the morning.",
    "",
    "---",
    "",
  ];

  let n = 0;
  for (const v of VENDORS) {
    const c = contacts[v.slug];
    if (!c) continue;
    n += 1;
    const text = whatsappText(v, c.pic);
    const link = c.phone
      ? `https://wa.me/${c.phone}?text=${encodeURIComponent(text)}`
      : "(no phone number in the sheet)";
    lines.push(`## ${n}. ${v.company}`);
    lines.push("");
    lines.push(`- **PIC:** ${c.pic || "—"}`);
    lines.push(`- **Phone:** ${c.phone ? "+" + c.phone : "—"}`);
    lines.push(`- **Attach:** \`proposals/outreach/${v.slug}.pdf\``);
    lines.push(`- **Open WhatsApp:** ${link}`);
    if (v.existing) lines.push(`- **Note:** ${v.existing.count} products already live — the message says so`);
    lines.push("");
    lines.push("<details><summary>Message text</summary>");
    lines.push("");
    lines.push("```");
    lines.push(text);
    lines.push("```");
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  fs.writeFileSync(path.join(OUT_DIR, "send-list.md"), lines.join("\n"), "utf8");
  console.log(`\n  wrote proposals/outreach/send-list.md (${n} contacts with WhatsApp links)`);
}

function main() {
  const only = process.argv[2];
  const chrome = chromePath();
  if (!chrome) {
    console.error("No Chrome or Edge found; cannot produce a PDF.");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const list = only ? VENDORS.filter((v) => v.slug === only) : VENDORS;
  if (!list.length) {
    console.error(`No vendor matches "${only}". Try one of:\n  ${VENDORS.map((v) => v.slug).join("\n  ")}`);
    process.exit(1);
  }

  const now = new Date();
  const tanggal = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  let pdfs = 0;
  let locked = 0;
  for (const v of list) {
    const htmlPath = path.join(OUT_DIR, `${v.slug}.html`);
    const pdfPath = path.join(OUT_DIR, `${v.slug}.pdf`);
    fs.writeFileSync(htmlPath, buildHtml(v, tanggal), "utf8");
    const res = pdfFromHtml(chrome, htmlPath, pdfPath);
    if (res.ok) {
      pdfs += 1;
      console.log(`  ${v.company.padEnd(46)} ${v.slug}.pdf  (${Math.round(fs.statSync(pdfPath).size / 1024)} KB)`);
    } else {
      locked += 1;
      console.log(`  ${v.company.padEnd(46)} LOCKED — wrote ${path.basename(res.tmpPath)}`);
    }
  }
  console.log(`\n  ${pdfs} PDF(s) written to proposals/outreach/${locked ? `, ${locked} locked` : ""}`);
  if (!only) writeSendList();
}

main();
