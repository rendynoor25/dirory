import { z } from "zod";

/**
 * Ask Supabase which external providers are actually enabled, so the UI never
 * offers a button that would fail with "provider is not enabled".
 */
export async function googleEnabled(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR-PROJECT-REF")) return false;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      // Never cache: a provider can be turned on in the dashboard at any time.
      cache: "no-store",
    });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return Boolean(settings.external?.google);
  } catch {
    return false;
  }
}

const GoogleClientId = z
  .string()
  .trim()
  .regex(/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/);

/**
 * The Google OAuth web client id for Google's own sign-in button (Google
 * Identity Services), read at runtime so it can be set without a rebuild. It
 * is public: it is in every Google sign-in URL. Null when unset or malformed;
 * the sign-in forms then fall back to Supabase's redirect flow.
 *
 * With the button, Google signs in on dirory.com itself and its account
 * chooser says "to continue to dirory.com" instead of the Supabase project's
 * address. The same id must be in Supabase (Auth → Providers → Google →
 * Client IDs) for signInWithIdToken, and dirory.com in the client's
 * "Authorized JavaScript origins" in Google Cloud.
 */
export function googleClientId(): string | null {
  const parsed = GoogleClientId.safeParse(process.env.GOOGLE_CLIENT_ID ?? "");
  return parsed.success ? parsed.data : null;
}
