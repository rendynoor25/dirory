import { Badge, Card, CardHeader, Empty, SubmitButton, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatIDR } from "@/lib/format";
import { createPlan } from "../actions";

export default async function AdminPlans() {
  const { supabase } = await requireAdmin();

  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, price_idr, period, max_assets, active, subscriptions(id, status)")
    .order("price_idr");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Plans and pricing"
          subtitle="FR-M4 · flat tiers with an asset limit. Price is in IDR."
        />
        {plans?.length ? (
          <Table head={["Name", "Price", "Period", "Max assets", "Subscribers", "Active"]}>
            {plans.map((p: any) => {
              const active = (p.subscriptions ?? []).filter((s: any) =>
                ["trial", "active", "grace"].includes(s.status),
              ).length;
              return (
                <tr key={p.id}>
                  <Td className="font-medium text-slate-900">{p.name}</Td>
                  <Td>{formatIDR(p.price_idr)}</Td>
                  <Td>{p.period}</Td>
                  <Td>{p.max_assets}</Td>
                  <Td>{active}</Td>
                  <Td>
                    <Badge tone={p.active ? "green" : "gray"}>{p.active ? "active" : "hidden"}</Badge>
                  </Td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>No plans yet.</Empty>
        )}

        <div className="border-t border-slate-100 px-5 py-4">
          <form action={createPlan} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Name</label>
              <input
                name="name"
                required
                placeholder="Growth"
                className="mt-1 w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Price (IDR)</label>
              <input
                name="price_idr"
                type="number"
                min={0}
                required
                placeholder="1500000"
                className="mt-1 w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Period</label>
              <select
                name="period"
                className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="monthly">monthly</option>
                <option value="yearly">yearly</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Max assets</label>
              <input
                name="max_assets"
                type="number"
                min={1}
                defaultValue={50}
                className="mt-1 w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <SubmitButton>Add plan</SubmitButton>
          </form>
        </div>
      </Card>
    </div>
  );
}