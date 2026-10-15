import { BUNDLE_FILENAME } from "@/lib/pluginRelease";
import { serveGatedDownload } from "@/lib/pluginDownload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** SketchUp and Revit together (scripts/build-download-bundle.ps1), same gate. */
export function GET(request: Request) {
  return serveGatedDownload(request, BUNDLE_FILENAME, "application/zip");
}
