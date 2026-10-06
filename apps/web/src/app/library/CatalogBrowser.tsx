"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { CatalogItem } from "@/lib/catalog";
import { productHref, tileLabel } from "@/lib/catalog";
import { t, type Locale } from "@/lib/i18n";

type SortKey = "name" | "brand" | "newest";

/**
 * The public product catalogue: search, type tabs, brand/category filters and a
 * responsive grid. Modelled on Dekoruma's supply-warehouse listing, kept to the
 * two product kinds Dirory has (models and materials).
 *
 * Filtering is client-side over the full catalogue (1,300+ items), which makes
 * it instant and needs no extra endpoints. `locale` comes from the server page.
 */
export function CatalogBrowser({ items, locale }: { items: CatalogItem[]; locale: Locale }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "model" | "material">("all");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [visible, setVisible] = useState(60);

  const brands = useMemo(
    () => Array.from(new Set(items.map((i) => i.brand).filter(Boolean))).sort(),
    [items],
  );
  const categories = useMemo(() => {
    const pool = type === "all" ? items : items.filter((i) => i.type === type);
    return Array.from(new Set(pool.map((i) => i.category).filter(Boolean))).sort();
  }, [items, type]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((item) => {
      if (type !== "all" && item.type !== type) return false;
      if (brand && item.brand !== brand) return false;
      if (category && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
    if (sort === "brand") list.sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
    else if (sort === "newest") list.reverse();
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [items, query, type, brand, category, sort]);

  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > shown.length;

  const resetFilters = () => {
    setQuery("");
    setType("all");
    setBrand("");
    setCategory("");
    setVisible(60);
  };

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-slate-200 bg-[#f8f9fc]/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(60);
              }}
              placeholder={t(locale, "library.searchPlaceholder")}
              aria-label={t(locale, "library.searchLabel")}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label={t(locale, "library.sortLabel")}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-brand-500"
            >
              <option value="name">{t(locale, "library.sortName")}</option>
              <option value="brand">{t(locale, "library.sortBrand")}</option>
              <option value="newest">{t(locale, "library.sortNewest")}</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "model", "material"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setType(kind);
                  setCategory("");
                  setVisible(60);
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  type === kind
                    ? "bg-brand-700 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                }`}
              >
                {kind === "all"
                  ? t(locale, "library.allProducts")
                  : kind === "model"
                    ? t(locale, "library.models")
                    : t(locale, "library.materials")}
              </button>
            ))}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={brand}
                onChange={(e) => {
                  setBrand(e.target.value);
                  setVisible(60);
                }}
                aria-label={t(locale, "library.filterBrand")}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500"
              >
                <option value="">{t(locale, "library.allBrands")}</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setVisible(60);
                }}
                aria-label={t(locale, "library.filterCategory")}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500"
              >
                <option value="">{t(locale, "library.allCategories")}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {(query || type !== "all" || brand || category) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-xl px-2 py-2 text-sm text-slate-500 hover:text-slate-800"
                >
                  {t(locale, "library.clear")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mb-4 text-sm text-slate-500">
        {t(locale, filtered.length === 1 ? "library.countOne" : "library.countMany", {
          count: filtered.length.toLocaleString(),
        })}
        {brand ? t(locale, "library.fromBrand", { brand }) : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
          <p className="text-sm text-slate-600">{t(locale, "library.none")}</p>
          <button type="button" onClick={resetFilters} className="mt-3 text-sm font-medium text-brand-700 hover:underline">
            {t(locale, "library.clear")}
          </button>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((item) => (
              <ProductCard key={item.asset_id} item={item} locale={locale} />
            ))}
          </ul>

          {hasMore ? (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + 60)}
                className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
              >
                {t(locale, "library.showMore", { count: filtered.length - shown.length })}
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function ProductCard({ item, locale }: { item: CatalogItem; locale: Locale }) {
  const kindLabel = item.type === "material" ? t(locale, "library.material") : t(locale, "library.model");
  return (
    <li>
      <Link
        href={productHref(item)}
        className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-slate-900/5"
      >
        <div className="relative aspect-square overflow-hidden bg-[#eceef7]">
          {item.thumbnail_url ? (
            <Image
              src={item.thumbnail_url}
              alt={item.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition duration-300 group-hover:scale-[1.04]"
              unoptimized
            />
          ) : (
            <span className="flex h-full items-center justify-center text-3xl">
              {item.type === "material" ? "🎨" : "📦"}
            </span>
          )}
          <span className="absolute left-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
            {item.brand}
          </span>
          {item.sample ? (
            <span className="absolute right-2 top-2 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {t(locale, "common.freeSample")}
            </span>
          ) : null}
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {kindLabel}
            {item.category ? ` · ${item.category}` : ""}
          </p>
          {tileLabel(item) ? <p className="mt-0.5 text-xs text-slate-400">{tileLabel(item)}</p> : null}
        </div>
      </Link>
    </li>
  );
}
