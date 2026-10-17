/**
 * A web address a vendor or admin typed, made safe to store and open.
 *
 * The plugin and the Revit add-in open a product link with the system shell,
 * which would also run a program path, a network share or a file:// link, so
 * only absolute http(s) addresses with a real host name are kept (OWASP A05).
 * "example.com" is accepted and stored as "https://example.com".
 *
 * Returns the normalised URL, null for an empty value, or undefined when the
 * value is not a web address.
 */
export function normaliseWebUrl(input: unknown): string | null | undefined {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (raw.length > 400 || /\s/.test(raw)) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  // A real public host: a dot, letters/digits/hyphens only, no credentials.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) || url.username || url.password) return undefined;
  return url.toString();
}
