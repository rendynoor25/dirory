/**
 * Return the public-facing origin for an incoming request.
 *
 * Behind Caddy/Docker, `request.url` can be `http://0.0.0.0:3000/...` — that is
 * the container's bind address, not a URL a browser can open. Prefer the
 * configured canonical site URL; use forwarded headers for local/preview
 * environments, then fall back to the request URL only as a last resort.
 */
export function publicOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to forwarded request headers.
    }
  }

  const headers = request.headers;
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host");
  if (host) {
    const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto = forwardedProto || new URL(request.url).protocol.replace(":", "");
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}
