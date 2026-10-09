import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Midtrans Snap adapter (PRD §76, §255).
 *
 * Snap is Midtrans' hosted payment page: it offers the local methods that
 * matter here — QRIS, bank transfer (VA), e-wallets (GoPay/OVO/DANA/ShopeePay)
 * and cards — behind one redirect, so Dirory does not implement each one.
 *
 * This module is **server-only**. `MIDTRANS_SERVER_KEY` authorises charges and
 * must never reach the browser. `MIDTRANS_CLIENT_KEY` is public by design (Snap
 * needs it in `data-client-key`), but it is still read on the server and passed
 * to the client component as a prop, so it is not baked into every page bundle.
 *
 * Configuration (server `.env`):
 *   MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
 *   MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxx
 *   MIDTRANS_IS_PRODUCTION=false          # "true" for live transactions
 *
 * Webhook URL to register in the Midtrans dashboard (Settings → Configuration):
 *   https://<your-domain>/api/payments/midtrans/webhook
 */

export type MidtransConfig = {
  serverKey: string;
  clientKey: string;
  isProduction: boolean;
};

export function midtransConfig(): MidtransConfig {
  return {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    clientKey: process.env.MIDTRANS_CLIENT_KEY ?? "",
    isProduction: (process.env.MIDTRANS_IS_PRODUCTION ?? "").toLowerCase() === "true",
  };
}

/** True when both keys are present, so the UI can offer online payment. */
export function midtransConfigured(): boolean {
  const { serverKey, clientKey } = midtransConfig();
  return Boolean(serverKey && clientKey);
}

/** Snap.js URL the browser loads; sandbox and production differ. */
export function snapScriptUrl(isProduction: boolean): string {
  return isProduction
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";
}

