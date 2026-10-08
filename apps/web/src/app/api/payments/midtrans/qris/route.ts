import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createQrisCharge, qrisConfigured } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/midtrans/qris
 *
 * Mint a dynamic QRIS for one of the vendor's own unpaid invoices and store it
 * on the invoice. The QR is unique to that invoice and expires.
 *
 * The webhook settles it, exactly as it does for a Snap payment: both set
 * `gateway_ref` to the order id, so there is one settlement path.
 */
export async function POST(request: Request) {
  if (!qrisConfigured()) {
    return NextResponse.json(
      { error: "QRIS is not configured. Set MIDTRANS_SERVER_KEY." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { invoice_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const invoiceId = body.invoice_id;
  if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) {
    return NextResponse.json({ error: "A valid invoice_id is required." }, { status: 400 });
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, vendor_id, amount_idr, status, qr_url, qr_expires_at")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.status !== "unpaid") {
    return NextResponse.json({ error: `This invoice is ${invoice.status}.` }, { status: 409 });
  }

  const { data: membership } = await supabase
    .from("vendor_members")
    .select("vendor_id")
    .eq("vendor_id", invoice.vendor_id)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not your invoice." }, { status: 403 });

  // Reuse a QR that is still valid, so refreshing the page does not mint a new
  // one each time (each mint is a separate Midtrans transaction).
  if (invoice.qr_url && invoice.qr_expires_at && new Date(invoice.qr_expires_at) > new Date()) {
    return NextResponse.json({
      qr_url: invoice.qr_url,
      expires_at: invoice.qr_expires_at,
      reused: true,
    });
  }

  try {
    const charge = await createQrisCharge({
      invoiceId: invoice.id,
      amountIdr: Number(invoice.amount_idr),
      description: "Dirory subscription",
    });

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        gateway: "midtrans",
        gateway_ref: charge.gatewayRef,
        qr_string: charge.qrString,
        qr_url: charge.qrUrl,
        qr_expires_at: charge.expiresAt,
      })
      .eq("id", invoice.id);

    if (updateError) {
      return NextResponse.json({ error: "Could not attach the QR to the invoice." }, { status: 500 });
    }

    return NextResponse.json({
      qr_url: charge.qrUrl,
      qr_string: charge.qrString,
      expires_at: charge.expiresAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create the QR.";
    console.error("midtrans qris failed", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
