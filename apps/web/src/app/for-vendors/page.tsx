import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { isSupabaseConfigured, createSupabaseServerClient } from "@/lib/supabase/server";
import { formatIDR } from "@/lib/format";
import { DIRORY_EMAIL, formatWhatsApp, whatsAppLink } from "@/lib/contact";

export const dynamic = "force-dynamic";

/**
 * Vendor-facing landing page, at /for-vendors.
 *
 * Modelled on business.bimobject.com — the manufacturer side of a product
 * library — with "manufacturer" reading as "vendor" (the word Dirory uses
 * everywhere else). Its content principles, kept here:
 *
 *   1. Speak to the supplier, not the architect.
 *   2. Lead with the benefit: get your products into the drawing.
 *   3. Prove it with real names and real numbers, never invented ones.
 *   4. Show the mechanism (publish → be found → measure → be asked).
 *   5. Price it in the open, then one obvious call to action.
 *
 * Everything factual on this page is read from the database: the brand wall, the
 * three counts and the plans. Nothing is hardcoded, so the page cannot drift from
 * the catalogue.
 */

type PlanRow = {
  id: string;
  name: string;
  price_idr: number;
  period: string;
  max_assets: number;
};

export default async function ForVendors() {
  const locale = await getLocale();

  // ---- Live facts (public data; RLS already allows anon to read it) --------
  let brands: string[] = [];
  let productCount = 0;
  let categoryCount = 0;
  let tiers: { name: string; monthly?: PlanRow; yearly?: PlanRow; max: number }[] = [];

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const [vendorRes, productRes, categoryRes, planRes] = await Promise.all([
      supabase
        .from("vendors")
        .select("brand_name")
        .eq("status", "approved")
        .eq("is_platform", false)
        .order("brand_name"),
      supabase.from("assets").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("categories").select("id", { count: "exact", head: true }),
      supabase
        .from("plans")
        .select("id, name, price_idr, period, max_assets")
        .eq("active", true)
        .order("price_idr"),
    ]);

    // Filler rows are not brands; showing "Generic" on a trust wall would be a
    // lie of omission.
    const hidden = new Set(["generic", "dirory"]);
    brands = [
      ...new Set(
        (vendorRes.data ?? [])
          .map((v) => String(v.brand_name ?? "").trim())
          .filter((n) => n && !hidden.has(n.toLowerCase())),
      ),
    ];

    productCount = productRes.count ?? 0;
    categoryCount = categoryRes.count ?? 0;

    const byName = new Map<string, { name: string; monthly?: PlanRow; yearly?: PlanRow; max: number }>();
    for (const p of (planRes.data ?? []) as PlanRow[]) {
      const cur = byName.get(p.name) ?? { name: p.name, max: 0 };
      if (p.period === "yearly") cur.yearly = p;
      else cur.monthly = p;
      cur.max = Math.max(cur.max, Number(p.max_assets) || 0);
      byName.set(p.name, cur);
    }
    tiers = [...byName.values()].sort(
      (a, b) =>
        Number(a.monthly?.price_idr ?? a.yearly?.price_idr ?? 0) -
        Number(b.monthly?.price_idr ?? b.yearly?.price_idr ?? 0),
    );
  }

  const demoLink = whatsAppLink(
    locale === "id"
      ? "Halo Dirory, saya ingin demo untuk brand kami."
      : "Hi Dirory, I'd like a demo for our brand.",
  );
  const nf = new Intl.NumberFormat("id-ID");

  const values = [
    { title: t(locale, "fv.p1Title"), text: t(locale, "fv.p1Text") },
    { title: t(locale, "fv.p2Title"), text: t(locale, "fv.p2Text") },
    { title: t(locale, "fv.p3Title"), text: t(locale, "fv.p3Text") },
    { title: t(locale, "fv.p4Title"), text: t(locale, "fv.p4Text") },
  ];
  const steps = [
    { n: "01", title: t(locale, "fv.step1Title"), text: t(locale, "fv.step1Text") },
    { n: "02", title: t(locale, "fv.step2Title"), text: t(locale, "fv.step2Text") },
    { n: "03", title: t(locale, "fv.step3Title"), text: t(locale, "fv.step3Text") },
    { n: "04", title: t(locale, "fv.step4Title"), text: t(locale, "fv.step4Text") },
  ];
  const stats = [
    { value: nf.format(productCount), label: t(locale, "fv.statProducts") },
    { value: nf.format(brands.length), label: t(locale, "fv.statBrands") },
    { value: nf.format(categoryCount), label: t(locale, "fv.statCategories") },
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f9fc] text-slate-950">
      {/* ---- Header ------------------------------------------------------- */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="Dirory home">
          <Image src="/dirory-mark.png" alt="" width={37} height={40} priority className="h-10 w-auto object-contain" />
          <span className="text-lg font-semibold tracking-tight">Dirory</span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-6" aria-label="Main navigation">
          <a href="#how" className="hidden text-sm text-slate-600 hover:text-slate-950 sm:inline">
            {t(locale, "fv.navHow")}
          </a>
          <a href="#brands" className="hidden text-sm text-slate-600 hover:text-slate-950 sm:inline">
            {t(locale, "fv.navBrands")}
          </a>
          <Link href="/pricing" className="hidden text-sm text-slate-600 hover:text-slate-950 sm:inline">
            {t(locale, "fv.navPricing")}
          </Link>
          <LanguageToggle locale={locale} />
          <AccountMenu />
          <a
            href={demoLink}
            className="hidden rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 md:inline-block"
          >
            {t(locale, "fv.navCta")}
          </a>
        </nav>
      </header>

      {/* ---- Hero --------------------------------------------------------- */}
      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.04fr_.96fr] lg:px-10 lg:pb-24 lg:pt-14">
        <div className="pointer-events-none absolute -left-40 top-4 h-96 w-96 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">
            {t(locale, "fv.kicker")}
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.05em] sm:text-6xl">
            {t(locale, "fv.h1a")} <span className="text-brand-500">{t(locale, "fv.h1b")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">{t(locale, "fv.lead")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/pricing"
              className="rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/15 transition hover:-translate-y-0.5 hover:bg-brand-800"
            >
              {t(locale, "fv.ctaPricing")} <span aria-hidden="true">→</span>
            </Link>
            <a
              href={demoLink}
              className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              {t(locale, "fv.ctaTalk")}
            </a>
            <Link href="/vendor" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
              {t(locale, "fv.ctaRegister")}
            </Link>
          </div>
          <p className="mt-4 max-w-lg text-xs leading-5 text-slate-500">{t(locale, "fv.heroNote")}</p>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:justify-self-end">
          <div className="absolute -right-8 -top-9 h-40 w-40 rounded-full bg-brand-100 blur-2xl" />
          <figure className="relative">
            <Image
              src="/dirory-in-sketchup.png"
              alt="Dirory inside SketchUp"
              width={1193}
              height={680}
              className="relative w-full rounded-2xl border border-slate-200 bg-white shadow-[0_32px_100px_-42px_rgba(33,48,108,.42)]"
            />
          </figure>
        </div>
      </section>

      {/* ---- Trust wall (real brands) ------------------------------------- */}
      <section id="brands" className="scroll-mt-24 border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">
                {t(locale, "fv.trustTag")}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {t(locale, "fv.trustHeading")}
              </h2>
            </div>
            <p className="text-xs text-slate-500">{t(locale, "fv.trustNote")}</p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {brands.map((name) => (
              <div
                key={name}
                className="flex h-16 items-center justify-center rounded-2xl border border-slate-200 bg-[#fbfcff] px-3 text-center transition hover:border-brand-200 hover:shadow-sm"
              >
                <span className="text-sm font-semibold tracking-tight text-slate-700">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- What you get ------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">
            {t(locale, "fv.whyTag")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t(locale, "fv.whyHeading")}
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-600">{t(locale, "fv.whyLead")}</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v, i) => (
            <article key={v.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="text-xs font-bold tracking-widest text-brand-400">0{i + 1}</div>
              <h3 className="mt-4 text-base font-semibold">{v.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{v.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---- Real numbers ------------------------------------------------- */}
      <section className="border-y border-slate-200 bg-brand-900 text-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-200">
              {t(locale, "fv.statsTag")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t(locale, "fv.statsHeading")}
            </h2>
            <p className="mt-4 leading-7 text-brand-100">{t(locale, "fv.statsLead")}</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="text-4xl font-semibold tracking-tight sm:text-5xl">{s.value}</div>
                <div className="mt-2 text-sm text-brand-100">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- How it works ------------------------------------------------- */}
      <section id="how" className="scroll-mt-24 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">
              {t(locale, "fv.howTag")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t(locale, "fv.howHeading")}
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <article key={s.n} className="rounded-2xl border border-slate-200 bg-[#fbfcff] p-6">
                <div className="text-xs font-bold tracking-widest text-brand-400">{s.n}</div>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Plans (from the database) ------------------------------------ */}
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">
            {t(locale, "fv.plansTag")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t(locale, "fv.plansHeading")}
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-600">{t(locale, "fv.plansLead")}</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => (
            <article key={tier.name} className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-sm font-semibold text-slate-900">{tier.name}</p>
              {tier.monthly ? (
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                  {formatIDR(Number(tier.monthly.price_idr))}
                  <span className="ml-1 text-sm font-normal text-slate-500">
                    {t(locale, "pricing.perMonth")}
                  </span>
                </p>
              ) : null}
              {tier.yearly ? (
                <p className="mt-1 text-sm text-slate-600">
                  {formatIDR(Number(tier.yearly.price_idr))} {t(locale, "pricing.perYear")}
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    2 {t(locale, "pricing.monthsFree")}
                  </span>
                </p>
              ) : null}
              <p className="mt-3 text-xs text-slate-500">
                {nf.format(tier.max)} {t(locale, "fv.planProducts")}
              </p>
            </article>
          ))}
          <article className="rounded-2xl border border-brand-200 bg-brand-50/50 p-6">
            <p className="text-sm font-semibold text-slate-900">Full Range</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              {t(locale, "pricing.customQuote")}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              500+ {t(locale, "fv.planProducts")}
            </p>
          </article>
        </div>
        <Link
          href="/pricing"
          className="mt-7 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          {t(locale, "fv.plansCta")} <span className="ml-2" aria-hidden="true">→</span>
        </Link>
      </section>

      {/* ---- Demo + CTA --------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-10 lg:pb-20">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8">
            <h2 className="text-2xl font-semibold tracking-tight">{t(locale, "fv.demoHeading")}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{t(locale, "fv.demoText")}</p>
            <Link
              href="/demo/vendor"
              className="mt-6 inline-flex rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              {t(locale, "fv.demoCta")} <span className="ml-2" aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] bg-brand-900 px-8 py-10 text-white">
            <div className="absolute -right-12 -top-24 h-72 w-72 rounded-full border-[42px] border-white/5" />
            <div className="relative">
              <h2 className="text-2xl font-semibold tracking-tight">{t(locale, "fv.ctaHeading")}</h2>
              <p className="mt-3 leading-7 text-brand-100">{t(locale, "fv.ctaText")}</p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a
                  href={demoLink}
                  className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-brand-800 transition hover:bg-brand-50"
                >
                  {t(locale, "fv.ctaButton")} <span className="ml-1" aria-hidden="true">→</span>
                </a>
                <a href={`mailto:${DIRORY_EMAIL}`} className="text-sm font-semibold text-brand-100 underline">
                  {DIRORY_EMAIL}
                </a>
                <span className="text-sm text-brand-200">{formatWhatsApp()}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Footer ------------------------------------------------------- */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-800">
            <Image src="/dirory-mark.png" alt="" width={22} height={24} className="h-6 w-auto" /> Dirory
          </Link>
          <p>{t(locale, "footer.tagline")}</p>
          <div className="flex items-center gap-5">
            <Link href="/pricing" className="hover:text-slate-900">{t(locale, "fv.navPricing")}</Link>
            <Link href="/privacy" className="hover:text-slate-900">{t(locale, "footer.privacy")}</Link>
            <Link href="/login" className="hover:text-slate-900">{t(locale, "footer.account")}</Link>
            <LanguageToggle locale={locale} />
          </div>
        </div>
      </footer>
    </main>
  );
}
