import { NextResponse } from "next/server";
import { PLUGIN_FILENAME, PLUGIN_VERSION } from "@/lib/pluginRelease";
import { publicOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * Update check for the SketchUp plugin.
 *
 *   GET /api/plugin/latest   ->   { version, filename, download_url, notes }
 *
 * No session is required: a version number is not sensitive, and the plugin
 * needs to know an update exists BEFORE it can sign in to fetch it. The RBZ
 * itself stays behind the /api/download/rbz sign-in gate.
 */
export async function GET(request: Request) {
  // Behind Caddy, request.url is the container address (0.0.0.0:3000), which is
  // not reachable from a browser. Use the canonical public origin.
  const origin = publicOrigin(request);
  return NextResponse.json(
    {
      version: PLUGIN_VERSION,
      filename: PLUGIN_FILENAME,
      download_url: `${origin}/api/download/rbz`,
      // The most recent user-visible changes, newest first. Keep this short —
      // it is shown inside the plugin's update prompt.
      notes: [
        "Search now runs on Enter (clearer results, better demand data).",
        "Inspector window and per-card download badges.",
        "Sign in with Google, no code to type.",
      ],
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
