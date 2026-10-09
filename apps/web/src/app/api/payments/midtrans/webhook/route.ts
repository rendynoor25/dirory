import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  invoiceIdFromOrderId,
  mapMidtransStatus,
  midtransConfigured,
  verifyMidtransSignature,
} from "@/lib/midtrans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/midtrans/webhook
 *
 * Called by Midtrans, not by a browser: there is no session, so this route uses
 * the service role and relies entirely on the signature check.
 *
 * Register this URL in Midtrans → Settings → Configuration → Payment
 * Notification URL:
 *   https://<your-domain>/api/payments/midtrans/webhook
 *
 * Safety rules, in order:
 *   1. Reject anything whose signature does not verify.
 *   2. Record the notification in `payment_events`; the unique key makes a
 *      retry a no-op, so a subscription cannot be extended twice.
 *   3. Only settle when the amount matches the invoice, so a tampered or
 *      mismatched notification cannot pay a larger invoice.
 *   4. Always answer 200 once the event is stored, so Midtrans stops retrying.
 */
export async function POST(request: Request) {
  if (!midtransConfigured()) {
    return NextResponse.json({ error: "Gateway not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const orderId = String(body.order_id ?? "");
  const statusCode = String(body.status_code ?? "");
  const grossAmount = String(body.gross_amount ?? "");
  const signatureKey = String(body.signature_key ?? "");
  const transactionStatus = String(body.transaction_status ?? "");

  if (!orderId || !statusCode || !grossAmount || !signatureKey) {
    return NextResponse.json({ error: "Incomplete notification." }, { status: 400 });
  }

  if (!verifyMidtransSignature({ orderId, statusCode, grossAmount, signatureKey })) {
    console.warn("midtrans webhook: bad signature", { orderId });
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();

  // Find the invoice this order belongs to.
  //
  // `gateway_ref` is the primary link, but it only holds the *latest* order for
  // an invoice: a vendor can click "Pay" twice, or mint a QRIS charge after a
  // Snap attempt. The order id embeds the full invoice id, so fall back to that.
  // Without the fallback, paying an earlier order would take the money and never
  // apply it ("unmatched").
  let invoice = (
    await supabase
      .from("invoices")
      .select("id, amount_idr, status")
      .eq("gateway_ref", orderId)
      .maybeSingle()
  ).data;

  if (!invoice) {
    const fallbackId = invoiceIdFromOrderId(orderId);
    if (fallbackId) {
      invoice = (
        await supabase
          .from("invoices")
          .select("id, amount_idr, status")
          .eq("id", fallbackId)
          .maybeSingle()
      ).data;
    }
  }

  // Idempotency: the unique key means a duplicate notification inserts nothing.
  const { data: recorded, error: recordError } = await supabase
    .from("payment_events")
    .insert({
      gateway: "midtrans",
      order_id: orderId,
      transaction_status: transactionStatus,
      status_code: statusCode,
      gross_amount: grossAmount,
      invoice_id: invoice?.id ?? null,
      payload: body,
    })
    .select("id")
    .maybeSingle();

  if (recordError && recordError.code !== "23505") {
    console.error("midtrans webhook: could not record event", recordError);
    // Ask Midtrans to retry rather than silently dropping a real payment.
    return NextResponse.json({ error: "Could not record the event." }, { status: 500 });
  }
  if (!recorded) {
    // 23505 → already processed. Acknowledge so retries stop.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!invoice) {
    // Signed correctly, but we have no matching invoice. Store it and stop.
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const outcome = mapMidtransStatus(transactionStatus);

  if (outcome !== "paid") {
    // pending / failed / ignored: the event is logged for reconciliation, and
    // the invoice is left untouched. A pending QRIS is not a payment.
    return NextResponse.json({ ok: true, status: transactionStatus, outcome });
  }

  // Compare amounts before settling. Midtrans sends a decimal string.
  const paid = Math.round(Number(grossAmount));
  const due = Math.round(Number(invoice.amount_idr));
  if (!Number.isFinite(paid) || paid !== due) {
    console.warn("midtrans webhook: amount mismatch", { orderId, paid, due });
    return NextResponse.json({ ok: true, amount_mismatch: true });
  }

  const { error: settleError } = await supabase.rpc("mark_invoice_paid", {
    p_invoice: invoice.id,
    p_gateway: "midtrans",
    p_reference: orderId,
  });
  if (settleError) {
    console.error("midtrans webhook: could not settle invoice", settleError);
    return NextResponse.json({ error: "Could not settle the invoice." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settled: invoice.id });
}
