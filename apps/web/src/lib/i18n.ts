/**
 * Site translations (English / Bahasa Indonesia).
 *
 * Pure data + a pure `t()` helper, so this file is safe to import from both
 * server and client components. The server-only cookie reader lives in
 * `locale-server.ts`.
 *
 * Locale is stored in a `locale` cookie rather than in the URL: the app is a
 * product tool more than a marketing site, and this keeps every existing route
 * and link unchanged. English is the default and the fallback — a missing key
 * returns the English string, then the key itself, so a gap is visible rather
 * than blank.
 */

export type Locale = "en" | "id";
export const LOCALES: Locale[] = ["en", "id"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

/** Short labels for the toggle. */
export const LOCALE_LABELS: Record<Locale, string> = { en: "EN", id: "ID" };

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "id";
}

const en: Record<string, string> = {
  // ---- shared -------------------------------------------------------------
  "nav.library": "Library",
  "nav.howItWorks": "How it works",
  "nav.brands": "Brands",
  "nav.howToInstall": "How to install",
  "nav.signIn": "Sign in",
  "nav.getPlugin": "Get the plugin",
  "footer.tagline": "Product library for architects and designers.",
  "footer.privacy": "Privacy",
  "footer.account": "Account",
  "account.download": "Download the plugin",
  "account.admin": "Admin dashboard",
  "account.vendor": "Vendor dashboard",
  "account.privacy": "Privacy",
  "account.profile": "Your profile",
  "account.signOut": "Sign out",
  "common.viewProduct": "View product",
  "common.freeSample": "Free sample",

  // ---- landing ------------------------------------------------------------
  "home.badge": "Product library for SketchUp",
  "home.h1a": "Design with products that are",
  "home.h1b": "real.",
  "home.lead":
    "Dirory brings Indonesian construction brands, 3D models and material textures into one easy-to-use SketchUp library.",
  "home.browse": "Browse the library",
  "home.getPlugin": "Get the plugin",
  "home.freeNote": "Free to browse. Account required to get the plugin download.",
  "home.socialStrong": "Models. Materials. Brands.",
  "home.socialRest": "Ready for your next project.",
  "home.mockTitle": "Dirory · SketchUp library",
  "home.mockAll": "All products",
  "home.mockModels": "Models",
  "home.mockMaterials": "Materials",
  "home.mockFavourite": "★ Favourite",
  "home.mockUsage": "Usage",
  "home.mockSearch": "Search products and materials",
  "home.mockBrowseNote": "Browse freely · sign in when you're ready to use a product",
  "home.builtFor": "Built for designers",
  "home.builtForSub": "Your material library, in SketchUp",
  "home.howTag": "How it works",
  "home.howHeading": "From search to placed, in three clicks.",
  "home.step1Title": "Get the plugin",
  "home.step1Text": "Create a free account and install the Dirory extension in SketchUp 2021 or newer.",
  "home.step2Title": "Browse real products",
  "home.step2Text":
    "Search every brand's models and materials inside SketchUp. Filter by category or brand, or star your favourites.",
  "home.step3Title": "Drop them into your design",
  "home.step3Text":
    "Click a model to place it, or click a material and paint a surface. Sizes, textures and 3 mm grout are handled for you.",
  "home.feat1Title": "Made for SketchUp",
  "home.feat1Text": "Find product models and material textures without leaving your design workflow.",
  "home.feat2Title": "Real Indonesian brands",
  "home.feat2Text": "Products from local suppliers, organised by category and brand, always up to date.",
  "home.feat3Title": "Free for designers",
  "home.feat3Text": "Browse the library for free. Create an account to download and use the Dirory plugin.",
  "home.insideTag": "Inside SketchUp",
  "home.insideHeading": "The catalogue lives in your SketchUp window.",
  "home.insideBody":
    "Sign in once with Google and the whole library loads in the Dirory panel — brands, categories, and every model and material. Click a card to place a model or paint a surface; files download in the background and are cached for next time.",
  "home.insideB1": "Filter by brand, category or type, and star favourites",
  "home.insideB2": "Download badges show what is already cached on your computer",
  "home.insideB3": "Your name appears in the panel — favourites follow your account",
  "home.insideCaption": "The Dirory panel running in SketchUp — browsing 634 TACO materials.",
  "home.insideAlt": "The Dirory panel open inside SketchUp, showing the TACO brand with 634 materials",
  "home.brandsTag": "Brands in the library",
  "home.brandsHeading": "Products from brands you specify every day.",
  "home.brandsBody":
    "The sample library already covers these brands. More are added as Dirory grows — and you can ask for a brand directly from inside SketchUp.",
  "home.ctaTag": "Start designing",
  "home.ctaHeading": "Bring better product detail into your next SketchUp project.",
  "home.ctaBody": "Create a free account. We'll send a secure sign-in link to your email, then you can get the plugin.",
  "home.ctaButton": "Create your free account",
  "brand.sanitaryware": "Sanitaryware",
  "brand.tilesStone": "Tiles & stone",
  "brand.tiles": "Tiles",
  "brand.hpl": "HPL & laminate",
  "brand.wallPaint": "Wall paint",
  "brand.furniture": "Furniture",

  // ---- library ------------------------------------------------------------
  "library.title": "Product library",
  "library.subtitle":
    "{count} products — {models} models and {materials} materials from Indonesian brands. Browsing is free; installing Dirory brings them into SketchUp.",
  "library.searchPlaceholder": "Search models, materials, brands…",
  "library.sortName": "Name A–Z",
  "library.sortBrand": "Brand",
  "library.sortNewest": "Newest",
  "library.sortLabel": "Sort by",
  "library.allProducts": "All products",
  "library.models": "Models",
  "library.materials": "Materials",
  "library.allBrands": "All brands",
  "library.allCategories": "All categories",
  "library.clear": "Clear",
  "library.countOne": "{count} product",
  "library.countMany": "{count} products",
  "library.fromBrand": " from {brand}",
  "library.none": "No products match that search.",
  "library.showMore": "Show more ({count} left)",
  "library.loading": "The catalogue is loading or temporarily unavailable. Please try again shortly.",
  "library.material": "Material",
  "library.model": "3D model",
  "library.searchLabel": "Search products",
  "library.filterBrand": "Filter by brand",
  "library.filterCategory": "Filter by category",

  // ---- product ------------------------------------------------------------
  "product.notFound": "Product not found",
  "product.brand": "Brand",
  "product.category": "Category",
  "product.type": "Type",
  "product.typeMaterial": "Material (texture)",
  "product.typeModel": "3D model (component)",
  "product.tileSize": "Tile size",
  "product.sku": "SKU / code",
  "product.tags": "Tags",
  "product.useTitle": "Use this product in SketchUp",
  "product.useBody":
    "Dirory is a free SketchUp extension. Install it, then click this product in the panel to place the model or paint the material. Files download automatically — nothing to save or unzip.",
  "product.downloadPlugin": "Download the Dirory plugin",
  "product.signInInstall": "Sign in to install Dirory",
  "product.brandPage": "Brand's product page",
  "product.signedInHint": "Already installed? Open the Dirory panel in SketchUp and search for this product.",
  "product.signedOutHint": "A free account keeps your favourites in sync. Browsing needs no account.",
  "product.moreFrom": "More from {brand} and {category}",
  "product.typeLabel": "Material",
  "product.typeLabelModel": "3D model",

  // ---- how to install -----------------------------------------------------
  "install.tag": "Setup guide",
  "install.title": "How to install Dirory in SketchUp",
  "install.lead":
    "It takes about two minutes. You need SketchUp 2021 or newer on Windows or macOS, an internet connection, and a free Dirory account.",
  "install.versionQuestion": "Which SketchUp version do you have?",
  "install.versionHelp": "Find it under Help → About SketchUp (Windows) or SketchUp → About SketchUp (macOS).",
  "install.versionSelect": "Select your version…",
  "install.versionSupportedGroup": "Supported",
  "install.versionUnsupportedGroup": "Not supported",
  "install.versionOlder": "2016 or older",
  "install.versionOk": "SketchUp {version} works.",
  "install.versionOkBody": "Follow the steps below — the install is the same on Windows and macOS.",
  "install.versionBad": "SketchUp {version} is not supported.",
  "install.versionBadBody":
    "Dirory needs SketchUp 2021 or newer: the plugin uses SketchUp's modern HTTP API to reach the cloud library, and that API does not exist in older versions. Upgrade SketchUp, then come back — your Dirory account and favourites are unaffected.",
  "install.stepByStep": "Step by step",
  "install.step1Title": "Create a free account",
  "install.step2Title": "Download the extension",
  "install.step3Title": "Open Extension Manager in SketchUp",
  "install.step4Title": "Install the RBZ",
  "install.step5Title": "Restart SketchUp",
  "install.step6Title": "Open the panel and sign in",
  "install.whereTitle": "Where to find it afterwards",
  "install.whereWhat": "What",
  "install.whereWhere": "Where",
  "install.wherePanel": "Open the product library",
  "install.wherePanelValue": "Extensions → Dirory → Open Library Panel",
  "install.whereSignIn": "Sign in or out",
  "install.whereSignInValue": "The account button in the panel, or Extensions → Dirory → Sign in",
  "install.whereTest": "Check the connection",
  "install.whereTestValue": "Extensions → Dirory → Test Connection",
  "install.whereUpdate": "Update the plugin",
  "install.whereUpdateValue": "The update badge in the panel, then restart SketchUp",
  "install.updateTitle": "Updating",
  "install.updateBody":
    "You do not need to reinstall by hand. When a new version is published, an Update badge appears in the panel. Click it, then restart SketchUp — the plugin replaces itself and keeps your settings and sign-in.",
  "install.troubleTitle": "If something goes wrong",
  "install.troubleQ1": "SketchUp says the extension is not signed",
  "install.troubleA1":
    "Normal for plugins outside the Extension Warehouse. Choose Install / Yes. The file comes from dirory.com over HTTPS.",
  "install.troubleQ2": "No Dirory menu after installing",
  "install.troubleA2":
    "Restart SketchUp. If it still does not appear, open Window → Ruby Console and check for a red error, then reinstall the RBZ.",
  "install.troubleQ3": "The panel opens but shows no products",
  "install.troubleA3": "Sign in first (the account button). Browsing is free, but the catalogue needs the cloud connection.",
  "install.troubleQ4": "\u201CHTTP 0\u201D or cannot reach the server",
  "install.troubleA4":
    "Extensions → Dirory → Test Connection shows the exact cause. A network filter or firewall blocking the connection is the usual reason.",
  "install.troubleQ5": "Sign-in opens a browser page that will not load",
  "install.troubleA5":
    "The browser step must reach dirory.com. If it cannot, the panel keeps waiting — check the address in the browser window.",
  "install.troubleQ6": "SketchUp 2020 or older",
  "install.troubleA6":
    "Not supported. The plugin needs SketchUp 2021+ for its HTTP API. Upgrade SketchUp; your Dirory account stays the same.",
  "install.readyTitle": "Ready?",
  "install.readyBody": "Create your free account, then download the extension.",

  // ---- download -----------------------------------------------------------
  "download.tag": "SketchUp extension",
  "download.title": "Get Dirory for SketchUp",
  "download.signedInAs": "Signed in as",
  "download.signedInBody": "Download the extension, then add it in SketchUp's Extension Manager.",
  "download.button": "Download RBZ",
  "download.requires": "Requires SketchUp 2021 or newer.",
  "download.requiresBody":
    "The plugin browses the cloud library inside SketchUp: search models and materials, click to place or paint, and update itself when a new version ships.",
  "download.step1": "In SketchUp, open Window → Extension Manager.",
  "download.step2": "Choose Install Extension and select the downloaded .rbz.",
  "download.step3": "Restart SketchUp, then open Extensions → Dirory → Open Library Panel.",
  "download.step4": "Sign in with Google from the panel's account button.",
  "download.fullGuide": "See the full install guide",
  "download.signInLead":
    "Create a free architect account or sign in to download the plugin. We send a one-time link to your email; Gmail addresses are supported.",
  "download.signUpOrIn": "Sign up or sign in",
  "download.howToInstall": "How to install",
  "download.privacy": "Privacy Policy",
  "download.footerNote": "Free for architects and designers.",

  // ---- login --------------------------------------------------------------
  "login.title": "Sign in",
  "login.leadGoogle": "Continue with Google, or use an email link. No password to remember.",
  "login.leadEmail": "Use an email link to sign in. No password to remember.",
  "login.google": "Continue with Google",
  "login.googleOpening": "Opening Google…",
  "login.orEmail": "or use email",
  "login.emailLabel": "Email address (Gmail works)",
  "login.emailButton": "Email me a sign-in link",
  "login.sending": "Sending…",
  "login.sent": "Link sent",
  "login.sentBody":
    "Check your inbox. The secure sign-in link is valid for a few minutes. New email addresses create a free architect account.",
  "login.footer": "Vendors and Dirory admins sign in here too. Architects sign in from inside SketchUp.",
  "login.terms": "First time here? Signing in creates your free architect account. By continuing, you acknowledge our",
  "login.privacyLink": "Privacy Policy",
  "login.noPassword": "No password is collected by Dirory.",
  "login.googleError": "{message} — Google sign-in may not be enabled yet. Use the email link below.",
  "login.googleFail": "Could not start Google sign-in.",
  "login.sendFail": "Could not send the link.",
  "login.emailPlaceholder": "you@gmail.com",

  // ---- welcome (occupation) ----------------------------------------------
  "welcome.tag": "One quick question",
  "welcome.title": "What best describes you?",
  "welcome.lead": "This helps us understand who uses Dirory and what to build next. You can change it later.",
  "welcome.architect": "Architect",
  "welcome.designer": "Designer",
  "welcome.student": "Student",
  "welcome.other": "Other",
  "welcome.saving": "Saving…",
  "welcome.skip": "Skip for now",
  "welcome.thanks": "Thanks — you're all set.",
  "welcome.error": "Could not save that. Please try again.",
  "welcome.continue": "Continue",
  "welcome.askedInSketchUp": "One quick question before you go back to SketchUp.",

  // ---- language toggle ----------------------------------------------------
  "lang.label": "Language",
};

