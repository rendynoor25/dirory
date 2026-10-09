#!/usr/bin/env node
/**
 * Build the Dirory pitch deck as 16:9 HTML slides and a PDF.
 *
 *   node scripts/build-pitchdeck.mjs
 *
 * Same pipeline as scripts/build-proposals.mjs: no PDF library, just headless
 * Chrome --print-to-pdf. Output lands in `pitchdeck/`.
 *
 * Audience: partners and connectors (e.g. Khairun at Sanbercode), not vendors.
 * The ask is introductions, not money, so the deck is weighted towards what
 * Dirory has already built on the supply side and what a partner can open doors
 * to.
 *
 * Figures come from the live database (brands, products, categories, usage) and
 * are labelled with the date they were read. The dashboard image is the demo
 * mock and is marked as an illustration; the two SketchUp screenshots are real.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "pitchdeck");
const ASSETS = path.join(OUT_DIR, "assets");
const SRC_ASSETS = path.join(ROOT, "proposals", "assets");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

// ---------------------------------------------------------------------------
// Figures read from the live database on 9 Oct 2026.
// Update these when the numbers move; the deck does not query at build time so
// that it stays a pure, reproducible document.
// ---------------------------------------------------------------------------
const TANGGAL = "Oktober 2026";
const DATA = {
  asOf: "9 Oktober 2026",
  brands: 15,
  products: 1355,
  materials: 1325,
  models: 30,
  categories: 36,
  architects: 53,
  installs: 7,
  snapshots: 62,
};

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------
const BRAND = "#2f3f96";
const BRAND_DARK = "#1f2b6b";
const INK = "#0f172a";
const MUTED = "#5b6478";

function css() {
  return `
    @page { size: 1280px 720px; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: ${INK};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slide {
      width: 1280px; height: 720px; padding: 52px 68px 62px;
      position: relative; overflow: hidden; page-break-after: always; background: #fff;
    }
    .slide:last-child { page-break-after: auto; }
    .kicker {
      display: inline-block; font-size: 14px; font-weight: 700; letter-spacing: 2.5px;
      text-transform: uppercase; color: ${BRAND}; margin: 0 0 6px;
    }
    .rule { height: 5px; width: 64px; background: ${BRAND}; border-radius: 3px; margin: 0 0 20px; }
    h1 { font-size: 46px; line-height: 1.1; margin: 6px 0 18px; letter-spacing: -0.8px; }
    h2 { font-size: 35px; line-height: 1.14; margin: 4px 0 18px; letter-spacing: -0.5px; }
    h3 { font-size: 20px; margin: 0 0 8px; color: ${BRAND}; }
    p { margin: 0 0 12px; font-size: 19px; line-height: 1.5; }
    .lead { font-size: 23px; line-height: 1.5; color: #414a60; }
    .small { font-size: 15px; }
    .muted { color: ${MUTED}; }
    .foot {
      position: absolute; left: 68px; right: 68px; bottom: 22px;
      border-top: 1px solid #eceef5; padding-top: 10px;
      display: flex; justify-content: space-between; font-size: 13px; color: #9aa1b2;
    }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }
    .cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
    .card { border: 1px solid #e2e6f0; border-radius: 14px; padding: 22px 24px; background: #fbfcff; }
    .card p { font-size: 16px; margin: 0; color: #3c4457; line-height: 1.5; }
    ul { margin: 0; padding-left: 22px; }
    li { font-size: 19px; line-height: 1.5; margin-bottom: 9px; }
    li.small { font-size: 16px; }
    .callout {
      border-left: 4px solid ${BRAND}; background: #f5f7fd; padding: 16px 20px;
      border-radius: 0 12px 12px 0;
    }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;
      color: ${MUTED}; border-bottom: 1px solid #e2e6f0; padding: 9px 12px;
    }
    td { padding: 12px; border-bottom: 1px solid #f0f2f8; font-size: 17px; vertical-align: top; }
    .price { font-weight: 700; white-space: nowrap; }
    .stat { border: 1px solid #e2e6f0; border-radius: 14px; padding: 20px 22px; background: #fbfcff; }
    .stat .n { font-size: 46px; font-weight: 700; color: ${BRAND}; line-height: 1; letter-spacing: -1px; }
    .stat .l { font-size: 15px; color: ${MUTED}; margin-top: 8px; line-height: 1.35; }
    .shot { border: 1px solid #e2e6f0; border-radius: 12px; overflow: hidden; }
    .shot img { display: block; width: 100%; }
    .cover { display: flex; flex-direction: column; justify-content: space-between;
             background: linear-gradient(160deg, #ffffff 0%, #f2f4fc 100%); }
    .cover-foot { font-size: 17px; color: ${BRAND_DARK}; font-weight: 600; }
    .ask { border: 1px solid #dfe4f4; border-radius: 16px; padding: 24px 26px; background: #f7f9ff; }
    .pill {
      display: inline-block; font-size: 14px; font-weight: 700; color: ${BRAND};
      background: #eef1fb; border-radius: 999px; padding: 6px 14px; margin: 0 8px 8px 0;
    }
  `;
}

function foot(n) {
  return `<div class="foot"><span>Dirory — pitch deck</span><span>${n}</span></div>`;
}

function slide(n, inner, opts = {}) {
  return `<section class="slide ${opts.cls ?? ""}">${inner}${opts.noFoot ? "" : foot(n)}</section>`;
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------
function buildHtml() {
  const cover = slide(
    0,
    `
    <div>
      <img src="assets/logo-vertical.png" alt="Dirory" style="width:200px">
    </div>
    <div>
      <p class="kicker" style="margin-bottom:10px">Pitch deck · ${TANGGAL}</p>
      <h1>Katalog produk bangunan Indonesia,<br>di dalam software desain arsitek.</h1>
      <p class="lead" style="max-width:820px">
        Arsitek memakai produk asli produsen Indonesia langsung di SketchUp.<br>
        Brand melihat produk mana yang benar-benar dipakai — bukan sekadar diunduh.
      </p>
    </div>
    <div class="cover-foot">
      dirory.com &nbsp;·&nbsp; hello@dirory.com &nbsp;·&nbsp; +62 857-1008-6041
    </div>
    `,
    { cls: "cover", noFoot: true },
  );

  const s2 = slide(
    2,
    `
    <p class="kicker">Masalah</p>
    <div class="rule"></div>
    <h2>Arsitek mencari produk dengan cara yang melelahkan.</h2>
    <div class="cols" style="margin-top:10px">
      <div>
        <h3>Yang dialami arsitek</h3>
        <ul>
          <li class="small">Membuka puluhan katalog PDF, situs brand, dan grup WhatsApp hanya untuk menemukan dimensi dan tekstur yang benar.</li>
          <li class="small">Model 3D di pustaka umum tidak mencerminkan produk yang benar-benar dijual di Indonesia.</li>
          <li class="small">Hasilnya: spesifikasi "kira-kira", revisi berulang, dan anggaran yang meleset.</li>
        </ul>
      </div>
      <div>
        <h3>Yang dialami brand</h3>
        <ul>
          <li class="small">Katalog masih berupa PDF dan cetakan. Produk tidak bisa langsung dipakai di gambar.</li>
          <li class="small">Brand tidak tahu produk mana yang benar-benar masuk ke proyek — hanya tahu berapa kali katalog diunduh.</li>
          <li class="small">Anggaran pemasaran keluar sebagai iklan, tanpa data pemakaian nyata.</li>
        </ul>
      </div>
    </div>
    <div class="callout" style="margin-top:22px">
      <strong>Unduhan bukan pemakaian.</strong> Sampai hari ini tidak ada cara bagi brand material
      Indonesia untuk tahu produk mana yang benar-benar masuk ke file proyek arsitek.
    </div>
    `,
  );

  const s3 = slide(
    3,
    `
    <p class="kicker">Solusi</p>
    <div class="rule"></div>
    <h2>Satu pustaka produk asli, di dalam SketchUp.</h2>
    <div class="cols3" style="margin-top:14px">
      <div class="card">
        <h3>Arsitek</h3>
        <p>Mencari dan memakai produk <strong>gratis</strong>. Cari, klik, dan produk masuk ke gambar — tanpa keluar dari software desainnya.</p>
      </div>
      <div class="card">
        <h3>Brand</h3>
        <p>Katalognya tayang di dalam SketchUp, dan setiap pemakaian <strong>tercatat</strong>: luas tercat, unit terpasang, dan permintaan penawaran.</p>
      </div>
      <div class="card">
        <h3>Dirory</h3>
        <p>Mengkurasi isi pustaka, menjaga mutu model, dan mengelola langganan brand.</p>
      </div>
    </div>
    <div class="callout" style="margin-top:26px">
      <strong>Yang membedakan Dirory:</strong> kami tidak menjual iklan atau tayangan.
      Kami mengukur <em>pemakaian</em> — berapa meter persegi material brand yang benar-benar
      tercat di proyek nyata.
    </div>
    `,
  );

  const s4 = slide(
    4,
    `
    <p class="kicker">Produk · sisi arsitek</p>
    <div class="rule"></div>
    <h2>Yang dilihat arsitek saat mencari produk.</h2>
    <div class="cols" style="grid-template-columns: 0.85fr 1.4fr; align-items:center; margin-top:8px">
      <div>
        <ul>
          <li class="small">Panel Dirory hidup di dalam SketchUp — arsitek tidak berpindah aplikasi.</li>
          <li class="small">Filter per kategori dan brand; material dan model dalam satu tempat.</li>
          <li class="small">Logo dan nama brand tampil di setiap kartu produk.</li>
          <li class="small">Katalog nyata, berisi produk brand yang sudah tayang.</li>
        </ul>
        <p class="small muted" style="margin-top:14px">Tangkapan layar asli dari plugin Dirory.</p>
      </div>
      <div class="shot" style="height:425px">
        <img src="assets/sketchup-search.png" alt="Panel pencarian Dirory di SketchUp" style="margin-top:-44px">
      </div>
    </div>
    `,
  );

  const s5 = slide(
    5,
    `
    <p class="kicker">Produk · pengukuran</p>
    <div class="rule"></div>
    <h2>Setiap pemakaian menjadi angka.</h2>
    <div class="cols" style="grid-template-columns: 0.85fr 1.4fr; align-items:center; margin-top:8px">
      <div>
        <ul>
          <li class="small"><strong>Luas tercat (m²)</strong> — berapa meter persegi material brand yang dipakai di proyek nyata.</li>
          <li class="small"><strong>Unit terpasang</strong> — berapa unit produk yang masuk ke gambar, per tipe.</li>
          <li class="small"><strong>Proyek &amp; kota</strong> — sebaran pemakaian.</li>
          <li class="small"><strong>Permintaan penawaran</strong> — arsitek yang siap membeli, hanya yang ia setujui bagikan.</li>
        </ul>
        <p class="small muted" style="margin-top:14px">Tangkapan layar asli: 21,82 m² tercat dari 3 brand dalam satu file.</p>
      </div>
      <div class="shot" style="height:419px">
        <img src="assets/sketchup-usage.png" alt="Tab Usage Dirory di SketchUp" style="margin-top:-44px">
      </div>
    </div>
    `,
  );

  const s6 = slide(
    6,
    `
    <p class="kicker">Produk · sisi brand</p>
    <div class="rule"></div>
    <h2>Untuk brand: dari katalog menjadi bukti.</h2>
    <div class="cols" style="grid-template-columns: 1.15fr 1fr; align-items:start; margin-top:8px">
      <div class="shot" style="height:352px">
        <img src="assets/dashboard.png" alt="Ilustrasi dashboard brand Dirory">
      </div>
      <div>
        <ul>
          <li class="small">Dashboard pemakaian: agregat dan anonim. Brand tidak melihat nama proyek atau identitas arsitek.</li>
          <li class="small">Kotak masuk permintaan penawaran, bisa diekspor ke tim sales.</li>
          <li class="small">Pangsa kategori: berapa persen pemakaian kategori yang memakai produknya.</li>
          <li class="small">Laporan bulanan siap diteruskan ke manajemen.</li>
        </ul>
        <p class="small muted" style="margin-top:12px">Dashboard di atas adalah ilustrasi; angka pada tangkapan layar SketchUp adalah data nyata.</p>
      </div>
    </div>
    `,
  );

  const stat = (n, l) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`;

  const s7 = slide(
    7,
    `
    <p class="kicker">Traksi</p>
    <div class="rule"></div>
    <h2>Yang sudah berjalan.</h2>
    <div class="cols" style="grid-template-columns: repeat(2, 1fr); gap: 22px; margin-top:6px">
      ${stat(DATA.brands, "brand material Indonesia sudah tayang")}
      ${stat(DATA.products.toLocaleString("id-ID"), "produk disetujui, siap dipakai arsitek")}
      ${stat(DATA.categories, "kategori produk — dari cat, keramik, HPL hingga sanitari dan pintu")}
      ${stat(DATA.architects, "akun arsitek terdaftar")}
    </div>
    <div class="cols" style="grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top:22px">
      ${stat(DATA.installs, "instalasi plugin aktif")}
      ${stat(DATA.snapshots, "snapshot pemakaian tercatat")}
      ${stat("100%", "organik — tanpa iklan berbayar")}
    </div>
    <p class="small muted" style="margin-top:20px">
      Data per ${DATA.asOf}, dibaca langsung dari basis data Dirory. Sisi pasokan sudah terbangun;
      fokus berikutnya menumbuhkan sisi arsitek.
    </p>
    `,
  );

  const s8 = slide(
    8,
    `
    <p class="kicker">Model bisnis</p>
    <div class="rule"></div>
    <h2>Arsitek gratis. Brand berlangganan.</h2>
    <table style="margin-top:6px">
      <thead><tr><th>Paket brand</th><th>Untuk</th><th>Bulanan</th><th>Tahunan</th></tr></thead>
      <tbody>
        <tr><td><strong>Starter</strong></td><td>Brand kecil, atau katalog awal — hingga 100 produk</td>
            <td class="price">Rp 500.000</td><td class="price">Rp 5.000.000</td></tr>
        <tr><td><strong>Growth</strong></td><td>Brand material dengan ratusan warna — hingga 500 produk</td>
            <td class="price">Rp 2.500.000</td><td class="price">Rp 25.000.000</td></tr>
        <tr><td><strong>Full Range</strong></td><td>Brand nasional — 500+ produk, prioritas penempatan</td>
            <td class="price" colspan="2">Penawaran khusus</td></tr>
      </tbody>
    </table>
    <div class="cols" style="margin-top:20px">
      <div class="card">
        <h3>Layanan digitalisasi (sekali bayar)</h3>
        <p>Material Rp 25.000–50.000 per produk (makin murah bila banyak); model Rp 400.000–2.500.000. Untuk brand yang belum punya file siap pakai.</p>
      </div>
      <div class="card">
        <h3>Mengapa berkelanjutan</h3>
        <p>Pendapatan berulang dari langganan tahunan. Semakin banyak brand tayang, semakin dalam katalognya, semakin bernilai bagi arsitek.</p>
      </div>
    </div>
    `,
  );

  const s9 = slide(
    9,
    `
    <p class="kicker">Peluang</p>
    <div class="rule"></div>
    <h2>Kategorinya sudah ada. Brandnya baru sebagian.</h2>
    <p class="lead" style="max-width:940px">
      Dirory tidak perlu menciptakan kategori baru. Dari ${DATA.categories} kategori yang sudah terisi,
      sebagian besar masih diisi satu atau dua brand.
    </p>
    <div class="cols3" style="margin-top:22px">
      <div class="card">
        <h3>Yang sudah dalam</h3>
        <p>Cat, keramik, HPL, sanitari, granit, dan plywood — beberapa brand dengan katalog terdalam sudah tayang.</p>
      </div>
      <div class="card">
        <h3>Ruang tumbuh</h3>
        <p>Setiap kategori punya puluhan brand material Indonesia yang belum masuk. Menambah brand berarti memperdalam katalog yang sama.</p>
      </div>
      <div class="card">
        <h3>Efek jaringan</h3>
        <p>Semakin lengkap katalog, semakin sering arsitek membuka Dirory. Semakin sering dipakai, semakin menarik bagi brand berikutnya.</p>
      </div>
    </div>
    <div class="callout" style="margin-top:24px">
      <strong>Posisi hari ini:</strong> sisi pasokan (brand &amp; produk) sudah terbangun secara organik.
      Yang perlu dipercepat adalah sisi permintaan: arsitek dan desainer yang memakai Dirory setiap hari.
    </div>
    `,
  );

  const s10 = slide(
    10,
    `
    <p class="kicker">Mengapa sekarang</p>
    <div class="rule"></div>
    <h2>Tiga hal yang membuat ini mungkin hari ini.</h2>
    <div class="cols3" style="margin-top:16px">
      <div class="card">
        <h3>1. Alatnya sudah dipakai</h3>
        <p>SketchUp sudah menjadi alat kerja sehari-hari bagi arsitek dan desainer interior di Indonesia. Dirory masuk ke alur kerja yang sudah ada, bukan menuntut alat baru.</p>
      </div>
      <div class="card">
        <h3>2. Brand menuntut data</h3>
        <p>Anggaran pemasaran material bergeser dari cetak dan iklan ke saluran yang bisa diukur. Dirory memberi angka yang selama ini tidak ada.</p>
      </div>
      <div class="card">
        <h3>3. Belum ada yang mengukur</h3>
        <p>Pustaka 3D umum berisi model generik tanpa brand. Dirory adalah katalog produk asli yang sekaligus mengukur pemakaiannya.</p>
      </div>
    </div>
    `,
  );

  const s11 = slide(
    11,
    `
    <p class="kicker">Diferensiasi</p>
    <div class="rule"></div>
    <h2>Bukan pustaka 3D biasa.</h2>
    <table style="margin-top:6px">
      <thead><tr><th>Alternatif</th><th>Kuat di</th><th>Lemah di</th></tr></thead>
      <tbody>
        <tr><td>Pustaka 3D umum</td><td>Banyak model gratis</td><td>Model generik, bukan produk Indonesia, tanpa data pemakaian</td></tr>
        <tr><td>Katalog PDF brand</td><td>Lengkap secara visual</td><td>Tidak bisa dimasukkan ke gambar; tidak ada data</td></tr>
        <tr><td>Maket / material board</td><td>Meyakinkan secara fisik</td><td>Terbatas, tidak terukur, tidak terhubung ke gambar kerja</td></tr>
        <tr style="background:#f5f7fd">
          <td><strong>Dirory</strong></td>
          <td><strong>Produk asli masuk ke gambar + data pemakaian</strong></td>
          <td>Katalog perlu terus diperdalam</td>
        </tr>
      </tbody>
    </table>
    `,
  );

  const sTeam = slide(
    12,
    `
    <p class="kicker">Tim</p>
    <div class="rule"></div>
    <h2>Dibangun oleh seorang arsitek.</h2>
    <div class="cols" style="grid-template-columns: 330px 1fr; gap:46px; align-items:start; margin-top:10px">
      <div>
        <div style="width:330px; height:372px; border-radius:16px; overflow:hidden; border:1px solid #e2e6f0">
          <img src="assets/founder.jpg" alt="Rendy Noor Chandra" style="width:100%; height:100%; object-fit:cover; object-position:center top">
        </div>
        <h3 style="margin-top:16px; font-size:23px; margin-bottom:2px">Rendy Noor Chandra</h3>
        <p style="color:${BRAND}; font-weight:600; margin:0; font-size:16px">Founder · Arsitek &amp; spesialis BIM</p>
      </div>
      <div>
        <h3>Mengapa ini penting bagi Dirory</h3>
        <ul style="margin-top:8px">
          <li class="small">Dirory dibangun oleh orang yang memakai SketchUp dan alur kerja BIM setiap hari — bukan pihak luar yang menebak kebutuhan arsitek.</li>
          <li class="small">Pengalaman merancang bangunan dari skala kecil hingga gedung bertingkat berarti memahami bagaimana spesifikasi produk benar-benar dipakai di proyek nyata.</li>
          <li class="small">Produk, plugin, katalog, dan sistemnya dibangun langsung oleh founder.</li>
        </ul>
        <div class="callout" style="margin-top:20px">
          <strong>Founder tunggal.</strong> Semua keputusan dan eksekusi ada di satu tangan — cepat
          diambil, langsung dikerjakan. Yang Dirory butuhkan berikutnya bukan tim, melainkan
          jangkauan: kemitraan untuk membuka pintu.
        </div>
      </div>
    </div>
    `,
  );

  const s13 = slide(
    13,
    `
    <p class="kicker">Cara kami tumbuh</p>
    <div class="rule"></div>
    <h2>Dua sisi yang saling menguatkan.</h2>
    <div class="cols" style="margin-top:14px">
      <div>
        <h3>Sisi pasokan — brand</h3>
        <ul>
          <li class="small">Onboarding brand secara organik dan melalui kemitraan.</li>
          <li class="small">Pilot gratis untuk brand pertama: digitalisasi dan masa tayang tanpa biaya.</li>
          <li class="small">Fokus pada brand dengan katalog dalam (ratusan SKU).</li>
        </ul>
      </div>
      <div>
        <h3>Sisi permintaan — arsitek</h3>
        <ul>
          <li class="small">Komunitas arsitek dan desainer interior.</li>
          <li class="small">Kampus dan program pendidikan desain.</li>
          <li class="small">Katalog yang makin lengkap menarik pemakaian berulang.</li>
        </ul>
      </div>
    </div>
    <div class="callout" style="margin-top:24px">
      <strong>Inilah bagian yang paling terbantu oleh kemitraan.</strong> Pembukaan pintu ke
      brand dan komunitas arsitek jauh lebih cepat daripada menjangkau satu per satu.
    </div>
    `,
  );

  const s14 = slide(
    14,
    `
    <p class="kicker">Yang kami butuhkan</p>
    <div class="rule"></div>
    <h2>Perkenalan, bukan pendanaan.</h2>
    <p class="lead" style="max-width:980px">
      Dirory sedang mencari mitra yang dapat membuka pintu — bukan investor.
    </p>
    <div style="margin-top:18px">
      <span class="pill">Perkenalan ke brand material</span>
      <span class="pill">Asosiasi &amp; komunitas arsitek</span>
      <span class="pill">Kampus desain</span>
      <span class="pill">Mitra distribusi</span>
      <span class="pill">Event industri</span>
    </div>
    <div class="cols" style="margin-top:24px">
      <div class="ask">
        <h3>Idealnya brand seperti apa</h3>
        <p class="small" style="margin:0;color:#3c4457">Brand material bangunan dengan katalog dalam (ratusan SKU) — cat, keramik, HPL, sanitari, pintu, granit — yang ingin tahu produknya benar-benar dipakai di proyek.</p>
      </div>
      <div class="ask">
        <h3>Yang kami siapkan</h3>
        <p class="small" style="margin:0;color:#3c4457">Demo langsung di SketchUp, pilot tanpa biaya untuk brand pertama, dan laporan pemakaian yang bisa dibawa ke rapat manajemen.</p>
      </div>
    </div>
    `,
  );

  const s15 = slide(
    15,
    `
    <p class="kicker">Terima kasih</p>
    <div class="rule"></div>
    <h2>Mari mulai dari satu percakapan.</h2>
    <p class="lead" style="max-width:880px">
      Kami dapat mendemonstrasikan Dirory langsung di SketchUp dalam 30 menit,
      memakai produk brand yang relevan.
    </p>
    <div style="margin-top:26px; font-size:22px; line-height:1.9">
      <div><strong>WhatsApp</strong> &nbsp; +62 857-1008-6041</div>
      <div><strong>Email</strong> &nbsp; hello@dirory.com</div>
      <div><strong>Situs</strong> &nbsp; dirory.com &nbsp;·&nbsp; dirory.com/vendor</div>
    </div>
    <p class="small muted" style="margin-top:34px">
      Dirory — katalog produk bangunan Indonesia, di dalam software desain arsitek.
      Data traksi per ${DATA.asOf}.
    </p>
    `,
  );

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Dirory — Pitch Deck</title>
<style>${css()}</style></head><body>
${cover}
${s2}
${s3}
${s4}
${s5}
${s6}
${s7}
${s8}
${s9}
${s10}
${s11}
${sTeam}
${s13}
${s14}
${s15}
</body></html>`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
function chromePath() {
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

function ensureAssets() {
  fs.mkdirSync(ASSETS, { recursive: true });
  for (const name of [
    "logo-vertical.png",
    "mark.png",
    "sketchup-search.png",
    "sketchup-usage.png",
    "dashboard.png",
  ]) {
    const from = path.join(SRC_ASSETS, name);
    const to = path.join(ASSETS, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, to);
    else console.warn(`  missing source asset: ${name}`);
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  ensureAssets();

  const html = buildHtml();
  const htmlPath = path.join(OUT_DIR, "dirory-pitchdeck.html");
  const pdfPath = path.join(OUT_DIR, "dirory-pitchdeck.pdf");
  fs.writeFileSync(htmlPath, html, "utf8");

  const chrome = chromePath();
  if (!chrome) {
    console.log("  Chrome not found; wrote HTML only:", htmlPath);
    return;
  }

  execFileSync(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      "file:///" + htmlPath.replace(/\\/g, "/"),
    ],
    { stdio: "ignore" },
  );

  const kb = Math.round(fs.statSync(pdfPath).size / 1024);
  console.log(`  Dirory pitch deck   dirory-pitchdeck.pdf  (${kb} KB)`);
  console.log("\nDone. Open pitchdeck/dirory-pitchdeck.pdf");
}

main();
