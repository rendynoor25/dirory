import { NextResponse } from "next/server";
import { PLUGIN_FILENAME, PLUGIN_VERSION, REVIT_FOR, REVIT_VERSION } from "@/lib/pluginRelease";
import { publicOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * Update check for the SketchUp plugin.
 *
 *   GET /api/plugin/latest   ->   { version, filename, download_url, notes,
 *                                   revit_version, revit_for, revit_download_url }
 *
 * The Revit add-in reads revit_version (Check for Updates on its ribbon).
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
      revit_version: REVIT_VERSION,
      revit_for: REVIT_FOR,
      revit_download_url: `${origin}/download`,
      // The most recent user-visible changes, newest first. Keep this short —
      // it is shown inside the plugin's update prompt.
      notes: [
        "Faster, more reliable start on Windows.",
        "Works when SketchUp is installed in a folder with non-English characters.",
        "Product cards show when a model is downloading and when it is ready.",
      ],
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
