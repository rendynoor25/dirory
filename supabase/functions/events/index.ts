// Dirory — POST /events ingest (PRD §10, milestone M5)
//
// Wire-compatible with plugin v0.5.0 AND v0.5.1. The two plugin versions send
// byte-identical payloads: cloud.rb is unchanged between them, and v0.5.1's new
// features (Favourite tab, pinned controls, brand logos) are local-only. The
// `favourite` tab is normalised to `all` by the panel before sending, so the
// `tab` field still only carries all|model|material.
//
// Contract:
//   * Answer 2xx only when the WHOLE batch is stored (the plugin then deletes
//     it from its outbox).
//   * Duplicates (same event id) are accepted and ignored — idempotent.
//   * usage_snapshot upserts on (install_id, model_id), appends to
//     usage_history, and an empty items list clears the project.
//   * search_miss increments missing_requests (creates the row when new).
//   * Clients never write these tables directly: this function uses the
//     service role.
//
// Deploy: supabase functions deploy events --no-verify-jwt

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, json, serviceHeaders } from "../_shared/cors.ts";
import { resolveServiceKey } from "../_shared/keys.ts";

const MAX_BATCH = 50;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB per batch

type Kind = "account" | "search_miss" | "usage_snapshot" | "quote_request";

interface EventRow {
  id: string;
  kind: Kind;
  ts?: string;
  data?: Record<string, unknown>;
}

