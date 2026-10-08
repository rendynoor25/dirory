"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Save the signed-in user's optional city and province.
 *
 * Kept separate from `saveOccupation` so a user can answer one, both or neither
 * without the other being touched. RLS restricts the write to the caller's own
 * profile, and the `force_profile_role` trigger only rewrites `role`.
 *
 * Empty strings clear the field back to NULL, so "answered nothing" stays
 * distinguishable from "answered, then removed it".
 */
export async function saveGeography(input: {
  city?: string;
  province?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const clean = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, 80) : null;
  };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update({ city: clean(input.city), province: clean(input.province) })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
