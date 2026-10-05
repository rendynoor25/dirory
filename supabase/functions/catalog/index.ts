import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, serviceHeaders } from "../_shared/cors.ts";
import { resolveServiceKey } from "../_shared/keys.ts";

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
 * M6 addition: `models` / `materials` are private, so each item also carries a
 * short-lived `thumbnail_url` (signed) for the card grid. The raw storage key
 * stays in `thumbnail`. The asset file itself is not signed here — the plugin
 * asks /download/<asset_id> when the architect clicks (FR-A11).
 *
 * Auth: apikey / Bearer anon key (the plugin sends it from Connection Settings).
 * Browsing is anonymous (FR-A1). Only approved assets of vendors that are
 * visible (platform brand, approved vendor, or a subscription in
 * trial/active/grace) are returned. Samples from the "Dirory" platform brand are
 * always included (FR-A8).
 */
Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const url = new URL(req.url);
  const updatedSince = url.searchParams.get("updated_since");
  // `thumbs=path` returns a stable, app-proxied thumbnail path instead of a
  // signed storage URL. The website uses this: signed URLs are ~540 chars each
  // (700 KB for 1,300 items) and expire within the hour, so a cached page would
  // show broken images. The plugin keeps the signed URLs (it loads them live).
  const thumbsPathMode = url.searchParams.get("thumbs") === "path";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = resolveServiceKey();
  const headers = serviceHeaders(serviceKey);

  // PostgREST caps a single response at `max_rows` (1,000 on Supabase), so a
  // bigger catalogue must be paged or the tail is silently dropped. Page until a
  // short page arrives.
  const PAGE = 1000;
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      select:
        "id,name,type,tags,tile_w_cm,tile_h_cm,current_version_id,updated_at,legacy_key,sku,product_url," +
        "categories(name)," +
        "vendors!inner(id,brand_name,is_platform,status,logo_url,logo_path)," +
        "asset_versions!assets_current_version_fk(version,file_path,thumbnail_path,review_status)",
      status: "eq.approved",
      order: "updated_at.asc,id.asc",
      limit: String(PAGE),
      offset: String(offset),
    });
    if (updatedSince) params.set("updated_at", `gt.${updatedSince}`);

    const res = await fetch(`${supabaseUrl}/rest/v1/assets?${params}`, { headers });
    if (!res.ok) return json({ error: "catalog query failed" }, 502);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
    if (offset > 200000) break; // hard stop; no real catalogue is this large
  }

  // FR-A9: only the platform brand and approved (subscription-visible) vendors.
  const visible = rows.filter(
    (r: any) => r.vendors?.is_platform || r.vendors?.status === "approved",
  );

  // FR-A24: the panel keys `brandLogos` by lower-cased brand name.
  const brandLogos: Record<string, string> = {};
  for (const r of visible) {
    const brand = String(r.vendors?.brand_name ?? "Dirory");
    const key = brand.toLowerCase();
    if (brandLogos[key]) continue;
    const logo = publicLogoUrl(supabaseUrl, r.vendors);
    if (logo) brandLogos[key] = logo;
  }

  // Sign every distinct thumbnail in batches. The buckets are private, so the
  // card grid cannot load a bare storage key. Skipped entirely in path mode.
  const signedThumbs = new Map<string, string>();
  if (!thumbsPathMode) {
    const thumbPaths: string[] = Array.from(
      new Set(
        visible
          .map((r: any) => {
            const v = Array.isArray(r.asset_versions) ? r.asset_versions[0] : r.asset_versions;
            return v?.thumbnail_path ? String(v.thumbnail_path) : null;
          })
          .filter((p: string | null): p is string => Boolean(p)),
      ),
    );
    if (thumbPaths.length) {
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const CHUNK = 100;
      for (let i = 0; i < thumbPaths.length; i += CHUNK) {
        const chunk = thumbPaths.slice(i, i + CHUNK);
        const { data } = await admin.storage.from("materials").createSignedUrls(chunk, 3600);
        for (const s of data ?? []) {
          if (s?.path && s?.signedUrl) signedThumbs.set(s.path, s.signedUrl);
        }
      }
    }
  }

  const items = visible.map((r: any) => {
    const v = Array.isArray(r.asset_versions) ? r.asset_versions[0] : r.asset_versions;
    const brand = r.vendors?.brand_name ?? "Dirory";
    const thumbKey = v?.thumbnail_path ?? null;
    return {
      // ---- shape preserved from scan_library (FR-A7) ----
      id: r.id,
      name: r.name,
      type: r.type,
      category: r.categories?.name ?? "",
      brand,
      sample: Boolean(r.vendors?.is_platform),
      tags: r.tags ?? [],
      thumbnail: thumbKey,
      // M6: a displayable URL for the card grid. In path mode this is a stable
      // app-proxied route; otherwise a short-lived signed storage URL.
      thumbnail_url: thumbKey
        ? thumbsPathMode
          ? `/api/thumb/${r.id}`
          : signedThumbs.get(thumbKey) ?? null
        : null,
      // The file is delivered by /download/<asset_id> on click, not here.
      model_path: r.type === "model" ? v?.file_path ?? null : null,
      material_path: r.type === "material" ? v?.file_path ?? null : null,
      // ---- new fields ----
      asset_id: r.id,
      version: v?.version ?? 1,
      tile_size_cm: r.tile_w_cm
        ? [Number(r.tile_w_cm), Number(r.tile_h_cm ?? r.tile_w_cm)]
        : null,
      // Inspector / product-info detail (M6).
      sku: r.sku ?? null,
      product_url: r.product_url ?? null,
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
