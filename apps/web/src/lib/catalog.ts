/**
 * Shared shapes for the public product catalogue.
 *
 * `CatalogItem` is the **browse** shape: the `catalog` Edge Function returns
 * exactly these fields when asked for `fields=browse`, which is everything the
 * website renders. The plugin asks for the full payload instead (FR-A7) — it
 * also needs `thumbnail`, `material_path`, `key`, `legacy_key` and `brand_logo`.
 *
 * The split is load-bearing. The full payload passed 2 MB, and Next's data
 * cache refuses any single fetch entry over that, so the page could never be
 * cached and silently kept serving a stale catalogue.
 */
export type CatalogItem = {
  asset_id: string;
  name: string;
  type: "model" | "material";
  category: string;
  brand: string;
  sample: boolean;
  tags: string[];
  thumbnail_url: string | null;
  tile_size_cm: [number, number] | null;
  /** Free-text size for models, e.g. "120 × 60 × 75 cm" (FR-V3). */
  dimensions: string | null;
  /** SketchUp release the file was saved in: "2018" or "2021+". Null for materials. */
  su_version: string | null;
  sku: string | null;
  product_url: string | null;
};

export type Catalog = {
  updated_at: string;
  count: number;
  items: CatalogItem[];
  brand_logos: Record<string, string>;
};

/**
 * Fetch the catalogue server-side. Revalidated every 5 minutes so a newly
 * approved product shows up without a redeploy, while a burst of visitors does
 * not hammer the Edge Function.
 *
 * Two query flags, both needed for the cache to work at all:
 *
 * `thumbs=path` asks for stable `/api/thumb/<asset_id>` URLs instead of signed
 * storage URLs. Signed URLs are ~540 characters each (~700 KB for the whole
 * catalogue) and expire within the hour, so a cached page would show broken
 * images — and the payload would exceed Next's 2 MB data-cache limit.
 *
 * `fields=browse` drops the fields only the SketchUp plugin reads. Without it
 * the payload is ~1.9 MB, over Next's 2 MB per-entry cache limit, so Next
 * refuses to store the response, the 5-minute revalidation can never replace
 * the entry, and the page serves the last catalogue that fit.
 */
export async function fetchCatalog(): Promise<Catalog> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { updated_at: new Date().toISOString(), count: 0, items: [], brand_logos: {} };
  }
  try {
    const res = await fetch(`${url}/functions/v1/catalog?thumbs=path&fields=browse`, {
      headers: { apikey: key },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const data = (await res.json()) as Catalog;
    return { ...data, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return { updated_at: new Date().toISOString(), count: 0, items: [], brand_logos: {} };
  }
}

/** A stable slug for a product URL. Uses the asset id, which is unique. */
export function productHref(item: { asset_id: string }): string {
  return `/product/${item.asset_id}`;
}

export function tileLabel(item: Pick<CatalogItem, "tile_size_cm">): string | null {
  if (!item.tile_size_cm || item.tile_size_cm.length < 2) return null;
  return `${item.tile_size_cm[0]} × ${item.tile_size_cm[1]} cm`;
}
