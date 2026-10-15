import { PLUGIN_FILENAME } from "@/lib/pluginRelease";
import { serveGatedDownload } from "@/lib/pluginDownload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The SketchUp extension (.rbz), for a signed-in architect who consented. */
export function GET(request: Request) {
  return serveGatedDownload(request, PLUGIN_FILENAME, "application/octet-stream");
}
