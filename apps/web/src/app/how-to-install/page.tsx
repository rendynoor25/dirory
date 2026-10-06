import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { VersionCheck } from "./VersionCheck";

export const metadata = {
  title: "How to install",
};

/**
 * Installation guide. Copy comes from lib/i18n.ts so the EN/ID toggle applies.
 */
export default async function HowToInstallPage() {
  const locale = await getLocale();

  const steps: { n: string; title: string; body: React.ReactNode }[] = [
    {
      n: "01",
      title: t(locale, "install.step1Title"),
      body: (
        <>
          <Link href="/login?next=%2Fdownload" className="font-medium text-brand-700 underline">
            {t(locale, "nav.signIn")}
          </Link>{" "}
          — {t(locale, "login.google")}
        </>
      ),
    },
    {
      n: "02",
      title: t(locale, "install.step2Title"),
      body: (
        <>
          <Link href="/download" className="font-medium text-brand-700 underline">
            {t(locale, "download.title")}
          </Link>{" "}
          → <strong>{t(locale, "download.button")}</strong>
        </>
      ),
    },
    { n: "03", title: t(locale, "install.step3Title"), body: <>{t(locale, "download.step1")}</> },
    { n: "04", title: t(locale, "install.step4Title"), body: <>{t(locale, "install.troubleA1")}</> },
    { n: "05", title: t(locale, "install.step5Title"), body: <>{t(locale, "download.step3")}</> },
    { n: "06", title: t(locale, "install.step6Title"), body: <>{t(locale, "download.step4")}</> },
  ];

  const where: [string, string][] = [
    [t(locale, "install.wherePanel"), t(locale, "install.wherePanelValue")],
    [t(locale, "install.whereSignIn"), t(locale, "install.whereSignInValue")],
    [t(locale, "install.whereTest"), t(locale, "install.whereTestValue")],
    [t(locale, "install.whereUpdate"), t(locale, "install.whereUpdateValue")],
  ];

  const trouble: [string, string][] = [
    [t(locale, "install.troubleQ1"), t(locale, "install.troubleA1")],
    [t(locale, "install.troubleQ2"), t(locale, "install.troubleA2")],
    [t(locale, "install.troubleQ3"), t(locale, "install.troubleA3")],
    [t(locale, "install.troubleQ4"), t(locale, "install.troubleA4")],
    [t(locale, "install.troubleQ5"), t(locale, "install.troubleA5")],
    [t(locale, "install.troubleQ6"), t(locale, "install.troubleA6")],
  ];

  return (
    <main className="min-h-screen bg-[#f8f9fc] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Dirory home">
            <Image src="/dirory-mark.png" alt="" width={34} height={37} priority className="h-9 w-auto" />
            <span className="text-lg font-semibold tracking-tight">Dirory</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5" aria-label="Main navigation">
            <Link href="/library" className="text-sm text-slate-600 hover:text-slate-950">
              {t(locale, "nav.library")}
            </Link>
            <Link href="/how-to-install" className="text-sm font-semibold text-brand-700">
              {t(locale, "nav.howToInstall")}
            </Link>
            <LanguageToggle locale={locale} />
            <AccountMenu />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">{t(locale, "install.tag")}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t(locale, "install.title")}</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">{t(locale, "install.lead")}</p>

        <div className="mt-8">
          <VersionCheck locale={locale} />
        </div>

        <h2 className="mt-12 text-xl font-semibold tracking-tight">{t(locale, "install.stepByStep")}</h2>
        <ol className="mt-5 space-y-4">
          {steps.map((step) => (
            <li key={step.n} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                {step.n}
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">{t(locale, "install.whereTitle")}</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t(locale, "install.whereWhat")}</th>
                  <th className="px-4 py-3 font-semibold">{t(locale, "install.whereWhere")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {where.map(([what, whereValue]) => (
                  <tr key={what}>
                    <td className="px-4 py-3">{what}</td>
                    <td className="px-4 py-3 font-medium">{whereValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">{t(locale, "install.updateTitle")}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t(locale, "install.updateBody")}</p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">{t(locale, "install.troubleTitle")}</h2>
          <dl className="mt-4 space-y-3">
            {trouble.map(([q, a]) => (
              <div key={q} className="rounded-2xl border border-slate-200 bg-white p-5">
                <dt className="text-sm font-semibold text-slate-900">{q}</dt>
                <dd className="mt-1 text-sm leading-6 text-slate-600">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-12 rounded-2xl border border-brand-200 bg-brand-50/60 p-6 text-center">
          <h2 className="text-lg font-semibold text-slate-900">{t(locale, "install.readyTitle")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t(locale, "install.readyBody")}</p>
          <Link
            href="/login?next=%2Fdownload"
            className="mt-4 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            {t(locale, "nav.getPlugin")}
          </Link>
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-800">
            <Image src="/dirory-mark.png" alt="" width={20} height={22} className="h-5 w-auto" /> Dirory
          </Link>
          <p>{t(locale, "footer.tagline")}</p>
          <div className="flex items-center gap-5">
            <Link href="/library" className="hover:text-slate-900">{t(locale, "nav.library")}</Link>
            <Link href="/how-to-install" className="hover:text-slate-900">{t(locale, "nav.howToInstall")}</Link>
            <Link href="/privacy" className="hover:text-slate-900">{t(locale, "footer.privacy")}</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
