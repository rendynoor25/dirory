import Link from "next/link";
import { Badge, Card, CardHeader, Empty, Kpi, Table, Td, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatIDR } from "@/lib/format";

export default async function AdminOverview() {
  const { supabase } = await requireAdmin();

  const [
    { count: users },
    { count: vendors },
    { count: assets },
    { count: samples },
    { count: installs },
    { count: snapshots },
    { count: quotes },
    { data: mrrRows },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
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

  // --- Revenue and vendor pipeline (document §1: Revenue, Vendors) ----------
  // Everything here is aggregate money or counts; no architect data is involved.
  const [{ data: invoiceRows }, { data: subRows }, { data: vendorRows }] = await Promise.all([
    supabase.from("invoices").select("amount_idr, status, due_at, paid_at"),
    supabase.from("subscriptions").select("status, plans(name, price_idr, period)"),
    supabase.from("vendors").select("status, is_platform"),
  ]);

  const now = new Date();
  const invoices = (invoiceRows ?? []) as { amount_idr: number; status: string; due_at: string | null; paid_at: string | null }[];
  const collected = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.amount_idr), 0);
  const unpaid = invoices.filter((i) => i.status === "unpaid");
  const overdue = unpaid.filter((i) => i.due_at && new Date(i.due_at) < now);

  // Revenue by plan, and how many vendors sit on each. Yearly is normalised to a
  // monthly figure so the column is comparable.
  const byPlan = new Map<string, { vendors: number; mrr: number }>();
  for (const s of (subRows ?? []) as any[]) {
    if (!["active", "trial", "grace"].includes(s.status)) continue;
    const name = s.plans?.name ?? "(no plan)";
    const price = Number(s.plans?.price_idr ?? 0);
    const monthly = s.plans?.period === "yearly" ? Math.round(price / 12) : price;
    const cur = byPlan.get(name) ?? { vendors: 0, mrr: 0 };
    cur.vendors += 1;
    cur.mrr += monthly;
    byPlan.set(name, cur);
  }

  const pipeline = (vendorRows ?? []).reduce(
    (acc: Record<string, number>, v: any) => {
      if (v.is_platform) return acc;
      acc[v.status] = (acc[v.status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const [{ data: topMissing }, { data: recentAudit }, { data: pending }, { data: health }] =
    await Promise.all([
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
    // Plugin health (migration 0016). Admin-only rollup; empty until plugin
    // 0.9.6 reports, because earlier versions never sent these counters.
    supabase.rpc("plugin_health_summary", { p_days: 7 }),
  ]);

  const healthRows = (health ?? []) as {
    plugin_version: string;
    installs: number;
    load_attempts: number;
    load_failures: number;
    load_failure_pct: number;
    avg_load_ms: number;
    insert_failures: number;
    paint_failures: number;
    cloud_failures: number;
  }[];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Users" value={users ?? 0} href="/admin/users" hint="architects & designers" />
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

          <Card>
            <CardHeader
              title="Plugin health"
              subtitle="Last 7 days, per plugin version. Counters only — no project, geometry or file data. Empty until plugin 0.9.6 reports."
            />
            {healthRows.length ? (
              <Table head={["Version", "Installs", "Loads", "Fail %", "Avg load", "Insert", "Paint", "Cloud"]}>
                {healthRows.map((h) => (
                  <tr key={h.plugin_version}>
                    <Td className="font-medium text-slate-900">{h.plugin_version}</Td>
                    <Td>{h.installs}</Td>
                    <Td>{h.load_attempts}</Td>
                    <Td className={Number(h.load_failure_pct) > 10 ? "text-rose-700" : ""}>
                      {Number(h.load_failure_pct)}%
                    </Td>
                    <Td>{h.avg_load_ms ? `${Number(h.avg_load_ms).toLocaleString("id-ID")} ms` : "—"}</Td>
                    <Td>{h.insert_failures}</Td>
                    <Td>{h.paint_failures}</Td>
                    <Td>{h.cloud_failures}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No health reports yet.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Revenue"
              subtitle="MRR is monthly-normalised, so yearly plans count as 1/12."
            />
            <div className="grid grid-cols-2 gap-3 p-5">
              <Stat label="MRR" value={formatIDR(mrr)} />
              <Stat label="ARR" value={formatIDR(mrr * 12)} />
              <Stat label="Collected (all time)" value={formatIDR(collected)} />
              <Stat
                label="Overdue"
                value={`${overdue.length}${unpaid.length ? ` / ${unpaid.length}` : ""}`}
                tone={overdue.length ? "bad" : undefined}
              />
            </div>
            {byPlan.size ? (
              <Table head={["Plan", "Vendors", "MRR"]}>
                {[...byPlan.entries()]
                  .sort((a, b) => b[1].mrr - a[1].mrr)
                  .map(([name, v]) => (
                    <tr key={name}>
                      <Td className="font-medium text-slate-900">{name}</Td>
                      <Td>{v.vendors}</Td>
                      <Td>{formatIDR(v.mrr)}</Td>
                    </tr>
                  ))}
              </Table>
            ) : (
              <Empty>No active subscriptions yet.</Empty>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Vendor pipeline"
              subtitle="Approval status. A vendor's products are visible once approved and subscribed."
              action={
                <Link href="/admin/vendors" className="text-xs font-medium text-brand-600">
                  Open →
                </Link>
              }
            />
            <div className="grid grid-cols-3 gap-3 p-5">
              <Stat label="Pending" value={pipeline.pending ?? 0} />
              <Stat label="Approved" value={pipeline.approved ?? 0} />
              <Stat label="Suspended" value={pipeline.suspended ?? 0} />
            </div>
          </Card>

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

/** A compact label/value pair for the metric cards. */
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "bad";
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "bad" ? "text-rose-700" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}