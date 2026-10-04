// Dirory — resolving Supabase keys inside Edge Functions.
//
// Why this file exists.
//
// Supabase is mid-migration from legacy JWT keys to the new short keys:
//
//   legacy `anon`         -> `sb_publishable_...`   (public, browser-safe)
//   legacy `service_role` -> `sb_secret_...`        (privileged, server-only)
//
// Edge Functions receive BOTH sets, and the names are misleading:
//
//   SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  -> the LEGACY values
//   SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS -> JSON objects of the new ones
//
// Supabase's own docs warn that reading the legacy names "keeps you on the
// deprecated path", and there is a known issue (supabase/supabase#37648) where
// those variables continue to hold `eyJ...` values even after new keys exist.
// A project whose dashboard shows `sb_secret_...` would then have its functions
// signing requests with a stale legacy key — a mismatch that is hard to debug.
//
// So: prefer the new variables, fall back to the legacy ones. The fallback keeps
// local `supabase start` and un-migrated projects working.

/** Parse a Supabase "named keys" JSON object, e.g. {"default":"sb_secret_..."}. */
function firstNamedKey(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    // Prefer the conventional name, then whatever single key is present.
    if (typeof parsed.default === "string" && parsed.default) return parsed.default;
    const values = Object.values(parsed).filter((v) => typeof v === "string" && v);
    return values.length ? values[0] : null;
  } catch {
    // Some setups put the bare key in this variable rather than JSON.
    return raw.trim() || null;
  }
}

/** The privileged key for server-side writes (bypasses RLS). */
export function resolveServiceKey(): string {
  const key =
    firstNamedKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!key) {
    throw new Error(
      "No service key available. Expected SUPABASE_SECRET_KEYS, " +
        "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return key;
}

/** The public key, used when acting on behalf of the caller. */
export function resolvePublishableKey(): string {
  const key =
    firstNamedKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")) ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");

  if (!key) {
    throw new Error(
      "No publishable key available. Expected SUPABASE_PUBLISHABLE_KEYS, " +
        "SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY.",
    );
  }
  return key;
}
