// Checks the search-miss scrubber in supabase/functions/events (UU PDP A1).
// Usage: node scripts/test-scrub-query.mjs
import fs from "node:fs";

const src = fs.readFileSync(new URL("../supabase/functions/events/index.ts", import.meta.url), "utf8");
const grab = (name) => new RegExp(src.match(new RegExp(`const ${name} = /(.+)/g;`))[1], "g");
const EMAIL_RE = grab("EMAIL_RE"), MOBILE_RE = grab("MOBILE_RE"), LONG_DIGITS_RE = grab("LONG_DIGITS_RE");
const scrub = (q) => q.replace(EMAIL_RE, " ").replace(MOBILE_RE, " ").replace(LONG_DIGITS_RE, " ").replace(/\s+/g, " ").trim();

const cases = [
  ["toto cw630pj", "toto cw630pj"],
  ["granit 60x120", "granit 60x120"],
  ["panel 600 600 1200", "panel 600 600 1200"],
  ["ral 9010", "ral 9010"],
  ["budi@studio.co.id wastafel", "wastafel"],
  ["wa 0812-3456-7890 keramik", "wa keramik"],
  ["+62 812 3456 7890", ""],
  ["6281234567890 kloset", "kloset"],
];
let failed = 0;
for (const [input, want] of cases) {
  const got = scrub(input);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${JSON.stringify(input)} -> ${JSON.stringify(got)}`);
}
process.exit(failed ? 1 : 0);
