/**
 * Unit test for the Midtrans adapter's pure logic.
 *
 * Runs with Node's own type stripping, so no build step and no test framework:
 *
 *   node --experimental-strip-types scripts/test-midtrans.mts
 *
 * It uses a made-up server key, so it proves the crypto and the status mapping
 * without touching Midtrans or needing real credentials. A live sandbox payment
 * is a separate, manual step - see docs/PAYMENTS.md.
 */

process.env.MIDTRANS_SERVER_KEY = "SB-Mid-server-TESTKEY123";
process.env.MIDTRANS_CLIENT_KEY = "SB-Mid-client-TESTKEY123";
process.env.MIDTRANS_IS_PRODUCTION = "false";

import { createHash } from "node:crypto";
import {
  buildOrderId,
  mapMidtransStatus,
  midtransConfigured,
  midtransEnabledPayments,
  snapScriptUrl,
  verifyMidtransSignature,
} from "../apps/web/src/lib/midtrans.ts";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`}`);
}

/** Same formula Midtrans documents: sha512(order_id + status_code + gross_amount + server_key). */
function sign(orderId: string, statusCode: string, grossAmount: string, serverKey: string) {
  return createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest("hex");
}

const KEY = process.env.MIDTRANS_SERVER_KEY!;
const orderId = "DRY-abc123-1700000000";
const statusCode = "200";
const gross = "5000000.00";
const good = sign(orderId, statusCode, gross, KEY);

console.log("verifyMidtransSignature");
check("accepts a correctly signed notification", verifyMidtransSignature({ orderId, statusCode, grossAmount: gross, signatureKey: good }), true);
check("rejects a tampered amount", verifyMidtransSignature({ orderId, statusCode, grossAmount: "1.00", signatureKey: good }), false);
check("rejects a tampered order id", verifyMidtransSignature({ orderId: "DRY-evil", statusCode, grossAmount: gross, signatureKey: good }), false);
check("rejects a tampered status code", verifyMidtransSignature({ orderId, statusCode: "201", grossAmount: gross, signatureKey: good }), false);
check("rejects a signature from another key", verifyMidtransSignature({ orderId, statusCode, grossAmount: gross, signatureKey: sign(orderId, statusCode, gross, "SB-Mid-server-OTHER") }), false);
check("rejects an empty signature", verifyMidtransSignature({ orderId, statusCode, grossAmount: gross, signatureKey: "" }), false);
check("rejects a short signature without throwing", verifyMidtransSignature({ orderId, statusCode, grossAmount: gross, signatureKey: "abc" }), false);

console.log("\nmapMidtransStatus");
check("settlement -> paid", mapMidtransStatus("settlement"), "paid");
check("capture -> paid", mapMidtransStatus("capture"), "paid");
check("pending -> pending", mapMidtransStatus("pending"), "pending");
check("deny -> failed", mapMidtransStatus("deny"), "failed");
check("cancel -> failed", mapMidtransStatus("cancel"), "failed");
check("expire -> failed", mapMidtransStatus("expire"), "failed");
check("refund -> failed", mapMidtransStatus("refund"), "failed");
check("unknown -> ignored", mapMidtransStatus("something_new"), "ignored");
check("undefined -> ignored", mapMidtransStatus(undefined), "ignored");

console.log("\nbuildOrderId");
const a = buildOrderId("11111111-2222-3333-4444-555555555555", new Date(1_700_000_000_000));
const b = buildOrderId("11111111-2222-3333-4444-555555555555", new Date(1_700_000_001_000));
check("starts with DRY-", a.startsWith("DRY-"), true);
check("contains no dashes from the uuid", a.slice(4, 16).includes("-"), false);
check("two attempts at different times differ", a !== b, true);

console.log("\nconfiguration");
check("midtransConfigured with both keys", midtransConfigured(), true);
check("sandbox snap script url", snapScriptUrl(false), "https://app.sandbox.midtrans.com/snap/snap.js");
check("production snap script url", snapScriptUrl(true), "https://app.midtrans.com/snap/snap.js");

console.log("\nmidtransEnabledPayments");
delete process.env.MIDTRANS_ENABLED_PAYMENTS;
check("unset -> empty (Snap offers everything)", midtransEnabledPayments(), []);
process.env.MIDTRANS_ENABLED_PAYMENTS = "bsi_va";
check("single method -> one entry", midtransEnabledPayments(), ["bsi_va"]);
process.env.MIDTRANS_ENABLED_PAYMENTS = "bsi_va, bca_va ,,";
check("trims and drops blanks", midtransEnabledPayments(), ["bsi_va", "bca_va"]);
delete process.env.MIDTRANS_ENABLED_PAYMENTS;

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
