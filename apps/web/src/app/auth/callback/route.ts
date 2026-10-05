import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth / magic-link return path.
 *
 * Google (and the email link) come back here with `?code=`. We exchange it for a
 * session and then send the user to `next`, or home by default.
 *
 * A subtlety that caused a "sign in does nothing" report: the previous default
 * was `/vendor`, so an architect who signed in from the public site was dumped
 * on a vendor page that then bounced them back to /login — it looked like the
 * sign-in had failed. The default is now the home page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const candidate = url.searchParams.get("next") ?? "/";
  // Do not turn the callback into an open redirect. Only accept local paths.
  const next = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";

  // Google (or Supabase) can return a provider error instead of a code.
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(providerError)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=Missing+code", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    // An admin who landed on the default destination goes to the dashboard.
    // Everyone else continues to `next` (their original target).
    if (profile?.role === "admin" && next === "/") {
      return NextResponse.redirect(new URL("/admin", url.origin));
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
