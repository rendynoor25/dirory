import Image from "next/image";
import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { fetchCatalog } from "@/lib/catalog";
import { CatalogBrowser } from "./CatalogBrowser";

export const metadata = {
  title: "Product library",
  description:
    "Browse every Dirory model and material — real Indonesian brands, free to explore. Install Dirory to use them in SketchUp.",
};

/**
 * Public catalogue (no sign-in needed to browse), like Dekoruma's supply
 * warehouse. Downloading/using a product requires the plugin and an account.
 */
export default async function LibraryPage() {
  const catalog = await fetchCatalog();
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
              Library
            </Link>
            <a
              href="https://dekoruma.freshdesk.com/support/solutions/articles/17000144296-thudio-workspace-onboarding/"
              target="_blank"
              rel="noreferrer"
              className="hidden text-sm text-slate-600 hover:text-slate-950 sm:inline"
            >
              How to use
            </a>
            <AccountMenu />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Product library</h1>
          <p className="mt-1 text-sm text-slate-600">
            {catalog.count.toLocaleString()} products — {models} models and {materials} materials from
            Indonesian brands. Browsing is free; installing Dirory brings them into SketchUp.
          </p>
        </div>

        {catalog.count === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
            <p className="text-sm text-slate-600">
              The catalogue is loading or temporarily unavailable. Please try again shortly.
            </p>
          </div>
        ) : (
          <CatalogBrowser items={catalog.items} />
        )}
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-800">
            <Image src="/dirory-mark.png" alt="" width={20} height={22} className="h-5 w-auto" /> Dirory
          </Link>
          <p>Product library for architects and designers.</p>
          <div className="flex gap-5">
            <Link href="/library" className="hover:text-slate-900">Library</Link>
            <Link href="/download" className="hover:text-slate-900">Get the plugin</Link>
            <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
