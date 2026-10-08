/**
 * Whether an address looks like a company address rather than a personal one.
 *
 * Used to gate the company pricing page: Dirory sells to brands (TOTO, TACO and
 * similar), and a work address is a cheap signal that the visitor represents a
 * business rather than an individual architect.
 *
 * This is a **soft gate, not security**. Anyone can type any domain, and nothing
 * here protects data — it only shapes who the pricing page is shown to. The
 * vendor portal itself does not depend on it, and neither does any RLS policy.
 */

/** Free / personal mailbox providers. */
const FREEMAIL = new Set([
  // Global
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "rocketmail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "tutanota.com",
  "tuta.io",
  "fastmail.com",
  "hushmail.com",
  "inbox.com",
  "qq.com",
  "163.com",
  "126.com",
  // Common in Indonesia
  "yahoo.co.id",
  "ymail.co.id",
  "plasa.com",
  "telkom.net",
  "indosat.net.id",
  "cbn.net.id",
  "rad.net.id",
  "centrin.net.id",
  "dnet.net.id",
  "indo.net.id",
  "biz.net.id",
  "mail2world.com",
]);

/** Lower-cased domain part, or "" when the address is not usable. */
export function emailDomain(email: string | null | undefined): string {
  const value = String(email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return "";
  const domain = value.slice(at + 1);
  // A domain needs a dot and no whitespace to be plausible.
  if (!domain.includes(".") || /\s/.test(domain)) return "";
  return domain;
}

export function isFreemail(email: string | null | undefined): boolean {
  const domain = emailDomain(email);
  return domain !== "" && FREEMAIL.has(domain);
}

/** True when we are willing to show company pricing to this address. */
export function isBusinessEmail(email: string | null | undefined): boolean {
  return emailDomain(email) !== "" && !isFreemail(email);
}