interface Envelope {
  install_id: string;
  user?: { name?: string; email?: string; phone?: string; firm?: string } | null;
  plugin_version?: string;
  su_version?: string;
  platform?: string;
  events: EventRow[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeQuery(text: unknown): string {
  return String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isValid(e: EventRow): boolean {
  if (!e || !UUID_RE.test(String(e.id))) return false;
  if (!["account", "search_miss", "usage_snapshot", "quote_request"].includes(e.kind)) {
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);

  let body: Envelope;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (!body || !UUID_RE.test(String(body.install_id))) {
    return json({ error: "install_id must be a uuid" }, 400);
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return json({ error: "events must be a non-empty array" }, 400);
  }
  if (body.events.length > MAX_BATCH) {
    return json({ error: `at most ${MAX_BATCH} events per batch` }, 400);
  }
  if (!body.events.every(isValid)) return json({ error: "invalid event" }, 400);

  const supabase: SupabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    resolveServiceKey(),
    { auth: { persistSession: false } },
  );

  // --- rate limit: a naive per-install cap, cheap and good enough for v1 ----
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("ingest_log")
    .select("id", { count: "exact", head: true })
    .eq("install_id", body.install_id)
    .gte("received_at", since);
  if ((count ?? 0) >= 120) return json({ error: "rate limited" }, 429);

  // --- idempotency: drop ids we have already stored ------------------------
  const ids = body.events.map((e) => e.id);
  const { data: seen } = await supabase
    .from("ingest_log").select("id").in("id", ids);
  const seenIds = new Set(((seen as { id: string }[] | null) ?? []).map((r) => r.id));
  const fresh = body.events.filter((e) => !seenIds.has(e.id));

  // Resolve the signed-in architect (soft sign-in email → profile), best effort.
  let profileId: string | null = null;
  const email = body.user?.email?.trim().toLowerCase();
  if (email) {
    const { data: userRow } = await supabase
      .schema("auth").from("users").select("id").eq("email", email).maybeSingle();
    profileId = userRow?.id ?? null;
  }

  try {
    // Record every fresh id first so a retry of the same batch is a no-op.
    if (fresh.length) {
      await supabase.from("ingest_log").insert(
        fresh.map((e) => ({ id: e.id, install_id: body.install_id, kind: e.kind })),
      );
    }

    await supabase.from("installs").upsert({
      id: body.install_id,
      profile_id: profileId,
      plugin_version: body.plugin_version ?? null,
      su_version: body.su_version ?? null,
      platform: body.platform ?? null,
      last_seen: new Date().toISOString(),
    }, { onConflict: "id" });

    for (const e of fresh) {
      const data = (e.data ?? {}) as Record<string, unknown>;

      if (e.kind === "search_miss") {
        const query = normalizeQuery(data.query);
        if (query.length < 3 || query.length > 120) continue;

        await supabase.from("search_misses").insert({
          id: e.id,
          install_id: body.install_id,
          profile_id: profileId,
          query_norm: query,
          tab: ["all", "model", "material"].includes(String(data.tab))
            ? data.tab
            : "all",
        });

        // Increment the grouped demand row (FR-M10).
        const { data: existing } = await supabase
          .from("missing_requests").select("id, miss_count").eq("query_norm", query)
          .maybeSingle();
        if (existing) {
          await supabase.from("missing_requests").update({
            miss_count: (existing.miss_count ?? 0) + 1,
            distinct_installs: await distinctInstalls(supabase, query),
            last_seen: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await supabase.from("missing_requests").insert({
            query_norm: query,
            miss_count: 1,
            distinct_installs: 1,
          });
        }
      }

      if (e.kind === "usage_snapshot") {
        const modelId = String(data.model_id ?? "");
        const items = Array.isArray(data.items) ? data.items : [];
        if (!modelId) continue;

        const { data: snap } = await supabase.from("usage_snapshots").upsert({
          install_id: body.install_id,
          profile_id: profileId,
          model_id: modelId,
          // v0.5.2: the plugin sends '' when the architect has NOT consented to
          // sharing the project title (UU 27/2022). Normalise that to null so
          // "opted out" is stored as absence, never as an empty string.
          project: nonEmptyString(data.project),
          totals: (data.totals ?? {}) as Record<string, unknown>,
          taken_at: new Date().toISOString(),
        }, { onConflict: "install_id,model_id" }).select("id").single();

        if (snap?.id) {
          await supabase.from("usage_snapshot_items").delete().eq("snapshot_id", snap.id);
          if (items.length) {
            // PRD §9 mapping note: until M6 the plugin sends the local relative
            // path as `asset`. Link it to a real asset when the catalogue knows
            // that path, via assets.legacy_key.
            const keys = items
              .map((i: Record<string, unknown>) => (typeof i.asset === "string" ? i.asset : null))
              .filter((k): k is string => Boolean(k));
            const keyToAsset = await resolveLegacyKeys(supabase, keys);

            await supabase.from("usage_snapshot_items").insert(
              items.map((i: Record<string, unknown>) => {
                const key = typeof i.asset === "string" ? i.asset : null;
                return {
                  snapshot_id: snap.id,
                  asset_key: key,
                  asset_id: key ? keyToAsset.get(key) ?? null : null,
                  type: i.type === "material" ? "material" : "model",
                  name: i.name ?? null,
                  category: i.category ?? null,
                  brand: i.brand ?? null,
                  qty: Number(i.qty ?? 0),
                  faces: Number(i.faces ?? 0),
                  area_m2: Number(i.area_m2 ?? 0),
                };
              }),
            );
          }
        }
        await supabase.from("usage_history").insert({
          install_id: body.install_id, model_id: modelId, items,
        });
      }

      if (e.kind === "quote_request") {
        // Quote requests are created server-side (M6). The v0.5 event is kept
        // for the WhatsApp hand-off; store it against the brands' vendors when
        // they can be resolved, otherwise leave it in the admin log only.
        const brands = Array.isArray(data.brands) ? data.brands.map(String) : [];
        if (brands.length) {
          const { data: vendors } = await supabase
            .from("vendors").select("id, brand_name").in("brand_name", brands);
          for (const v of vendors ?? []) {
            await supabase.from("quote_requests").insert({
              install_id: body.install_id,
              architect_id: profileId,
              vendor_id: v.id,
              // Same rule as the snapshot: '' means "not consented", not "blank".
              project_name: nonEmptyString(data.project),
              items: Array.isArray(data.items) ? data.items : [],
              status: "new",
            });
          }
        }
      }
      // kind === 'account' needs no storage beyond installs.last_seen.
    }

    return json({ ok: true, received: body.events.length, stored: fresh.length });
  } catch (err) {
    console.error("events ingest failed", err);
    // Non-2xx: the plugin keeps the batch queued and retries.
    return json({ error: "ingest failed" }, 500);
  }
});

async function distinctInstalls(supabase: SupabaseClient, query: string): Promise<number> {
  const { count } = await supabase
    .from("search_misses")
    .select("install_id", { count: "exact", head: true })
    .eq("query_norm", query);
  return count ?? 0;
}

/**
 * Treat a blank string as absent.
 *
 * v0.5.2 sends `project: ''` when the architect has not consented to sharing the
 * project title. Storing that verbatim would put an empty string in the column,
 * which reads as "the project has no title" rather than "we are not allowed to
 * know it". Consent-absent must be stored as absence.
 */
function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * PRD §9 mapping note. The plugin sends the local-library relative path
 * (`Model/Closet/Toto/CW 630 PJ.skp`) as `asset` until M6. Map each path to the
 * catalogue asset that carries it in `legacy_key`. Unknown paths simply resolve
 * to nothing; the row keeps its `asset_key` and is linked later.
 */
async function resolveLegacyKeys(
  supabase: SupabaseClient,
  keys: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!keys.length) return map;

  const { data } = await supabase
    .from("assets")
    .select("id, legacy_key")
    .in("legacy_key", [...new Set(keys)]);

  for (const row of (data as { id: string; legacy_key: string | null }[] | null) ?? []) {
    if (row.legacy_key && !map.has(row.legacy_key)) map.set(row.legacy_key, row.id);
  }
  return map;
}
