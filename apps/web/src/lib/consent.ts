/**
 * Plugin download consent (UU 27/2022).
 *
 * Bump `PLUGIN_CONSENT_VERSION` whenever the policy text changes materially.
 * The download route requires an *exact* match with the version stored on the
 * profile, so a revision automatically asks every architect to agree again.
 *
 * The value is a plain string rather than a date object so it round-trips
 * through Postgres without timezone surprises.
 */
export const PLUGIN_CONSENT_VERSION = "2026-10";
