import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { PLUGIN_CONSENT_VERSION } from "@/lib/consent";
import { publicOrigin } from "@/lib/site-url";

/**
 * Serve a file from apps/web/private only to a signed-in architect who has
 * accepted the current privacy notice and made the sharing choices
 * (UU PDP). Shared by the SketchUp, Revit and combined downloads, so the
 * three can never drift apart: a direct link cannot skip the notice.
 */
export async function serveGatedDownload(request: Request, filename: string, contentType: string) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Account sign-in is temporarily unavailable." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    const login = new URL("/login", publicOrigin(request));
    login.searchParams.set("next", "/download");
    return NextResponse.redirect(login);
  }

  // Require the matching application profile as well as a valid Supabase user.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, plugin_consent_version, consent_version")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    const login = new URL("/login", publicOrigin(request));
    login.searchParams.set("next", "/download");
    login.searchParams.set("error", "Your account profile could not be verified. Please sign in again.");
    return NextResponse.redirect(login);
  }

  if (
    profile.plugin_consent_version !== PLUGIN_CONSENT_VERSION ||
    profile.consent_version !== PLUGIN_CONSENT_VERSION
  ) {
    return NextResponse.redirect(new URL("/download", publicOrigin(request)));
  }

  try {
    const file = await readFile(path.join(process.cwd(), "private", filename));
    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    console.error("download artifact missing", filename, cause);
    return NextResponse.json({ error: "This download is temporarily unavailable." }, { status: 503 });
  }
}
