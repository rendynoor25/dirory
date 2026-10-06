"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOccupation } from "@/lib/occupations";

/**
 * Save the signed-in user's occupation.
 *
 * RLS already restricts the update to the caller's own profile, and the
 * `force_profile_role` trigger only rewrites `role`, so this cannot be used to
 * change anything else.
 *
 * This file is `"use server"`, so `saveOccupation` is the only export — the
 * option list and the type guard live in `lib/occupations.ts`.
 */
export async function saveOccupation(value: string): Promise<{ ok: boolean; error?: string }> {
  if (!isOccupation(value)) return { ok: false, error: "invalid" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const { error } = await supabase.from("profiles").update({ occupation: value }).eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
