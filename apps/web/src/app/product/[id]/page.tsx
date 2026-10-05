import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountMenu } from "@/components/AccountMenu";
import { fetchCatalog, tileLabel, type CatalogItem } from "@/lib/catalog";
import { getSession } from "@/lib/auth";
import { DownloadCta } from "./DownloadCta";

export const metadata = {
  title: "Product",
};

/**
 * Product detail page, modelled on Dekoruma's product pages: a big image, the
 * specifications, and a single clear action.
 *
 * The action is NOT "add to cart" — Dirory is a design library. It is "install
 * Dirory to use this in SketchUp": install the plugin, and if the visitor is not
 * signed in, sign in first.
 */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const catalog = await fetchCatalog();
  const item = catalog.items.find((i) => i.asset_id === id);
  if (!item) notFound();

  const { user } = await getSession();

  const related: CatalogItem[] = catalog.items
    .filter((i) => i.asset_id !== item.asset_id && (i.brand === item.brand || i.category === item.category))
    .slice(0, 8);

  const specs: [string, string][] = [
    ["Brand", item.brand],
    ["Category", item.category || "—"],
    ["Type", item.type === "material" ? "Material (texture)" : "3D model (component)"],
  ];
  const tile = tileLabel(item);
  if (tile) specs.push(["Tile size", tile]);
  if (item.sku) specs.push(["SKU / code", item.sku]);
  if (item.tags.length) specs.push(["Tags", item.tags.join(", ")]);

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
              Library
            </Link>
            <AccountMenu />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/library" className="hover:text-slate-800">
            Library
          </Link>
          {item.type ? (
            <>
              <span className="mx-1.5">/</span>
              <Link href={`/library?type=${item.type}`} className="hover:text-slate-800">
                {item.type === "material" ? "Materials" : "Models"}
              </Link>
            </>
          ) : null}
          {item.category ? (
            <>
              <span className="mx-1.5">/</span>
              <span className="text-slate-700">{item.category}</span>
            </>
          ) : null}
        </nav>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="relative aspect-square bg-[#eceef7]">
              {item.thumbnail_url ? (
                <Image
                  src={item.thumbnail_url}
                  alt={item.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                  priority
                  unoptimized
                />
              ) : (
                <span className="flex h-full items-center justify-center text-6xl">
                  {item.type === "material" ? "🎨" : "📦"}
                </span>
              )}
              {item.sample ? (
                <span className="absolute left-3 top-3 rounded-md bg-emerald-600/90 px-2 py-1 text-xs font-semibold text-white">
                  Free sample
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">{item.brand}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{item.name}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {item.type === "material" ? "Material" : "3D model"}
              {item.category ? ` · ${item.category}` : ""}
            </p>

            <dl className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {specs.map(([label, value]) => (
                <div key={label} className="flex gap-4 px-4 py-3">
                  <dt className="w-32 shrink-0 text-sm text-slate-500">{label}</dt>
                  <dd className="text-sm font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>

            <DownloadCta signedIn={Boolean(user)} productUrl={item.product_url} />
          </div>
        </div>

        {related.length ? (
          <section className="mt-14">
            <h2 className="text-lg font-semibold">More from {item.brand} and {item.category}</h2>
            <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((r) => (
                <li key={r.asset_id}>
                  <Link
                    href={`/product/${r.asset_id}`}
                    className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5"
                  >
                    <div className="relative aspect-square bg-[#eceef7]">
                      {r.thumbnail_url ? (
                        <Image
                          src={r.thumbnail_url}
                          alt={r.name}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-3xl">
                          {r.type === "material" ? "🎨" : "📦"}
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold text-slate-800">{r.name}</p>
                      <p className="truncate text-xs text-slate-500">{r.brand}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
