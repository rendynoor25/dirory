import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

/**
 * Public landing page (dirory.com).
 *
 * Structure follows Thudio's site — a clear how-it-works flow, the brands
 * available, and one obvious call to action — using Dirory's own logo colours
 * (#3B52A1 deep → #5C6FB1 light).
 *
 * All copy comes from lib/i18n.ts so the EN/ID toggle works. English is the
 * default and the fallback.
 *
 * NOTE: no community statistics are shown yet; the founder has not supplied
 * real numbers and inventing them would be misleading.
 */

export default async function Home() {
  const locale = await getLocale();

  const steps = [
    { number: "01", title: t(locale, "home.step1Title"), text: t(locale, "home.step1Text") },
    { number: "02", title: t(locale, "home.step2Title"), text: t(locale, "home.step2Text") },
    { number: "03", title: t(locale, "home.step3Title"), text: t(locale, "home.step3Text") },
  ];

  const features = [
    { title: t(locale, "home.feat1Title"), text: t(locale, "home.feat1Text") },
    { title: t(locale, "home.feat2Title"), text: t(locale, "home.feat2Text") },
    { title: t(locale, "home.feat3Title"), text: t(locale, "home.feat3Text") },
  ];

  const brands = [
    { name: "TOTO", note: t(locale, "brand.sanitaryware") },
    { name: "Trilliunware", note: t(locale, "brand.sanitaryware") },
    { name: "NIRO GRANITE", note: t(locale, "brand.tilesStone") },
    { name: "ROMAN", note: t(locale, "brand.tiles") },
    { name: "TACO", note: t(locale, "brand.hpl") },
    { name: "Nippon Paint", note: t(locale, "brand.wallPaint") },
    { name: "Propan", note: t(locale, "brand.wallPaint") },
    { name: "Malka", note: t(locale, "brand.furniture") },
  ];

  const insidePoints = [t(locale, "home.insideB1"), t(locale, "home.insideB2"), t(locale, "home.insideB3")];

  const mockTabs = [
    [t(locale, "home.mockAll"), true],
    [t(locale, "home.mockModels"), false],
    [t(locale, "home.mockMaterials"), false],
    [t(locale, "home.mockFavourite"), false],
    [t(locale, "home.mockUsage"), false],
  ] as const;

  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f9fc] text-slate-950">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="Dirory home">
          <Image src="/dirory-mark.png" alt="" width={37} height={40} priority className="h-10 w-auto object-contain" />
          <span className="text-lg font-semibold tracking-tight">Dirory</span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-6" aria-label="Main navigation">
          <a href="#how-it-works" className="hidden text-sm text-slate-600 hover:text-slate-950 sm:inline">
            {t(locale, "nav.howItWorks")}
          </a>
          <Link href="/for-vendors" className="hidden text-sm text-slate-600 hover:text-slate-950 sm:inline">
            {t(locale, "nav.forBrands")}
          </Link>
          <Link href="/how-to-install" className="hidden text-sm text-slate-600 hover:text-slate-950 sm:inline">
            {t(locale, "nav.howToInstall")}
          </Link>
          <LanguageToggle locale={locale} />
          <AccountMenu />
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.04fr_.96fr] lg:px-10 lg:pb-28 lg:pt-16">
        <div className="pointer-events-none absolute -left-40 top-4 h-96 w-96 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/80 px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t(locale, "home.badge")}
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-[4.5rem]">
            {t(locale, "home.h1a")} <span className="text-brand-500">{t(locale, "home.h1b")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">{t(locale, "home.lead")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login?next=%2Fdownload" className="rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/15 transition hover:-translate-y-0.5 hover:bg-brand-800">
              {t(locale, "home.getPlugin")} <span aria-hidden="true">→</span>
            </Link>
            <Link href="/library" className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
              {t(locale, "home.browse")}
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">{t(locale, "home.freeNote")}</p>
          <div className="mt-10 flex items-center gap-4 border-t border-slate-200 pt-6">
            <div className="flex -space-x-2" aria-hidden="true">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f8f9fc] bg-brand-100 text-xs font-bold text-brand-700">3D</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f8f9fc] bg-[#e6f3ed] text-xs font-bold text-emerald-800">M</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f8f9fc] bg-[#f4ecdd] text-xs font-bold text-amber-800">ID</span>
            </div>
            <p className="text-sm text-slate-500">
              <strong className="font-semibold text-slate-800">{t(locale, "home.socialStrong")}</strong>{" "}
              {t(locale, "home.socialRest")}
            </p>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:justify-self-end">
          <div className="absolute -right-8 -top-9 h-40 w-40 rounded-full bg-brand-100 blur-2xl" />
          <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-[#e4f2eb] blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white bg-white p-3 shadow-[0_32px_100px_-42px_rgba(33,48,108,.42)]">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              <span className="ml-3 text-xs font-medium text-slate-400">{t(locale, "home.mockTitle")}</span>
            </div>
            <div className="grid grid-cols-[104px_1fr] gap-3 p-3 sm:grid-cols-[128px_1fr]">
              <aside className="rounded-2xl bg-[#f5f6fb] p-3">
                <div className="mb-4 flex items-center gap-2">
                  <Image src="/dirory-mark.png" alt="Dirory" width={23} height={25} className="h-6 w-auto" />
                  <span className="text-xs font-bold">Dirory</span>
                </div>
                {mockTabs.map(([label, active]) => (
                  <div key={label} className={`mb-1 rounded-lg px-2 py-2 text-[10px] ${active ? "bg-brand-100 font-semibold text-brand-700" : "text-slate-500"}`}>
                    {label}
                  </div>
                ))}
                <div className="mt-5 border-t border-slate-200 pt-3 text-[9px] uppercase tracking-wider text-slate-400">
                  {t(locale, "nav.brands")}
                </div>
                <div className="mt-2 space-y-2 text-[10px] text-slate-600"><p>◉ TOTO</p><p>◉ ROMAN</p><p>◉ Dirory</p></div>
              </aside>
              <div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-400">
                  <span>⌕ {t(locale, "home.mockSearch")}</span><span>⌘ K</span>
                </div>
                <div className="mt-3 flex gap-2 overflow-hidden text-[10px]">
                  <span className="rounded-full bg-brand-700 px-3 py-1.5 font-semibold text-white">{t(locale, "home.mockAll")}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">{t(locale, "home.mockModels")}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">{t(locale, "home.mockMaterials")}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">{t(locale, "brand.tiles")}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
                  <ProductTile name="Modern basin mixer" brand="TOTO" tone="blue" viewLabel={t(locale, "common.viewProduct")} />
                  <ProductTile name="Stonewash · 60×120" brand="ROMAN" tone="sand" viewLabel={t(locale, "common.viewProduct")} />
                  <ProductTile name="Minimal wall basin" brand="TOTO" tone="green" viewLabel={t(locale, "common.viewProduct")} />
                  <ProductTile name="Warm oak texture" brand="DIRORY" tone="wood" viewLabel={t(locale, "common.viewProduct")} />
                </div>
                <div className="mt-3 rounded-xl bg-[#f7f8fc] px-3 py-2 text-[10px] text-slate-500">{t(locale, "home.mockBrowseNote")}</div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 right-5 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl shadow-slate-900/10 sm:right-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t(locale, "home.builtFor")}</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">{t(locale, "home.builtForSub")}</div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">{t(locale, "home.howTag")}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t(locale, "home.howHeading")}</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <article key={step.number} className="relative rounded-2xl border border-slate-200 bg-[#fbfcff] p-6">
                <div className="text-xs font-bold tracking-widest text-brand-400">{step.number}</div>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
              </article>
            ))}
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">{t(locale, "home.insideTag")}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t(locale, "home.insideHeading")}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">{t(locale, "home.insideBody")}</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {insidePoints.map((line) => (
                  <li key={line} className="flex gap-3">
                    <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                      ✓
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <figure className="relative">
              <div className="absolute -inset-4 rounded-[2rem] bg-brand-50" aria-hidden="true" />
              <Image
                src="/dirory-in-sketchup.png"
                alt={t(locale, "home.insideAlt")}
                width={1193}
                height={680}
                className="relative w-full rounded-2xl border border-slate-200 shadow-[0_28px_80px_-40px_rgba(33,48,108,.5)]"
              />
              <figcaption className="relative mt-3 text-center text-xs text-slate-400">{t(locale, "home.insideCaption")}</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section id="brands" className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">{t(locale, "home.brandsTag")}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t(locale, "home.brandsHeading")}</h2>
          <p className="mt-4 text-sm leading-6 text-slate-600">{t(locale, "home.brandsBody")}</p>
        </div>
        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {brands.map((brand) => (
            <div key={brand.name} className="flex h-24 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-center transition hover:border-brand-200 hover:shadow-sm">
              <span className="text-sm font-semibold tracking-tight text-slate-800">{brand.name}</span>
              <span className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">{brand.note}</span>
            </div>
          ))}
        </div>
      </section>

      {/* The "For brands" section lives on /for-vendors now — one place, not two. */}

      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-10 lg:pb-20">
        <div className="relative overflow-hidden rounded-[2rem] bg-brand-900 px-7 py-10 text-white sm:px-12 sm:py-14">
          <div className="absolute -right-12 -top-24 h-72 w-72 rounded-full border-[42px] border-white/5" />
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-200">{t(locale, "home.ctaTag")}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t(locale, "home.ctaHeading")}</h2>
            <p className="mt-4 leading-7 text-brand-100">{t(locale, "home.ctaBody")}</p>
            <Link href="/login?next=%2Fdownload" className="mt-7 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-brand-800 transition hover:bg-brand-50">
              {t(locale, "home.ctaButton")} <span className="ml-2" aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-800">
            <Image src="/dirory-mark.png" alt="" width={22} height={24} className="h-6 w-auto" /> Dirory
          </Link>
          <p>{t(locale, "footer.tagline")}</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-slate-900">{t(locale, "footer.privacy")}</Link>
            <Link href="/login" className="hover:text-slate-900">{t(locale, "footer.account")}</Link>
            <LanguageToggle locale={locale} />
          </div>
        </div>
      </footer>
    </main>
  );
}

function ProductTile({
  name,
  brand,
  tone,
  viewLabel,
}: {
  name: string;
  brand: string;
  tone: "blue" | "sand" | "green" | "wood";
  viewLabel: string;
}) {
  const tones = {
    blue: "from-[#c7d3ec] to-[#eef1ff]",
    sand: "from-[#e9d7bd] to-[#f8f0e5]",
    green: "from-[#c9e3d4] to-[#edf6ef]",
    wood: "from-[#d4b797] to-[#f2e4d2]",
  };
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
      <div className={`relative flex h-20 items-center justify-center bg-gradient-to-br ${tones[tone]} sm:h-24`}>
        <div className="h-10 w-10 rounded-[35%] border-[5px] border-white/80 shadow-sm sm:h-12 sm:w-12" />
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-white/80 px-1.5 py-0.5 text-[8px] font-semibold text-slate-600">{brand}</span>
        <span className="absolute right-2 top-1 text-white drop-shadow">☆</span>
      </div>
      <div className="px-2.5 py-2">
        <div className="truncate text-[10px] font-semibold text-slate-800">{name}</div>
        <div className="mt-1 text-[9px] text-slate-400">{viewLabel}&nbsp; →</div>
      </div>
    </div>
  );
}