function snapApiBase(isProduction: boolean): string {
  return isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

export type SnapItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

/**
 * Payment methods to offer, from `MIDTRANS_ENABLED_PAYMENTS` (comma-separated).
 *
 * Empty means "everything the merchant account has enabled" (Snap's default).
 * Set it to a single value such as `bsi_va` to send the payer straight to BSI
 * Virtual Account: Snap skips its method list when only one is specified.
 *
 * The code for BSI Virtual Account is `bsi_va`, per Midtrans' docs. It can only
 * be paid through the BYOND by BSI app, so pair it with the manual transfer
 * option rather than making it the only way to pay.
 */
export function midtransEnabledPayments(): string[] {
  return (process.env.MIDTRANS_ENABLED_PAYMENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SnapCustomer = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
};

export type SnapResult = {
  token: string;
  redirectUrl: string | null;
};

/**
 * Create a Snap transaction and return its token.
 *
 * Throws on a non-2xx answer with Midtrans' own message, so the caller can show
 * something useful instead of a blank failure.
 */
export async function createSnapTransaction(input: {
  orderId: string;
  amountIdr: number;
  itemName: string;
  customer?: SnapCustomer;
  items?: SnapItem[];
}): Promise<SnapResult> {
  const { serverKey, isProduction } = midtransConfig();
  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY is not set.");

  const auth = Buffer.from(`${serverKey}:`).toString("base64");

  const body: Record<string, unknown> = {
    transaction_details: {
      order_id: input.orderId,
      gross_amount: Math.round(input.amountIdr),
    },
  };

  // item_details is optional, but sending one line keeps the Snap page readable
  // and its total must equal gross_amount or Midtrans rejects the request.
  if (input.items?.length) {
    body.item_details = input.items;
  } else {
    body.item_details = [
      {
        id: input.orderId,
        name: input.itemName.slice(0, 50),
        price: Math.round(input.amountIdr),
        quantity: 1,
      },
    ];
  }

  if (input.customer && Object.values(input.customer).some(Boolean)) {
    body.customer_details = input.customer;
  }

  // Restrict the offered methods when the operator asked for a specific one.
  const enabled = midtransEnabledPayments();
  if (enabled.length) {
    body.enabled_payments = enabled;
  }

  const res = await fetch(`${snapApiBase(isProduction)}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
    // Never let a slow gateway hang the request indefinitely.
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Midtrans rejected the transaction (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  let parsed: { token?: string; redirect_url?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Midtrans returned a response that was not JSON.");
  }

  if (!parsed.token) throw new Error("Midtrans did not return a Snap token.");
  return { token: parsed.token, redirectUrl: parsed.redirect_url ?? null };
}

/**
 * Verify a webhook notification.
 *
 * Midtrans signs with SHA-512 over `order_id + status_code + gross_amount +
 * server_key` and sends the hex digest as `signature_key`. Compare in constant
 * time so the endpoint does not leak the digest byte by byte.
 */
export function verifyMidtransSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
}): boolean {
  const { serverKey } = midtransConfig();
  if (!serverKey) return false;

  const expected = createHash("sha512")
    .update(`${input.orderId}${input.statusCode}${input.grossAmount}${serverKey}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(input.signatureKey ?? "", "utf8");
  // timingSafeEqual throws on a length mismatch, so check length first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** How a Midtrans `transaction_status` maps onto our invoice handling. */
export type MidtransOutcome = "paid" | "pending" | "failed" | "ignored";

export function mapMidtransStatus(status: string | undefined): MidtransOutcome {
  switch ((status ?? "").toLowerCase()) {
    case "settlement":
    case "capture":
      return "paid";
    case "pending":
      return "pending";
    case "deny":
    case "cancel":
    case "expire":
    case "failure":
    case "refund":
    case "partial_refund":
      return "failed";
    default:
      return "ignored";
  }
}

/**
 * A stable, unique order id. Midtrans requires uniqueness across all attempts,
 * so the epoch is included.
 *
 * The **whole** invoice id is embedded, not a prefix. A vendor can mint more than
 * one order for the same invoice — a Snap attempt, another after going back, or a
 * QRIS charge — but `invoices.gateway_ref` holds only the latest. Embedding the
 * full id lets the webhook recover the invoice from *any* of those orders, so
 * paying an older one settles instead of being lost as "unmatched". Midtrans caps
 * order_id at 50 characters; this format is 47.
 */
export function buildOrderId(invoiceId: string, now = new Date()): string {
  const stamp = Math.floor(now.getTime() / 1000);
  return `DRY-${invoiceId.replace(/-/g, "").toLowerCase()}-${stamp}`;
}

/**
 * Recover the invoice id from an order id built by `buildOrderId`, or null when
 * the id was not built by us. The webhook uses this as a fallback when
 * `gateway_ref` has moved on to a newer order for the same invoice.
 */
export function invoiceIdFromOrderId(orderId: string): string | null {
  const m = /^DRY-([0-9a-f]{32})-\d+$/i.exec(orderId);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Dynamic QRIS (Core API)
//
// Snap already includes QRIS, but a dedicated charge gives ONE QR for ONE
// invoice with a fixed amount and an expiry - a "dynamic" QRIS, per Bank
// Indonesia's terms - which is what the invoice page shows when the payer wants
// to scan rather than be redirected.
//
// Core API base differs from Snap's: api.sandbox.midtrans.com / api.midtrans.com
// ---------------------------------------------------------------------------
function coreApiBase(isProduction: boolean): string {
  return isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
}

export type QrisChargeResult = {
  orderId: string;
  transactionId: string | null;
  /** EMVCo payload, if Midtrans returned it. */
  qrString: string | null;
  /** PNG of the QR, hosted by Midtrans. This is what the page renders. */
  qrUrl: string | null;
  /** ISO timestamp, or null when Midtrans did not state one. */
  expiresAt: string | null;
};

/**
 * Create a dynamic QRIS charge for one invoice.
 *
 * Midtrans returns the QR as an image URL in `actions[]`; the payload itself may
 * also come back as `qr_string`. The QR is unique to this order and expires.
 */
export async function createMidtransQrisCharge(input: {
  orderId: string;
  amountIdr: number;
  acquirer?: "gopay" | "airpay_shopee";
}): Promise<QrisChargeResult> {
  const { serverKey, isProduction } = midtransConfig();
  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY is not set.");

  const auth = Buffer.from(`${serverKey}:`).toString("base64");

  const res = await fetch(`${coreApiBase(isProduction)}/v2/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: {
        order_id: input.orderId,
        gross_amount: Math.round(input.amountIdr),
      },
      qris: { acquirer: input.acquirer ?? "gopay" },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Midtrans rejected the QRIS charge (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  let parsed: {
    transaction_id?: string;
    qr_string?: string;
    expiry_time?: string;
    actions?: { name?: string; url?: string }[];
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Midtrans returned a QRIS response that was not JSON.");
  }

  const qrUrl = parsed.actions?.find((a) => a.name === "generate-qr-code")?.url ?? null;

  // Midtrans states expiry in Jakarta time without a zone, e.g.
  // "2026-10-09 11:46:13". Parse it as +07:00 rather than letting the server's
  // own timezone decide, which would shift the expiry.
  let expiresAt: string | null = null;
  if (parsed.expiry_time) {
    const d = new Date(`${parsed.expiry_time.replace(" ", "T")}+07:00`);
    expiresAt = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return {
    orderId: input.orderId,
    transactionId: parsed.transaction_id ?? null,
    qrString: parsed.qr_string ?? null,
    qrUrl,
    expiresAt,
  };
}
