import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, json, serviceHeaders } from "../_shared/cors.ts";
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
 * `fields=browse` trims every item to the fields the website renders. The full
 * payload outgrew Next's 2 MB per-entry data-cache limit, which silently froze
 * the public /library page; see the note where the flag is read.
 *
 * Auth: apikey / Bearer anon key (the plugin sends it from Connection Settings).
 * Browsing is anonymous (FR-A1). Only approved assets of visible vendors are
 * returned, and visibility follows FR-M6: the platform brand, or an approved
 * vendor with a subscription in trial/active/grace whose period has not ended
 * more than 7 days ago. Samples from the "Dirory" platform brand are always
 * included (FR-A8).
 *
 * This function reads with the service role, so it does NOT go through the
 * `vendor_is_visible()` RLS function. The rule is therefore duplicated here on
 * purpose - migration 0022 changes both, and they must stay in step.
 */
Deno.serve(async (req: Request) => {
  // CORS preflight. A browser sends OPTIONS before any GET carrying the
  // `apikey` header; answering 405 here made the catalogue unreachable from
  // SketchUp for Web / iPad (jsa/docs/GAPS.md B1). Same pattern as the other
  // functions.
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const url = new URL(req.url);
  const updatedSince = url.searchParams.get("updated_since");
  // `thumbs=path` returns a stable, app-proxied thumbnail path instead of a
  // signed storage URL. The website uses this: signed URLs are ~540 chars each
  // (700 KB for 1,300 items) and expire within the hour, so a cached page would
  // show broken images. The plugin keeps the signed URLs (it loads them live).
  const thumbsPathMode = url.searchParams.get("thumbs") === "path";
  // `fields=browse` returns only what the website's pages actually render, and
  // drops the fields the SketchUp plugin needs. Two reasons it exists:
  //
  //  - Size. The full payload is 1.9 MB at today's catalogue and grows with it,
  //    and Next's data cache refuses any single fetch entry over 2 MB
  //    (`hasCustomCacheHandler` aside, see incremental-cache/index.js). Once the
  //    catalogue crossed that line the site could no longer cache the response,
  //    so /library was left rendering the last entry that still fit.
  //  - The website never reads the dropped fields. `thumbnail` and
  //    `material_path` alone are ~15% of the payload each, `brand_logo`,
  //    `legacy_key`, `key`, `vendor_id` and a duplicate `id` make up most of the
  //    rest.
  //
  // The plugin keeps asking for the full shape (FR-A7), so this is opt-in.
  const browseMode = url.searchParams.get("fields") === "browse";
  // `app=revit`: the Revit add-in also gets products that only have a Revit
  // family (no SketchUp file). Everyone else gets the products they can
  // insert, so older SketchUp plugins never show a card they cannot use.
  const forRevit = url.searchParams.get("app") === "revit";

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
        "id,name,type,tags,tile_w_cm,tile_h_cm,current_version_id,updated_at,legacy_key,sku,product_url,dimensions," +
        "categories(name)," +
        "vendors!inner(id,brand_name,is_platform,status,logo_url,logo_path," +
        "subscriptions(status,current_period_end))," +
        "asset_versions!assets_current_version_fk(version,file_path,thumbnail_path,review_status,su_version,revit_file_path)",
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

  // FR-A9 / FR-M6: platform brand, or an approved vendor whose subscription is
  // in trial/active/grace with the period not ended more than 7 days ago.
  const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const vendorVisible = (v: any): boolean => {
    if (!v) return false;
    if (v.is_platform) return true;
    if (v.status !== "approved") return false;
    const subs = Array.isArray(v.subscriptions)
      ? v.subscriptions
      : v.subscriptions
        ? [v.subscriptions]
        : [];
    return subs.some((s: any) => {
      if (!["trial", "active", "grace"].includes(s?.status)) return false;
      // A null end date is a non-expiring (grandfathered) subscription.
      if (s.current_period_end == null) return true;
      return new Date(s.current_period_end).getTime() > nowMs - GRACE_MS;
    });
  };
  const versionOf = (r: any) => (Array.isArray(r.asset_versions) ? r.asset_versions[0] : r.asset_versions);
  const visible = rows.filter((r: any) => {
    if (!vendorVisible(r.vendors)) return false;
    const v = versionOf(r);
    // A Revit-only product: for the add-in and the website, not SketchUp.
    if (r.type === "model" && v && !v.file_path && v.revit_file_path) return forRevit || browseMode;
    return true;
  });

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

    // Every field the website renders — the /library grid and the /product
    // detail page — and nothing else. `fields=browse` returns exactly this.
    const browse = {
      asset_id: r.id,
      name: r.name,
      type: r.type,
      category: r.categories?.name ?? "",
      brand,
      sample: Boolean(r.vendors?.is_platform),
      tags: r.tags ?? [],
      // A displayable URL for the card grid. In path mode this is a stable
      // app-proxied route; otherwise a short-lived signed storage URL.
      thumbnail_url: thumbKey
        ? thumbsPathMode
          ? `/api/thumb/${r.id}`
          : signedThumbs.get(thumbKey) ?? null
        : null,
      tile_size_cm: r.tile_w_cm
        ? [Number(r.tile_w_cm), Number(r.tile_h_cm ?? r.tile_w_cm)]
        : null,
      // FR-V3: free-text size for models, e.g. "120 × 60 × 75 cm".
      dimensions: r.dimensions ?? null,
      // The SketchUp release the file was saved in ("2018", "2021+"), read from
      // the .skp header at upload. A newer file cannot be opened by an older
      // SketchUp, so the panel warns before inserting one.
      su_version: v?.su_version ?? null,
      // Inspector / product-info detail (M6).
      sku: r.sku ?? null,
      product_url: r.product_url ?? null,
      // A Revit family (.rfa) is available for this product.
      has_revit: Boolean(v?.revit_file_path),
    };
    if (browseMode) return browse;

    return {
      // ---- shape preserved from scan_library (FR-A7) ----
      ...browse,
      id: r.id,
      // The raw storage key. The asset file itself is not signed here — the
      // plugin asks /download/<asset_id> when the architect clicks (FR-A11).
      thumbnail: thumbKey,
      model_path: r.type === "model" ? v?.file_path ?? null : null,
      material_path: r.type === "material" ? v?.file_path ?? null : null,
      // The Revit family's storage key; the add-in downloads it with
      // /download/<asset_id>?format=rfa.
      rfa_path: v?.revit_file_path ?? null,
      // The panel keys favourites (and "used before") by this value. It must be
      // present or favouriting silently does nothing: the star toggles
      // `item.key`, which would be undefined. Use the asset id so favourites
      // follow the account across computers (the /favourites endpoint treats a
      // UUID as asset_id and anything else as a legacy local-library path).
      key: r.id,
      version: v?.version ?? 1,
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
