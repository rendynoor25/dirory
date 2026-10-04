"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "That code does not look right.");

/**
 * FR-A4 (M6) — approve a SketchUp device-code login.
 *
 * The row is only updated while it is still pending and unexpired (enforced by
 * both this WHERE clause and the RLS policy in migration 0007), and it can only
 * be bound to the signed-in user's own profile.
 */
export async function approveDevice(formData: FormData) {
  const rawCode = String(formData.get("code") ?? "");
  const parsed = CodeSchema.safeParse(rawCode);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/auth/device?code=${parsed.success ? parsed.data : ""}`)}`);
  }
  if (!parsed.success) redirect("/auth/device?status=invalid");

  const { data, error } = await supabase
    .from("plugin_device_codes")
    .update({ status: "approved", profile_id: user.id, approved_at: new Date().toISOString() })
    .eq("user_code", parsed.data)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("user_code");

  if (error || !data || data.length === 0) {
    redirect(`/auth/device?code=${parsed.data}&status=invalid`);
  }
  redirect(`/auth/device?code=${parsed.data}&status=approved`);
}
