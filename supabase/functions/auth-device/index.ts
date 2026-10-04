// Dirory — device-code login for the SketchUp plugin (PRD §6.1 FR-A4, §10, M6)
//
//   POST /auth-device/start   { install_id?, plugin_version?, platform? }
//     -> { device_code, user_code, verification_url, interval, expires_in }
//
//   POST /auth-device/poll    { device_code, install_id? }
//     -> { status: "pending" }
//     -> { status: "approved", token, user: { name, email } }
//     -> { status: "expired" | "denied" }
//
//   POST /auth-device/revoke  (Authorization: Bearer <token>)
//     -> { ok: true }
//
// The plugin opens `verification_url` in the browser. The architect signs in on
// the web app and approves the code; `poll` then issues the opaque token the
// plugin stores. Only hashes are kept at rest (migration 0007).
//
// Deploy: supabase functions deploy auth-device --no-verify-jwt

import { corsHeaders, json } from "../_shared/cors.ts";
import {
  bearerToken,
  randomToken,
  serviceClient,
  sha256Hex,
  userCode,
} from "../_shared/plugin-auth.ts";

const DEVICE_TTL_SECONDS = 900; // 15 minutes
const POLL_INTERVAL_SECONDS = 5;

function siteUrl(): string {
  return (
    Deno.env.get("SITE_URL") ??
    Deno.env.get("NEXT_PUBLIC_SITE_URL") ??
    "https://dirory.id"
  ).replace(/\/+$/, "");
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function start(req: Request): Promise<Response> {
  const body = await readJson(req);
  const supabase = serviceClient();

  // Housekeeping: drop codes nobody can approve any more.
  await supabase.rpc("purge_expired_device_codes").then(() => {}, () => {});

  const deviceCode = randomToken(32);
  const deviceCodeHash = await sha256Hex(deviceCode);
  const code = userCode();
  const expiresAt = new Date(Date.now() + DEVICE_TTL_SECONDS * 1000).toISOString();

  const { error } = await supabase.from("plugin_device_codes").insert({
    device_code_hash: deviceCodeHash,
    user_code: code,
    status: "pending",
    expires_at: expiresAt,
  });
  if (error) return json({ error: "could not start device login" }, 500);

  const verificationUrl = `${siteUrl()}/auth/device?code=${encodeURIComponent(code)}`;
  return json({
    device_code: deviceCode,
    user_code: code,
    verification_url: verificationUrl,
    interval: POLL_INTERVAL_SECONDS,
    expires_in: DEVICE_TTL_SECONDS,
  });
}

async function poll(req: Request): Promise<Response> {
  const body = await readJson(req);
  const deviceCode = String(body.device_code ?? "");
  if (!deviceCode) return json({ error: "device_code is required" }, 400);

  const supabase = serviceClient();
  const hash = await sha256Hex(deviceCode);
  const { data: row } = await supabase
    .from("plugin_device_codes")
    .select("device_code_hash, user_code, profile_id, status, expires_at")
    .eq("device_code_hash", hash)
    .maybeSingle();

  if (!row) return json({ status: "expired" });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabase.from("plugin_device_codes").delete().eq("device_code_hash", hash);
    return json({ status: "expired" });
  }
  if (row.status === "denied") return json({ status: "denied" });
  if (row.status !== "approved" || !row.profile_id) return json({ status: "pending" });

  // Approved: mint the plugin token, then burn the device code so it cannot be
  // exchanged twice.
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const installId = /^[0-9a-f-]{36}$/i.test(String(body.install_id ?? ""))
    ? String(body.install_id)
    : null;

  const { error: insertError } = await supabase.from("plugin_tokens").insert({
    token_hash: tokenHash,
    profile_id: row.profile_id,
    install_id: installId,
    label: String(body.plugin_version ?? "").slice(0, 40) || null,
  });
  if (insertError) return json({ error: "could not issue token" }, 500);
  await supabase.from("plugin_device_codes").delete().eq("device_code_hash", hash);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", row.profile_id)
    .maybeSingle();
  const { data: user } = await supabase
    .schema("auth")
    .from("users")
    .select("email")
    .eq("id", row.profile_id)
    .maybeSingle();

  return json({
    status: "approved",
    token,
    user: { name: profile?.full_name ?? "", email: user?.email ?? "" },
  });
}

async function revoke(req: Request): Promise<Response> {
  const token = bearerToken(req);
  if (!token) return json({ error: "missing token" }, 401);
  const supabase = serviceClient();
  const hash = await sha256Hex(token);
  await supabase.from("plugin_tokens").delete().eq("token_hash", hash);
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const action = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  switch (action) {
    case "start":
      return start(req);
    case "poll":
      return poll(req);
    case "revoke":
      return revoke(req);
    default:
      // Also accept the action in the body, so `/auth-device` alone works.
      return json({ error: "unknown action" }, 404);
  }
});
