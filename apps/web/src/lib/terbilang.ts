/**
 * Indonesian number-to-words ("terbilang").
 *
 * A kuitansi states the amount in words as well as figures, which is the
 * convention on Indonesian receipts and invoices. Written by hand rather than
 * pulled from a library because the rules are short and this avoids a dependency
 * for one function.
 *
 * Rules that matter:
 *   11  -> "sebelas"        (not "satu belas")
 *   12  -> "dua belas"
 *   100 -> "seratus"        (not "satu ratus")
 *   1000 -> "seribu"        (not "satu ribu")
 *   2000 -> "dua ribu"
 */

const UNITS = [
  "", // 0 is handled separately
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

function toWords(n: number): string {
  if (n < 12) return UNITS[n];
  if (n < 20) return `${toWords(n - 10)} belas`;
  if (n < 100) {
    const rest = n % 10;
    return `${toWords(Math.floor(n / 10))} puluh${rest ? ` ${toWords(rest)}` : ""}`;
  }
  if (n < 200) {
    const rest = n % 100;
    return `seratus${rest ? ` ${toWords(rest)}` : ""}`;
  }
  if (n < 1000) {
    const rest = n % 100;
    return `${toWords(Math.floor(n / 100))} ratus${rest ? ` ${toWords(rest)}` : ""}`;
  }
  if (n < 2000) {
    const rest = n % 1000;
    return `seribu${rest ? ` ${toWords(rest)}` : ""}`;
  }
  if (n < 1_000_000) {
    const rest = n % 1000;
    return `${toWords(Math.floor(n / 1000))} ribu${rest ? ` ${toWords(rest)}` : ""}`;
  }
  if (n < 1_000_000_000) {
    const rest = n % 1_000_000;
    return `${toWords(Math.floor(n / 1_000_000))} juta${rest ? ` ${toWords(rest)}` : ""}`;
  }
  if (n < 1_000_000_000_000) {
    const rest = n % 1_000_000_000;
    return `${toWords(Math.floor(n / 1_000_000_000))} miliar${rest ? ` ${toWords(rest)}` : ""}`;
  }
  const rest = n % 1_000_000_000_000;
  return `${toWords(Math.floor(n / 1_000_000_000_000))} triliun${rest ? ` ${toWords(rest)}` : ""}`;
}

/** Words only, lower case, e.g. "lima juta". */
export function terbilang(amount: number): string {
  const n = Math.round(Math.abs(Number(amount) || 0));
  if (n === 0) return "nol";
  return toWords(n).replace(/\s+/g, " ").trim();
}

/** Sentence form for a receipt, e.g. "Lima juta rupiah". */
export function terbilangRupiah(amount: number): string {
  const words = terbilang(amount);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} rupiah`;
}
