/**
 * Billing configuration for the vendor portal.
 *
 * Bank details are **server-only** env vars (deliberately not `NEXT_PUBLIC_*`,
 * so they are never baked into the client bundle). Set them in the server `.env`
 * and restart — no rebuild needed, because server components read them per
 * request:
 *
 *   BILLING_BANK_NAME="Bank Central Asia (BCA)"
 *   BILLING_BANK_ACCOUNT="1234567890"
 *   BILLING_BANK_HOLDER="PT Dirory Indonesia"
 */

export const BANK = {
  name: process.env.BILLING_BANK_NAME ?? "",
  account: process.env.BILLING_BANK_ACCOUNT ?? "",
  holder: process.env.BILLING_BANK_HOLDER ?? "",
};

/** True once the bank details are set, so the page can hide an empty box. */
export function bankConfigured(): boolean {
  return Boolean(BANK.name && BANK.account && BANK.holder);
}

/** "month" / "year" — used in "renews every month". */
export function periodNoun(period: string | null | undefined): string {
  return period === "yearly" ? "year" : "month";
}

/** Add one billing period to a date. Mirrors the admin "mark paid" extension. */
export function addPeriod(from: Date, period: string | null | undefined): Date {
  const until = new Date(from);
  if (period === "yearly") until.setFullYear(until.getFullYear() + 1);
  else until.setMonth(until.getMonth() + 1);
  return until;
}
