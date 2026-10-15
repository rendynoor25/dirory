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
// /favourites. The price book needs Dirory Pro (migration 0039):
//   * a monthly entitlement covers every model;
//   * a project pass covers one model: `model` (sha256 of the SketchUp model's
//     guid, hashed in the plugin) is bound to the pass on first use;
//   * admins pass, for testing.
// Otherwise 402 { error: "pro_required", upgrade_url }.
//
// Deploy: supabase functions deploy rab --no-verify-jwt

import { corsHeaders, json } from "../_shared/cors.ts";
import { resolvePluginToken, serviceClient } from "../_shared/plugin-auth.ts";

const REGION_RE = /^[a-z][a-z0-9_-]{1,40}$/;
const MODEL_RE = /^[0-9a-f]{64}$/;

function siteUrl(): string {
  return (Deno.env.get("SITE_URL") ?? Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://dirory.id")
    .replace(/\/+$/, "");
}

type Entitlement = { id: string; plan_id: string; model_hash: string | null; ends_at: string };

/** True when the profile may use the price book for this model (may bind a pass). */
async function hasPro(
  supabase: ReturnType<typeof serviceClient>,
  profileId: string,
  model: string | null,
): Promise<boolean> {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (profile?.role === "admin") return true;

  const now = new Date().toISOString();
  const { data } = await supabase
    .from("pro_entitlements")
    .select("id, plan_id, model_hash, ends_at, pro_plans!inner(per_model)")
    .eq("profile_id", profileId)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("ends_at", { ascending: true });
  type Row = Entitlement & { pro_plans: { per_model: boolean } | { per_model: boolean }[] };
  const rows = (data ?? []) as unknown as Row[];
  // A many-to-one embed arrives as an object; be tolerant of an array too.
  const perModel = (r: Row) => (Array.isArray(r.pro_plans) ? r.pro_plans[0]?.per_model : r.pro_plans?.per_model) ?? true;

  if (rows.some((r) => !perModel(r))) return true;
  if (!model) return false;
  if (rows.some((r) => r.model_hash === model)) return true;
  const unused = rows.find((r) => r.model_hash === null);
  if (!unused) return false;
  // Bind the soonest-ending unused pass to this model. The `is null` guard
  // keeps two simultaneous requests from binding it twice.
  const { data: bound } = await supabase
    .from("pro_entitlements")
    .update({ model_hash: model })
    .eq("id", unused.id)
    .is("model_hash", null)
    .select("id")
    .maybeSingle();
  return Boolean(bound);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const identity = await resolvePluginToken(req.headers.get("Authorization")?.slice(7).trim() ?? null);
  if (!identity) return json({ error: "sign in required" }, 401);

  const supabase = serviceClient();
  const params = new URL(req.url).searchParams;
  const region = params.get("region");
  const modelParam = (params.get("model") ?? "").toLowerCase();
  const model = MODEL_RE.test(modelParam) ? modelParam : null;

  if (!region) {
    const { data, error } = await supabase.from("rab_regions").select("id, name, fetched").order("name");
    if (error) return json({ error: "read failed" }, 500);
    return json({ regions: data ?? [] });
  }
  if (!REGION_RE.test(region)) return json({ error: "invalid region" }, 400);

  if (!(await hasPro(supabase, identity.profileId, model))) {
    return json({ error: "pro_required", upgrade_url: `${siteUrl()}/pro` }, 402);
  }

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
