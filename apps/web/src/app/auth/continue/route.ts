import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/site-url";
import { landingPath, safeNext } from "@/lib/auth-landing";

/**
 * After Google's own sign-in button (GoogleSignInButton): the browser already
 * has a Supabase session, so there is no code to exchange as in /auth/callback.
 * This only sends the user on, the same way /auth/callback does.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent("Sign-in did not finish. Please try again.")}`, publicOrigin(request)),
    );
  }
  return NextResponse.redirect(new URL(await landingPath(supabase, next), publicOrigin(request)));
}
