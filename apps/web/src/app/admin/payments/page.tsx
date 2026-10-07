import { Badge, Card, CardHeader, Empty, Kpi, SubmitButton, Table, Td, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatIDR } from "@/lib/format";
import { markInvoicePaid } from "../actions";

export default async function AdminPayments() {
  const { supabase } = await requireAdmin();

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, amount_idr, status, gateway, gateway_ref, payment_method, proof_reference, proof_path, " +
        "paid_at, due_at, created_at, vendors(brand_name), subscriptions(plans(name))",
    )
    .order("created_at", { ascending: false });

  const overdue = (invoices ?? []).filter(
    (i: any) => i.status === "unpaid" && i.due_at && new Date(i.due_at) < new Date(),
  ).length;

  const paidThisMonth = (invoices ?? [])
    .filter((i: any) => i.status === "paid" && i.paid_at && new Date(i.paid_at).getMonth() === new Date().getMonth())
    .reduce((s: number, i: any) => s + Number(i.amount_idr), 0);

  // Signed URLs for transfer proofs (FR-M5).
  const rows = await Promise.all(
    (invoices ?? []).map(async (i: any) => {
      const { data } = i.proof_path
        ? await supabase.storage.from("materials").createSignedUrl(i.proof_path, 600)
        : { data: null };
      return { ...i, proof_url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Kpi label="Collected this month" value={formatIDR(paidThisMonth)} />
        <Kpi label="Unpaid invoices" value={(invoices ?? []).filter((i: any) => i.status === "unpaid").length} />
        <Kpi label="Overdue" value={overdue} />
      </div>

      <Card>
        <CardHeader
          title="Invoices"
          subtitle="FR-M5 · gateway webhooks and manual bank transfers. Confirming a payment extends the subscription (7-day grace, then hidden — FR-M6)."
        />
        {rows.length ? (
          <Table head={["Vendor", "Plan", "Amount", "Due", "Gateway", "Status", "Proof", ""]}>
            {rows.map((i: any) => (
              <tr key={i.id} className="hover:bg-slate-50/60">
                <Td className="font-medium text-slate-900">{i.vendors?.brand_name ?? "—"}</Td>
                <Td>{i.subscriptions?.plans?.name ?? "—"}</Td>
                <Td>{formatIDR(i.amount_idr)}</Td>
                <Td className="text-xs">{formatDate(i.due_at)}</Td>
                <Td className="text-xs">
                  {i.payment_method ?? i.gateway}
                  {i.proof_reference ? <div className="text-slate-400">{i.proof_reference}</div> : null}
                  {i.gateway_ref ? <div className="text-slate-400">{i.gateway_ref}</div> : null}
                </Td>
                <Td>
                  <Badge tone={statusTone(i.status)}>{i.status}</Badge>
                </Td>
                <Td>
                  {i.proof_url ? (
                    <a
                      href={i.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-brand-600"
                    >
                      View ↓
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Td>
                <Td>
                  {i.status === "unpaid" ? (
                    <form action={markInvoicePaid}>
                      <input type="hidden" name="invoice_id" value={i.id} />
                      <SubmitButton>Mark paid</SubmitButton>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-400">{formatDate(i.paid_at)}</span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No invoices yet.</Empty>
        )}
      </Card>
    </div>
  );
}