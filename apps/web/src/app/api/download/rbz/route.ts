import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { PLUGIN_FILENAME } from "@/lib/pluginRelease";
import { PLUGIN_CONSENT_VERSION } from "@/lib/consent";
import { publicOrigin } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serve the SketchUp extension only to a signed-in account. */
export async function GET(request: Request) {
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
    .select("id, plugin_consent_version")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    const login = new URL("/login", publicOrigin(request));
    login.searchParams.set("next", "/download");
    login.searchParams.set("error", "Your account profile could not be verified. Please sign in again.");
    return NextResponse.redirect(login);
  }

  // Consent gate (UU 27/2022). Checked here as well as on the page, so a direct
  // link to this route cannot avoid the privacy notice.
  if (profile.plugin_consent_version !== PLUGIN_CONSENT_VERSION) {
    const consent = new URL("/download", publicOrigin(request));
    return NextResponse.redirect(consent);
  }

  const filename = PLUGIN_FILENAME;
  const filePath = path.join(process.cwd(), "private", filename);

  try {
    const file = await readFile(filePath);
    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    console.error("RBZ download artifact missing", cause);
    return NextResponse.json({ error: "Plugin download is temporarily unavailable." }, { status: 503 });
  }
}
