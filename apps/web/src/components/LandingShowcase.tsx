import Link from "next/link";
import { productHref } from "@/lib/catalog";
import { t, type Locale } from "@/lib/i18n";
import type { LandingStats } from "@/lib/landingStats";

/**
 * Landing page strip: live catalogue numbers and two scrolling rows, products
 * and brand logos. Pure CSS (`.marquee` in globals.css), so it is a server
 * component and ships no JavaScript. The rows pause on hover, and with reduced
 * motion they stop and become horizontally scrollable instead.
 */
export function LandingShowcase({ stats, locale }: { stats: LandingStats; locale: Locale }) {
  const format = (n: number) => n.toLocaleString(locale === "id" ? "id-ID" : "en-US");
  const figures = [
    { value: stats.products, label: t(locale, "home.statProducts") },
    { value: stats.brands, label: t(locale, "home.statBrands") },
    { value: stats.users, label: t(locale, "home.statUsers") },
  ].filter((f): f is { value: number; label: string } => f.value !== null);

  if (!figures.length && !stats.showcase.length) return null;

  return (
    <section aria-labelledby="showcase-heading" className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 pt-14 lg:px-10 lg:pt-16">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">{t(locale, "home.statsTag")}</p>
            <h2 id="showcase-heading" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t(locale, "home.statsHeading")}
            </h2>
          </div>
          {figures.length > 0 && (
            <dl className="grid grid-cols-3 gap-3 sm:gap-4 lg:min-w-[30rem]">
              {figures.map((f) => (
                <div key={f.label} className="rounded-2xl border border-slate-200 bg-[#fbfcff] px-3 py-4 sm:px-5">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500 sm:text-xs">{f.label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-brand-700 sm:text-3xl">{format(f.value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {stats.showcase.length > 0 && (
        <div className="marquee mt-10" aria-label={t(locale, "home.showcaseLabel")}>
          <ul className="marquee-track" style={{ animationDuration: `${stats.showcase.length * 4}s` }}>
            {[...stats.showcase, ...stats.showcase].map((item, i) => {
              const copy = i >= stats.showcase.length;
              return (
                <li key={`${item.asset_id}-${i}`} aria-hidden={copy || undefined} className="w-36 shrink-0 sm:w-44">
                  <Link
                    href={productHref(item)}
                    tabIndex={copy ? -1 : undefined}
                    className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-brand-200 hover:shadow-md"
                  >
                    <div className="aspect-square bg-slate-100">
                      {/* Plain <img>: /api/thumb streams the stored file with its own cache headers. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.thumbnail_url} alt={copy ? "" : item.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                    </div>
                    <div className="px-3 py-2">
                      <div className="truncate text-xs font-semibold text-slate-800">{item.name}</div>
                      <div className="truncate text-[10px] uppercase tracking-wider text-slate-400">{item.brand}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {stats.logos.length > 0 && (
        <div className="marquee marquee-reverse mt-6 pb-14 lg:pb-16" aria-label={t(locale, "home.logosLabel")}>
          <ul className="marquee-track items-center" style={{ animationDuration: `${Math.max(stats.logos.length * 4, 30)}s` }}>
            {[...stats.logos, ...stats.logos].map((logo, i) => {
              const copy = i >= stats.logos.length;
              return (
                <li key={`${logo.brand}-${i}`} aria-hidden={copy || undefined} className="flex h-16 w-36 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 sm:w-44">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo.url} alt={copy ? "" : logo.brand} loading="lazy" className="max-h-9 max-w-full object-contain" />
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {stats.logos.length === 0 && <div className="pb-14 lg:pb-16" />}
    </section>
  );
}
