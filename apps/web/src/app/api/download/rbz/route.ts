import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";

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
    const login = new URL("/login", request.url);
    login.searchParams.set("next", "/download");
    return NextResponse.redirect(login);
  }

  // Require the matching application profile as well as a valid Supabase user.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    const login = new URL("/login", request.url);
    login.searchParams.set("next", "/download");
    login.searchParams.set("error", "Your account profile could not be verified. Please sign in again.");
    return NextResponse.redirect(login);
  }

  const filename = "DiroryLibrary-0.8.2.rbz";
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
