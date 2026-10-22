import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { fetchCatalog, type CatalogItem } from "@/lib/catalog";

/**
 * Live numbers and a product showcase for the landing page.
 *
 * Products and brands come from the public catalogue (`fetchCatalog`, already
 * cached for 5 minutes), so they count exactly what a visitor can browse:
 * approved assets of visible vendors. Users are the `profiles` rows — one per
 * auth user, created by the sign-up trigger — counted with the service role and
 * cached for an hour. Nothing here runs per request.
 *
 * A number that cannot be read is `null` and the page leaves it out rather
 * than showing a zero.
 */
export type LandingStats = {
  products: number | null;
  brands: number | null;
  users: number | null;
  showcase: ShowcaseItem[];
  logos: { brand: string; url: string }[];
};

export type ShowcaseItem = Pick<CatalogItem, "asset_id" | "name" | "brand" | "type" | "category"> & {
  thumbnail_url: string;
};

const SHOWCASE_SIZE = 24;

const countUsers = unstable_cache(
  async (): Promise<number | null> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { count, error } = await supabase.from("profiles").select("id", { count: "exact", head: true });
      return error ? null : count;
    } catch {
      return null;
    }
  },
  ["landing-user-count"],
  { revalidate: 3600 },
);

export async function getLandingStats(): Promise<LandingStats> {
  const [catalog, users] = await Promise.all([fetchCatalog(), countUsers()]);
  const items = catalog.items;

  // Dirory's own sample products are not a partner brand.
  const isPartner = (brand: string) => brand.trim().toLowerCase() !== "dirory";
  const brands = new Set(items.map((i) => i.brand).filter(isPartner));
  // `brand_logos` is keyed by lower-cased brand name; recover the display name.
  const brandName = new Map([...brands].map((b) => [b.toLowerCase(), b]));

  return {
    products: items.length || null,
    brands: brands.size || null,
    users: users || null,
    showcase: pickShowcase(items),
    logos: Object.entries(catalog.brand_logos ?? {})
      .filter(([brand, url]) => isPartner(brand) && Boolean(url))
      .map(([key, url]) => ({ brand: brandName.get(key) ?? key, url })),
  };
}

/**
 * A spread of products for the carousel: round-robin across brands so one
 * large vendor does not fill it, alternating models and materials within each
 * brand. Deterministic, so the cached page does not reshuffle per render.
 */
function pickShowcase(items: CatalogItem[]): ShowcaseItem[] {
  const byBrand = new Map<string, ShowcaseItem[]>();
  for (const item of items) {
    if (!item.thumbnail_url || item.sample) continue;
    const list = byBrand.get(item.brand) ?? [];
    list.push({ asset_id: item.asset_id, name: item.name, brand: item.brand, type: item.type, category: item.category, thumbnail_url: item.thumbnail_url });
    byBrand.set(item.brand, list);
  }
  const queues = [...byBrand.values()].map((list) => {
    const models = list.filter((i) => i.type === "model");
    const materials = list.filter((i) => i.type === "material");
    const mixed: ShowcaseItem[] = [];
    for (let i = 0; i < Math.max(models.length, materials.length); i++) {
      if (models[i]) mixed.push(models[i]);
      if (materials[i]) mixed.push(materials[i]);
    }
    return mixed;
  });

  const picked: ShowcaseItem[] = [];
  for (let round = 0; picked.length < SHOWCASE_SIZE && queues.some((q) => q.length > round); round++) {
    for (const queue of queues) {
      if (queue[round] && picked.length < SHOWCASE_SIZE) picked.push(queue[round]);
    }
  }
  return picked;
}
