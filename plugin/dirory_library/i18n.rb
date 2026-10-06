require 'json'

# ----------------------------------------------------------------------
# Dirory UI translations.
#
# The panel is plain HTML/JS, so the strings live here in Ruby and are pushed
# into the panel as one JSON object (window.diroryI18n). Adding a language is
# one more entry in TRANSLATIONS with the same keys.
#
# Keys are grouped by area. `en` is the reference: any key missing from another
# language falls back to English, so a partial translation is always safe.
# ----------------------------------------------------------------------
module Dirory
  module Library
    module I18n
      SUPPORTED = {
        'en' => 'English',
        'id' => 'Bahasa Indonesia'
      }.freeze

      TRANSLATIONS = {
        'en' => {
          # header / tabs
          'app.search_placeholder' => 'Search name, category or brand…',
          'app.search' => 'Search',
          'tab.all' => 'All',
          'tab.model' => 'Models',
          'tab.material' => 'Materials',
          'tab.favourite' => '★ Favourite',
          'tab.usage' => 'Usage',
          'filter.all_categories' => 'All categories',
          'filter.all_brands' => 'All brands',
          'filter.show_all_brands' => 'Show all brands',
          'brand.materials' => '%{count} materials',
          'brand.models' => '%{count} models',
          'hint.main' => '📦 Click a model card, then click in the model to place it. ☆ Star a card to keep it in Favourite. 🎨 Click a material card — the Paint Bucket activates with that material, ready to click a surface.',
          # empty states
          'empty.default' => 'No items found. Try another category or brand, or drop a .skp file anywhere inside your library folder and click ⟳ to rescan.',
          'empty.no_results' => 'No results for “%{query}”.',
          'empty.no_results_reported' => 'No results for “%{query}”. It isn’t in the library yet — we’ve noted your search so the Dirory team can add it.',
          'empty.no_favourites' => 'No favourites yet. Tap ☆ on a card to keep it here. Products you insert or paint also appear here automatically.',
          # account
          'account.title' => 'Sign in to Dirory',
          'account.lead' => 'Browsing and search are free without an account. Sign in to insert models, paint materials and ask for quotes.',
          'account.google' => 'Sign in with Google',
          'account.google_help' => 'Opens your browser so you can choose your Google account. Dirory never sees or stores your password. When you are done, come back to SketchUp — this panel signs in by itself.',
          'account.waiting' => 'Waiting for you to finish in the browser…',
          'account.waiting_status' => 'Waiting for you to finish in the browser… (%{status})',
          'account.reopen' => 'Open the sign-in page again',
          'account.cancel' => 'Cancel',
          'account.your_account' => 'Your account',
          'account.sign_out' => 'Sign out',
          'account.signed_in_as' => 'Signed in as %{who}',
          'account.not_completed' => 'Sign-in was not completed. Please try again.',
          # consent
          'consent.title' => 'What you share',
          'consent.usage' => 'Share anonymous usage, and searches that find nothing',
          'consent.project' => 'Also send my project name',
          'consent.details' => 'See exactly what is sent',
          'consent.privacy_link' => 'Read the full privacy policy',
          # toasts
          'toast.sign_in_load' => 'Sign in to load this model into your project.',
          'toast.sign_in_paint' => 'Sign in to paint this material onto a surface.',
          'toast.sign_in_quote' => 'Sign in to ask this brand for a quote.',
          # product info / inspector
          'product.info' => 'Product info',
          'product.name' => 'Name',
          'product.brand' => 'Brand',
          'product.category' => 'Category',
          'product.type' => 'Type',
          'product.type.material' => 'Material',
          'product.type.model' => '3D model',
          'product.tile_size' => 'Tile size',
          'product.dimensions' => 'Dimensions',
          'product.sketchup' => 'SketchUp',
          'product.sketchup_or_later' => '%{version} or later',
          'product.tags' => 'Tags',
          'product.sku' => 'SKU',
          'product.url' => 'Product URL',
          'product.open_page' => 'Open product page ↗',
          'product.ask_quote' => 'Ask this brand for a quote',
          'inspector.title' => 'Inspector',
          'inspector.lead' => 'Select a Dirory product in your model to see its details here — useful for working drawings and purchase orders.',
          'inspector.nothing' => 'Nothing Dirory is selected. Click a model or a painted surface, then open the Inspector again.',
          # quote
          'quote.title' => 'Ask for a Quote',
          'quote.project' => 'Project name',
          'quote.city' => 'City',
          'quote.timeline' => 'Timeline',
          'quote.note' => 'Note',
          'quote.phone' => 'I agree to be contacted on my account email/phone about this quote.',
          'quote.send' => 'Send quote request',
          'quote.help' => 'Sends one request per brand, with only that brand’s items. WhatsApp opens as an optional extra.',
          # usage
          'usage.refresh' => '⟳ Refresh',
          'usage.export' => '⭳ Export CSV',
          'usage.select_all' => '☑ Select all brands',
          'usage.collapse_all' => '▴ Collapse all',
          'usage.hide_unused' => 'Hide unused materials / models',
          'usage.note' => 'Grouped by brand and counted from the open model, so it stays correct after undo or delete. Only models and materials inserted with this version of Dirory are counted. Free Dirory samples are listed but can’t be quoted.',
          'usage.ask_quote' => '🛒 Ask for a Quote',
          # settings / update
          'settings.title' => 'Settings',
          'settings.language' => 'Language',
          'settings.about' => 'About',
          'settings.version' => 'Dirory plugin %{version}',
          'settings.close' => 'Close',
          'update.title' => 'Update available',
          'update.lead' => 'A newer Dirory plugin is ready to install.',
          'update.current' => 'Installed: %{version}',
          'update.latest' => 'Latest: %{version}',
          'update.button' => 'Update now',
          'update.checking' => 'Checking…',
          'update.none' => 'You have the latest version (%{version}).',
          'update.staged' => 'Update downloaded. Restart SketchUp to finish — your settings and sign-in are kept.',
          'update.failed' => 'The update could not be downloaded (%{error}). Please try again.',
          'update.restart_now' => 'Restart SketchUp now',
          'update.later' => 'Later',
        },
        'id' => {
          'app.search_placeholder' => 'Cari nama, kategori, atau merek…',
          'app.search' => 'Cari',
          'tab.all' => 'Semua',
          'tab.model' => 'Model',
          'tab.material' => 'Material',
          'tab.favourite' => '★ Favorit',
          'tab.usage' => 'Pemakaian',
          'filter.all_categories' => 'Semua kategori',
          'filter.all_brands' => 'Semua merek',
          'filter.show_all_brands' => 'Tampilkan semua merek',
          'brand.materials' => '%{count} material',
          'brand.models' => '%{count} model',
          'hint.main' => '📦 Klik kartu model, lalu klik di dalam model untuk menempatkannya. ☆ Bintangi kartu untuk menyimpannya ke Favorit. 🎨 Klik kartu material — Paint Bucket aktif dengan material tersebut, siap diklik ke permukaan.',
          'empty.default' => 'Tidak ada item. Coba kategori atau merek lain, atau letakkan file .skp di dalam folder pustaka Anda lalu klik ⟳ untuk memindai ulang.',
          'empty.no_results' => 'Tidak ada hasil untuk “%{query}”.',
          'empty.no_results_reported' => 'Tidak ada hasil untuk “%{query}”. Belum ada di pustaka — pencarian Anda sudah kami catat agar tim Dirory menambahkannya.',
          'empty.no_favourites' => 'Belum ada favorit. Ketuk ☆ pada kartu untuk menyimpannya di sini. Produk yang Anda sisipkan atau cat juga otomatis muncul di sini.',
          'account.title' => 'Masuk ke Dirory',
          'account.lead' => 'Menelusuri dan mencari gratis tanpa akun. Masuk untuk menyisipkan model, mengecat material, dan meminta penawaran.',
          'account.google' => 'Masuk dengan Google',
          'account.google_help' => 'Membuka peramban agar Anda dapat memilih akun Google. Dirory tidak pernah melihat atau menyimpan kata sandi Anda. Setelah selesai, kembali ke SketchUp — panel ini akan masuk dengan sendirinya.',
          'account.waiting' => 'Menunggu Anda menyelesaikan di peramban…',
          'account.waiting_status' => 'Menunggu Anda menyelesaikan di peramban… (%{status})',
          'account.reopen' => 'Buka lagi halaman masuk',
          'account.cancel' => 'Batal',
          'account.your_account' => 'Akun Anda',
          'account.sign_out' => 'Keluar',
          'account.signed_in_as' => 'Masuk sebagai %{who}',
          'account.not_completed' => 'Proses masuk belum selesai. Silakan coba lagi.',
          'consent.title' => 'Apa yang Anda bagikan',
          'consent.usage' => 'Bagikan pemakaian anonim, dan pencarian yang tidak menemukan apa pun',
          'consent.project' => 'Kirim juga nama proyek saya',
          'consent.details' => 'Lihat persisnya apa yang dikirim',
          'consent.privacy_link' => 'Baca kebijakan privasi selengkapnya',
          'toast.sign_in_load' => 'Masuk untuk memuat model ini ke proyek Anda.',
          'toast.sign_in_paint' => 'Masuk untuk mengecat material ini ke permukaan.',
          'toast.sign_in_quote' => 'Masuk untuk meminta penawaran dari merek ini.',
          'product.info' => 'Info produk',
          'product.name' => 'Nama',
          'product.brand' => 'Merek',
          'product.category' => 'Kategori',
          'product.type' => 'Jenis',
          'product.type.material' => 'Material',
          'product.type.model' => 'Model 3D',
          'product.tile_size' => 'Ukuran ubin',
          'product.dimensions' => 'Dimensi',
          'product.sketchup' => 'SketchUp',
          'product.sketchup_or_later' => '%{version} atau lebih baru',
          'product.tags' => 'Tag',
          'product.sku' => 'Kode',
          'product.url' => 'Tautan produk',
          'product.open_page' => 'Buka halaman produk ↗',
          'product.ask_quote' => 'Minta penawaran dari merek ini',
          'inspector.title' => 'Inspektur',
          'inspector.lead' => 'Pilih produk Dirory di model Anda untuk melihat detailnya di sini — berguna untuk gambar kerja dan pesanan pembelian.',
          'inspector.nothing' => 'Tidak ada Dirory yang dipilih. Klik model atau permukaan yang dicat, lalu buka Inspektur lagi.',
          'quote.title' => 'Minta Penawaran',
          'quote.project' => 'Nama proyek',
          'quote.city' => 'Kota',
          'quote.timeline' => 'Perkiraan waktu',
          'quote.note' => 'Catatan',
          'quote.phone' => 'Saya setuju dihubungi melalui email/telepon akun saya tentang penawaran ini.',
          'quote.send' => 'Kirim permintaan penawaran',
          'quote.help' => 'Mengirim satu permintaan per merek, hanya berisi item merek tersebut. WhatsApp terbuka sebagai tambahan opsional.',
          'usage.refresh' => '⟳ Segarkan',
          'usage.export' => '⭳ Ekspor CSV',
          'usage.select_all' => '☑ Pilih semua merek',
          'usage.collapse_all' => '▴ Tutup semua',
          'usage.hide_unused' => 'Sembunyikan material / model yang tidak dipakai',
          'usage.note' => 'Dikelompokkan per merek dan dihitung dari model yang terbuka, sehingga tetap benar setelah undo atau hapus. Hanya model dan material yang disisipkan dengan versi Dirory ini yang dihitung. Sampel gratis Dirory terdaftar tetapi tidak dapat diminta penawaran.',
          'usage.ask_quote' => '🛒 Minta Penawaran',
          'settings.title' => 'Pengaturan',
          'settings.language' => 'Bahasa',
          'settings.about' => 'Tentang',
          'settings.version' => 'Plugin Dirory %{version}',
          'settings.close' => 'Tutup',
          'update.title' => 'Pembaruan tersedia',
          'update.lead' => 'Plugin Dirory versi lebih baru siap dipasang.',
          'update.current' => 'Terpasang: %{version}',
          'update.latest' => 'Terbaru: %{version}',
          'update.button' => 'Perbarui sekarang',
          'update.checking' => 'Memeriksa…',
          'update.none' => 'Anda sudah memakai versi terbaru (%{version}).',
          'update.staged' => 'Pembaruan terunduh. Mulai ulang SketchUp untuk menyelesaikan — pengaturan dan status masuk Anda tetap tersimpan.',
          'update.failed' => 'Pembaruan tidak dapat diunduh (%{error}). Silakan coba lagi.',
          'update.restart_now' => 'Mulai ulang SketchUp sekarang',
          'update.later' => 'Nanti',
        }
      }.freeze

      def self.supported
        SUPPORTED
      end

      def self.normalize(code)
        c = code.to_s.strip.downcase
        return 'id' if c.start_with?('id')  # id, id-ID, in-ID
        return 'en' if c.start_with?('en')
        SUPPORTED.key?(c) ? c : 'en'
      end

      # The whole dictionary for one language, English keys filled in.
      def self.dictionary(code)
        lang = normalize(code)
        base = TRANSLATIONS['en']
        return base if lang == 'en'
        base.merge(TRANSLATIONS[lang] || {})
      end
    end
  end
end
