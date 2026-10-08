/**
 * Unit test for the Indonesian "terbilang" (number-to-words) helper.
 *
 *   node --experimental-strip-types scripts/test-terbilang.mts
 *
 * A kuitansi states the amount in words, so a wrong word is a wrong receipt.
 * The irregular cases (sebelas, seratus, seribu) are where naive
 * implementations break, so they are checked explicitly.
 */

import { terbilang, terbilangRupiah } from "../apps/web/src/lib/terbilang.ts";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`}`);
}

console.log("teens and tens");
check("0", terbilang(0), "nol");
check("1", terbilang(1), "satu");
check("9", terbilang(9), "sembilan");
check("10", terbilang(10), "sepuluh");
check("11 is sebelas, not satu belas", terbilang(11), "sebelas");
check("12", terbilang(12), "dua belas");
check("19", terbilang(19), "sembilan belas");
check("20", terbilang(20), "dua puluh");
check("21", terbilang(21), "dua puluh satu");
check("99", terbilang(99), "sembilan puluh sembilan");

console.log("\nhundreds");
check("100 is seratus, not satu ratus", terbilang(100), "seratus");
check("101", terbilang(101), "seratus satu");
check("110", terbilang(110), "seratus sepuluh");
check("199", terbilang(199), "seratus sembilan puluh sembilan");
check("200", terbilang(200), "dua ratus");
check("999", terbilang(999), "sembilan ratus sembilan puluh sembilan");

console.log("\nthousands");
check("1000 is seribu, not satu ribu", terbilang(1000), "seribu");
check("1001", terbilang(1001), "seribu satu");
check("1500", terbilang(1500), "seribu lima ratus");
check("2000 is dua ribu", terbilang(2000), "dua ribu");
check("500000", terbilang(500000), "lima ratus ribu");
check("150000", terbilang(150000), "seratus lima puluh ribu");

console.log("\nmillions and beyond");
check("1000000", terbilang(1000000), "satu juta");
check("1500000", terbilang(1500000), "satu juta lima ratus ribu");
check("5000000", terbilang(5000000), "lima juta");
check("25000000 (the Growth package)", terbilang(25000000), "dua puluh lima juta");
check("1000000000", terbilang(1000000000), "satu miliar");

console.log("\nreceipt form");
check("Rp 5.000.000", terbilangRupiah(5000000), "Lima juta rupiah");
check("Rp 25.000.000", terbilangRupiah(25000000), "Dua puluh lima juta rupiah");
check("Rp 0", terbilangRupiah(0), "Nol rupiah");

console.log("\nrobustness");
check("negative uses the absolute value", terbilang(-25000000), "dua puluh lima juta");
check("decimals round", terbilang(1500.4), "seribu lima ratus");
check("NaN becomes nol", terbilang(Number.NaN), "nol");

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
