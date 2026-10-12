import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Security events and alerts (OWASP A09 — logging and monitoring).
 *
 * Every security-relevant failure is written to `security_events` (0030) and, for
 * the kinds that matter, emailed to the founder. Two deliberate properties:
 *
 *  1. **Recording never throws.** A failure to log must not turn a rejected
 *     request into a 500, or an attacker could use logging itself as a lever.
 *  2. **Alerts are throttled per kind.** A scanner hitting the webhook would
 *     otherwise send hundreds of identical mails, and a mailbox that noisy gets
 *     filtered and ignored — which is the same as having no alert at all.
 *
 * Delivery uses Resend (`RESEND_API_KEY`), because the VPS cannot send mail
 * itself: dirory.com publishes DMARC `p=reject`, so a message claiming to be from
 * it, sent by a host with no DKIM, is rejected outright by Gmail. Without a key
 * the event is still recorded and the reason is logged, so nothing is lost.
 */

/** Where alerts go. Explicitly the founder's address unless overridden. */
const ALERT_TO = process.env.SECURITY_ALERT_TO ?? "rendynoorchandra@gmail.com";
const ALERT_FROM = process.env.SECURITY_ALERT_FROM ?? "Dirory alerts <onboarding@resend.dev>";

/** One alert per kind per window, so a flood becomes one mail, not thousands. */
const COOLDOWN_MINUTES = 15;

export type SecurityEventKind =
  | "webhook.bad_signature"
  | "webhook.oversized_body"
  | "webhook.amount_mismatch"
  | "webhook.unmatched_invoice";

/** Best-effort client address; `x-forwarded-for` is set by Caddy. */
function clientIp(request?: Request): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
  return request.headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

function body(kind: string, detail: Record<string, unknown>, ip: string | null): string {
  return [
    `Dirory security event: ${kind}`,
    "",
    `When : ${new Date().toISOString()}`,
    `From : ${ip ?? "unknown"}`,
    "",
    "Detail:",
    JSON.stringify(detail, null, 2),
    "",
    "—",
    "Recorded in the security_events table; see /admin/security in the back-office.",
    "A rejection like a bad signature on the Midtrans webhook is a normal thing to",
    "see occasionally. A burst of them is worth a look.",
  ].join("\n");
}

async function sendAlert(kind: string, detail: Record<string, unknown>, ip: string | null): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Recorded, not emailed. Say which, so the omission is visible in the logs.
    console.warn(`security alert NOT EMAILED (RESEND_API_KEY unset) to=${ALERT_TO} kind=${kind}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: ALERT_FROM,
        to: [ALERT_TO],
        subject: `[Dirory] ${kind}`,
        text: body(kind, detail, ip),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn("security alert rejected by the mail provider", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("security alert could not be sent", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Record a security event, and alert on it if nothing like it was alerted on
 * recently. Safe to call from a route handler: it never throws.
 */
export async function recordSecurityEvent(
  kind: SecurityEventKind,
  detail: Record<string, unknown> = {},
  request?: Request,
): Promise<void> {
  try {
    const supabase = createSupabaseServiceClient();
    const ip = clientIp(request);

    const { data: row } = await supabase
      .from("security_events")
      .insert({ kind, severity: "warning", detail, ip })
      .select("id")
      .single();

    // Throttle: has this kind been alerted on inside the cooldown?
    const since = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
    const { count } = await supabase
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", kind)
      .not("notified_at", "is", null)
      .gte("created_at", since);

    if ((count ?? 0) > 0) return;

    if (await sendAlert(kind, detail, ip)) {
      if (row?.id) {
        await supabase.from("security_events").update({ notified_at: new Date().toISOString() }).eq("id", row.id);
      }
    }
  } catch (err) {
    // Never let monitoring break the thing it monitors.
    console.error("security event could not be recorded", err);
  }
}
