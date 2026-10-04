// Dirory — server-side quote requests with consent (PRD §6.5 FR-A20, §10, M6)
//
//   POST /quotes        (Authorization: Bearer <plugin token>)
//     body {
//       model_id?, project_name, city, timeline, note,
//       phone_shared, brands?, items: [ { asset_id?, type, name, brand?, qty?, area_m2? } ]
//     }
//     -> { ok: true, quotes: <vendors> }
//
// The architect selects the brands in the Usage tab, then fills a consent form.
// This endpoint splits the selected items per vendor and writes one
// `quote_requests` row per vendor, containing only that vendor's items. The
// Dirory platform brand is never quotable. The WhatsApp hand-off stays optional
// on the client (Q8).
//
// Deploy: supabase functions deploy quotes --no-verify-jwt

import { corsHeaders, json } from "../_shared/cors.ts";
import { resolvePluginToken, serviceClient } from "../_shared/plugin-auth.ts";

const MAX_ITEMS = 200;
const MAX_TEXT = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QuoteItem {
  asset_id: string | null;
  vendor_id: string;
  type: "model" | "material";
  name: string;
  qty: number;
  area_m2: number;
}

function text(value: unknown, max = MAX_TEXT): string {
  const s = String(value ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const identity = await resolvePluginToken(req.headers.get("Authorization")?.slice(7).trim() ?? null);
  if (!identity) return json({ error: "sign in required" }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (!rawItems.length) return json({ error: "no items to quote" }, 400);

  const supabase = serviceClient();

  // Resolve the vendor for each item. Cloud items carry an asset_id; older
  // local items are matched by brand name as a fallback.
  const assetIds = rawItems
    .map((i) => (i && typeof i === "object" ? (i as Record<string, unknown>).asset_id : null))
    .filter((v): v is string => typeof v === "string" && UUID_RE.test(v));

  const vendorByAsset = new Map<string, { vendor_id: string; is_platform: boolean; brand: string }>();
  if (assetIds.length) {
    const { data: assets } = await supabase
      .from("assets")
      .select("id, vendor_id, vendors!inner(is_platform, brand_name)")
      .in("id", Array.from(new Set(assetIds)));
    for (const a of assets ?? []) {
      const vendor = Array.isArray(a.vendors) ? a.vendors[0] : a.vendors;
      vendorByAsset.set(a.id, {
        vendor_id: a.vendor_id,
        is_platform: Boolean(vendor?.is_platform),
        brand: vendor?.brand_name ?? "",
      });
    }
  }

  const brandsInRequest = new Set(
    (Array.isArray(body.brands) ? body.brands : [])
      .map((b) => text(b, 80))
      .filter(Boolean),
  );
  const vendorByBrand = new Map<string, string>();
  if (brandsInRequest.size) {
    const { data: vendors } = await supabase
      .from("vendors")
      .select("id, brand_name, is_platform")
      .in("brand_name", Array.from(brandsInRequest));
    for (const v of vendors ?? []) {
      if (!v.is_platform) vendorByBrand.set(v.brand_name.toLowerCase(), v.id);
    }
  }

  const grouped = new Map<string, QuoteItem[]>();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const assetId = typeof item.asset_id === "string" && UUID_RE.test(item.asset_id) ? item.asset_id : null;
    const mapped = assetId ? vendorByAsset.get(assetId) : undefined;
    let vendorId = mapped?.vendor_id ?? null;
    if (mapped?.is_platform) continue; // samples are not quotable (FR-A8)

    if (!vendorId) {
      const brand = text(item.brand, 80).toLowerCase();
      if (!brand) continue;
      vendorId = vendorByBrand.get(brand) ?? null;
      if (!vendorId) {
        const { data: v } = await supabase
          .from("vendors")
          .select("id, is_platform")
          .eq("brand_name", text(item.brand, 80))
          .maybeSingle();
        if (!v || v.is_platform) continue;
        vendorId = v.id;
      }
    }
    if (!vendorId) continue;

    const type = item.type === "material" ? "material" : "model";
    const list = grouped.get(vendorId) ?? [];
    list.push({
      asset_id: assetId,
      vendor_id: vendorId,
      type,
      name: text(item.name, 200),
      qty: Math.max(0, Math.min(100000, Number(item.qty) || 0)),
      area_m2: Math.max(0, Math.min(1_000_000, Number(item.area_m2) || 0)),
    });
    grouped.set(vendorId, list);
  }

  if (!grouped.size) return json({ error: "no quotable items (samples cannot be quoted)" }, 400);

  const installId = /^[0-9a-f-]{36}$/i.test(text(body.install_id, 40)) ? text(body.install_id, 40) : null;
  const projectName = text(body.project_name);
  const city = text(body.city, 120);
  const timeline = text(body.timeline, 120);
  const note = text(body.note, 1000);
  const phoneShared = Boolean(body.phone_shared);

  const rows = Array.from(grouped.entries()).map(([vendorId, items]) => ({
    architect_id: identity.profileId,
    install_id: installId,
    vendor_id: vendorId,
    // Respect consent: only store the project title when the architect shared it.
    project_name: projectName || null,
    city: city || null,
    timeline: timeline || null,
    note: note || null,
    phone_shared: phoneShared,
    items,
    status: "new",
  }));

  const { error } = await supabase.from("quote_requests").insert(rows);
  if (error) return json({ error: "could not save the quote request" }, 500);

  return json({ ok: true, quotes: rows.length });
});
