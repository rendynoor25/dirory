import Link from "next/link";

/**
 * The product page's single action: get Dirory so this product can be used in
 * SketchUp. There is no "download the file" button on the website — the plugin
 * downloads the asset on demand from inside SketchUp.
 *
 * If the visitor is not signed in, sign-in comes first.
 */
export function DownloadCta({ signedIn, productUrl }: { signedIn: boolean; productUrl: string | null }) {
  return (
    <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50/60 p-5">
      <h2 className="text-base font-semibold text-slate-900">Use this product in SketchUp</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Dirory is a free SketchUp extension. Install it, then click this product in the panel to
        place the model or paint the material. Files download automatically — nothing to save or
        unzip.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {signedIn ? (
          <Link
            href="/download"
            className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            Download the Dirory plugin
          </Link>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent("/download")}`}
            className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            Sign in to install Dirory
          </Link>
        )}
        {productUrl ? (
          <a
            href={productUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            Brand&apos;s product page ↗
          </a>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {signedIn
          ? "Already installed? Open the Dirory panel in SketchUp and search for this product."
          : "A free account keeps your favourites in sync. Browsing needs no account."}
      </p>
    </div>
  );
}
