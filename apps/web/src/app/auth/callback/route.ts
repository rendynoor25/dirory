import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase sends the user back here after they click the email link.
 *
 * Three shapes arrive, and each needs a different message:
 *   1. `?code=...`                              → exchange it for a session
 *   2. `?error=...&error_code=...`              → Supabase refused the link
 *      (an expired or already-used one-time link is the common case)
 *   3. no `code` and no `error`                 → the link was opened on the
 *      wrong host, or the Site URL is misconfigured, so the code never came
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorCode = url.searchParams.get("error_code") ?? url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Only accept local paths, so this route cannot be used as an open redirect.
  const candidate = url.searchParams.get("next") ?? "/vendor";
  const next = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/vendor";

  const failure = (message: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, url.origin));

  if (errorCode) {
    if (errorCode === "otp_expired" || /expired/i.test(errorDescription ?? "")) {
      return failure(
        "That sign-in link has expired or was already used. Request a new one — links work once and only for a few minutes.",
      );
    }
    if (errorCode === "access_denied") {
      return failure("That sign-in link was refused. Request a new one.");
    }
    return failure(errorDescription || `Sign-in failed (${errorCode}). Request a new link.`);
  }

  if (!code) {
    return failure(
      "No sign-in code was received. Open the link from the same device, or request a new one. " +
        "If this keeps happening, the Supabase Site URL is probably still set to localhost.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return failure(error.message);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Send admins straight to the back-office unless they were heading elsewhere.
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "admin" && next === "/vendor") {
      return NextResponse.redirect(new URL("/admin", url.origin));
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
