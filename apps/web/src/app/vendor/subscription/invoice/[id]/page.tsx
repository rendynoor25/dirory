import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, statusTone } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDate, formatDateTime, formatIDR } from "@/lib/format";
import { BANK, bankConfigured, periodNoun } from "@/lib/billing";
import { qrisConfigured, qrisLabel } from "@/lib/payments";
import { midtransConfig, midtransConfigured, snapScriptUrl } from "@/lib/midtrans";
import { setPaymentMethod, submitPayment } from "../../../actions";
import { PaymentProof } from "./PaymentProof";
import { MidtransPay } from "./MidtransPay";

export const dynamic = "force-dynamic";

/**
 * FR-V6 / FR-M5 — pay one invoice.
 *
 * Two manual methods: a bank transfer (works today) and dynamic QRIS (needs a
 * gateway key; the page says so until it is configured). After paying, the
 * vendor attaches proof and a reference, and the Dirory team confirms it — which
 * activates/extend the subscription.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, memberships } = await getSession();
  const membership = memberships[0];
  if (!membership) return notFound();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, vendor_id, amount_idr, status, gateway, payment_method, proof_path, proof_reference, due_at, paid_at, created_at, subscriptions(plans(name, period))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!invoice || invoice.vendor_id !== membership.vendor_id) notFound();

  const plan = (invoice as any).subscriptions?.plans;
  const unpaid = invoice.status === "unpaid";
  const awaiting = unpaid && Boolean(invoice.proof_path);
  const method = invoice.payment_method ?? "transfer";

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/vendor/subscription" className="text-slate-500 hover:text-slate-800">
          ← Subscription
        </Link>
      </div>

      {invoice.status === "paid" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Paid on {formatDateTime(invoice.paid_at)}. Your subscription is active.
        </div>
      ) : awaiting ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your proof was received. The Dirory team will confirm the payment and activate your
          subscription shortly.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Invoice" subtitle={`#${invoice.id.slice(0, 8)}`} />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Status</span>
              <Badge tone={statusTone(invoice.status)}>{invoice.status}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Plan</span>
              <span className="font-medium text-slate-800">{plan?.name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Billing</span>
              <span className="text-slate-700">every {periodNoun(plan?.period)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Due</span>
              <span className="text-slate-700">{formatDate(invoice.due_at)}</span>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500">Amount to pay</p>
              <p className="text-2xl font-semibold text-slate-900">{formatIDR(invoice.amount_idr)}</p>
            </div>
          </div>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {unpaid && midtransConfigured() ? (
            <Card>
              <CardHeader
                title="Pay online"
                subtitle="Card, QRIS, bank transfer (VA), GoPay, OVO, DANA or ShopeePay. The invoice is marked paid automatically once the gateway confirms it."
              />
              <div className="p-5">
                <MidtransPay
                  invoiceId={invoice.id}
                  clientKey={midtransConfig().clientKey}
                  scriptUrl={snapScriptUrl(midtransConfig().isProduction)}
                  amountLabel={formatIDR(invoice.amount_idr)}
                />
                <p className="mt-3 text-xs text-slate-500">
                  Prefer to pay by bank transfer and send us the proof? Use the manual options below.
                </p>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="How to pay manually"
              subtitle="Choose a method, pay the exact amount, then attach your proof below."
            />

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {/* ---- bank transfer ---------------------------------------- */}
              <div className={`rounded-xl border p-4 ${method === "transfer" ? "border-brand-400" : "border-slate-200"}`}>
                <p className="text-sm font-semibold text-slate-900">Bank transfer</p>
                {bankConfigured() ? (
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <Row label="Bank" value={BANK.name} />
                    <Row label="Account no." value={BANK.account} mono />
                    <Row label="Account name" value={BANK.holder} />
                  </dl>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    Bank details are not configured yet. Set <code>BILLING_BANK_*</code> on the
                    server.
                  </p>
                )}
                {unpaid ? (
                  <form action={setPaymentMethod} className="mt-4">
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <input type="hidden" name="method" value="transfer" />
                    <button
                      disabled={method === "transfer"}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {method === "transfer" ? "Selected" : "Pay by transfer"}
                    </button>
                  </form>
                ) : null}
              </div>

              {/* ---- QRIS ------------------------------------------------- */}
              <div className={`rounded-xl border p-4 ${method === "qris" ? "border-brand-400" : "border-slate-200"}`}>
                <p className="text-sm font-semibold text-slate-900">
                  QRIS {qrisLabel() ? `· ${qrisLabel()}` : ""}
                </p>
                {qrisConfigured() ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Scan the QR with any e-wallet or bank app. A fresh QR is created for this invoice.
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    Dynamic QRIS is not switched on yet — the gateway keys still need adding. Pay by
                    bank transfer for now; the QR will appear here once it is connected.
                  </p>
                )}
                {unpaid && qrisConfigured() ? (
                  <form action={setPaymentMethod} className="mt-4">
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <input type="hidden" name="method" value="qris" />
                    <button
                      disabled={method === "qris"}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {method === "qris" ? "Selected" : "Pay by QRIS"}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </Card>

          {unpaid ? (
            <Card>
              <CardHeader
                title="I've paid"
                subtitle="Attach your receipt and the reference / sender name so the team can match it."
              />
              <form action={submitPayment} className="grid gap-4 p-5 sm:grid-cols-2">
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <input type="hidden" name="method" value={method} />
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Reference / sender name
                  </label>
                  <input
                    name="reference"
                    defaultValue={invoice.proof_reference ?? ""}
                    placeholder="e.g. TRF-8891 / PT Contoh"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <PaymentProof vendorId={membership.vendor_id} invoiceId={invoice.id} />
                <div className="sm:col-span-2">
                  <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                    {awaiting ? "Update my proof" : "Submit proof of payment"}
                  </button>
                </div>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right font-medium text-slate-800 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
