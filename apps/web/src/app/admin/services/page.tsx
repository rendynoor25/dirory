import { Badge, Card, CardHeader, Empty, Kpi } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatIDR } from "@/lib/format";
import { quoteServiceRequest, setServiceStatus } from "../actions";

export const dynamic = "force-dynamic";

/**
 * The modelling queue.
 *
 * The top of this page is the answer to "a payment came in — what do I do next?":
 * a job is **ready to start** when its quote was accepted AND its invoice is paid.
 * Payment state is read from the invoice, never stored on the job, so the queue
 * cannot disagree with Admin → Payments.
 */

type Row = {
  id: string;
  title: string;
  product_count: number | null;
  brief: string | null;
  admin_note: string | null;
  status: string;
  quoted_idr: number | null;
  invoice_id: string | null;
  created_at: string;
  vendors: { brand_name: string } | null;
  invoices: { status: string } | null;
};

const isReady = (r: Row) => r.status === "accepted" && r.invoices?.status === "paid";

function rank(r: Row): number {
  if (isReady(r)) return 0; // paid, waiting for you — top of the pile
  if (r.status === "requested") return 1; // needs a quote
  if (r.status === "in_progress") return 2;
  if (r.status === "accepted") return 3; // quoted and accepted, awaiting payment
  return 4; // delivered / cancelled
}

export default async function AdminServices() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("service_requests")
    .select(
      "id, title, product_count, brief, admin_note, status, quoted_idr, invoice_id, created_at, vendors(brand_name), invoices(status)",
    )
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => rank(a) - rank(b));
  const ready = rows.filter(isReady).length;
  const toQuote = rows.filter((r) => r.status === "requested").length;
  const inProgress = rows.filter((r) => r.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Kpi label="Ready to start" value={ready} hint="paid, not yet begun" />
        <Kpi label="Waiting for a quote" value={toQuote} />
        <Kpi label="In progress" value={inProgress} />
      </div>

      <Card>
        <CardHeader
          title="Modelling & digitization jobs"
          subtitle="FR-V? · quote first, then the vendor accepts and pays. Paid jobs move to the top."
        />
        {rows.length ? (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <div key={r.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {r.vendors?.brand_name ?? "—"}
                      <span className="font-normal text-slate-500"> · {r.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(r.created_at)}
                      {r.product_count ? ` · ${r.product_count} products` : ""}
                      {r.quoted_idr ? ` · quoted ${formatIDR(r.quoted_idr)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isReady(r) ? <Badge tone="green">paid · ready</Badge> : null}
                    {r.status === "accepted" && !isReady(r) ? <Badge tone="amber">awaiting payment</Badge> : null}
                    <Badge tone={r.status === "delivered" ? "green" : r.status === "cancelled" ? "red" : "blue"}>
                      {r.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>

                {r.brief ? <p className="mt-2 text-xs text-slate-500">Vendor brief: {r.brief}</p> : null}
                {r.admin_note ? (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Admin note: {r.admin_note}
                  </p>
                ) : null}

                {/* ---- quote it ------------------------------------------- */}
                {r.status === "requested" ? (
                  <form action={quoteServiceRequest} className="mt-4 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="request_id" value={r.id} />
                    <div>
                      <label className="text-xs font-medium text-slate-600">Quote (Rp)</label>
                      <input
                        name="quoted_idr"
                        type="number"
                        min={0}
                        required
                        className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-600">Note to the vendor</label>
                      <input
                        name="admin_note"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="What's included, timeline…"
                      />
                    </div>
                    <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                      Send quote
                    </button>
                  </form>
                ) : null}

                {/* ---- advance it ----------------------------------------- */}
                {["accepted", "in_progress"].includes(r.status) ? (
                  <form action={setServiceStatus} className="mt-4 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="request_id" value={r.id} />
                    <input type="hidden" name="status" value={r.status === "accepted" ? "in_progress" : "delivered"} />
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-600">Note (optional)</label>
                      <input
                        name="admin_note"
                        defaultValue={r.admin_note ?? ""}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                      {r.status === "accepted" ? "Start modelling" : "Mark delivered"}
                    </button>
                  </form>
                ) : null}

                {/* ---- close it ------------------------------------------- */}
                {["requested", "quoted", "accepted", "in_progress"].includes(r.status) ? (
                  <form action={setServiceStatus} className="mt-2">
                    <input type="hidden" name="request_id" value={r.id} />
                    <input type="hidden" name="status" value="cancelled" />
                    <button className="text-xs text-slate-400 hover:text-rose-600">Cancel this job</button>
                  </form>
                ) : null}

                {r.invoice_id ? (
                  <p className="mt-3 text-xs text-slate-400">
                    Invoice {r.invoices?.status ?? "—"} ·{" "}
                    <a href="/admin/payments" className="underline">
                      Admin → Payments
                    </a>
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <Empty>No service requests yet.</Empty>
        )}
      </Card>
    </div>
  );
}
