import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { fetchCatalog } from "@/lib/catalog";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { CatalogBrowser } from "./CatalogBrowser";

export const metadata = {
  title: "Product library",
};

/**
 * Public catalogue (no sign-in needed to browse). Downloading/using a product
 * requires the plugin and an account.
 */
export default async function LibraryPage() {
  const [catalog, locale] = await Promise.all([fetchCatalog(), getLocale()]);
  const models = catalog.items.filter((i) => i.type === "model").length;
  const materials = catalog.items.filter((i) => i.type === "material").length;

  return (
    <main className="min-h-screen bg-[#f8f9fc] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Dirory home">
            <Image src="/dirory-mark.png" alt="" width={34} height={37} priority className="h-9 w-auto" />
            <span className="text-lg font-semibold tracking-tight">Dirory</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5" aria-label="Main navigation">
            <Link href="/library" className="text-sm font-semibold text-brand-700">
              {t(locale, "nav.library")}
            </Link>
            <Link href="/how-to-install" className="hidden text-sm text-slate-600 hover:text-slate-950 sm:inline">
              {t(locale, "nav.howToInstall")}
            </Link>
            <LanguageToggle locale={locale} />
            <AccountMenu />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t(locale, "library.title")}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {t(locale, "library.subtitle", {
              count: catalog.count.toLocaleString(),
              models,
              materials,
            })}
          </p>
        </div>

        {catalog.count === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
            <p className="text-sm text-slate-600">{t(locale, "library.loading")}</p>
          </div>
        ) : (
          <CatalogBrowser items={catalog.items} locale={locale} />
        )}
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
