/**
 * Payment gateway adapter (QRIS).
 *
 * QRIS is **dynamic**: a fresh QR per invoice, minted by a payment gateway. That
 * needs a merchant account and API keys, which are not configured yet — so
 * `qrisConfigured()` is false, the invoice page offers the bank transfer, and it
 * says the QR is coming. Bank transfer needs no credentials and works today.
 *
 * To switch QRIS on:
 *   1. Set the gateway key in the server `.env`:
 *        XENDIT_SECRET_KEY=...            (or)   MIDTRANS_SERVER_KEY=...
 *   2. Implement `createQrisCharge` below for that gateway:
 *        Xendit   POST https://api.xendit.co/qr_codes
 *                 { external_id, type:"DYNAMIC", callback_url, amount }
 *                 -> { qr_string, id, expires_at }
 *        Midtrans POST <core-api>/v2/charge
 *                 { payment_type:"qris", transaction_details:{order_id,gross_amount} }
 *                 -> actions[] { name:"generate-qr-code", url }
 *   3. Point the gateway's webhook at /api/payments/webhook/<gateway> and
 *      verify its signature/callback token there before marking an invoice paid.
 *
 * Until then `createQrisCharge` throws a clear error rather than silently doing
 * nothing.
 */

export type QrisCharge = {
  /** EMVCo payload the client renders as a QR. */
  qrString: string | null;
  /** Or a gateway-hosted QR image URL. */
  qrUrl: string | null;
  expiresAt: string;
  gatewayRef: string;
};

export function qrisGateway(): "xendit" | "midtrans" | null {
  if (process.env.XENDIT_SECRET_KEY) return "xendit";
  if (process.env.MIDTRANS_SERVER_KEY) return "midtrans";
  return null;
}

export function qrisConfigured(): boolean {
  return qrisGateway() !== null;
}

/** Human label for the invoice page. */
export function qrisLabel(): string {
  const g = qrisGateway();
  if (g === "xendit") return "Xendit";
  if (g === "midtrans") return "Midtrans";
  return "";
}

export async function createQrisCharge(_input: {
  invoiceId: string;
  amountIdr: number;
  description: string;
}): Promise<QrisCharge> {
  throw new Error(
    "Dynamic QRIS is not configured yet. Set XENDIT_SECRET_KEY or MIDTRANS_SERVER_KEY and implement createQrisCharge().",
  );
}
