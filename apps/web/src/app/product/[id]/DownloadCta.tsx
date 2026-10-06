import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";

/**
 * The product page's single action: get Dirory so this product can be used in
 * SketchUp. There is no "download the file" button on the website — the plugin
 * downloads the asset on demand from inside SketchUp.
 *
 * If the visitor is not signed in, sign-in comes first.
 */
export function DownloadCta({
  signedIn,
  productUrl,
  locale,
}: {
  signedIn: boolean;
  productUrl: string | null;
  locale: Locale;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50/60 p-5">
      <h2 className="text-base font-semibold text-slate-900">{t(locale, "product.useTitle")}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{t(locale, "product.useBody")}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        {signedIn ? (
          <Link
            href="/download"
            className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            {t(locale, "product.downloadPlugin")}
          </Link>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent("/download")}`}
            className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            {t(locale, "product.signInInstall")}
          </Link>
        )}
        {productUrl ? (
          <a
            href={productUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            {t(locale, "product.brandPage")} ↗
          </a>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {signedIn ? t(locale, "product.signedInHint") : t(locale, "product.signedOutHint")}
      </p>
    </div>
  );
}
