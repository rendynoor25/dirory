import { Badge, Card, CardHeader, Empty, Table, Td, statusTone } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDate, formatIDR } from "@/lib/format";

export const dynamic = "force-dynamic";

/** FR-V6 — current plan, renewal date, invoices, plan limits. */
export default async function VendorSubscription() {
  const { supabase, memberships } = await getSession();
  const membership = memberships[0];
  if (!membership) return <Empty>Register your brand first.</Empty>;

  const vendorId = membership.vendor_id;

  const [{ data: subscription }, { data: invoices }, { data: plans }, { count: assetCount }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("id, status, current_period_start, current_period_end, plans(id, name, price_idr, period, max_assets)")
        .eq("vendor_id", vendorId)
        .maybeSingle(),
      supabase
        .from("invoices")
        .select("id, amount_idr, status, gateway, due_at, paid_at, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
      supabase.from("plans").select("id, name, price_idr, period, max_assets").eq("active", true).order("price_idr"),
      supabase.from("assets").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
    ]);

  const currentPlan = (subscription as any)?.plans;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Current plan" subtitle="FR-V6" />
          <div className="p-5 text-sm">
            {subscription ? (
              <>
                <Badge tone={statusTone(subscription.status)}>{subscription.status}</Badge>
                <p className="mt-3 text-lg font-semibold text-slate-900">{currentPlan?.name ?? "—"}</p>
                <p className="text-slate-600">{formatIDR(currentPlan?.price_idr)} / {currentPlan?.period}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Renews {formatDate(subscription.current_period_end)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {assetCount ?? 0} of {currentPlan?.max_assets ?? "—"} products used
                </p>
              </>
            ) : (
              <p className="text-slate-500">
                No subscription yet. Products are hidden from architects until a plan is active — but
                Dirory's own free samples stay visible.
              </p>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Invoices" subtitle="Pay online, or transfer manually and upload proof for the Dirory team to confirm." />
          {invoices?.length ? (
            <Table head={["Amount", "Gateway", "Due", "Status", "Paid"]}>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <Td>{formatIDR(i.amount_idr)}</Td>
                  <Td className="text-xs">{i.gateway}</Td>
                  <Td className="text-xs">{formatDate(i.due_at)}</Td>
                  <Td>
                    <Badge tone={statusTone(i.status)}>{i.status}</Badge>
                  </Td>
                  <Td className="text-xs">{formatDate(i.paid_at)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No invoices yet.</Empty>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Available plans" subtitle="Flat tiers with a product limit (Q4)." />
        <Table head={["Plan", "Price", "Period", "Max products"]}>
          {(plans ?? []).map((p) => (
            <tr key={p.id}>
              <Td className="font-medium text-slate-900">{p.name}</Td>
              <Td>{formatIDR(p.price_idr)}</Td>
              <Td>{p.period}</Td>
              <Td>{p.max_assets}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}