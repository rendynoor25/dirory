import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { buildProOrderId, createMidtransQrisCharge, midtransConfigured } from "@/lib/midtrans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ plan: z.enum(["pro_monthly", "pro_project"]) });

/**
 * POST /api/pro/order  { plan }
 *
 * Start (or reuse) a Dirory Pro order for the signed-in architect and attach a
 * dynamic QRIS to it. The price comes from `pro_plans` via pro_create_order(),
 * never from the browser. The webhook settles it (order id "DRP-…").
 *
 * GET /api/pro/order?id=<order>  -> { status, ends_at } for the payer's own order,
 * polled by the /pro page so it can say "Pro is active" without a refresh.
 */
export async function POST(request: Request) {
  if (!midtransConfigured()) {
    return NextResponse.json({ error: "QRIS is not configured." }, { status: 503 });
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown plan." }, { status: 400 });

  const { data: order, error } = await supabase.rpc("pro_create_order", { p_plan: parsed.data.plan });
  if (error || !order) {
    console.error("pro_create_order failed", error);
    return NextResponse.json({ error: "Could not start the order." }, { status: 500 });
  }

  // Reuse a QR that is still valid, so a refresh does not mint a new charge.
  if (order.qr_url && order.qr_expires_at && new Date(order.qr_expires_at) > new Date()) {
    return NextResponse.json({
      order_id: order.id,
      amount_idr: order.amount_idr,
      qr_url: order.qr_url,
      expires_at: order.qr_expires_at,
    });
  }

  try {
    const charge = await createMidtransQrisCharge({
      orderId: buildProOrderId(order.id),
      amountIdr: Number(order.amount_idr),
    });
    // Clients cannot write pro_orders; the order is the caller's own (it came
    // back from pro_create_order under their session), so the service role
    // attaches the QR.
    const service = createSupabaseServiceClient();
    const { error: updateError } = await service
      .from("pro_orders")
      .update({
        gateway: "midtrans",
        gateway_ref: charge.orderId,
        qr_string: charge.qrString,
        qr_url: charge.qrUrl,
        qr_expires_at: charge.expiresAt,
      })
      .eq("id", order.id)
      .eq("profile_id", user.id);
    if (updateError) {
      return NextResponse.json({ error: "Could not attach the QR to the order." }, { status: 500 });
    }
    return NextResponse.json({
      order_id: order.id,
      amount_idr: order.amount_idr,
      qr_url: charge.qrUrl,
      expires_at: charge.expiresAt,
    });
  } catch (err) {
    console.error("pro qris failed", err);
    const message = err instanceof Error ? err.message : "Could not create the QR.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // RLS limits both reads to the caller's own rows.
  const { data: order } = await supabase.from("pro_orders").select("id, status").eq("id", id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { data: ent } = await supabase
    .from("pro_entitlements")
    .select("ends_at")
    .eq("order_id", id)
    .maybeSingle();
  return NextResponse.json({ status: order.status, ends_at: ent?.ends_at ?? null });
}
