/**
 * Unit test for the company-email rule behind /pricing.
 *
 *   node --experimental-strip-types scripts/test-business-email.mts
 *
 * The gate is a business rule, not security, but the parsing has real edge
 * cases ("a@", "@b.com", a domain with no dot) and a mistake would either hide
 * the page from every brand or show it to everyone.
 */

import {
  canViewCompanyPricing,
  emailDomain,
  isBusinessEmail,
  isFreemail,
} from "../apps/web/src/lib/businessEmail.ts";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`}`);
}

console.log("emailDomain");
check("normal address", emailDomain("sales@toto.co.id"), "toto.co.id");
check("upper case is lowered", emailDomain("Sales@TOTO.co.id"), "toto.co.id");
check("surrounding space", emailDomain("  a@b.com  "), "b.com");
check("no at sign", emailDomain("nobody"), "");
check("nothing after the at", emailDomain("a@"), "");
check("nothing before the at", emailDomain("@b.com"), "");
check("domain without a dot", emailDomain("a@localhost"), "");
check("null", emailDomain(null), "");
check("undefined", emailDomain(undefined), "");

console.log("\nisFreemail");
check("gmail.com", isFreemail("someone@gmail.com"), true);
check("yahoo.co.id", isFreemail("someone@yahoo.co.id"), true);
check("hotmail.com", isFreemail("someone@hotmail.com"), true);
check("a company domain", isFreemail("sales@toto.co.id"), false);
check("empty", isFreemail(""), false);

console.log("\nisBusinessEmail");
check("toto.co.id is a business", isBusinessEmail("sales@toto.co.id"), true);
check("gmail is not", isBusinessEmail("someone@gmail.com"), false);
check("a malformed address is not", isBusinessEmail("nobody"), false);

console.log("\ncanViewCompanyPricing");
delete process.env.PRICING_ALLOWED_EMAILS;
check("the founder's gmail is allowed", canViewCompanyPricing("rendynoorchandra@gmail.com"), true);
check("founder, mixed case", canViewCompanyPricing("RendyNoorChandra@Gmail.com"), true);
check("another gmail is not", canViewCompanyPricing("random@gmail.com"), false);
check("a company address is allowed", canViewCompanyPricing("sales@taco.co.id"), true);
check("no address is not", canViewCompanyPricing(null), false);

process.env.PRICING_ALLOWED_EMAILS = "colleague@gmail.com, demo@yahoo.com";
check("an extra allowed address works", canViewCompanyPricing("colleague@gmail.com"), true);
check("a second extra address works", canViewCompanyPricing("demo@yahoo.com"), true);
check("an unlisted gmail still is not", canViewCompanyPricing("someone@gmail.com"), false);
delete process.env.PRICING_ALLOWED_EMAILS;

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
