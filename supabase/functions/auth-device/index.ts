// Dirory — device-code login for the SketchUp plugin (PRD §6.1 FR-A4, §10, M6)
//
//   POST /auth-device/start   { install_id?, plugin_version?, platform? }
//     -> { device_code, user_code, verification_url, interval, expires_in }
//
//   POST /auth-device/poll    { device_code, install_id? }
//     -> { status: "pending" }
//     -> { status: "approved", token, user: { name, email }, consent }
//        consent: { version, share_usage, share_project, share_search_miss }
//        or null — the choices made on the download page (UU PDP A3).
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
const START_LIMIT_PER_MINUTE = 60;
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

  // Anyone can start a sign-in, so cap how fast codes are created (OWASP A06):
  // a script cannot fill the table or crowd out real codes. Real use is a
  // handful a minute at most.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("plugin_device_codes")
    .select("user_code", { count: "exact", head: true })
    .gt("created_at", since);
  if ((count ?? 0) >= START_LIMIT_PER_MINUTE) {
    return json({ error: "too many sign-in attempts, try again in a minute" }, 429);
  }

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

  // Which app is signing in, so the browser page can say "Connect Revit" or
  // "Connect SketchUp". The Revit add-in sends plugin_version "revit-x.y.z".
  const app = /^revit/i.test(String(body.plugin_version ?? "")) ? "revit" : "sketchup";
  const verificationUrl = `${siteUrl()}/auth/device?code=${encodeURIComponent(code)}&app=${app}`;
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
    .select("full_name, consent_version, share_usage, share_project, share_search_miss")
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
    // The plugin adopts these instead of asking again inside SketchUp.
    consent: profile?.consent_version
      ? {
        version: profile.consent_version,
        share_usage: !!profile.share_usage,
        share_project: !!profile.share_project,
        share_search_miss: !!profile.share_search_miss,
      }
      : null,
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
