/**
 * Dirory's own contact details.
 *
 * One place, so the number cannot drift between the pricing page, the privacy
 * policy, the proposals and anything added later. Override with
 * `NEXT_PUBLIC_DIRORY_WHATSAPP` / `NEXT_PUBLIC_DIRORY_EMAIL` when the number
 * changes; these are public values, so `NEXT_PUBLIC_*` is correct.
 */

export const DIRORY_WHATSAPP = process.env.NEXT_PUBLIC_DIRORY_WHATSAPP ?? "+6285710086041";
export const DIRORY_EMAIL = process.env.NEXT_PUBLIC_DIRORY_EMAIL ?? "hello@dirory.com";

/** "+62 857-1008-6041" — how the number should read on a page or a proposal. */
export function formatWhatsApp(value: string = DIRORY_WHATSAPP): string {
  const digits = value.replace(/\D/g, "");
  // Indonesian mobile numbers: 62 8xx-xxxx-xxxx
  const m = /^62(\d{3})(\d{4})(\d+)$/.exec(digits);
  if (m) return `+62 ${m[1]}-${m[2]}-${m[3]}`;
  return value;
}

/** wa.me wants digits only, no plus, no dashes. */
export function whatsAppDigits(value: string = DIRORY_WHATSAPP): string {
  return value.replace(/\D/g, "");
}

/** A wa.me link, optionally with the first message pre-filled. */
export function whatsAppLink(text?: string): string {
  const base = `https://wa.me/${whatsAppDigits()}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
