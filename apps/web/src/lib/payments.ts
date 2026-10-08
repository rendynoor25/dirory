import { buildOrderId, createMidtransQrisCharge, midtransConfigured } from "@/lib/midtrans";

/**
 * Dynamic QRIS for an invoice.
 *
 * "Dynamic" is Bank Indonesia's term for a QR that is minted per transaction,
 * carries the amount, and expires - as opposed to a static QR the payer types an
 * amount into. Each Dirory invoice therefore gets its OWN QR, tied to one order
 * id, which is what makes it safe to show on a public-ish page: paying it can
 * only ever settle that one invoice.
 *
 * Implemented with Midtrans Core API (`payment_type: "qris"`). Snap also offers
 * QRIS, but Snap is a redirect; this path exists so the payer can scan in place
 * without leaving the page.
 *
 * Xendit is a possible alternative but is not implemented: `createQrisCharge`
 * throws rather than pretending.
 */

export type QrisCharge = {
  /** EMVCo payload, when the gateway returns one. */
  qrString: string | null;
  /** Hosted PNG of the QR. This is what the page renders. */
  qrUrl: string | null;
  /** ISO timestamp, or null when the gateway did not state one. */
  expiresAt: string | null;
  /** The order id stored on the invoice; the webhook matches on it. */
  gatewayRef: string;
};

/** Which gateway can mint a QR right now. Only Midtrans is implemented. */
export function qrisGateway(): "midtrans" | "xendit" | null {
  if (midtransConfigured()) return "midtrans";
  if (process.env.XENDIT_SECRET_KEY) return "xendit";
  return null;
}

/**
 * True only when QRIS can actually be created. Deliberately narrower than
 * `qrisGateway()`: Xendit is listed so the label is honest, but it would throw,
 * and the invoice page must not offer a button that cannot work.
 */
export function qrisConfigured(): boolean {
  return midtransConfigured();
}

/** Human label for the invoice page. */
export function qrisLabel(): string {
  return qrisConfigured() ? "Midtrans" : "";
}

export async function createQrisCharge(input: {
  invoiceId: string;
  amountIdr: number;
  description: string;
}): Promise<QrisCharge> {
  if (midtransConfigured()) {
    const orderId = buildOrderId(input.invoiceId);
    const charge = await createMidtransQrisCharge({
      orderId,
      amountIdr: input.amountIdr,
    });
    return {
      qrString: charge.qrString,
      qrUrl: charge.qrUrl,
      expiresAt: charge.expiresAt,
      gatewayRef: charge.orderId,
    };
  }

  throw new Error(
    "Dynamic QRIS is not configured. Set MIDTRANS_SERVER_KEY (Xendit is not implemented yet).",
  );
}
