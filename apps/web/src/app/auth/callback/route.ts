import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const candidate = url.searchParams.get("next") ?? "/vendor";
  // Do not turn the callback into an open redirect. Only accept local paths.
  const next = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/vendor";

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

  // Send admins to the back-office, everyone else where they were heading.
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
