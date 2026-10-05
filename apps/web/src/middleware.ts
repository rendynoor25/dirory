import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * One domain, one app: `dirory.com`.
 *
 * Everything is served from the same host — the public pages (`/`, `/library`,
 * `/login`, `/download`, `/auth/device`) and the back-office at `/admin`. There
 * is no host-based routing any more: a single domain means one TLS certificate,
 * one cookie scope, and sign-in that works across the whole site.
 *
 * This middleware does two things:
 *   1. Refreshes the Supabase session cookie on every navigation (required by
 *      @supabase/ssr so server components see a valid session).
 *   2. Sends signed-out visitors to /login when they hit a protected area.
 *
 * Authorization itself lives in the database (RLS) and in `requireAdmin()`;
 * this is only a friendly redirect, not the security boundary.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR-PROJECT-REF")) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/admin") || path.startsWith("/vendor");

  if (isProtected && !user) {
    const redirect = new URL("/login", request.url);
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
