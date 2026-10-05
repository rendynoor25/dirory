import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Host-based routing for one Next.js app serving two audiences:
 *
 *   dirory.com         → the public / architect surface: landing page, sign-in,
 *                        the plugin's /auth/device approval page, /download.
 *   admin.dirory.com   → the back-office dashboard (the existing /admin/*).
 *
 * The app stays a single deploy; only the entry path differs. On the admin
 * host, `/` (and `/login`) are rewritten to `/admin` so the founder lands on
 * the dashboard, while `/admin/...` links keep working unchanged. On any other
 * host (localhost, *.netlify.app, preview URLs) nothing is rewritten, so local
 * development and preview deploys behave exactly as before.
 *
 * When the apex is still the public host it also refreshes the Supabase session
 * cookie on every navigation, as it did before.
 */

const ADMIN_HOST = (process.env.NEXT_PUBLIC_ADMIN_HOST ?? "admin.dirory.com").toLowerCase();

function hostOf(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return forwarded.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

function isAdminHost(host: string): boolean {
  return host === ADMIN_HOST;
}

export async function middleware(request: NextRequest) {
  const host = hostOf(request);
  const adminHost = isAdminHost(host);
  const path = request.nextUrl.pathname;

  // On the admin host, send the root and a bare /login to the dashboard.
  // /admin/* is left alone so its links and redirects stay consistent.
  let rewriteTo: string | null = null;
  if (adminHost && (path === "/" || path === "/login")) {
    rewriteTo = "/admin";
  }

  // Preserve the original path so server components can tell which host they
  // are on (used to keep absolute links on the right domain).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-dirory-host", host);
  requestHeaders.set("x-dirory-surface", adminHost ? "admin" : "public");

  let response = rewriteTo
    ? NextResponse.rewrite(new URL(rewriteTo, request.url), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });

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
        response = rewriteTo
          ? NextResponse.rewrite(new URL(rewriteTo, request.url), { request: { headers: requestHeaders } })
          : NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // `next` must reflect where the user was headed. On the admin host a bare "/"
  // was rewritten to /admin, so send them back to /admin, not "/".
  const nextPath = rewriteTo ?? path;
  const isProtected = path.startsWith("/admin") || path.startsWith("/vendor") || rewriteTo === "/admin";

  if (isProtected && !user) {
    const redirect = new URL("/login", request.url);
    redirect.searchParams.set("next", nextPath);
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
