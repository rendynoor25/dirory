// Dirory — shared helpers for Edge Functions.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Auth headers for a server-to-server REST call using the service key.
 *
 * Supabase issues two key formats that need different headers:
 *   - new keys (`sb_secret_...`, `sb_publishable_...`) are NOT JWTs and must be
 *     sent on `apikey` only; adding `Authorization: Bearer` makes Supabase try
 *     to parse them as a JWT and fail with "Invalid JWT".
 *   - legacy keys (`eyJ...`) are JWTs and are accepted on both.
 *
 * Always send `apikey`; add the Bearer header only for a legacy JWT key.
 */
export function serviceHeaders(serviceKey: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: serviceKey };
  if (serviceKey.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${serviceKey}`;
  }
  return headers;
}
