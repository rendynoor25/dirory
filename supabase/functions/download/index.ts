// Dirory — signed asset download for the plugin (PRD §6.3 FR-A11, §10, M6)
//
//   GET /download/<asset_id>        (Authorization: Bearer <plugin token>)
//     -> { url, version, file_name, type, tile_size_cm, thumbnail_url }
//
// The `models` and `materials` buckets are private, so the plugin cannot fetch
// a file from storage directly. It asks here and receives a short-lived signed
// URL (≤ 10 min, PRD §11). Only approved assets of a visible vendor — or the
// Dirory platform brand — are ever signed. Sign-in is required (FR-A2).
//
// Deploy: supabase functions deploy download --no-verify-jwt

import { corsHeaders, json } from "../_shared/cors.ts";
import { resolvePluginToken, serviceClient } from "../_shared/plugin-auth.ts";

const SIGNED_URL_SECONDS = 600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function basename(key: string): string {
  return key.split("/").filter(Boolean).pop() ?? key;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const assetId =
    (segments[segments.length - 1] === "download" ? url.searchParams.get("asset_id") : segments[segments.length - 1]) ??
    url.searchParams.get("asset_id") ??
    "";
  if (!UUID_RE.test(assetId)) return json({ error: "asset_id must be a uuid" }, 400);

  const identity = await resolvePluginToken(req.headers.get("Authorization")?.slice(7).trim() ?? null);
  if (!identity) return json({ error: "sign in required" }, 401);

  const supabase = serviceClient();
  const { data: assetData } = await supabase
    .from("assets")
    .select(
      "id, type, name, status, tile_w_cm, tile_h_cm, current_version_id, " +
        "vendors!inner(is_platform, status), " +
        "asset_versions!assets_current_version_fk(version, file_path, thumbnail_path, review_status)",
    )
    .eq("id", assetId)
    .maybeSingle();

  if (!assetData) return json({ error: "asset not found" }, 404);
  const asset = assetData as any;
  if (asset.status !== "approved") return json({ error: "asset not available" }, 404);

  const vendor = Array.isArray(asset.vendors) ? asset.vendors[0] : asset.vendors;
  const visible = vendor?.is_platform || vendor?.status === "approved";
  if (!visible) return json({ error: "asset not available" }, 404);

  const version = Array.isArray(asset.asset_versions) ? asset.asset_versions[0] : asset.asset_versions;
  if (!version || version.review_status !== "approved" || !version.file_path) {
    return json({ error: "no approved file" }, 404);
  }

  const bucket = asset.type === "material" ? "materials" : "models";
  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(version.file_path, SIGNED_URL_SECONDS);
  if (signError || !signed?.signedUrl) return json({ error: "could not sign the file" }, 500);

  let thumbnailUrl: string | null = null;
  if (version.thumbnail_path) {
    const { data: thumb } = await supabase.storage
      .from("materials")
      .createSignedUrl(version.thumbnail_path, SIGNED_URL_SECONDS);
    thumbnailUrl = thumb?.signedUrl ?? null;
  }

  return json({
    asset_id: asset.id,
    name: asset.name,
    type: asset.type,
    url: signed.signedUrl,
    version: version.version ?? 1,
    file_name: basename(version.file_path),
    file_path: version.file_path,
    thumbnail_url: thumbnailUrl,
    tile_size_cm: asset.tile_w_cm ? [Number(asset.tile_w_cm), Number(asset.tile_h_cm ?? asset.tile_w_cm)] : null,
    expires_in: SIGNED_URL_SECONDS,
  });
});
