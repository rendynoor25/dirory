"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PLUGIN_CONSENT_VERSION } from "@/lib/consent";

/**
 * Record the architect's sharing choices and acceptance of the plugin privacy
 * notice, then send them to the file.
 *
 * The choices go through `record_my_consent`, which writes the consent log and
 * the profile for the caller only (migration 0034). The plugin picks them up
 * when it signs in. The download route independently requires the same version,
 * so a direct link to /api/download/rbz cannot skip this form.
 */
export async function acceptPluginConsent(form: FormData) {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login?next=%2Fdownload");

  const usage = form.get("share_usage") === "on";
  const { error: consentError } = await supabase.rpc("record_my_consent", {
    p_usage: usage,
    p_project: usage && form.get("share_project") === "on",
    p_search_miss: form.get("share_search_miss") === "on",
    p_version: PLUGIN_CONSENT_VERSION,
  });

  const { error } = consentError
    ? { error: consentError }
    : await supabase
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
  // Changing choices later is not a request for the file again.
  redirect(form.get("stay") === "1" ? "/download" : "/api/download/rbz");
}
