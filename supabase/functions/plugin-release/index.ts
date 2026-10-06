// Dirory â€” plugin self-update download (M6 follow-up)
//
//   GET /plugin-release            -> { version, filename }
//   GET /plugin-release/download   -> the .rbz bytes
//        (Authorization: Bearer <plugin token>)
//
// Why this exists: the website serves the RBZ through a cookie session
// (/api/download/rbz), which the SketchUp plugin cannot use â€” it holds an opaque
// device token, not a browser cookie. The plugin checks for an update and then
// downloads the archive from here, authenticated by that token.
//
// The published version is read from a single value so the check and the
// download can never disagree.
//
// Deploy: supabase functions deploy plugin-release --no-verify-jwt

import { corsHeaders, json } from "../_shared/cors.ts";
import { resolvePluginToken, serviceClient } from "../_shared/plugin-auth.ts";

/** Keep in step with apps/web/src/lib/pluginRelease.ts. */
const PLUGIN_VERSION = "0.9.4";
const PLUGIN_FILENAME = `DiroryLibrary-${PLUGIN_VERSION}.rbz`;
// Private bucket created by migration 0009; only the service role touches it.
const BUCKET = "plugin-release";
const OBJECT = PLUGIN_FILENAME;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const isDownload = url.pathname.endsWith("/download");

  // ---- version check (no auth: a version number is not sensitive) ----
  if (!isDownload) {
    return json({
      version: PLUGIN_VERSION,
      filename: PLUGIN_FILENAME,
      download_path: "/plugin-release/download",
    });
  }

  // ---- download (requires a signed-in plugin) ----
  const identity = await resolvePluginToken(req.headers.get("Authorization")?.slice(7).trim() ?? null);
  if (!identity) return json({ error: "sign in required" }, 401);

  const supabase = serviceClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(OBJECT);
  if (error || !data) {
    return json(
      {
        error: "plugin archive not found in storage",
        expected_object: `${BUCKET}/${OBJECT}`,
        hint: "Upload the current .rbz to that storage path when you cut a release.",
      },
      404,
    );
  }

  const bytes = new Uint8Array(await data.arrayBuffer());;
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${PLUGIN_FILENAME}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Plugin-Version": PLUGIN_VERSION,
    },
  });
});
