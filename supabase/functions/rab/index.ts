// Dirory — RAB price book for the plugin (Dirory Pro: Bill of Quantities)
//
//   GET /rab?region=jakarta
//     -> { region, name, currency, overhead_pct, source, fetched,
//          items: [{ key, name, element, quantity_basis, unit, unit_price,
//                    title, reference, components: [...] }] }
//   GET /rab                -> { regions: [{ id, name, fetched }] }
//
// The plugin multiplies these unit prices by the quantities of its own
// takeoff (plugin/dirory_library/ui/rab.js); geometry never leaves SketchUp.
//
// Auth: the plugin's opaque token (Authorization: Bearer <token>), as for
// /favourites. Signed-in only for now; this is where the Dirory Pro check
// (subscription or per-project pass) goes in step 3.
//
// Deploy: supabase functions deploy rab --no-verify-jwt

import { corsHeaders, json } from "../_shared/cors.ts";
import { resolvePluginToken, serviceClient } from "../_shared/plugin-auth.ts";

const REGION_RE = /^[a-z][a-z0-9_-]{1,40}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const identity = await resolvePluginToken(req.headers.get("Authorization")?.slice(7).trim() ?? null);
  if (!identity) return json({ error: "sign in required" }, 401);

  const supabase = serviceClient();
  const region = new URL(req.url).searchParams.get("region");

  if (!region) {
    const { data, error } = await supabase.from("rab_regions").select("id, name, fetched").order("name");
    if (error) return json({ error: "read failed" }, 500);
    return json({ regions: data ?? [] });
  }
  if (!REGION_RE.test(region)) return json({ error: "invalid region" }, 400);

  const { data: reg, error: regError } = await supabase
    .from("rab_regions")
    .select("id, name, currency, overhead_pct, source, fetched")
    .eq("id", region)
    .maybeSingle();
  if (regError) return json({ error: "read failed" }, 500);
  if (!reg) return json({ error: "unknown region" }, 404);

  const [{ data: items, error: itemsError }, { data: comps, error: compsError }] = await Promise.all([
    supabase
      .from("rab_items")
      .select("key, name, element, quantity_basis, unit, unit_price, title, reference, source_ref")
      .eq("region_id", region)
      .order("sort"),
    supabase
      .from("rab_components")
      .select("item_key, kind, code, name, unit, coef, price")
      .eq("region_id", region)
      .order("id"),
  ]);
  if (itemsError || compsError) return json({ error: "read failed" }, 500);

  const byItem = new Map<string, unknown[]>();
  for (const c of (comps ?? []) as { item_key: string }[]) {
    const { item_key, ...rest } = c;
    if (!byItem.has(item_key)) byItem.set(item_key, []);
    byItem.get(item_key)!.push(rest);
  }

  return json({
    region: reg.id,
    name: reg.name,
    currency: reg.currency,
    overhead_pct: Number(reg.overhead_pct),
    source: reg.source,
    fetched: reg.fetched,
    items: ((items ?? []) as { key: string; unit_price: number }[]).map((it) => ({
      ...it,
      unit_price: Number(it.unit_price),
      components: byItem.get(it.key) ?? [],
    })),
  });
});
