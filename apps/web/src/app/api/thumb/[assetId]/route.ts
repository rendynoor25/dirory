import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public thumbnail proxy for the web catalogue AND every native panel
 * (SketchUp, Revit, Rhino).
 *
 * The `materials` / `models` Supabase buckets are PRIVATE, so the site cannot
 * link to storage directly. Signing a URL per item would work, but it bloats
 * the catalogue JSON (~540 chars per item) and the signature expires within the
 * hour, so a cached catalogue shows broken cards. Instead the catalogue carries
 * a stable path `/api/thumb/<asset_id>?v=<version>` and this route signs,
 * fetches, shrinks and caches the image once.
 *
 * Egress matters: the original file can be a multi-megabyte texture. Serving it
 * to every visitor (and to every panel that redraws a card) is what pushed the
 * Supabase project past its free-plan egress. So the first request per asset
 * version:
 *
 *   1. looks up the approved asset and signs its stored thumbnail,
 *   2. downloads the original ONCE,
 *   3. resizes it to at most 800 px and encodes WebP (JPEG for clients that
 *      do not accept WebP),
 *   4. writes it to a local disk cache,
 *
 * and every later request is served from that file with no Supabase traffic.
 * `?v=<version>` makes the response immutable: a new asset version is a new URL,
 * so browsers and panels can keep it for a year.
 *
 * The path is looked up from the database; the caller cannot supply a storage
 * path, so this cannot be used to read arbitrary objects.
 */

const MAX_EDGE = 800;
const WEBP_QUALITY = 72;

/**
 * Persisted in production (docker-compose mounts a volume here). The temp-dir
 * default keeps `next dev` from writing into the repository. The directory
 * holds one small image per asset version, so the full catalogue stays well
 * under 200 MB.
 */
const CACHE_DIR =
  process.env.THUMB_CACHE_DIR || path.join(tmpdir(), "dirory-thumbs");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// asset_versions.version is an integer. Keeping the URL token numeric also
// prevents arbitrary cache keys from filling the thumbnail volume.
const VERSION_RE = /^\d{1,10}$/;

function cacheHeaders(etag: string, immutable: boolean): Record<string, string> {
  return {
    "Cache-Control": immutable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=604800, stale-while-revalidate=2592000",
    // WebP is offered to browsers/panels that accept it, JPEG to the rest
    // (an older macOS WebKit inside SketchUp does not know WebP).
    Vary: "Accept",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };
}

function imageResponse(
  body: Buffer,
  etag: string,
  immutable: boolean,
  contentType: string,
): Response {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      ...cacheHeaders(etag, immutable),
    },
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await ctx.params;
  if (!UUID_RE.test(assetId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const requestedVersion = new URL(request.url).searchParams.get("v") ?? "";
  if (requestedVersion && !VERSION_RE.test(requestedVersion)) {
    return NextResponse.json({ error: "bad version" }, { status: 400 });
  }

  const wantsWebp = (request.headers.get("accept") ?? "")
    .toLowerCase()
    .includes("image/webp");
  const format = wantsWebp ? "webp" : "jpg";

  // The catalogue supplies the version so normal cache hits need no database
  // lookup. On a miss, the token is checked against the current DB version
  // before downloading or caching anything.
  const etag = `"${assetId}-${requestedVersion || "0"}-${MAX_EDGE}-${format}"`;
  const immutable = Boolean(requestedVersion);
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders(etag, immutable) });
  }

  const cacheFile = path.join(
    CACHE_DIR,
    `${assetId}-${requestedVersion || "0"}.${format}`,
  );

  // 1. Local cache: no Supabase, no database, no signing.
  try {
    const cached = await readFile(cacheFile);
    return imageResponse(cached, etag, immutable, wantsWebp ? "image/webp" : "image/jpeg");
  } catch {
    // Not cached yet - fall through.
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  // Service role because the bucket is private and the thumbnail must be shown
  // to anonymous visitors. Only the stored thumbnail path for an approved asset
  // is ever looked up.
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: asset } = await supabase
    .from("assets")
    .select(
      "status, type, asset_versions!assets_current_version_fk(version, thumbnail_path, file_path)",
    )
    .eq("id", assetId)
    .maybeSingle();

  if (!asset || asset.status !== "approved") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const version = Array.isArray(asset.asset_versions)
    ? asset.asset_versions[0]
    : asset.asset_versions;
  if (requestedVersion && String(version?.version ?? "") !== requestedVersion) {
    return NextResponse.json({ error: "stale thumbnail version" }, { status: 404 });
  }
  const storagePath: string | null = version?.thumbnail_path ?? null;
  if (!storagePath) {
    // No preview image. Do NOT fall back to file_path: for a model that is a
    // .skp (sharp would fail, and streaming tens of MB as an image is exactly
    // the egress problem this route exists to stop). The card shows its
    // placeholder icon instead.
    return NextResponse.json({ error: "no thumbnail" }, { status: 404 });
  }

  const { data: signed } = await supabase.storage.from("materials").createSignedUrl(storagePath, 60);
  if (!signed?.signedUrl) {
    return NextResponse.json({ error: "sign failed" }, { status: 502 });
  }

  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }

  const sourceType = upstream.headers.get("content-type") ?? "";
  if (!sourceType.startsWith("image/")) {
    return NextResponse.json({ error: "not an image" }, { status: 404 });
  }

  const original = Buffer.from(await upstream.arrayBuffer());
  let resized: Buffer;
  try {
    const pipeline = sharp(original, { failOn: "none" })
      .rotate() // honour EXIF orientation
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
    resized = wantsWebp
      ? await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
      : // JPEG has no alpha; flatten transparent pixels onto white rather than
        // letting sharp turn them black.
        await pipeline
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 78, mozjpeg: true })
          .toBuffer();
  } catch (err) {
    console.error(`thumb ${assetId}: could not resize`, err);
    return NextResponse.json({ error: "bad image" }, { status: 502 });
  }

  // 2. Persist for the next visitor. Write to a unique temp file first so a
  // concurrent request never reads a half-written image, then rename.
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const tmp = `${cacheFile}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmp, resized);
    await rename(tmp, cacheFile);
  } catch (err) {
    // A read-only cache directory must not break the image: serve the bytes,
    // just without the local cache.
    console.warn(`thumb ${assetId}: could not write cache`, err);
  }

  return imageResponse(resized, etag, immutable, wantsWebp ? "image/webp" : "image/jpeg");
}
