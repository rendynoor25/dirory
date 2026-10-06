import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PLUGIN_VERSION } from "@/lib/pluginRelease";

export const dynamic = "force-dynamic";

export default async function DownloadPage() {
  const [{ user }, locale] = await Promise.all([getSession(), getLocale()]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <Image src="/dirory-mark.png" alt="" width={30} height={33} className="h-8 w-auto" /> Dirory
          </Link>
          <LanguageToggle locale={locale} />
        </div>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-brand-600">{t(locale, "download.tag")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(locale, "download.title")}</h1>

        {user ? (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {t(locale, "download.signedInAs")} <strong className="text-slate-800">{user.email}</strong>.{" "}
              {t(locale, "download.signedInBody")}
            </p>

            <a
              href="/api/download/rbz"
              className="mt-7 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              {t(locale, "download.button")} (v{PLUGIN_VERSION})
            </a>

            <div className="mt-7 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
              <strong>{t(locale, "download.requires")}</strong> {t(locale, "download.requiresBody")}
            </div>

            <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>{t(locale, "download.step1")}</li>
              <li>
                {t(locale, "download.step2")}{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.rbz</code>
              </li>
              <li>{t(locale, "download.step3")}</li>
              <li>{t(locale, "download.step4")}</li>
            </ol>

            <p className="mt-5 text-sm">
              <Link href="/how-to-install" className="font-medium text-brand-700 underline">
                {t(locale, "download.fullGuide")} →
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">{t(locale, "download.signInLead")}</p>
            <Link
              href="/login?next=%2Fdownload"
              className="mt-7 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              {t(locale, "download.signUpOrIn")}
            </Link>
            <p className="mt-5 text-sm">
              <Link href="/how-to-install" className="font-medium text-brand-700 underline">
                {t(locale, "download.howToInstall")} →
              </Link>
            </p>
          </>
        )}

        <p className="mt-7 text-xs text-slate-500">
          <Link href="/privacy" className="underline">{t(locale, "download.privacy")}</Link> ·{" "}
          {t(locale, "download.footerNote")}
        </p>
      </section>
    </main>
  );
}
