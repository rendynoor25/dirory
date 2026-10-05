import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public thumbnail proxy for the web catalogue.
 *
 * The `materials` and `models` Supabase buckets are PRIVATE, so the site cannot
 * link to storage directly. Signing a URL per item would work but bloats the
 * catalogue JSON enormously (~540 chars each, 700 KB for 1,300 items) and the
 * signatures expire within the hour, so a cached page would show broken images.
 *
 * Instead the catalogue carries a stable path like `/api/thumb/<asset_id>` and
 * this route signs and streams the image on demand, with a long cache header so
 * the browser and CDN keep it. Only approved thumbnails are served.
 *
 * The path is `<vendor>/<asset>/<file>`; it is validated against the database so
 * this cannot be used to read arbitrary objects.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await ctx.params;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(assetId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  // Service role because the bucket is private and the thumbnail must be shown
  // to anonymous visitors. Only the stored thumbnail path for an approved asset
  // is ever looked up — the caller cannot supply a path.
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: asset } = await supabase
    .from("assets")
    .select(
      "status, type, asset_versions!assets_current_version_fk(thumbnail_path, file_path)",
    )
    .eq("id", assetId)
    .maybeSingle();

  if (!asset || asset.status !== "approved") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const version = Array.isArray(asset.asset_versions)
    ? asset.asset_versions[0]
    : asset.asset_versions;
  const path: string | null = version?.thumbnail_path ?? version?.file_path ?? null;
  if (!path) {
    return NextResponse.json({ error: "no thumbnail" }, { status: 404 });
  }

  const bucket = asset.type === "material" ? "materials" : "materials";
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (!signed?.signedUrl) {
    return NextResponse.json({ error: "sign failed" }, { status: 502 });
  }

  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      // Long browser cache; the underlying file only changes with a new version.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
