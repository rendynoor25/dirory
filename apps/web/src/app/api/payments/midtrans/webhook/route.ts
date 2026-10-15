import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  invoiceIdFromOrderId,
  mapMidtransStatus,
  midtransConfigured,
  proOrderIdFromOrderId,
  verifyMidtransSignature,
} from "@/lib/midtrans";
import { recordSecurityEvent } from "@/lib/securityAlerts";

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

  // This route is public by necessity (Midtrans has no Dirory session) and is
  // protected only by the signature. A04: bound the work before parsing it. A
  // real notification is about a kilobyte; `Content-Length` can lie, so the
  // limit is enforced on the body that actually arrived.
  const MAX_BYTES = 64 * 1024;
  const raw = await request.text();
  if (raw.length > MAX_BYTES) {
    console.warn("midtrans webhook: oversized body rejected", { bytes: raw.length });
    await recordSecurityEvent("webhook.oversized_body", { bytes: raw.length }, request);
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
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
    // The single most useful alert: either someone is probing, or the gateway key
    // was rotated and real notifications are now being thrown away.
    await recordSecurityEvent("webhook.bad_signature", { orderId, statusCode }, request);
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();

  // Dirory Pro (architects, migration 0039): its own orders, same rules.
  if (orderId.startsWith("DRP-")) {
    return settleProOrder(supabase, request, body, {
      orderId,
      statusCode,
      grossAmount,
      transactionStatus,
    });
  }

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
    // Signed correctly, but we have no matching invoice. Store it and stop —
    // and say so, because a signed notification nobody can apply is a payment
    // taken with nothing credited.
    await recordSecurityEvent("webhook.unmatched_invoice", { orderId, grossAmount }, request);
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
    await recordSecurityEvent("webhook.amount_mismatch", { orderId, paid, due }, request);
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

/**
 * A Dirory Pro order (architect). Same safety rules as an invoice: the event is
 * logged first (a retry is a no-op), only a settlement for the exact amount
 * grants Pro, and mark_pro_order_paid() is itself idempotent.
 */
async function settleProOrder(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  request: Request,
  body: Record<string, unknown>,
  n: { orderId: string; statusCode: string; grossAmount: string; transactionStatus: string },
) {
  let order = (
    await supabase.from("pro_orders").select("id, amount_idr, status").eq("gateway_ref", n.orderId).maybeSingle()
  ).data;
  if (!order) {
    const fallbackId = proOrderIdFromOrderId(n.orderId);
    if (fallbackId) {
      order = (
        await supabase.from("pro_orders").select("id, amount_idr, status").eq("id", fallbackId).maybeSingle()
      ).data;
    }
  }

  const { data: recorded, error: recordError } = await supabase
    .from("payment_events")
    .insert({
      gateway: "midtrans",
      order_id: n.orderId,
      transaction_status: n.transactionStatus,
      status_code: n.statusCode,
      gross_amount: n.grossAmount,
      pro_order_id: order?.id ?? null,
      payload: body,
    })
    .select("id")
    .maybeSingle();
  if (recordError && recordError.code !== "23505") {
    console.error("midtrans webhook: could not record pro event", recordError);
    return NextResponse.json({ error: "Could not record the event." }, { status: 500 });
  }
  if (!recorded) return NextResponse.json({ ok: true, duplicate: true });

  if (!order) {
    await recordSecurityEvent("webhook.unmatched_pro_order", { orderId: n.orderId, grossAmount: n.grossAmount }, request);
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const outcome = mapMidtransStatus(n.transactionStatus);
  if (outcome !== "paid") return NextResponse.json({ ok: true, status: n.transactionStatus, outcome });

  const paid = Math.round(Number(n.grossAmount));
  const due = Math.round(Number(order.amount_idr));
  if (!Number.isFinite(paid) || paid !== due) {
    await recordSecurityEvent("webhook.amount_mismatch", { orderId: n.orderId, paid, due }, request);
    return NextResponse.json({ ok: true, amount_mismatch: true });
  }

  const { error } = await supabase.rpc("mark_pro_order_paid", {
    p_order: order.id,
    p_gateway: "midtrans",
    p_reference: n.orderId,
  });
  if (error) {
    console.error("midtrans webhook: could not settle pro order", error);
    return NextResponse.json({ error: "Could not settle the order." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pro_settled: order.id });
}
