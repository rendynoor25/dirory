/**
 * Shared shapes for the public product catalogue.
 *
 * These mirror the fields the `catalog` Edge Function returns (the same payload
 * the SketchUp plugin consumes), so the website and the plugin always agree on
 * what a product is.
 */
export type CatalogItem = {
  id: string;
  name: string;
  type: "model" | "material";
  category: string;
  brand: string;
  sample: boolean;
  tags: string[];
  thumbnail: string | null;
  thumbnail_url: string | null;
  model_path: string | null;
  material_path: string | null;
  asset_id: string;
  version: number;
  tile_size_cm: [number, number] | null;
  sku: string | null;
  product_url: string | null;
  legacy_key: string | null;
  brand_logo: string | null;
  vendor_id: string | null;
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
 * `thumbs=path` asks for stable `/api/thumb/<asset_id>` URLs instead of signed
 * storage URLs. Signed URLs are ~540 characters each (~700 KB for the whole
 * catalogue) and expire within the hour, so a cached page would show broken
 * images — and the payload would exceed Next's 2 MB data-cache limit.
 */
export async function fetchCatalog(): Promise<Catalog> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { updated_at: new Date().toISOString(), count: 0, items: [], brand_logos: {} };
  }
  try {
    const res = await fetch(`${url}/functions/v1/catalog?thumbs=path`, {
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
