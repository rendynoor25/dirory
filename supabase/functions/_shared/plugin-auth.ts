// Dirory — plugin token validation shared by the M6 Edge Functions.
//
// The plugin never holds a Supabase JWT. It holds an opaque token issued by
// /auth-device after the architect approved the code in the browser. Every
// token-protected endpoint hashes the incoming token and looks it up in
// `plugin_tokens` with the service role — see migration 0007.
//
// This module is deliberately dependency-light so `catalog`, `download`,
// `quotes`, `favourites` and `auth-device` can all share it.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { resolveServiceKey } from "./keys.ts";

/** SHA-256 as lower-case hex. The only form of a token we ever store. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A random, URL-safe secret token / code. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A short, human-typable code: 4 + 4 groups of an unambiguous alphabet. */
export function userCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const chars = Array.from(buf).map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Service-role client (bypasses RLS) — the same pattern as the events function. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, resolveServiceKey(), {
    auth: { persistSession: false },
  });
}

/** The raw bearer token from the request, or null. */
export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length ? token : null;
}

export interface PluginIdentity {
  profileId: string;
  tokenId: string;
  name: string;
  email: string;
}

/**
 * Resolve a plugin token to its profile. Returns null for an unknown or
 * malformed token. Touches `last_used_at`; failures there are non-fatal.
 */
export async function resolvePluginToken(token: string | null): Promise<PluginIdentity | null> {
  if (!token) return null;
  const supabase = serviceClient();
  const hash = await sha256Hex(token);

  const { data: row } = await supabase
    .from("plugin_tokens")
    .select("id, profile_id")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!row) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", row.profile_id)
    .maybeSingle();

  const { data: user } = await supabase
    .schema("auth")
    .from("users")
    .select("email")
    .eq("id", row.profile_id)
    .maybeSingle();

  // Best-effort last-used stamp; never block the request on it.
  supabase
    .from("plugin_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => {}, () => {});

  return {
    profileId: row.profile_id,
    tokenId: row.id,
    name: profile?.full_name ?? "",
    email: user?.email ?? "",
  };
}
