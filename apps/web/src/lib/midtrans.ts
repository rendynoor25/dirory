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
 * so the epoch is included; the invoice id makes it easy to trace back.
 */
export function buildOrderId(invoiceId: string, now = new Date()): string {
  const stamp = Math.floor(now.getTime() / 1000);
  return `DRY-${invoiceId.replace(/-/g, "").slice(0, 12)}-${stamp}`;
}
