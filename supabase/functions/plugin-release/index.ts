// Dirory — plugin self-update (M6 follow-up)
//
//   GET /plugin-release            -> { version, filename, download_path }
//   GET /plugin-release/download   -> the .rbz bytes
//        (Authorization: Bearer <plugin token>)
//
// Why this exists: the website serves the RBZ through a cookie session
// (/api/download/rbz), which the SketchUp plugin cannot use — it holds an opaque
// device token, not a browser cookie. The plugin checks for an update and then
// downloads the archive from here, authenticated by that token.
//
// The published version is **derived from the release bucket**, not hardcoded.
// It used to be a constant, and it drifted: the function still advertised 0.9.4
// while the plugin had reached 0.9.7, so the update check offered a stale
// version and the download pointed at an object that might not exist. Now the
// only step needed to publish a release is uploading the archive —
// `node scripts/upload-plugin-release.mjs` — which is what that script always
// claimed.
//
// Deploy: supabase functions deploy plugin-release --no-verify-jwt

import { corsHeaders, json } from "../_shared/cors.ts";
import { resolvePluginToken, serviceClient } from "../_shared/plugin-auth.ts";

// Private bucket created by migration 0009; only the service role touches it.
const BUCKET = "plugin-release";

type Release = { version: string; object: string };

/** Numeric-aware compare, so 0.9.10 sorts above 0.9.9. */
function compareVersions(a: string, b: string): number {
  const av = a.split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
  const bv = b.split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const d = (av[i] ?? 0) - (bv[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The highest version currently in the bucket, or null when it is empty. */
async function latestRelease(): Promise<Release | null> {
  const supabase = serviceClient();
  const { data, error } = await supabase.storage.from(BUCKET).list("", { limit: 200 });
  if (error || !data) return null;

  const candidates = data
    .map((o) => {
      const m = /^DiroryLibrary-(.+)\.rbz$/i.exec(o.name);
      return m ? { version: m[1], object: o.name } : null;
    })
    .filter((r): r is Release => r !== null);

  if (!candidates.length) return null;
  candidates.sort((a, b) => compareVersions(a.version, b.version));
  return candidates[candidates.length - 1];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const isDownload = url.pathname.endsWith("/download");

  const release = await latestRelease();
  if (!release) {
    // Loud rather than stale: an empty bucket means no release has been uploaded.
    return json(
      {
        error: "no plugin release published",
        expected_bucket: BUCKET,
        hint: "Run: node scripts/upload-plugin-release.mjs",
      },
      404,
    );
  }

  // ---- version check (no auth: a version number is not sensitive) ----
  if (!isDownload) {
    return json({
      version: release.version,
      filename: release.object,
      download_path: "/plugin-release/download",
    });
  }

  // ---- download (requires a signed-in plugin) ----
  const identity = await resolvePluginToken(req.headers.get("Authorization")?.slice(7).trim() ?? null);
  if (!identity) return json({ error: "sign in required" }, 401);

  const supabase = serviceClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(release.object);
  if (error || !data) {
    return json({ error: "plugin archive not readable", expected_object: `${BUCKET}/${release.object}` }, 404);
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${release.object}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Plugin-Version": release.version,
    },
  });
});
