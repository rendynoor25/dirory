/**
 * The single source of truth for the published plugin version.
 *
 * Both the download route and the update-check endpoint read this, so they can
 * never disagree about what "latest" means. Update this one value (and drop the
 * matching .rbz into apps/web/private/) when you cut a release.
 */
export const PLUGIN_VERSION = "0.10.9";
export const PLUGIN_FILENAME = `DiroryLibrary-${PLUGIN_VERSION}.rbz`;

/** Dirory for Revit (beta). Build with scripts/build-revit.ps1. */
export const REVIT_VERSION = "0.1.19";
export const REVIT_FOR = "2024";
export const REVIT_FILENAME = `DiroryRevit-${REVIT_FOR}-${REVIT_VERSION}.zip`;

/**
 * Revit 2025-2027 (.NET 8 / .NET 10): one zip holding a build per year and an
 * installer that picks the years installed. Build with scripts/build-revit-multi.ps1.
 */
export const REVIT_NEW_FOR = "2025-2027";
export const REVIT_NEW_FILENAME = `DiroryRevit-${REVIT_NEW_FOR}-${REVIT_VERSION}.zip`;

/** SketchUp + Revit (every year) in one archive. Build with scripts/build-download-bundle.ps1. */
export const BUNDLE_FILENAME = `Dirory-SketchUp-${PLUGIN_VERSION}-Revit-${REVIT_VERSION}.zip`;

export type DownloadProduct = "sketchup" | "revit" | "revitNew" | "both";

/** Where each choice on /download is served from. */
export const DOWNLOAD_ROUTES: Record<DownloadProduct, string> = {
  sketchup: "/api/download/rbz",
  revit: "/api/download/revit",
  revitNew: "/api/download/revit-2025",
  both: "/api/download/bundle",
};