const id: Record<string, string> = {
  // ---- shared -------------------------------------------------------------
  "nav.library": "Pustaka",
  "nav.howItWorks": "Cara kerja",
  "nav.brands": "Merek",
  "nav.howToInstall": "Cara memasang",
  "nav.signIn": "Masuk",
  "nav.getPlugin": "Dapatkan plugin",
  "footer.tagline": "Pustaka produk untuk arsitek dan desainer.",
  "footer.privacy": "Privasi",
  "footer.account": "Akun",
  "account.download": "Unduh plugin",
  "account.admin": "Dasbor admin",
  "account.vendor": "Dasbor vendor",
  "account.privacy": "Privasi",
  "account.profile": "Profil Anda",
  "account.signOut": "Keluar",
  "common.viewProduct": "Lihat produk",
  "common.freeSample": "Sampel gratis",

  // ---- landing ------------------------------------------------------------
  "home.badge": "Pustaka produk untuk SketchUp",
  "home.h1a": "Desain dengan produk yang",
  "home.h1b": "nyata.",
  "home.lead":
    "Dirory menghadirkan merek konstruksi Indonesia, model 3D, dan tekstur material ke dalam satu pustaka SketchUp yang mudah digunakan.",
  "home.browse": "Jelajahi pustaka",
  "home.getPlugin": "Dapatkan plugin",
  "home.freeNote": "Gratis untuk dijelajahi. Perlu akun untuk mengunduh plugin.",
  "home.socialStrong": "Model. Material. Merek.",
  "home.socialRest": "Siap untuk proyek Anda berikutnya.",
  "home.mockTitle": "Dirory · pustaka SketchUp",
  "home.mockAll": "Semua produk",
  "home.mockModels": "Model",
  "home.mockMaterials": "Material",
  "home.mockFavourite": "★ Favorit",
  "home.mockUsage": "Pemakaian",
  "home.mockSearch": "Cari produk dan material",
  "home.mockBrowseNote": "Jelajahi dengan bebas · masuk saat siap memakai produk",
  "home.builtFor": "Dirancang untuk desainer",
  "home.builtForSub": "Pustaka material Anda, di dalam SketchUp",
  "home.howTag": "Cara kerja",
  "home.howHeading": "Dari pencarian hingga terpasang, dalam tiga klik.",
  "home.step1Title": "Dapatkan plugin",
  "home.step1Text": "Buat akun gratis dan pasang ekstensi Dirory di SketchUp 2021 atau lebih baru.",
  "home.step2Title": "Jelajahi produk asli",
  "home.step2Text":
    "Cari model dan material setiap merek langsung di SketchUp. Saring berdasarkan kategori atau merek, atau bintangi favorit Anda.",
  "home.step3Title": "Masukkan ke desain Anda",
  "home.step3Text":
    "Klik model untuk menempatkannya, atau klik material lalu cat permukaannya. Ukuran, tekstur, dan nat 3 mm ditangani otomatis.",
  "home.feat1Title": "Dibuat untuk SketchUp",
  "home.feat1Text": "Temukan model produk dan tekstur material tanpa keluar dari alur kerja desain Anda.",
  "home.feat2Title": "Merek Indonesia asli",
  "home.feat2Text": "Produk dari pemasok lokal, tersusun per kategori dan merek, selalu terbaru.",
  "home.feat3Title": "Gratis untuk desainer",
  "home.feat3Text": "Jelajahi pustaka secara gratis. Buat akun untuk mengunduh dan memakai plugin Dirory.",
  "home.insideTag": "Di dalam SketchUp",
  "home.insideHeading": "Katalognya ada di jendela SketchUp Anda.",
  "home.insideBody":
    "Masuk sekali dengan Google dan seluruh pustaka dimuat di panel Dirory — merek, kategori, serta setiap model dan material. Klik kartu untuk menempatkan model atau mencat permukaan; berkas diunduh di latar belakang dan disimpan untuk pemakaian berikutnya.",
  "home.insideB1": "Saring berdasarkan merek, kategori, atau jenis, dan bintangi favorit",
  "home.insideB2": "Lencana unduh menunjukkan apa yang sudah tersimpan di komputer Anda",
  "home.insideB3": "Nama Anda muncul di panel — favorit mengikuti akun Anda",
  "home.insideCaption": "Panel Dirory berjalan di SketchUp — menjelajahi 634 material TACO.",
  "home.insideAlt": "Panel Dirory terbuka di SketchUp, menampilkan merek TACO dengan 634 material",
  "home.brandsTag": "Merek di dalam pustaka",
  "home.brandsHeading": "Produk dari merek yang Anda tentukan setiap hari.",
  "home.brandsBody":
    "Pustaka contoh sudah mencakup merek-merek ini. Semakin banyak ditambahkan seiring Dirory berkembang — dan Anda dapat meminta merek langsung dari dalam SketchUp.",
  "home.ctaTag": "Mulai mendesain",
  "home.ctaHeading": "Hadirkan detail produk yang lebih baik di proyek SketchUp Anda berikutnya.",
  "home.ctaBody": "Buat akun gratis. Kami mengirim tautan masuk yang aman ke email Anda, lalu Anda dapat mengunduh plugin.",
  "home.ctaButton": "Buat akun gratis Anda",
  "brand.sanitaryware": "Saniter",
  "brand.tilesStone": "Keramik & batu",
  "brand.tiles": "Keramik",
  "brand.hpl": "HPL & laminat",
  "brand.wallPaint": "Cat dinding",
  "brand.furniture": "Furnitur",

  // ---- library ------------------------------------------------------------
  "library.title": "Pustaka produk",
  "library.subtitle":
    "{count} produk — {models} model dan {materials} material dari merek Indonesia. Menjelajah gratis; memasang Dirory membawanya ke SketchUp.",
  "library.searchPlaceholder": "Cari model, material, merek…",
  "library.sortName": "Nama A–Z",
  "library.sortBrand": "Merek",
  "library.sortNewest": "Terbaru",
  "library.sortLabel": "Urutkan",
  "library.allProducts": "Semua produk",
  "library.models": "Model",
  "library.materials": "Material",
  "library.allBrands": "Semua merek",
  "library.allCategories": "Semua kategori",
  "library.clear": "Hapus",
  "library.countOne": "{count} produk",
  "library.countMany": "{count} produk",
  "library.fromBrand": " dari {brand}",
  "library.none": "Tidak ada produk yang cocok dengan pencarian itu.",
  "library.showMore": "Tampilkan lagi ({count} tersisa)",
  "library.loading": "Katalog sedang dimuat atau sementara tidak tersedia. Silakan coba lagi sebentar lagi.",
  "library.material": "Material",
  "library.model": "Model 3D",
  "library.searchLabel": "Cari produk",
  "library.filterBrand": "Saring berdasarkan merek",
  "library.filterCategory": "Saring berdasarkan kategori",

  // ---- product ------------------------------------------------------------
  "product.notFound": "Produk tidak ditemukan",
  "product.brand": "Merek",
  "product.category": "Kategori",
  "product.type": "Jenis",
  "product.typeMaterial": "Material (tekstur)",
  "product.typeModel": "Model 3D (komponen)",
  "product.tileSize": "Ukuran ubin",
  "product.sku": "Kode / SKU",
  "product.tags": "Tag",
  "product.useTitle": "Pakai produk ini di SketchUp",
  "product.useBody":
    "Dirory adalah ekstensi SketchUp gratis. Pasang, lalu klik produk ini di panel untuk menempatkan model atau mencat material. Berkas diunduh otomatis — tidak ada yang perlu disimpan atau diekstrak.",
  "product.downloadPlugin": "Unduh plugin Dirory",
  "product.signInInstall": "Masuk untuk memasang Dirory",
  "product.brandPage": "Halaman produk merek",
  "product.signedInHint": "Sudah terpasang? Buka panel Dirory di SketchUp dan cari produk ini.",
  "product.signedOutHint": "Akun gratis menyinkronkan favorit Anda. Menjelajah tidak perlu akun.",
  "product.moreFrom": "Lainnya dari {brand} dan {category}",
  "product.typeLabel": "Material",
  "product.typeLabelModel": "Model 3D",

  // ---- how to install -----------------------------------------------------
  "install.tag": "Panduan pemasangan",
  "install.title": "Cara memasang Dirory di SketchUp",
  "install.lead":
    "Hanya perlu sekitar dua menit. Anda perlu SketchUp 2021 atau lebih baru di Windows atau macOS, koneksi internet, dan akun Dirory gratis.",
  "install.versionQuestion": "Versi SketchUp mana yang Anda pakai?",
  "install.versionHelp": "Lihat di Help → About SketchUp (Windows) atau SketchUp → About SketchUp (macOS).",
  "install.versionSelect": "Pilih versi Anda…",
  "install.versionSupportedGroup": "Didukung",
  "install.versionUnsupportedGroup": "Tidak didukung",
  "install.versionOlder": "2016 atau lebih lama",
  "install.versionOk": "SketchUp {version} bisa dipakai.",
  "install.versionOkBody": "Ikuti langkah-langkah di bawah — caranya sama di Windows dan macOS.",
  "install.versionBad": "SketchUp {version} tidak didukung.",
  "install.versionBadBody":
    "Dirory memerlukan SketchUp 2021 atau lebih baru: plugin memakai API HTTP modern SketchUp untuk mengakses pustaka awan, dan API itu belum ada di versi lama. Perbarui SketchUp, lalu kembali — akun dan favorit Dirory Anda tidak terpengaruh.",
  "install.stepByStep": "Langkah demi langkah",
  "install.step1Title": "Buat akun gratis",
  "install.step2Title": "Unduh ekstensinya",
  "install.step3Title": "Buka Extension Manager di SketchUp",
  "install.step4Title": "Pasang berkas RBZ",
  "install.step5Title": "Mulai ulang SketchUp",
  "install.step6Title": "Buka panel dan masuk",
  "install.whereTitle": "Tempat menemukannya nanti",
  "install.whereWhat": "Apa",
  "install.whereWhere": "Di mana",
  "install.wherePanel": "Buka pustaka produk",
  "install.wherePanelValue": "Extensions → Dirory → Open Library Panel",
  "install.whereSignIn": "Masuk atau keluar",
  "install.whereSignInValue": "Tombol akun di panel, atau Extensions → Dirory → Sign in",
  "install.whereTest": "Periksa koneksi",
  "install.whereTestValue": "Extensions → Dirory → Test Connection",
  "install.whereUpdate": "Perbarui plugin",
  "install.whereUpdateValue": "Lencana pembaruan di panel, lalu mulai ulang SketchUp",
  "install.updateTitle": "Memperbarui",
  "install.updateBody":
    "Anda tidak perlu memasang ulang secara manual. Saat versi baru terbit, lencana Update muncul di panel. Klik, lalu mulai ulang SketchUp — plugin mengganti dirinya sendiri dan tetap menyimpan pengaturan serta status masuk Anda.",
  "install.troubleTitle": "Jika ada masalah",
  "install.troubleQ1": "SketchUp bilang ekstensi tidak ditandatangani",
  "install.troubleA1":
    "Wajar untuk plugin di luar Extension Warehouse. Pilih Install / Yes. Berkasnya berasal dari dirory.com melalui HTTPS.",
  "install.troubleQ2": "Menu Dirory tidak muncul setelah dipasang",
  "install.troubleA2":
    "Mulai ulang SketchUp. Jika masih tidak muncul, buka Window → Ruby Console dan periksa pesan error merah, lalu pasang ulang berkas RBZ.",
  "install.troubleQ3": "Panel terbuka tetapi tidak ada produk",
  "install.troubleA3": "Masuk dulu (tombol akun). Menjelajah gratis, tetapi katalog memerlukan koneksi awan.",
  "install.troubleQ4": "\u201CHTTP 0\u201D atau tidak bisa menjangkau server",
  "install.troubleA4":
    "Extensions → Dirory → Test Connection menunjukkan penyebabnya. Biasanya karena filter jaringan atau firewall memblokir koneksi.",
  "install.troubleQ5": "Proses masuk membuka halaman peramban yang tidak bisa dimuat",
  "install.troubleA5":
    "Langkah peramban harus bisa menjangkau dirory.com. Jika tidak, panel akan terus menunggu — periksa alamat di jendela peramban.",
  "install.troubleQ6": "SketchUp 2020 atau lebih lama",
  "install.troubleA6":
    "Tidak didukung. Plugin memerlukan SketchUp 2021+ untuk API HTTP-nya. Perbarui SketchUp; akun Dirory Anda tetap sama.",
  "install.readyTitle": "Siap?",
  "install.readyBody": "Buat akun gratis, lalu unduh ekstensinya.",

  // ---- download -----------------------------------------------------------
  "download.tag": "Ekstensi SketchUp",
  "download.title": "Dapatkan Dirory untuk SketchUp",
  "download.signedInAs": "Masuk sebagai",
  "download.signedInBody": "Unduh ekstensinya, lalu tambahkan di Extension Manager SketchUp.",
  "download.button": "Unduh RBZ",
  "download.requires": "Memerlukan SketchUp 2021 atau lebih baru.",
  "download.requiresBody":
    "Plugin menjelajahi pustaka awan di dalam SketchUp: cari model dan material, klik untuk menempatkan atau mencat, dan memperbarui dirinya saat versi baru terbit.",
  "download.step1": "Di SketchUp, buka Window → Extension Manager.",
  "download.step2": "Pilih Install Extension dan pilih berkas .rbz yang sudah diunduh.",
  "download.step3": "Mulai ulang SketchUp, lalu buka Extensions → Dirory → Open Library Panel.",
  "download.step4": "Masuk dengan Google lewat tombol akun di panel.",
  "download.fullGuide": "Lihat panduan pemasangan lengkap",
  "download.signInLead":
    "Buat akun arsitek gratis atau masuk untuk mengunduh plugin. Kami mengirim tautan sekali pakai ke email Anda; alamat Gmail didukung.",
  "download.signUpOrIn": "Daftar atau masuk",
  "download.howToInstall": "Cara memasang",
  "download.privacy": "Kebijakan Privasi",
  "download.footerNote": "Gratis untuk arsitek dan desainer.",

  // ---- login --------------------------------------------------------------
  "login.title": "Masuk",
  "login.leadGoogle": "Lanjutkan dengan Google, atau pakai tautan email. Tidak perlu kata sandi.",
  "login.leadEmail": "Pakai tautan email untuk masuk. Tidak perlu kata sandi.",
  "login.google": "Lanjutkan dengan Google",
  "login.googleOpening": "Membuka Google…",
  "login.orEmail": "atau pakai email",
  "login.emailLabel": "Alamat email (Gmail bisa)",
  "login.emailButton": "Kirimi saya tautan masuk",
  "login.sending": "Mengirim…",
  "login.sent": "Tautan terkirim",
  "login.sentBody":
    "Periksa kotak masuk Anda. Tautan masuk yang aman berlaku beberapa menit. Alamat email baru akan membuat akun arsitek gratis.",
  "login.footer": "Vendor dan admin Dirory juga masuk di sini. Arsitek masuk dari dalam SketchUp.",
  "login.terms": "Pertama kali di sini? Masuk akan membuat akun arsitek gratis Anda. Dengan melanjutkan, Anda menyetujui",
  "login.privacyLink": "Kebijakan Privasi",
  "login.noPassword": "Dirory tidak mengumpulkan kata sandi.",
  "login.googleError": "{message} — Masuk dengan Google mungkin belum diaktifkan. Gunakan tautan email di bawah.",
  "login.googleFail": "Tidak dapat memulai masuk dengan Google.",
  "login.sendFail": "Tidak dapat mengirim tautan.",
  "login.emailPlaceholder": "anda@gmail.com",

  // ---- welcome (occupation) ----------------------------------------------
  "welcome.tag": "Satu pertanyaan singkat",
  "welcome.title": "Anda paling tepat digambarkan sebagai?",
  "welcome.lead": "Ini membantu kami memahami siapa yang memakai Dirory dan apa yang perlu dibangun berikutnya. Bisa diubah nanti.",
  "welcome.architect": "Arsitek",
  "welcome.designer": "Desainer",
  "welcome.student": "Mahasiswa",
  "welcome.other": "Lainnya",
  "welcome.saving": "Menyimpan…",
  "welcome.skip": "Lewati dulu",
  "welcome.thanks": "Terima kasih — semuanya siap.",
  "welcome.error": "Tidak dapat menyimpan. Silakan coba lagi.",
  "welcome.continue": "Lanjutkan",
  "welcome.askedInSketchUp": "Satu pertanyaan singkat sebelum kembali ke SketchUp.",

  // ---- language toggle ----------------------------------------------------
  "lang.label": "Bahasa",
};

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, id };

/**
 * Translate a key. Falls back to English, then to the key itself, so a missing
 * entry is obvious in the UI rather than rendering blank.
 */
export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  let text = dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
