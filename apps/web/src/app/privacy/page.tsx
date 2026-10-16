import Link from "next/link";
import { DIRORY_EMAIL, formatWhatsApp, whatsAppLink } from "@/lib/contact";
import { getLocale } from "@/lib/locale-server";
import { LanguageToggle } from "@/components/LanguageToggle";
import type { Locale } from "@/lib/i18n";

export const metadata = {
  title: "Privacy Policy",
  description: "How Dirory handles personal data in the website, the SketchUp plugin and the Revit add-in.",
};

/**
 * Dirory Privacy Policy, version 1.0, under UU No. 27 Tahun 2022 (UU PDP).
 *
 * Every statement here describes what the software does today; check the
 * code before changing a claim. Plain ASCII on purpose: earlier edits of this
 * file were corrupted by a tool that round-tripped the encoding.
 *
 * A material change (new data, new purpose, new recipient) needs a new
 * version below AND a new PLUGIN_CONSENT_VERSION (lib/consent.ts), so the
 * download page and the plugin ask everyone again.
 */
const VERSION = "1.1";

type Section = { h: string; p?: string[]; list?: string[] };

function sections(locale: Locale, email: string, whatsapp: string): { lead: string; effective: string; items: Section[] } {
  if (locale === "id") {
    return {
      lead:
        "Kebijakan ini menjelaskan data pribadi apa yang diproses Dirory, untuk apa, atas dasar apa, berapa lama, dengan siapa dibagikan, dan bagaimana Anda menggunakan hak Anda berdasarkan Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).",
      effective: `Versi ${VERSION}, berlaku sejak 16 Oktober 2026.`,
      items: [
        {
          h: "1. Pengendali data",
          p: [
            `Dirory dioperasikan oleh Rendy Noor Chandra, Indonesia, yang bertindak sebagai pengendali data pribadi. Kontak untuk semua urusan data pribadi: ${email} (subjek "Permintaan privasi") atau WhatsApp ${whatsapp}.`,
          ],
        },
        {
          h: "2. Cakupan",
          p: [
            "Kebijakan ini berlaku untuk situs dirory.com, plugin Dirory untuk SketchUp, add-in Dirory untuk Revit, portal vendor, dan langganan Dirory Pro.",
          ],
        },
        {
          h: "3. Data yang kami proses, tujuan, dan dasar pemrosesan",
          list: [
            "Akun: alamat email dan nama (dari tautan masuk email atau Google). Tujuan: menyediakan akun dan layanan. Dasar: pelaksanaan perjanjian.",
            "Data opsional: pekerjaan, kota, dan provinsi, hanya jika Anda mengisinya. Hanya dipakai secara agregat dan tidak pernah ditunjukkan ke merek. Dasar: persetujuan.",
            "Data instalasi: ID instalasi acak, versi plugin, versi SketchUp, sistem operasi, dan waktu terakhir aktif. Tujuan: dukungan, pembaruan, dan keamanan. Dasar: kepentingan yang sah.",
            "Laporan pemakaian, hanya jika Anda memilih \"Bagikan pemakaian\": produk Dirory yang dipakai di model yang terbuka (nama, kategori, merek, jumlah, luas yang dicat) dan ID model SketchUp. Nama proyek hanya jika Anda memilihnya secara terpisah. Penghitung kesehatan plugin (jumlah dan kegagalan pemuatan) ikut pilihan yang sama. Tidak pernah geometri, berkas, atau lokasi berkas. Dasar: persetujuan.",
            "Pencarian tanpa hasil, hanya jika \"Laporkan pencarian yang tidak menemukan apa pun\" aktif: hanya kata pencarian. Email dan nomor telepon dihapus otomatis, dan tidak disimpan bersama akun atau ID instalasi Anda. Dasar: persetujuan; Anda dapat mematikannya kapan saja.",
            "Catatan persetujuan: pilihan Anda, waktunya, versi kebijakan, dan versi plugin. Tujuan: membuktikan persetujuan. Dasar: kewajiban hukum.",
            "Favorit: produk yang Anda beri bintang, disinkronkan ke akun Anda. Dasar: pelaksanaan perjanjian.",
            "Permintaan penawaran: data yang Anda isi dan produk yang Anda pilih, dikirim hanya ke merek yang Anda pilih. Dasar: persetujuan (atas perintah Anda).",
            "Dirory Pro: paket, jumlah, status, dan waktu pembayaran. Pembayaran QRIS diproses oleh Midtrans; kami tidak menerima data rekening, kartu, atau dompet digital Anda. Untuk paket satu proyek, dan untuk dua estimasi RAB gratis per akun, kami menyimpan sidik satu arah (hash) dari ID model, bukan ID itu sendiri, agar satu proyek dihitung sekali. Dasar: pelaksanaan perjanjian dan kewajiban hukum (perpajakan).",
            "Estimasi biaya (RAB): volume dihitung di komputer Anda. Yang diunduh hanya daftar harga; geometri model tidak dikirim.",
            "Add-in Revit: tidak mengirim laporan pemakaian, kata pencarian, atau permintaan penawaran. Add-in hanya mengunduh produk yang Anda klik.",
            "Vendor: nama perusahaan, kontak, NPWP, produk, dan tagihan. Dasar: pelaksanaan perjanjian dan kewajiban hukum.",
            "Log keamanan: alamat IP dan rincian permintaan yang ditolak atau mencurigakan ke layanan pembayaran kami. Dasar: kepentingan yang sah (keamanan).",
            "Cookie: hanya yang diperlukan, yaitu sesi masuk dan pilihan bahasa. Tidak ada cookie iklan atau analitik.",
          ],
        },
        {
          h: "4. Yang dilihat merek (vendor)",
          p: [
            "Vendor hanya melihat angka agregat tentang produknya sendiri, dan hanya bila angka itu mencakup sedikitnya 5 arsitek berbeda. Vendor tidak pernah melihat nama, email, nama proyek, atau kata pencarian Anda. Data kontak Anda sampai ke vendor hanya melalui permintaan penawaran yang Anda kirim sendiri.",
          ],
        },
        {
          h: "5. Yang tidak kami lakukan",
          p: [
            "Kami tidak menjual data pribadi, tidak memakainya untuk iklan, tidak membuat keputusan otomatis yang berdampak hukum pada Anda, dan tidak mengirim pemasaran tanpa persetujuan terpisah.",
          ],
        },
        {
          h: "6. Pemroses data dan transfer ke luar Indonesia",
          list: [
            "Supabase: basis data, autentikasi, penyimpanan berkas, dan fungsi server; data disimpan di Singapura.",
            "Google: hanya jika Anda memilih masuk dengan Google.",
            "Midtrans: pemrosesan pembayaran QRIS, Indonesia.",
            "Sumopod: server situs dirory.com.",
            "DomaiNesia: email yang kami kirim dan terima.",
          ],
          p: [
            "Penyimpanan di Singapura adalah transfer data pribadi ke luar wilayah Indonesia (UU PDP Pasal 56). Singapura memiliki undang-undang pelindungan data pribadi (Personal Data Protection Act 2012), dan Supabase memproses data hanya atas instruksi kami berdasarkan ketentuan pemrosesan datanya.",
          ],
        },
        {
          h: "7. Berapa lama data disimpan",
          list: [
            "Riwayat dan ringkasan pemakaian: 12 bulan.",
            "Data instalasi dan log kesehatan plugin: 12 bulan.",
            "Kata pencarian tanpa hasil: 24 bulan, lalu hanya jumlah totalnya yang disimpan.",
            "Log keamanan dan log audit: 24 bulan.",
            "Akun dan catatan persetujuan: selama akun aktif, lalu dihapus saat akun dihapus, kecuali yang wajib disimpan menurut hukum.",
            "Tagihan dan catatan pembayaran: 10 tahun, sesuai kewajiban perpajakan.",
          ],
          p: ["Penghapusan berdasarkan masa simpan ini berjalan otomatis setiap hari."],
        },
        {
          h: "8. Hak Anda",
          p: [
            "Berdasarkan UU PDP Anda berhak: mendapat informasi tentang pemrosesan; mengakses dan memperoleh salinan data Anda; memperbaiki data yang salah; meminta penghapusan atau pemusnahan; menarik persetujuan; menunda atau membatasi pemrosesan; mendapatkan data dalam format yang umum dipakai; menolak keputusan yang sepenuhnya otomatis; dan mengajukan keberatan atau gugatan ganti rugi.",
            `Cara menggunakan hak Anda: kirim email ke ${email} dengan subjek "Permintaan privasi", atau WhatsApp ${whatsapp}. Kami memverifikasi identitas Anda, lalu menindaklanjuti dalam waktu 3 x 24 jam. Pilihan berbagi dapat Anda ubah sendiri kapan saja di dialog akun plugin atau di halaman unduh ("Ubah pilihan saya"). Menarik persetujuan tidak memengaruhi pemrosesan yang sudah dilakukan sebelumnya.`,
          ],
        },
        {
          h: "9. Keamanan",
          p: [
            "Semua koneksi dienkripsi (HTTPS). Setiap tabel basis data dilindungi aturan akses per baris, berkas model dan material disimpan privat dan hanya dibagikan melalui tautan sementara, token masuk plugin disimpan dalam bentuk hash, dan kunci server tidak pernah dikirim ke perangkat pengguna. Jika terjadi kegagalan pelindungan data pribadi, kami memberi tahu Anda dan lembaga yang berwenang paling lambat 3 x 24 jam, sesuai UU PDP Pasal 46.",
          ],
        },
        {
          h: "10. Anak",
          p: ["Dirory adalah alat kerja profesional dan tidak ditujukan untuk anak di bawah 18 tahun. Kami tidak dengan sengaja memproses data anak."],
        },
        {
          h: "11. Perubahan kebijakan",
          p: [
            "Setiap perubahan diberi nomor versi dan tanggal baru di halaman ini. Jika perubahan menyangkut data, tujuan, atau penerima baru, kami meminta persetujuan Anda lagi sebelum pemrosesan baru dimulai.",
          ],
        },
        {
          h: "12. Kontak dan pengaduan",
          p: [
            `${email} atau WhatsApp ${whatsapp}. Jika Anda tidak puas dengan tanggapan kami, Anda dapat mengadu kepada lembaga penyelenggara pelindungan data pribadi sesuai UU PDP.`,
          ],
        },
      ],
    };
  }

  return {
    lead:
      "This policy explains what personal data Dirory processes, why, on what basis, for how long, who receives it, and how you use your rights under Indonesia's Personal Data Protection Law, Undang-Undang Nomor 27 Tahun 2022 (UU PDP).",
    effective: `Version ${VERSION}, effective 16 October 2026.`,
    items: [
      {
        h: "1. Data controller",
        p: [
          `Dirory is operated by Rendy Noor Chandra, Indonesia, who is the controller of your personal data. Contact for every personal-data matter: ${email} (subject "Privacy request") or WhatsApp ${whatsapp}.`,
        ],
      },
      {
        h: "2. What this covers",
        p: [
          "This policy covers the dirory.com website, the Dirory plugin for SketchUp, the Dirory add-in for Revit, the vendor portal and the Dirory Pro subscription.",
        ],
      },
      {
        h: "3. What we process, why, and our legal basis",
        list: [
          "Account: email address and name (from the email sign-in link or Google). Purpose: providing your account and the service. Basis: performance of a contract.",
          "Optional details: occupation, city and province, only if you enter them. Used only in aggregate and never shown to a brand. Basis: consent.",
          "Installation data: a random installation ID, plugin version, SketchUp version, operating system and when it was last active. Purpose: support, updates and security. Basis: legitimate interest.",
          "Usage reports, only if you choose \"Share usage\": the Dirory products used in your open model (name, category, brand, quantity, painted area) and SketchUp's model ID. The project name only if you choose that separately. Plugin health counters (load counts and failures) follow the same choice. Never geometry, files or file paths. Basis: consent.",
          "Searches that find nothing, only while \"Report searches that find nothing\" is on: the search term alone. Email addresses and phone numbers are removed automatically, and the term is not stored with your account or installation ID. Basis: consent; you can switch it off at any time.",
          "Consent records: your choices, when you made them, the policy version and the plugin version. Purpose: proving consent. Basis: legal obligation.",
          "Favourites: the products you star, synced to your account. Basis: performance of a contract.",
          "Quote requests: the details you enter and the products you pick, sent only to the brand you choose. Basis: consent (your instruction).",
          "Dirory Pro: plan, amount, payment status and time. QRIS payments are processed by Midtrans; we never receive your bank, card or e-wallet details. For a one-project pass, and for the two free RAB estimates per account, we keep a one-way hash of the model ID, not the ID itself, so a project counts once. Basis: performance of a contract and legal obligation (tax).",
          "Cost estimate (RAB): quantities are calculated on your computer. Only the price list is downloaded; model geometry is never sent.",
          "Revit add-in: sends no usage reports, search terms or quote requests. It only downloads the products you click.",
          "Vendors: company name, contacts, NPWP, products and invoices. Basis: performance of a contract and legal obligation.",
          "Security logs: the IP address and details of rejected or suspicious requests to our payment service. Basis: legitimate interest (security).",
          "Cookies: only the necessary ones, for your sign-in session and your language choice. No advertising or analytics cookies.",
        ],
      },
      {
        h: "4. What brands (vendors) see",
        p: [
          "A vendor sees only aggregate figures about its own products, and only when a figure covers at least 5 different architects. A vendor never sees your name, email, project names or search terms. Your contact details reach a vendor only through a quote request you send yourself.",
        ],
      },
      {
        h: "5. What we do not do",
        p: [
          "We do not sell personal data, use it for advertising, make fully automated decisions with legal effect on you, or send marketing without separate consent.",
        ],
      },
      {
        h: "6. Processors and transfers outside Indonesia",
        list: [
          "Supabase: database, authentication, file storage and server functions; data is stored in Singapore.",
          "Google: only if you choose to sign in with Google.",
          "Midtrans: QRIS payment processing, Indonesia.",
          "Sumopod: the servers for dirory.com.",
          "DomaiNesia: the email we send and receive.",
        ],
        p: [
          "Storage in Singapore is a transfer of personal data outside Indonesia (UU PDP Article 56). Singapore has its own personal data protection law (the Personal Data Protection Act 2012), and Supabase processes the data only on our instructions under its data processing terms.",
        ],
      },
      {
        h: "7. How long we keep it",
        list: [
          "Usage history and summaries: 12 months.",
          "Installation data and plugin health logs: 12 months.",
          "Searches that found nothing: 24 months, after which only the totals are kept.",
          "Security and audit logs: 24 months.",
          "Account and consent records: while the account exists, then deleted with the account, except what the law requires us to keep.",
          "Invoices and payment records: 10 years, as tax law requires.",
        ],
        p: ["Deletion under these periods runs automatically every day."],
      },
      {
        h: "8. Your rights",
        p: [
          "Under UU PDP you have the right to: be informed about the processing; access and get a copy of your data; correct inaccurate data; request erasure or destruction; withdraw consent; suspend or restrict processing; receive your data in a commonly used format; object to decisions based solely on automated processing; and file an objection or a claim for compensation.",
          `To use your rights, email ${email} with the subject "Privacy request", or WhatsApp ${whatsapp}. We verify your identity and act on the request within 3 x 24 hours. You can change your sharing choices yourself at any time in the plugin's account dialog or on the download page ("Change my choices"). Withdrawing consent does not affect processing that happened before.`,
        ],
      },
      {
        h: "9. Security",
        p: [
          "All connections are encrypted (HTTPS). Every database table is protected by row-level access rules, model and material files are stored privately and shared only through short-lived links, plugin sign-in tokens are stored as hashes, and server keys never reach a user's device. If personal data protection fails, we notify you and the competent authority within 3 x 24 hours, as UU PDP Article 46 requires.",
        ],
      },
      {
        h: "10. Children",
        p: ["Dirory is a professional tool and is not directed at anyone under 18. We do not knowingly process children's data."],
      },
      {
        h: "11. Changes to this policy",
        p: [
          "Every change gets a new version number and date on this page. If a change involves new data, a new purpose or a new recipient, we ask for your consent again before the new processing starts.",
        ],
      },
      {
        h: "12. Contact and complaints",
        p: [
          `${email} or WhatsApp ${whatsapp}. If you are not satisfied with our answer, you can complain to the personal data protection authority established under UU PDP.`,
        ],
      },
    ],
  };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const whatsapp = formatWhatsApp();
  const { lead, effective, items } = sections(locale, DIRORY_EMAIL, whatsapp);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-14">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-[#3549a7]">
          {locale === "id" ? "Kembali ke Dirory" : "Back to Dirory"}
        </Link>
        <LanguageToggle locale={locale} />
      </div>
      <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-[#465bb8]">
        {locale === "id" ? "Privasi" : "Privacy"}
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">
        {locale === "id" ? "Kebijakan Privasi" : "Privacy Policy"}
      </h1>
      <p className="mt-2 text-sm text-slate-500">{effective}</p>
      <p className="mt-4 text-sm leading-6 text-slate-600">{lead}</p>

      <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
        {items.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-semibold text-slate-900">{s.h}</h2>
            {s.list ? (
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                {s.list.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            ) : null}
            {(s.p ?? []).map((para) => (
              <p key={para} className="mt-2">
                {para}
              </p>
            ))}
          </section>
        ))}
        <p className="border-t border-slate-200 pt-5 text-xs text-slate-500">
          <a className="underline" href={`mailto:${DIRORY_EMAIL}?subject=Privacy%20request`}>
            {DIRORY_EMAIL}
          </a>
          {" · "}
          <a className="underline" href={whatsAppLink("Privacy request - Dirory")}>
            WhatsApp {whatsapp}
          </a>
        </p>
      </div>
    </main>
  );
}
