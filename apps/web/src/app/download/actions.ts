"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PLUGIN_CONSENT_VERSION } from "@/lib/consent";

/**
 * Record that the architect accepted the plugin privacy notice, then send them
 * to the file.
 *
 * Only the caller's own profile row is written, which the existing RLS policy
 * already permits. The download route independently requires the same version,
 * so a direct link to /api/download/rbz cannot skip this dialog.
 */
export async function acceptPluginConsent() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login?next=%2Fdownload");

  const { error } = await supabase
    .from("profiles")
    .update({
      plugin_consent_at: new Date().toISOString(),
      plugin_consent_version: PLUGIN_CONSENT_VERSION,
    })
    .eq("id", user.id);

  if (error) {
    // Send them back to the page with a message rather than to a broken file.
    console.error("could not record plugin consent", error);
    redirect("/download?error=consent");
  }

  revalidatePath("/download");
  redirect("/api/download/rbz");
}
