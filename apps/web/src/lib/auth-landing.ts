import type { SupabaseClient } from "@supabase/supabase-js";

/** Only local paths, so a sign-in return can never become an open redirect. */
export function safeNext(candidate: string | null | undefined, fallback = "/vendor"): string {
  const next = candidate ?? fallback;
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/**
 * Where a freshly signed-in user goes: `next`, except that an admin heading to
 * the default vendor page goes to the back-office. Shared by /auth/callback
 * (email link, Google redirect) and /auth/continue (Google's own button).
 */
export async function landingPath(supabase: SupabaseClient, next: string): Promise<string> {
  if (next !== "/vendor") return next;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return next;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role === "admin" ? "/admin" : next;
}
