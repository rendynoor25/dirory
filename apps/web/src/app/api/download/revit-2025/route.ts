import { REVIT_FILENAME } from "@/lib/pluginRelease";
import { serveGatedDownload } from "@/lib/pluginDownload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The old "Revit 2025-2027" link (bookmarks, earlier add-ins): it now gets the
 * one installer for every Revit year, like /api/download/revit.
 */
export function GET(request: Request) {
  return serveGatedDownload(request, REVIT_FILENAME, "application/vnd.microsoft.portable-executable");
}
