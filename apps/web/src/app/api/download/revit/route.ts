import { REVIT_FILENAME } from "@/lib/pluginRelease";
import { serveGatedDownload } from "@/lib/pluginDownload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dirory for Revit (scripts/build-revit.ps1), same gate as the SketchUp extension. */
export function GET(request: Request) {
  return serveGatedDownload(request, REVIT_FILENAME, "application/zip");
}
