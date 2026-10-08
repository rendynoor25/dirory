/**
 * Payment gateway adapter — dynamic QRIS.
 *
 * Note: Midtrans is wired up separately, through **Snap** (`lib/midtrans.ts`).
 * Snap's hosted page already includes QRIS, so this file only covers a *direct*
 * dynamic-QRIS charge, which needs Xendit. Do not treat `MIDTRANS_SERVER_KEY`
 * as enabling this path — it would show a "scan this QR" box with no QR in it.
 *
 * To switch direct QRIS on:
 *   1. Set `XENDIT_SECRET_KEY` in the server `.env`.
 *   2. Implement `createQrisCharge` below:
 *        POST https://api.xendit.co/qr_codes
 *        { external_id, type:"DYNAMIC", callback_url, amount }
 *        -> { qr_string, id, expires_at }
 *   3. Point Xendit's webhook at a route that verifies its callback token.
 *
 * Until then `createQrisCharge` throws a clear error rather than doing nothing.
 */

export type QrisCharge = {
  /** EMVCo payload the client renders as a QR. */
  qrString: string | null;
  /** Or a gateway-hosted QR image URL. */
  qrUrl: string | null;
  expiresAt: string;
  gatewayRef: string;
};

export function qrisGateway(): "xendit" | null {
  if (process.env.XENDIT_SECRET_KEY) return "xendit";
  return null;
}

export function qrisConfigured(): boolean {
  return qrisGateway() !== null;
}

/** Human label for the invoice page. */
export function qrisLabel(): string {
  return qrisGateway() === "xendit" ? "Xendit" : "";
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
