import Link from "next/link";
import { Badge, Card, CardHeader, Empty, Kpi, Table, Td, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export default async function AdminOverview() {
  const { supabase } = await requireAdmin();

  const [
    { count: vendors },
    { count: assets },
    { count: samples },
    { count: installs },
    { count: snapshots },
    { count: quotes },
    { data: mrrRows },
  ] = await Promise.all([
    supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("assets").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("assets").select("id", { count: "exact", head: true }).eq("status", "approved").eq("vendor_id", "00000000-0000-0000-0000-0000000000d1"),
    supabase.from("installs").select("id", { count: "exact", head: true }),
    supabase.from("usage_snapshots").select("id", { count: "exact", head: true }),
    supabase.from("quote_requests").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("plans(price_idr, period)").in("status", ["active", "trial"]),
  ]);

  // MRR: monthly subscriptions count once, yearly subscriptions count 1/12.
  const mrr = ((mrrRows as any[]) ?? []).reduce((sum: number, row: any) => {
    const price = Number(row.plans?.price_idr ?? 0);
    return sum + (row.plans?.period === "yearly" ? Math.round(price / 12) : price);
  }, 0);

  const [{ data: topMissing }, { data: recentAudit }, { data: pending }] = await Promise.all([
    supabase
      .from("missing_requests")
      .select("id, query_norm, miss_count, distinct_installs, status")
      .eq("status", "new")
      .order("miss_count", { ascending: false })
      .limit(8),
    supabase
      .from("audit_log")
      .select("id, action, entity, entity_id, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("asset_versions")
      .select("id, version, asset_id, assets(name, vendors(brand_name))")
      .eq("review_status", "pending")
      .order("created_at", { ascending: true })
      .limit(5),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Approved vendors" value={vendors ?? 0} href="/admin/vendors" />
        <Kpi label="Approved assets" value={assets ?? 0} hint={`${samples ?? 0} Dirory samples`} />
        <Kpi label="Installations" value={installs ?? 0} hint={`${snapshots ?? 0} live projects`} />
        <Kpi label="Quote requests" value={quotes ?? 0} href="/admin/quotes" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title="Demand — searches with no results"
              subtitle="FR-M10 · what architects look for but cannot find"
              action={
                <Link href="/admin/missing-requests" className="text-xs font-medium text-brand-600">
                  Open queue →
                </Link>
              }
            />
            {topMissing?.length ? (
              <Table head={["Query", "Searches", "Installs", "Status"]}>
                {topMissing.map((m) => (
                  <tr key={m.id}>
                    <Td className="font-medium text-slate-900">{m.query_norm}</Td>
                    <Td>{m.miss_count}</Td>
                    <Td>{m.distinct_installs}</Td>
                    <Td>
                      <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No unmet searches yet. They arrive with the first plugin snapshots.</Empty>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Review queue"
              subtitle="Oldest pending submissions first"
              action={
                <Link href="/admin/reviews" className="text-xs font-medium text-brand-600">
                  Open queue →
                </Link>
              }
            />
            {pending?.length ? (
              <Table head={["Asset", "Brand", "Version"]}>
                {pending.map((p: any) => (
                  <tr key={p.id}>
                    <Td className="font-medium text-slate-900">{p.assets?.name ?? "—"}</Td>
                    <Td>{p.assets?.vendors?.brand_name ?? "—"}</Td>
                    <Td>v{p.version}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nothing waiting for review.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Kpi label="MRR (from subscriptions)" value={`Rp ${new Intl.NumberFormat("id-ID").format(mrr)}`} hint="monthly-normalised" />
          <Card>
            <CardHeader title="Audit log" subtitle="Every admin action is recorded" />
            {recentAudit?.length ? (
              <ul className="divide-y divide-slate-50">
                {recentAudit.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-800">{a.action}</p>
                    <p className="text-xs text-slate-500">
                      {a.entity} · {formatDateTime(a.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No admin actions yet.</Empty>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}