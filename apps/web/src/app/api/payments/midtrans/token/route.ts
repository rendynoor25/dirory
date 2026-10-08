import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildOrderId,
  createSnapTransaction,
  midtransConfig,
  midtransConfigured,
  snapScriptUrl,
} from "@/lib/midtrans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/midtrans/token
 *
 * The vendor is signed in (cookie session), so RLS applies. Creates a Snap
 * transaction for one of the vendor's own unpaid invoices and records the order
 * id on the invoice, which is how the webhook finds it again.
 *
 * The server key never leaves this route; only the Snap token and the public
 * client key are returned.
 */
export async function POST(request: Request) {
  if (!midtransConfigured()) {
    return NextResponse.json(
      { error: "Online payment is not configured. Set MIDTRANS_SERVER_KEY and MIDTRANS_CLIENT_KEY." },
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

  // RLS already limits this to the vendor's own invoices; the membership check
  // is explicit so a misconfigured policy cannot silently widen access.
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, vendor_id, amount_idr, status, subscriptions(plans(name))")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) return NextResponse.json({ error: "Could not read the invoice." }, { status: 500 });
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", user.id)
    .maybeSingle();

  const planName = (invoice as { subscriptions?: { plans?: { name?: string } } }).subscriptions?.plans?.name;
  const orderId = buildOrderId(invoice.id);

  const [firstName, ...rest] = String(profile?.full_name ?? "").trim().split(/\s+/);

  try {
    const { token } = await createSnapTransaction({
      orderId,
      amountIdr: Number(invoice.amount_idr),
      itemName: planName ? `Dirory ${planName} subscription` : "Dirory subscription",
      customer: {
        first_name: firstName || undefined,
        last_name: rest.join(" ") || undefined,
        email: profile?.email ?? user.email ?? undefined,
        phone: profile?.phone ?? undefined,
      },
    });

    // Remember which order id belongs to this invoice; the webhook matches on it.
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ gateway: "midtrans", gateway_ref: orderId })
      .eq("id", invoice.id);
    if (updateError) {
      return NextResponse.json({ error: "Could not attach the payment to the invoice." }, { status: 500 });
    }

    const { clientKey, isProduction } = midtransConfig();
    return NextResponse.json({
      token,
      order_id: orderId,
      client_key: clientKey,
      snap_script_url: snapScriptUrl(isProduction),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start the payment.";
    console.error("midtrans token failed", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
