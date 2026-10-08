/**
 * The single source of truth for the published plugin version.
 *
 * Both the download route and the update-check endpoint read this, so they can
 * never disagree about what "latest" means. Update this one value (and drop the
 * matching .rbz into apps/web/private/) when you cut a release.
 */
export const PLUGIN_VERSION = "0.9.6";
export const PLUGIN_FILENAME = `DiroryLibrary-${PLUGIN_VERSION}.rbz`;
