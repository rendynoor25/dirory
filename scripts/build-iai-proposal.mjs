#!/usr/bin/env node
/**
 * Build the Dirory proposal for IAI Jawa Barat (the Indonesian Institute of
 * Architects, West Java chapter).
 *
 *   node scripts/build-iai-proposal.mjs
 *
 * This is **not** a vendor proposal and deliberately does not reuse
 * `build-proposals.mjs`. That document sells a subscription: it quotes packages,
 * offers a digitization pilot, and argues a brand should pay. Every one of those
 * things is wrong here — the audience is architects, and for them Dirory is free.
 * Sending a price list to an association of architects would be a category error.
 *
 * What this argues instead: the tool removes two specific pieces of friction an
 * architect lives with every day — models that are not the product actually sold
 * in Indonesia, and quantities counted by hand — and it costs the architect
 * nothing. The ask is a working relationship with the chapter, not a sale.
 *
 * Output: proposals/iai-jawa-barat.{html,pdf}. Same pipeline as everything else:
 * HTML plus headless Chrome, no PDF library.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "proposals");
const ASSETS = path.join(OUT_DIR, "assets");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

// Read from the live catalogue on 12 Oct 2026. Kept here rather than queried, so
// the document is reproducible; update when the numbers move.
const DATA = {
  products: "1.360",
  brands: "12",
  categories: "38",
  asOf: "Oktober 2026",
};

const RECIPIENT = {
  name: "Bapak Ar. Adrian Santoso, IAI",
  role: "Ketua",
  org: "Ikatan Arsitek Indonesia — Jawa Barat",
};

const WHATSAPP = "+62 857-1008-6041";
const EMAIL = "hello@dirory.com";

const BRAND = "#2f3f96";
const INK = "#0f172a";
const MUTED = "#5b6478";

function css() {
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: ${INK}; font-size: 10.5pt; line-height: 1.55;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .page {
      width: 210mm; min-height: 297mm; padding: 18mm 17mm 16mm;
      page-break-after: always; position: relative;
    }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 26pt; line-height: 1.15; margin: 0 0 6mm; letter-spacing: -0.4pt; }
    h2 { font-size: 15pt; margin: 0 0 3mm; letter-spacing: -0.2pt; }
    h3 { font-size: 11pt; margin: 0 0 1.5mm; }
    p  { margin: 0 0 3mm; }
    .lead { font-size: 12pt; color: ${MUTED}; line-height: 1.6; }
    .muted { color: ${MUTED}; }
    .small { font-size: 9pt; }
    .tag {
      display: inline-block; font-size: 8.5pt; font-weight: 700; letter-spacing: 1.2pt;
      text-transform: uppercase; color: ${BRAND}; margin-bottom: 3mm;
    }
    .rule { height: 3px; background: ${BRAND}; width: 42px; border-radius: 2px; margin: 0 0 6mm; }
    .cover { display: flex; flex-direction: column; justify-content: space-between; height: 100%; }
    .cover-logo img { width: 62mm; }
    .cover-foot { border-top: 1px solid #e2e6f0; padding-top: 5mm; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; }
    .card { border: 1px solid #e2e6f0; border-radius: 3mm; padding: 5mm; background: #fbfcff; break-inside: avoid; }
    .card h3 { color: ${BRAND}; }
    .step { display: grid; grid-template-columns: 9mm 1fr; gap: 4mm; margin-bottom: 4mm; break-inside: avoid; }
    .step .n {
      width: 9mm; height: 9mm; border-radius: 50%; background: ${BRAND}; color: #fff;
      font-weight: 700; font-size: 10pt; display: flex; align-items: center; justify-content: center;
    }
    table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm; }
    th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.6pt;
         color: ${MUTED}; border-bottom: 1px solid #e2e6f0; padding: 2mm 3mm; }
    td { padding: 2.6mm 3mm; border-bottom: 1px solid #f0f2f8; vertical-align: top; }
    tr { break-inside: avoid; }
    .pill { display: inline-block; font-size: 8.5pt; font-weight: 700; background: #eef1fb;
            color: ${BRAND}; border-radius: 20px; padding: 1mm 3mm; }
    .callout { border-left: 3px solid ${BRAND}; background: #f5f7fd; padding: 4mm 5mm;
               border-radius: 0 3mm 3mm 0; margin: 4mm 0; }
    .stat { border: 1px solid #e2e6f0; border-radius: 3mm; padding: 4mm; background: #fbfcff; }
    .stat .n { font-size: 22pt; font-weight: 700; color: ${BRAND}; line-height: 1; letter-spacing: -0.5pt; }
    .stat .l { font-size: 9pt; color: ${MUTED}; margin-top: 2mm; }
    .shotwrap { border: 1px solid #e2e6f0; border-radius: 3mm; overflow: hidden; margin: 4mm 0 3mm; }
    .shotwrap img { display: block; width: 100%; }
    .foot { position: absolute; left: 17mm; right: 17mm; bottom: 10mm;
            border-top: 1px solid #e2e6f0; padding-top: 2.5mm;
            font-size: 8pt; color: ${MUTED}; display: flex; justify-content: space-between; }
  `;
}

const foot = (page) =>
  `<div class="foot"><span>Dirory — usulan kerja sama IAI Jawa Barat</span><span>${page}</span></div>`;

function buildHtml(tanggal) {
  const search = "assets/sketchup-search.png";
  const usage = "assets/sketchup-usage.png";

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Dirory — Usulan kerja sama IAI Jawa Barat</title>
<style>${css()}</style></head><body>

<!-- ============================ COVER ============================ -->
<section class="page">
  <div class="cover">
    <div>
      <div class="cover-logo"><img src="assets/logo-vertical.png" alt="Dirory"></div>
      <div class="rule" style="margin-top:10mm"></div>
      <p class="tag">Usulan kerja sama</p>
      <h1>Pustaka produk bangunan Indonesia,<br>gratis untuk arsitek.</h1>
      <p class="lead">
        Dirory menempatkan produk asli produsen Indonesia di dalam SketchUp: dimensi
        yang tepat, dan jumlah yang bisa dihitung sendiri. Tidak ada biaya untuk
        arsitek — sekarang maupun nanti.
      </p>
    </div>
    <div class="cover-foot">
      <table style="margin:0">
        <tr><td style="border:0;padding:1mm 0;width:32mm" class="muted">Disiapkan untuk</td>
            <td style="border:0;padding:1mm 0"><strong>${RECIPIENT.name}</strong><br>
            <span class="muted small">${RECIPIENT.role} · ${RECIPIENT.org}</span></td></tr>
        <tr><td style="border:0;padding:1mm 0" class="muted">Tanggal</td>
            <td style="border:0;padding:1mm 0">${tanggal}</td></tr>
        <tr><td style="border:0;padding:1mm 0" class="muted">Sifat</td>
            <td style="border:0;padding:1mm 0">Usulan kemitraan — tanpa biaya bagi anggota</td></tr>
      </table>
    </div>
  </div>
</section>

<!-- ============================ MASALAH ============================ -->
<section class="page">
  <p class="tag">01 · Dua hal yang memakan waktu arsitek</p>
  <div class="rule"></div>
  <h2>Model yang "kira-kira", dan hitungan yang manual.</h2>

  <div class="grid2" style="margin-top:6mm">
    <div class="card">
      <h3>1. Produknya tidak ada di SketchUp</h3>
      <p class="small">
        Untuk memakai produk yang benar-benar dijual di Indonesia, arsitek membuka
        katalog PDF, situs produsen, dan grup WhatsApp — lalu memodelkannya sendiri
        dari nol, atau memakai bentuk umum yang mirip saja.
      </p>
      <p class="small muted" style="margin:0">
        Akibatnya dimensi meleset, dan gambar tidak cocok dengan barang yang akan
        dibeli.
      </p>
    </div>
    <div class="card">
      <h3>2. Menghitung jumlahnya dilakukan dengan tangan</h3>
      <p class="small">
        Berapa meter persegi keramik, berapa luasan cat, berapa unit saniter yang
        terpasang — dihitung manual dari gambar, lalu dituangkan lagi ke lembar
        perhitungan.
      </p>
      <p class="small muted" style="margin:0">
        Pekerjaan yang berulang, mudah salah, dan tidak pernah tercatat sebagai data
        yang bisa dipakai kembali.
      </p>
    </div>
  </div>

  <div class="callout" style="margin-top:8mm">
    <strong>Keduanya berasal dari satu hal:</strong> produk asli produsen tidak pernah
    masuk ke dalam file desain. Dirory memindahkan katalog ke tempat keputusan itu
    dibuat — di dalam SketchUp.
  </div>
  ${foot("2")}
</section>

<!-- ============================ APA ITU ============================ -->
<section class="page">
  <p class="tag">02 · Apa itu Dirory</p>
  <div class="rule"></div>
  <h2>Satu pustaka produk, di dalam SketchUp.</h2>
  <p class="lead">
    Dirory adalah pustaka produk bangunan yang berjalan sebagai panel di dalam
    SketchUp. Cari, klik, dan produk masuk ke gambar — beserta dimensi yang
    dikirimkan produsennya.
  </p>

  <div class="grid3" style="margin-top:8mm">
    <div class="card">
      <h3>Untuk arsitek</h3>
      <p class="small">Mencari dan memakai produk <strong>gratis</strong>. Tanpa biaya,
      tanpa iklan, tanpa batas jumlah pemakaian.</p>
    </div>
    <div class="card">
      <h3>Yang ada di dalamnya</h3>
      <p class="small">Produk asli produsen Indonesia: model 3D dengan dimensi, dan
      material untuk permukaan.</p>
    </div>
    <div class="card">
      <h3>Yang mengurus</h3>
      <p class="small">Dirory memeriksa skala dan penamaan setiap produk sebelum
      tayang, agar yang masuk ke gambar layak dipakai.</p>
    </div>
  </div>

  <h3 style="margin-top:8mm">Bedanya dengan pustaka model yang sudah ada</h3>
  <table>
    <thead><tr><th>Pustaka model umum</th><th>Dirory</th></tr></thead>
    <tbody>
      <tr><td>Bentuk umum yang "mirip"</td><td>Produk yang benar-benar dijual, dengan nama merek dan tipe</td></tr>
      <tr><td>Dimensi sering tidak akurat</td><td>Dimensi dari produsennya</td></tr>
      <tr><td>Tidak ada hubungan dengan barang yang dibeli</td><td>Satu produk = satu SKU yang bisa dipesan</td></tr>
      <tr><td>Tidak ada jumlah, harus dihitung manual</td><td>Luas dan unit dihitung dari gambar</td></tr>
    </tbody>
  </table>
  ${foot("3")}
</section>

<!-- ============================ CARA PAKAI ============================ -->
<section class="page">
  <p class="tag">03 · Cara memakainya</p>
  <div class="rule"></div>
  <h2>Empat langkah, tanpa keluar dari SketchUp.</h2>

  <div style="margin-top:5mm">
    <div class="step"><div class="n">1</div><div>
      <h3>Pasang plugin</h3>
      <p class="small">Sekali saja, dari dirory.com. Ringan, dan memperbarui dirinya
      sendiri bila ada versi baru.</p></div></div>

    <div class="step"><div class="n">2</div><div>
      <h3>Cari produknya</h3>
      <p class="small">Berdasarkan nama, kategori, atau merek. Hasilnya muncul sebagai
      kartu berisi gambar dan nama produk.</p></div></div>

    <div class="step"><div class="n">3</div><div>
      <h3>Masukkan ke gambar</h3>
      <p class="small">Model ditempatkan dengan dimensi aslinya; material diambil
      sebagai tekstur dan langsung dipakai mengecat permukaan.</p></div></div>

    <div class="step"><div class="n">4</div><div>
      <h3>Lihat jumlahnya</h3>
      <p class="small">Tab <em>Usage</em> menghitung sendiri: berapa unit terpasang,
      dan berapa meter persegi material yang terpakai.</p></div></div>
  </div>

  <div class="callout">
    <strong>Tidak ada yang dikirim keluar.</strong> Nama proyek adalah urusan Anda.
    Angka pemakaian dihitung tanpa nama proyek dan tanpa identitas arsitek; produsen
    hanya melihat jumlah, bukan pekerjaan siapa.
  </div>
  ${foot("4")}
</section>

<!-- ============================ CARI (screenshot) ============================ -->
<section class="page">
  <p class="tag">04 · Di dalam SketchUp</p>
  <div class="rule"></div>
  <h2>Produk asli, langsung di panel SketchUp.</h2>
  <p class="lead">
    Panel Dirory menyaring berdasarkan kategori dan merek. Yang muncul adalah produk
    yang sudah tayang, lengkap dengan merek dan tipenya.
  </p>
  <div class="shotwrap" style="height:108.6mm">
    <img src="${search}" alt="Panel pencarian Dirory di SketchUp" style="margin-top:-11.2mm">
  </div>
  <p class="small muted">
    Tangkapan layar asli dari plugin Dirory yang berjalan di SketchUp.
  </p>
  ${foot("5")}
</section>

<!-- ============================ KUANTIFIKASI (screenshot) ============================ -->
<section class="page">
  <p class="tag">05 · Kuantifikasi</p>
  <div class="rule"></div>
  <h2>Hitungan yang selama ini manual, dikerjakan sendiri.</h2>
  <p class="lead">
    Setiap kali sebuah model ditempatkan atau sebuah material dipakai mengecat, Dirory
    mencatatnya. Tab <em>Usage</em> menampilkan hasilnya per merek dan per material.
  </p>
  <div class="shotwrap" style="height:107mm">
    <img src="${usage}" alt="Tab Usage Dirory di SketchUp" style="margin-top:-11.2mm">
  </div>
  <div class="grid2" style="margin-top:2mm">
    <div class="card">
      <h3>Luas tercat (m²)</h3>
      <p class="small">Untuk material: berapa meter persegi yang benar-benar terpakai —
      keramik, cat, HPL, dan material lembaran lain.</p>
    </div>
    <div class="card">
      <h3>Unit terpasang</h3>
      <p class="small">Untuk model: berapa buah yang masuk ke gambar — saniter, pintu,
      jendela, dan seterusnya.</p>
    </div>
  </div>
  <p class="small muted">
    Tangkapan layar asli: 21,82 m² terpakai dari tiga merek dalam satu file.
    Datanya juga bisa diekspor ke CSV.
  </p>
  ${foot("6")}
</section>

<!-- ============================ ISI PUSTAKA ============================ -->
<section class="page">
  <p class="tag">06 · Isi pustaka hari ini</p>
  <div class="rule"></div>
  <h2>Sudah terisi, dan terus bertambah.</h2>
  <p class="lead">
    Pustaka bukan janji — katalognya sudah berjalan, dan tumbuh dari permintaan
    arsitek sendiri: bila sebuah produk dicari dan tidak ada, itu dicatat dan
    diupayakan masuk.
  </p>

  <div class="grid3" style="margin-top:8mm">
    <div class="stat"><div class="n">${DATA.products}</div><div class="l">produk tayang</div></div>
    <div class="stat"><div class="n">${DATA.brands}</div><div class="l">merek produsen Indonesia</div></div>
    <div class="stat"><div class="n">${DATA.categories}</div><div class="l">kategori, dari cat hingga saniter dan keramik</div></div>
  </div>

  <h3 style="margin-top:9mm">Kategori yang sudah terisi</h3>
  <p class="small">
    <span class="pill">Cat</span> <span class="pill">Keramik &amp; granit</span>
    <span class="pill">HPL</span> <span class="pill">Saniter</span>
    <span class="pill">Pintu &amp; jendela</span> <span class="pill">Kaca &amp; cermin</span>
    <span class="pill">Batu alam</span> <span class="pill">Bata &amp; beton</span>
    <span class="pill">Rangka atap &amp; penutup atap</span> <span class="pill">Langit-langit &amp; papan</span>
    <span class="pill">Kayu</span> <span class="pill">Logam</span>
    <span class="pill">Wallpaper</span> <span class="pill">Furnitur &amp; kabinet</span>
    <span class="pill">Pencahayaan</span> <span class="pill">Partisi</span>
  </p>

  <div class="callout" style="margin-top:7mm">
    <strong>Permintaan anggota menentukan isi pustaka.</strong> Kategori yang paling
    sering dicari tapi belum ada akan diprioritaskan untuk dimasukkan. Ini bagian
    yang paling terbantu oleh kemitraan dengan IAI.
  </div>
  ${foot("7")}
</section>

<!-- ============================ GRATIS ============================ -->
<section class="page">
  <p class="tag">07 · Kenapa gratis</p>
  <div class="rule"></div>
  <h2>Arsitek tidak membayar. Produsen yang membayar.</h2>
  <p class="lead">
    Pustaka produk seperti ini hanya berguna bila arsitek memakainya tanpa berpikir
    dua kali soal biaya. Karena itu Dirory tidak membebankan apa pun kepada arsitek —
    dan tidak menjual iklan di dalam panel.
  </p>

  <table>
    <thead><tr><th></th><th>Arsitek</th><th>Produsen / merek</th></tr></thead>
    <tbody>
      <tr><td>Mencari produk</td><td>Gratis, tanpa akun</td><td>—</td></tr>
      <tr><td>Memasukkan produk ke gambar</td><td>Gratis</td><td>—</td></tr>
      <tr><td>Menghitung luas &amp; unit</td><td>Gratis</td><td>—</td></tr>
      <tr><td>Menayangkan katalog</td><td>—</td><td>Berlangganan</td></tr>
      <tr><td>Melihat data pemakaian</td><td>—</td><td>Termasuk langganan</td></tr>
    </tbody>
  </table>

  <div class="callout">
    <strong>Tidak ada jual-beli data.</strong> Produsen tidak dapat melihat nama
    proyek, identitas arsitek, maupun pekerjaan Anda — pembatasannya ada di tingkat
    basis data, bukan sekadar janji. Yang mereka lihat hanya jumlah: berapa unit dan
    berapa meter persegi, secara agregat.
  </div>
  ${foot("8")}
</section>

<!-- ============================ USULAN KERJA SAMA ============================ -->
<section class="page">
  <p class="tag">08 · Usulan kerja sama</p>
  <div class="rule"></div>
  <h2>Yang kami usulkan kepada IAI Jawa Barat.</h2>
  <p class="lead">
    Usulan ini tidak meminta biaya, dan tidak meminta IAI menjual apa pun kepada
    anggotanya. Yang kami minta adalah kesempatan memperkenalkannya kepada anggota,
    dan masukan mereka sebagai penentu arah pengembangan pustaka.
  </p>

  <div style="margin-top:6mm">
    <div class="step"><div class="n">1</div><div>
      <h3>Sosialisasi kepada anggota</h3>
      <p class="small">Satu sesi daring atau tatap muka kepada anggota Jawa Barat.
      Durasi 30–45 menit, dengan contoh langsung di SketchUp.</p></div></div>

    <div class="step"><div class="n">2</div><div>
      <h3>Pelatihan singkat</h3>
      <p class="small">Panduan memakai panel Dirory dan membaca tab <em>Usage</em> —
      termasuk cara memanfaatkan angkanya untuk perhitungan sendiri.</p></div></div>

    <div class="step"><div class="n">3</div><div>
      <h3>Masukan anggota jadi prioritas</h3>
      <p class="small">Produk dan kategori yang paling sering dicari tapi belum ada
      akan diupayakan lebih dulu. Ini jalur langsung antara anggota dan isi pustaka.</p></div></div>

    <div class="step"><div class="n">4</div><div>
      <h3>Pengakuan sebagai mitra</h3>
      <p class="small">Bila IAI berkenan, kerja sama ini kami cantumkan sebagai
      kemitraan resmi dengan IAI Jawa Barat.</p></div></div>
  </div>

  <div class="callout">
    <strong>Yang kami minta dari IAI:</strong> kesediaan memperkenalkan, dan izin
    memakai nama IAI Jawa Barat sebagai mitra. Selebihnya kami kerjakan.
  </div>
  ${foot("9")}
</section>

<!-- ============================ PENUTUP ============================ -->
<section class="page">
  <p class="tag">09 · Langkah selanjutnya</p>
  <div class="rule"></div>
  <h2>Mari kita mulai dari satu percakapan.</h2>
  <p class="lead">
    Kami dapat mendemonstrasikan Dirory langsung di SketchUp dalam 30 menit,
    memakai produk yang biasa dipakai anggota Anda.
  </p>

  <div class="grid2" style="margin-top:6mm">
    <div class="card">
      <h3>Demo 30 menit</h3>
      <p class="small">Kami perlihatkan panel Dirory di SketchUp, cara memasukkan
      produk, dan cara membaca hitungan luas serta unitnya. Cukup satu laptop dengan
      Zoom/Meet.</p>
    </div>
    <div class="card">
      <h3>Sesi untuk anggota</h3>
      <p class="small">Bila dirasa bermanfaat setelah demo, kami siap
      menyelenggarakannya untuk anggota Jawa Barat — tanpa biaya untuk IAI maupun
      anggota.</p>
    </div>
  </div>

  <h3 style="margin-top:8mm">Hubungi</h3>
  <table>
    <tr><td style="width:38mm" class="muted">WhatsApp</td><td><strong>${WHATSAPP}</strong></td></tr>
    <tr><td class="muted">Email</td><td>${EMAIL}</td></tr>
    <tr><td class="muted">Situs</td><td>dirory.com</td></tr>
  </table>

  <p class="small muted" style="margin-top:8mm">
    Proposal ini disiapkan untuk ${RECIPIENT.name} — ${RECIPIENT.role}, ${RECIPIENT.org}.
    Tangkapan layar diambil langsung dari plugin Dirory yang berjalan di SketchUp,
    bukan mockup. Angka pustaka per ${DATA.asOf}.
  </p>
  ${foot("10")}
</section>

</body></html>`;
}

function chromePath() {
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(ASSETS)) {
    console.error(`Missing ${ASSETS}. The proposals' assets are shared with this one.`);
    process.exit(1);
  }

  const tanggal = new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date());
  const html = buildHtml(tanggal);
  const htmlPath = path.join(OUT_DIR, "iai-jawa-barat.html");
  const pdfPath = path.join(OUT_DIR, "iai-jawa-barat.pdf");
  fs.writeFileSync(htmlPath, html, "utf8");

  const chrome = chromePath();
  if (!chrome) {
    console.log("  Chrome not found; wrote HTML only:", htmlPath);
    return;
  }
  const tmpPath = pdfPath.replace(/\.pdf$/i, ".new.pdf");
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--no-sandbox",
      `--user-data-dir=${path.join(OUT_DIR, ".chrome-profile")}`,
      `--print-to-pdf=${tmpPath}`,
      "file:///" + htmlPath.replace(/\\/g, "/"),
    ],
    { stdio: "pipe" },
  );
  try {
    fs.renameSync(tmpPath, pdfPath);
  } catch {
    try {
      fs.copyFileSync(tmpPath, pdfPath);
      fs.rmSync(tmpPath, { force: true });
    } catch {
      console.log(`  LOCKED — wrote ${path.basename(tmpPath)} instead. Close the open PDF and re-run.`);
      return;
    }
  }
  console.log(`  IAI Jawa Barat   iai-jawa-barat.pdf  (${Math.round(fs.statSync(pdfPath).size / 1024)} KB)`);
  console.log("\nDone. Open proposals/iai-jawa-barat.pdf");
}

main();
