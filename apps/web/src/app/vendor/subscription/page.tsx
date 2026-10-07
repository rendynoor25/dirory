import Link from "next/link";
import { Badge, Card, CardHeader, Empty, Table, Td, statusTone } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDate, formatIDR } from "@/lib/format";
import { periodNoun } from "@/lib/billing";
import { choosePlan } from "../actions";

export const dynamic = "force-dynamic";

/** FR-V6 — current plan, renewal, product limit, invoices, and the plan chooser. */
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
        .select("id, amount_idr, status, gateway, payment_method, due_at, paid_at, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false }),
      supabase.from("plans").select("id, name, price_idr, period, max_assets").eq("active", true).order("price_idr"),
      supabase.from("assets").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
    ]);

  const currentPlan = (subscription as any)?.plans;
  const unpaid = (invoices ?? []).find((i: any) => i.status === "unpaid");
  const used = assetCount ?? 0;
  const limit = currentPlan?.max_assets ?? null;
  const overLimit = limit != null && used > limit;

  return (
    <div className="space-y-6">
      {unpaid ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You have an unpaid invoice of <strong>{formatIDR(unpaid.amount_idr)}</strong>, due{" "}
          {formatDate(unpaid.due_at)}.{" "}
          <Link href={`/vendor/subscription/invoice/${unpaid.id}`} className="font-medium underline">
            Pay it now →
          </Link>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Current plan" subtitle="FR-V6" />
          <div className="p-5 text-sm">
            {subscription ? (
              <>
                <Badge tone={statusTone(subscription.status)}>{subscription.status}</Badge>
                <p className="mt-3 text-lg font-semibold text-slate-900">{currentPlan?.name ?? "—"}</p>
                <p className="text-slate-600">
                  {formatIDR(currentPlan?.price_idr)} / {periodNoun(currentPlan?.period)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Renews {formatDate(subscription.current_period_end)}
                </p>
                <p className={`mt-2 text-xs ${overLimit ? "text-rose-700" : "text-slate-500"}`}>
                  {used} of {limit ?? "—"} products used
                  {overLimit ? " — over your plan limit" : ""}
                </p>
              </>
            ) : (
              <p className="text-slate-500">
                No subscription yet. Pick a plan below to activate your listing. Dirory&apos;s own
                free samples stay visible either way.
              </p>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Invoices"
            subtitle="Pay by bank transfer or QRIS, then upload your proof — the Dirory team confirms it."
          />
          {invoices?.length ? (
            <Table head={["Amount", "Method", "Due", "Status", "Paid", ""]}>
              {invoices.map((i: any) => (
                <tr key={i.id} className="hover:bg-slate-50/60">
                  <Td className="font-medium text-slate-900">{formatIDR(i.amount_idr)}</Td>
                  <Td className="text-xs">{i.payment_method ?? i.gateway}</Td>
                  <Td className="text-xs">{formatDate(i.due_at)}</Td>
                  <Td>
                    <Badge tone={statusTone(i.status)}>{i.status}</Badge>
                  </Td>
                  <Td className="text-xs">{formatDate(i.paid_at)}</Td>
                  <Td>
                    {i.status === "unpaid" ? (
                      <Link
                        href={`/vendor/subscription/invoice/${i.id}`}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                      >
                        Pay
                      </Link>
                    ) : (
                      <Link
                        href={`/vendor/subscription/invoice/${i.id}`}
                        className="text-xs font-medium text-brand-600"
                      >
                        View
                      </Link>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No invoices yet. Choose a plan to get one.</Empty>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Choose a plan"
          subtitle="FR-M4 / Q4 · flat tiers with a product limit. Choosing a plan creates an invoice to pay."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {(plans ?? []).map((p) => {
            const isCurrent = currentPlan?.id === p.id;
            return (
              <div
                key={p.id}
                className={`flex flex-col rounded-xl border p-4 ${
                  isCurrent ? "border-brand-400 bg-brand-50/40" : "border-slate-200"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatIDR(p.price_idr)}</p>
                <p className="text-xs text-slate-500">
                  per {periodNoun(p.period)} · up to {p.max_assets} products
                </p>
                <form action={choosePlan} className="mt-4">
                  <input type="hidden" name="plan_id" value={p.id} />
                  <button
                    className={`w-full rounded-lg px-3 py-2 text-xs font-medium ${
                      isCurrent
                        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        : "bg-brand-600 text-white hover:bg-brand-700"
                    }`}
                  >
                    {isCurrent ? "Renew this plan" : subscription ? "Switch to this plan" : "Choose this plan"}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
