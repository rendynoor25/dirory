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
