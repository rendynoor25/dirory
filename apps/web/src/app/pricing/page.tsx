import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { canViewCompanyPricing } from "@/lib/businessEmail";
import { formatIDR } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Brand pricing",
  description: "Packages and digitization pricing for brands on Dirory.",
};

/**
 * Brand pricing (founder decision, 9 Oct 2026).
 *
 * Gated behind a company address: Dirory sells to brands, and a work email is a
 * cheap signal that the visitor is one. This is a **soft gate, not security** -
 * it shapes who sees the page, and protects nothing. No RLS policy depends on it.
 *
 * The package rows come from `plans` (migration 0014), so the page and the
 * vendor portal can never quote different prices. The digitization and add-on
 * tables are one-off services that are not modelled in the database yet, so they
 * are listed here as published rates.
 */
export default async function PricingPage() {
  const [{ supabase, user }, locale] = await Promise.all([getSession(), getLocale()]);

  const allowed = canViewCompanyPricing(user?.email);

  const { data: plans } = allowed
    ? await supabase
        .from("plans")
        .select("id, name, price_idr, period, max_assets")
        .eq("active", true)
        .order("price_idr")
    : { data: null };

  return (
    <main className="min-h-screen bg-[#f8f9fc] px-6 py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <Image src="/dirory-mark.png" alt="" width={30} height={33} className="h-8 w-auto" /> Dirory
          </Link>
          <LanguageToggle locale={locale} />
        </div>

        <p className="mt-10 text-xs font-bold uppercase tracking-[.2em] text-brand-600">
          {t(locale, "pricing.tag")}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{t(locale, "pricing.title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{t(locale, "pricing.lead")}</p>

        {/* ---- Gate ------------------------------------------------------- */}
        {!user ? (
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-8">
            <h2 className="text-xl font-semibold text-slate-900">{t(locale, "pricing.gateTitle")}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              {t(locale, "pricing.gateBody")}
            </p>
            <Link
              href="/login?next=%2Fpricing"
              className="mt-6 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              {t(locale, "pricing.gateCta")}
            </Link>
          </div>
        ) : !allowed ? (
          <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-8">
            <h2 className="text-xl font-semibold text-amber-950">{t(locale, "pricing.personalTitle")}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-amber-900">
              {t(locale, "pricing.personalBody").replace("{email}", user.email ?? "")}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/auth/signout"
                className="rounded-full bg-amber-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-950"
              >
                {t(locale, "pricing.gateCta")}
              </Link>
              <a
                href="mailto:hello@dirory.com?subject=Dirory%20brand%20pricing"
                className="rounded-full border border-amber-300 bg-white px-5 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                hello@dirory.com
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* ---- Packages ------------------------------------------------ */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold text-slate-900">{t(locale, "pricing.packagesTitle")}</h2>
              <p className="mt-1 text-sm text-slate-600">{t(locale, "pricing.packagesLead")}</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(plans ?? []).map((p) => (
                  <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                    <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatIDR(Number(p.price_idr))}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t(locale, "pricing.perYear")} · {p.max_assets} {t(locale, "pricing.products")}
                    </p>
                  </div>
                ))}
                {/* Full Range is a negotiated quote, so it is not a purchasable plan. */}
                <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-6">
                  <p className="text-sm font-semibold text-slate-900">Full Range</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {t(locale, "pricing.customQuote")}
                  </p>
                  <p className="text-xs text-slate-500">
                    50+ {t(locale, "pricing.products")} · priority placement · quarterly review
                  </p>
                </div>
              </div>
            </section>

            {/* ---- Digitization -------------------------------------------- */}
            <section className="mt-12">
              <h2 className="text-lg font-semibold text-slate-900">
                {t(locale, "pricing.digitizationTitle")}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{t(locale, "pricing.digitizationLead")}</p>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3 font-medium">Tier</th>
                      <th className="px-5 py-3 font-medium">Examples</th>
                      <th className="px-5 py-3 font-medium">Per product</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <tr>
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {t(locale, "pricing.tierMaterials")}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        Paint colour codes, HPL, tile, andesite
                      </td>
                      <td className="px-5 py-4 text-slate-900">Rp 50.000 - 150.000</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {t(locale, "pricing.tierStandard")}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        Door handles, hinges, downlights, roofing, cladding
                      </td>
                      <td className="px-5 py-4 text-slate-900">Rp 400.000 - 750.000</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {t(locale, "pricing.tierAdvanced")}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        Toilets, sinks, AC units with clearance zones, cooker hoods, aluminium frames
                      </td>
                      <td className="px-5 py-4 text-slate-900">Rp 1.000.000 - 2.500.000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* ---- Add-ons -------------------------------------------------- */}
            <section className="mt-12">
              <h2 className="text-lg font-semibold text-slate-900">{t(locale, "pricing.addonsTitle")}</h2>
              <p className="mt-1 text-sm text-slate-600">{t(locale, "pricing.addonsLead")}</p>
              <ul className="mt-5 space-y-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm">
                <li className="flex justify-between gap-4">
                  <span className="text-slate-700">Update an existing model</span>
                  <span className="font-medium text-slate-900">30% of the original fee</span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-slate-700">Priority placement in category search</span>
                  <span className="font-medium text-slate-900">Rp 2.000.000 - 5.000.000 / month</span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-slate-700">Custom report or data export</span>
                  <span className="font-medium text-slate-900">Rp 1.000.000 / report</span>
                </li>
              </ul>
            </section>

            {/* ---- Contact -------------------------------------------------- */}
            <section className="mt-12 rounded-2xl bg-[#202d70] px-7 py-8 text-white">
              <p className="max-w-2xl text-sm leading-6 text-indigo-100">{t(locale, "pricing.contact")}</p>
              <a
                href="mailto:hello@dirory.com?subject=Dirory%20brand%20pricing"
                className="mt-5 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#26377f] hover:bg-indigo-50"
              >
                hello@dirory.com
              </a>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
