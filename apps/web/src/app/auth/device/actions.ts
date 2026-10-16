"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "That code does not look right.");

const AppSchema = z.enum(["sketchup", "revit"]).catch("sketchup");

function devicePath(code: string, app: string, status?: string) {
  const q = new URLSearchParams({ code, app });
  if (status) q.set("status", status);
  return `/auth/device?${q.toString()}`;
}

/**
 * FR-A4 (M6) — approve a plugin's device-code login (SketchUp or Revit).
 *
 * Only on the architect's click: a browser that is already signed in no
 * longer approves a code by itself, so a code is never bound to an account
 * the architect did not choose.
 *
 * The row is only updated while it is still pending and unexpired (enforced by
 * both this WHERE clause and the RLS policy in migration 0007), and it can only
 * be bound to the signed-in user's own profile.
 */
export async function approveDevice(formData: FormData) {
  const rawCode = String(formData.get("code") ?? "");
  const parsed = CodeSchema.safeParse(rawCode);
  const app = AppSchema.parse(String(formData.get("app") ?? ""));

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!parsed.success) redirect(devicePath("", app, "invalid"));
  if (!user) redirect(devicePath(parsed.data, app));

  const { data, error } = await supabase
    .from("plugin_device_codes")
    .update({ status: "approved", profile_id: user.id, approved_at: new Date().toISOString() })
    .eq("user_code", parsed.data)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("user_code");

  if (error || !data || data.length === 0) redirect(devicePath(parsed.data, app, "invalid"));
  redirect(devicePath(parsed.data, app, "approved"));
}

/** Sign out of this browser and come back to the same code, to pick another account. */
export async function switchAccount(formData: FormData) {
  const parsed = CodeSchema.safeParse(String(formData.get("code") ?? ""));
  const app = AppSchema.parse(String(formData.get("app") ?? ""));
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(devicePath(parsed.success ? parsed.data : "", app));
}
