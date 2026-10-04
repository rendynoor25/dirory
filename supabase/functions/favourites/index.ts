// Dirory — favourites sync (PRD FR-A22 / Q15, milestone M6)
//
// v0.5.1 stores favourites per computer in the SketchUp settings:
//   * `favourites` — keys the user starred
//   * `recent`     — the last 60 inserted or painted items, automatic
// and identifies each item by its path inside the local library, produced by
// `relative_key` in main.rb.
//
// From M6 they are stored per account so they follow the user across computers,
// keyed by asset_id. The plugin sends that same key list, so this endpoint is a
// drop-in: nothing in the panel changes.
//
// Auth: the plugin's opaque token (Authorization: Bearer <token>), issued by
// /auth-device. The token resolves to a profile_id here; every row is scoped to
// that profile. (Before M6 this endpoint expected a Supabase user JWT.)
//
//   GET  /favourites           -> { favourites: [...], recent: [...] }
//   POST /favourites           -> replace the list; body { favourites, recent }
//
// Deploy: supabase functions deploy favourites --no-verify-jwt

import { corsHeaders, json } from "../_shared/cors.ts";
import { resolvePluginToken, serviceClient } from "../_shared/plugin-auth.ts";

const MAX_KEYS = 500; // the plugin caps "recent" at 60; allow headroom for stars

interface Payload {
  favourites?: unknown;
  recent?: unknown;
}

function asKeyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 400)
    .slice(0, MAX_KEYS);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A key is either an asset_id (M6+) or a legacy library path. */
function splitKeys(keys: string[]): { assetIds: string[]; legacy: string[] } {
  const assetIds: string[] = [];
  const legacy: string[] = [];
  for (const k of keys) (UUID_RE.test(k) ? assetIds : legacy).push(k);
  return { assetIds, legacy };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const identity = await resolvePluginToken(req.headers.get("Authorization")?.slice(7).trim() ?? null);
  if (!identity) return json({ error: "sign in required" }, 401);
  const profileId = identity.profileId;
  const supabase = serviceClient();

  // ---------------------------------------------------------------- GET
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("favourites")
      .select("asset_id, legacy_key, starred, updated_at")
      .eq("profile_id", profileId)
      .order("updated_at", { ascending: false });
    if (error) return json({ error: "read failed" }, 500);

    const rows = (data ?? []) as {
      asset_id: string | null;
      legacy_key: string | null;
      starred: boolean;
    }[];
    // Return the same two lists the panel already understands.
    const favourites = rows
      .filter((r) => r.starred)
      .map((r) => r.asset_id ?? r.legacy_key)
      .filter(Boolean);
    const recent = rows
      .filter((r) => !r.starred)
      .map((r) => r.asset_id ?? r.legacy_key)
      .filter(Boolean);

    return json({ favourites, recent });
  }

  // ---------------------------------------------------------------- POST
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const starred = asKeyList(body.favourites);
  const recent = asKeyList(body.recent);

  // Replace semantics: the plugin always uploads its full, locally-authoritative
  // list, so deleting the user's rows first keeps the two sides identical.
  const { error: delError } = await supabase.from("favourites").delete().eq("profile_id", profileId);
  if (delError) return json({ error: "replace failed" }, 500);

  const { assetIds: starIds, legacy: starLegacy } = splitKeys(starred);
  const { assetIds: recentIds, legacy: recentLegacy } = splitKeys(recent);

  const rows = [
    ...starIds.map((id) => ({ profile_id: profileId, asset_id: id, legacy_key: null, starred: true })),
    ...starLegacy.map((k) => ({ profile_id: profileId, asset_id: null, legacy_key: k, starred: true })),
    ...recentIds.map((id) => ({ profile_id: profileId, asset_id: id, legacy_key: null, starred: false })),
    ...recentLegacy.map((k) => ({ profile_id: profileId, asset_id: null, legacy_key: k, starred: false })),
  ];

  if (rows.length) {
    const { error: insError } = await supabase.from("favourites").insert(rows);
    if (insError) return json({ error: "write failed" }, 500);
  }

  return json({ ok: true, favourites: starred.length, recent: recent.length });
});
