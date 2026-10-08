#!/usr/bin/env node
/**
 * Midtrans sandbox helpers. Two modes.
 *
 * 1. Create a real Snap transaction (sandbox) and print the payment page URL:
 *
 *      node scripts/midtrans-sandbox-test.mjs
 *
 *    Reads MIDTRANS_SERVER_KEY and MIDTRANS_CLIENT_KEY from the environment or
 *    from `.env.local` in the repo root. Refuses to run when
 *    MIDTRANS_IS_PRODUCTION is "true", so it can never charge a real card.
 *    Open the printed URL, pay with a Midtrans sandbox instrument, then watch
 *    the webhook and the invoice.
 *
 * 2. Simulate a settlement notification against a running webhook:
 *
 *      node scripts/midtrans-sandbox-test.mjs --notify https://dirory.com/api/payments/midtrans/webhook \
 *        --order DRY-xxxxxxxxxxxx-1700000000 --amount 5000000
 *
 *    Signs the payload exactly as Midtrans does, so it exercises the real
 *    signature check and the settle path. Use it to prove the endpoint works
 *    without waiting for a payment.
 *
 * Nothing here is imported by the app; it is an operator tool.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

loadEnv();

const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";
const clientKey = process.env.MIDTRANS_CLIENT_KEY ?? "";
const isProduction = (process.env.MIDTRANS_IS_PRODUCTION ?? "").toLowerCase() === "true";

if (!serverKey) {
  console.error("MIDTRANS_SERVER_KEY is not set (environment or .env.local).");
  process.exit(1);
}

if (isProduction) {
  console.error(
    "MIDTRANS_IS_PRODUCTION is \"true\". This script is for the sandbox only; refusing to run.",
  );
  process.exit(1);
}

function sign(orderId, statusCode, grossAmount, key) {
  return createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${key}`).digest("hex");
}

// ---------------------------------------------------------------------------
// Mode 2: simulate a settlement notification
// ---------------------------------------------------------------------------
const notifyUrl = arg("notify", null);
if (notifyUrl) {
  const orderId = String(arg("order", ""));
  const amount = String(arg("amount", ""));
  if (!orderId || !amount) {
    console.error("--notify needs --order <order_id> and --amount <gross_amount>");
    process.exit(1);
  }

  const statusCode = "200";
  const grossAmount = `${amount}.00`;
  const signatureKey = sign(orderId, statusCode, grossAmount, serverKey);

  const payload = {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: signatureKey,
    transaction_status: String(arg("status", "settlement")),
    transaction_id: `sim-${Date.now()}`,
    payment_type: "qris",
    transaction_time: new Date().toISOString().slice(0, 19).replace("T", " "),
  };

  console.log(`POST ${notifyUrl}`);
  console.log(`  order_id  : ${orderId}`);
  console.log(`  amount    : ${grossAmount}`);
  console.log(`  signature : ${signatureKey.slice(0, 24)}…`);

  const res = await fetch(String(notifyUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(`  response  : HTTP ${res.status} ${text.slice(0, 200)}`);

  if (res.ok) {
    console.log(
      "\nIf the invoice now shows paid, the signature check, the amount check and" +
        "\nmark_invoice_paid() all worked. Run it again: it must be a no-op (idempotent).",
    );
  }
  process.exit(res.ok ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Mode 1: create a Snap transaction
// ---------------------------------------------------------------------------
if (!clientKey) {
  console.error("MIDTRANS_CLIENT_KEY is not set (needed to open the Snap page).");
  process.exit(1);
}

const amount = Number(arg("amount", 1000));
const orderId = String(arg("order", `DRY-SANDBOXTEST-${Math.floor(Date.now() / 1000)}`));

const auth = Buffer.from(`${serverKey}:`).toString("base64");
const res = await fetch("https://app.sandbox.midtrans.com/snap/v1/transactions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Basic ${auth}`,
  },
  body: JSON.stringify({
    transaction_details: { order_id: orderId, gross_amount: amount },
    item_details: [{ id: "sandbox-test", name: "Dirory sandbox test", price: amount, quantity: 1 }],
    customer_details: { first_name: "Sandbox", email: "sandbox@dirory.com" },
  }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`Midtrans rejected the request (HTTP ${res.status}):`);
  console.error(body.slice(0, 400));
  console.error(
    "\nCommon causes: a production key with sandbox mode, a revoked key, or a key from another project.",
  );
  process.exit(1);
}

const parsed = JSON.parse(body);
console.log("Snap transaction created.");
console.log(`  order_id  : ${orderId}`);
console.log(`  token     : ${parsed.token}`);
console.log(`  pay here  : ${parsed.redirect_url}`);
console.log(`\nClient key for snap.js: ${clientKey}`);
console.log(
  "\nNext: open the payment page, pay with a sandbox instrument, then confirm the" +
    "\ninvoice became paid and that payment_events has a row for this order_id.",
);
