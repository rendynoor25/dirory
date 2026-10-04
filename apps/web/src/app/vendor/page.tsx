import Link from "next/link";
import { Badge, Card, CardHeader, Empty, Kpi, Table, Td, statusTone } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { registerVendor } from "./actions";

export const dynamic = "force-dynamic";

export default async function VendorHome({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { supabase, memberships } = await getSession();
  const membership = memberships[0];

  // ---------------------------------------------------------------- onboarding
  if (!membership) {
    return (
      <Card>
        <CardHeader
          title="Register your brand"
          subtitle="FR-V1 · your account stays pending until the Dirory team approves it."
        />
        <form action={registerVendor} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field name="name" label="Company name" required />
          <Field name="brand_name" label="Brand name" required />
          <Field name="email" label="Contact email" type="email" required />
          <Field name="whatsapp" label="Phone / WhatsApp" required />
          <Field name="website" label="Website" />
          <Field name="npwp" label="NPWP (optional)" />
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Submit registration
            </button>
          </div>
        </form>
      </Card>
    );
  }

  const vendorId = membership.vendor_id;
  const { range } = await searchParams;
  const rangeDays = Number(range ?? 30);
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);
  const sinceISO = since.toISOString().slice(0, 10);

  // FR-V4 — metrics come from usage snapshots and quotes, aggregated per asset.
  const [
    { data: rollup },
    { count: architectCount },
    { data: leads },
    { data: subscription },
    { data: assets },
  ] = await Promise.all([
    supabase
      .from("daily_asset_usage")
      .select("day, asset_id, projects, units, area_m2, quotes, assets(name, type)")
      .eq("vendor_id", vendorId)
      .gte("day", sinceISO),
    supabase
      .from("usage_snapshots")
      .select("profile_id", { count: "exact", head: true })
      .not("profile_id", "is", null),
    supabase
      .from("quote_requests")
      .select("id, project_name, city, status, created_at, items")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("subscriptions")
      .select("status, current_period_end, plans(name)")
      .eq("vendor_id", vendorId)
      .maybeSingle(),
    supabase
      .from("assets")
      .select("id, name, status, type")
      .eq("vendor_id", vendorId),
  ]);

  // Per-product aggregation over the selected range.
  const byAsset = new Map<
    string,
    { name: string; type: string; projects: number; units: number; area: number; quotes: number }
  >();
  for (const row of rollup ?? []) {
    const key = row.asset_id as string;
    const cur =
      byAsset.get(key) ??
      {
        name: (row as any).assets?.name ?? "—",
        type: (row as any).assets?.type ?? "model",
        projects: 0,
        units: 0,
        area: 0,
        quotes: 0,
      };
    cur.projects += row.projects ?? 0;
    cur.units += row.units ?? 0;
    cur.area += Number(row.area_m2 ?? 0);
    cur.quotes += row.quotes ?? 0;
    byAsset.set(key, cur);
  }
  const products = [...byAsset.entries()].sort((a, b) => b[1].units + b[1].area - (a[1].units + a[1].area));

  const totalProjects = new Set(products.map(([id]) => id)).size;
  const totals = products.reduce(
    (a, [, v]) => ({ units: a.units + v.units, area: a.area + v.area }),
    { units: 0, area: 0 },
  );

  const published = (assets ?? []).filter((a: any) => a.status === "approved").length;

  return (
    <div className="space-y-6">
      {membership.vendor.status !== "approved" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your vendor account is <strong>{membership.vendor.status}</strong>. You can upload products
          now; they become visible to architects once the Dirory team approves your account and the
          products. Dirory's own free samples are visible either way.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Range</span>
        {[7, 30, 90].map((d) => (
          <Link
            key={d}
            href={`/vendor?range=${d}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              rangeDays === d ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {d} days
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Projects using your products" value={products.length} hint={`${rangeDays}-day window`} />
        <Kpi label="Units placed" value={totals.units} />
        <Kpi label="Painted area" value={`${totals.area.toFixed(1)} m²`} />
        <Kpi label="Published products" value={`${published} / ${(assets ?? []).length}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Products"
            subtitle="FR-V4 · projects, units and painted area per product. You never see project names or architect identities here."
          />
          {products.length ? (
            <Table head={["Product", "Type", "Projects", "Units", "Area m²"]}>
              {products.map(([id, v]) => (
                <tr key={id}>
                  <Td className="font-medium text-slate-900">{v.name}</Td>
                  <Td>
                    <Badge tone={v.type === "material" ? "blue" : "gray"}>{v.type}</Badge>
                  </Td>
                  <Td>{v.projects}</Td>
                  <Td>{v.units || "—"}</Td>
                  <Td>{v.area ? v.area.toFixed(1) : "—"}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>
              No usage in this range yet. Numbers appear once architects insert your products in
              SketchUp and the snapshots arrive.
            </Empty>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Subscription"
              action={
                <Link href="/vendor/subscription" className="text-xs font-medium text-brand-600">
                  Manage →
                </Link>
              }
            />
            <div className="p-5 text-sm">
              {subscription ? (
                <>
                  <Badge tone={statusTone(subscription.status)}>{subscription.status}</Badge>
                  <p className="mt-2 text-slate-700">
                    {(subscription as any).plans?.name ?? "No plan"} · renews{" "}
                    {formatDate(subscription.current_period_end)}
                  </p>
                </>
              ) : (
                <p className="text-slate-500">No plan yet.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Latest leads"
              action={
                <Link href="/vendor/leads" className="text-xs font-medium text-brand-600">
                  Inbox →
                </Link>
              }
            />
            {leads?.length ? (
              <ul className="divide-y divide-slate-50">
                {leads.map((l: any) => (
                  <li key={l.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{l.project_name ?? "—"}</p>
                      <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {l.city ?? ""} · {(l.items ?? []).length} items ·{" "}
                      {formatDate(l.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No leads yet.</Empty>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
