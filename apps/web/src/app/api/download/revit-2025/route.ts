import { REVIT_NEW_FILENAME } from "@/lib/pluginRelease";
import { serveGatedDownload } from "@/lib/pluginDownload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dirory for Revit 2025-2027 (scripts/build-revit-multi.ps1), same gate as the other downloads. */
export function GET(request: Request) {
  return serveGatedDownload(request, REVIT_NEW_FILENAME, "application/zip");
}
