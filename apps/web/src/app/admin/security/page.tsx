import { Badge, Card, CardHeader, Empty, Kpi, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * OWASP A09 — the monitoring half of logging and monitoring.
 *
 * The webhook records anything that looks wrong: a signature that does not
 * verify, a body that is too large, an amount that does not match, a signed
 * notification for an invoice that does not exist. This page is where those land.
 *
 * It also says plainly whether email alerts are configured, because a monitoring
 * page that silently is not monitoring anything is worse than none.
 */
export default async function AdminSecurity() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("security_events")
    .select("id, kind, severity, ip, detail, notified_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];

  const dayAgo = Date.now() - 86_400_000;
  const last24h = rows.filter((r) => new Date(r.created_at).getTime() > dayAgo).length;
  const alerted = rows.filter((r) => r.notified_at).length;
  const emailsOn = Boolean(process.env.RESEND_API_KEY);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Kpi label="Events kept" value={rows.length} hint="most recent 100" />
        <Kpi label="Last 24 hours" value={last24h} />
        <Kpi label="Emailed" value={alerted} hint="the rest were recorded only" />
      </div>

      {emailsOn ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Email alerts are on — new events are sent to the configured address, at most one
          per kind every 15 minutes.
        </p>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Email alerts are off.</strong> Events are recorded here, but nothing is
          emailed. Set <code>RESEND_API_KEY</code> on the server to turn delivery on.
        </p>
      )}

      <Card>
        <CardHeader
          title="Security events"
          subtitle="A bad signature now and then is noise. A burst means someone is probing, or the gateway key was rotated."
        />
        {rows.length ? (
          <Table head={["When", "Kind", "From", "Notified", "Detail"]}>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <Td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</Td>
                <Td>
                  <Badge tone={r.severity === "critical" ? "red" : "amber"}>{r.kind}</Badge>
                </Td>
                <Td className="font-mono text-xs">{r.ip ?? "—"}</Td>
                <Td className="text-xs">{r.notified_at ? "yes" : "—"}</Td>
                <Td className="font-mono text-[11px] text-slate-500">
                  {JSON.stringify(r.detail ?? {})}
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nothing recorded. That is the normal state.</Empty>
        )}
      </Card>
    </div>
  );
}
