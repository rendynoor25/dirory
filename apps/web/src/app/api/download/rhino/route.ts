import { RHINO_FILENAME } from "@/lib/pluginRelease";
import { serveGatedDownload } from "@/lib/pluginDownload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dirory for Rhino 8 (scripts/build-rhino.ps1), same gate as the SketchUp extension. */
export function GET(request: Request) {
  return serveGatedDownload(request, RHINO_FILENAME, "application/octet-stream");
}
