import { json } from "../_shared/cors.ts";

/**
 * GET /catalog — approved catalogue for the plugin (PRD §10, M6).
 *
 * Returns the SAME hash shape as the current scan_library output (FR-A7), plus
 * asset_id, version and tile_size_cm, and the FR-A24 brand logo fields.
 *
 * The response mirrors the keys the v0.5.1 panel already reads from
 * `window.diroryRender(...)` (main.rb#send_library): `items`, `brand_logos`.
 * That keeps the panel unchanged when the source switches from the local folder
 * to this endpoint (PRD §6.1 "swap the source, not the shape").
 *
 * Auth: apikey / Bearer anon key (the plugin sends it from Connection Settings).
 * Only approved assets of vendors that are visible (platform brand, approved
 * vendor, or a subscription in trial/active/grace) are returned. Samples from
 * the "Dirory" platform brand are always included (FR-A8).
 */
Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const url = new URL(req.url);
  const updatedSince = url.searchParams.get("updated_since");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  const params = new URLSearchParams({
    select:
      "id,name,type,tags,tile_w_cm,tile_h_cm,current_version_id,updated_at,legacy_key," +
      "categories(name)," +
      "vendors!inner(id,brand_name,is_platform,status,logo_url,logo_path)," +
      "asset_versions!assets_current_version_fk(version,file_path,thumbnail_path,review_status)",
    status: "eq.approved",
    order: "updated_at.asc",
  });
  if (updatedSince) params.set("updated_at", `gt.${updatedSince}`);

  const res = await fetch(`${supabaseUrl}/rest/v1/assets?${params}`, { headers });
  if (!res.ok) return json({ error: "catalog query failed" }, 502);
  const rows = await res.json();

  // FR-A9: only the platform brand and approved (subscription-visible) vendors.
  const visible = rows.filter(
    (r: any) => r.vendors?.is_platform || r.vendors?.status === "approved",
  );

  // FR-A24: the panel keys `brandLogos` by lower-cased brand name.
  // Preference: the uploaded logo (logo_url / logo_path), then nothing — the
  // panel draws a round initial when a brand has no logo.
  const brandLogos: Record<string, string> = {};
  for (const r of visible) {
    const brand = String(r.vendors?.brand_name ?? "Dirory");
    const key = brand.toLowerCase();
    if (brandLogos[key]) continue;
    const logo = publicLogoUrl(supabaseUrl, r.vendors);
    if (logo) brandLogos[key] = logo;
  }

  const items = visible.map((r: any) => {
    const v = Array.isArray(r.asset_versions) ? r.asset_versions[0] : r.asset_versions;
    const brand = r.vendors?.brand_name ?? "Dirory";
    return {
      // ---- shape preserved from scan_library (FR-A7) ----
      id: r.id,
      name: r.name,
      type: r.type,
      category: r.categories?.name ?? "",
      brand,
      sample: Boolean(r.vendors?.is_platform),
      tags: r.tags ?? [],
      thumbnail: v?.thumbnail_path ?? null,
      model_path: r.type === "model" ? v?.file_path ?? null : null,
      material_path: r.type === "material" ? v?.file_path ?? null : null,
      // ---- new fields ----
      asset_id: r.id,
      version: v?.version ?? 1,
      tile_size_cm: r.tile_w_cm
        ? [Number(r.tile_w_cm), Number(r.tile_h_cm ?? r.tile_w_cm)]
        : null,
      // FR-A22: the plugin's local favourite key, so favourites recorded before
      // the cloud catalogue existed can be matched to this asset.
      legacy_key: r.legacy_key ?? null,
      // FR-A24.2: the logo chip on the product card.
      brand_logo: publicLogoUrl(supabaseUrl, r.vendors),
      vendor_id: r.vendors?.id ?? null,
    };
  });

  return json({
    updated_at: new Date().toISOString(),
    count: items.length,
    items,
    // FR-A24: brand banner + Usage tab logos, same shape as main.rb#brand_logos.
    brand_logos: brandLogos,
  });
});

/** Resolve a vendor's logo to a public URL in the `brands` bucket. */
function publicLogoUrl(
  supabaseUrl: string,
  vendor: { logo_url?: string | null; logo_path?: string | null } | null,
): string | null {
  if (!vendor) return null;
  // An explicit URL (set by an admin, or an external CDN) wins.
  if (vendor.logo_url) return vendor.logo_url;
  if (vendor.logo_path) {
    return `${supabaseUrl}/storage/v1/object/public/brands/${vendor.logo_path}`;
  }
  return null;
}
