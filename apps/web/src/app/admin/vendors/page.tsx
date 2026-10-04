import { Badge, Card, CardHeader, Empty, SubmitButton, Table, Td, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { setVendorStatus } from "../actions";

export default async function AdminVendors() {
  const { supabase } = await requireAdmin();

  const { data: vendors } = await supabase
    .from("vendors")
    .select(
      "id, name, brand_name, status, is_platform, email, whatsapp, website, npwp, approved_at, created_at, " +
        "assets(id, status), subscriptions(status, current_period_end, plans(name, price_idr))",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Vendors"
          subtitle="FR-M1 · approve, reject or suspend a vendor. Approving makes its catalogue eligible for architects."
        />
        {vendors?.length ? (
          <Table head={["Brand", "Contact", "Assets", "Subscription", "Status", "Applied", ""]}>
            {vendors.map((v: any) => {
              const sub = v.subscriptions?.[0];
              const approved = (v.assets ?? []).filter((a: any) => a.status === "approved").length;
              return (
                <tr key={v.id} className="hover:bg-slate-50/60">
                  <Td>
                    <div className="font-medium text-slate-900">{v.brand_name}</div>
                    <div className="text-xs text-slate-500">{v.name}</div>
                    {v.is_platform ? (
                      <span className="mt-1 inline-block">
                        <Badge tone="purple">Platform brand</Badge>
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <div className="text-xs">{v.email ?? "—"}</div>
                    <div className="text-xs text-slate-500">{v.whatsapp ?? "—"}</div>
                  </Td>
                  <Td>
                    {approved} approved
                    <div className="text-xs text-slate-500">{v.assets?.length ?? 0} total</div>
                  </Td>
                  <Td>
                    {sub ? (
                      <>
                        <Badge tone={statusTone(sub.status)}>{sub.status}</Badge>
                        <div className="mt-1 text-xs text-slate-500">
                          {sub.plans?.name ?? "—"} · until {formatDate(sub.current_period_end)}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">no plan</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(v.status)}>{v.status}</Badge>
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDate(v.created_at)}</Td>
                  <Td>
                    {v.is_platform ? (
                      <span className="text-xs text-slate-400">n/a</span>
                    ) : (
                      <div className="flex gap-2">
                        {v.status !== "approved" ? (
                          <form action={setVendorStatus}>
                            <input type="hidden" name="vendor_id" value={v.id} />
                            <input type="hidden" name="status" value="approved" />
                            <SubmitButton>Approve</SubmitButton>
                          </form>
                        ) : (
                          <form action={setVendorStatus}>
                            <input type="hidden" name="vendor_id" value={v.id} />
                            <input type="hidden" name="status" value="suspended" />
                            <SubmitButton variant="ghost">Suspend</SubmitButton>
                          </form>
                        )}
                        {v.status !== "suspended" ? (
                          <form action={setVendorStatus}>
                            <input type="hidden" name="vendor_id" value={v.id} />
                            <input type="hidden" name="status" value="rejected" />
                            <SubmitButton variant="danger">Reject</SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>No vendors have registered yet.</Empty>
        )}
      </Card>
    </div>
  );
}