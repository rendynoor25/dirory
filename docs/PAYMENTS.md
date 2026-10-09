# Payments — Midtrans Snap

How a vendor pays a Dirory subscription, and how the invoice becomes paid.

## What is implemented

| Piece | Where |
|---|---|
| Snap transaction (mint a payment token) | `POST /api/payments/midtrans/token` |
| Gateway webhook (settle the invoice) | `POST /api/payments/midtrans/webhook` |
| Midtrans adapter, signature check, status mapping | `apps/web/src/lib/midtrans.ts` |
| "Pay online" button | `apps/web/src/app/vendor/subscription/invoice/[id]/MidtransPay.tsx` |
| Single "invoice paid" operation | `public.mark_invoice_paid()` — migration `0013` |
| Gateway event log (idempotency + audit) | `public.payment_events` — migration `0013` |
| Grace/expiry (7 days, then hidden) | `public.expire_subscriptions()` + `public.vendor_is_visible()` — migration `0022` |

Snap is Midtrans' hosted payment page. It offers **QRIS, bank transfer (VA),
GoPay, OVO, DANA, ShopeePay and cards** behind one redirect, so Dirory does not
integrate each method separately.

## How the flow works

```
Vendor opens an unpaid invoice
        │
        │ clicks "Pay … online"
        ▼
POST /api/payments/midtrans/token        (vendor's session, RLS applies)
        │  • invoice must belong to the vendor and be unpaid
        │  • creates a Snap transaction, gets a token
        │  • stores gateway='midtrans', gateway_ref=<order_id>
        ▼
Snap.js opens the payment page in the browser
        │
        │ vendor pays
        ▼
Midtrans → POST /api/payments/midtrans/webhook   (no session; signature only)
        │  1. verify SHA-512 signature
        │  2. record in payment_events  → duplicate retries become a no-op
        │  3. only if status is settlement/capture AND the amount matches
        ▼
public.mark_invoice_paid()  →  invoice paid + subscription extended one period
```

**The browser callback does not mark anything paid.** `onSuccess` only refreshes
the page. The webhook is the source of truth, because a browser can lie or close.

## Setup

### 1. Get the keys

Midtrans dashboard → **Settings → Access Keys**:

| Key | Goes into | Secret? |
|---|---|---|
| Server key (`SB-Mid-server-…`) | `MIDTRANS_SERVER_KEY` | **yes — server only** |
| Client key (`SB-Mid-client-…`) | `MIDTRANS_CLIENT_KEY` | no (Snap.js needs it) |

### 2. Set the environment

In the server `.env` (see `.env.example`):

```bash
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxx
MIDTRANS_IS_PRODUCTION=false      # "true" only for live transactions
```

These are read at **runtime**, not baked in at build time, so no rebuild is
needed after changing them — restart the container.

### 3. Register the webhook

Midtrans dashboard → **Settings → Configuration → Payment Notification URL**:

```
https://dirory.com/api/payments/midtrans/webhook
```

Use the same host as `NEXT_PUBLIC_SITE_URL` / `DOMAIN`. The route is public by
necessity (Midtrans has no Dirory session) and is protected by the signature.

### 4. Apply the migration

```bash
cd supabase && npx supabase db push
```

`0013_midtrans_payments.sql` creates `payment_events` and `mark_invoice_paid()`.
Until it is applied, the webhook cannot settle an invoice.

### 5. Test in sandbox

Two scripts ship with the repo. Neither is imported by the app.

**Prove the signature logic (no credentials needed):**

```bash
node --experimental-strip-types scripts/test-midtrans.mts
```

It uses a made-up key and checks that a correctly signed notification is
accepted while a tampered amount, order id, status code or foreign signature is
rejected, plus the status mapping. All checks pass today.

**Create a real sandbox transaction:**

```bash
node scripts/midtrans-sandbox-test.mjs
```

Reads `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` from the environment or
`.env.local`, refuses to run when `MIDTRANS_IS_PRODUCTION=true`, and prints a
Snap payment URL. Pay with a sandbox instrument, then confirm the invoice became
paid.

**Simulate the webhook without waiting for a payment:**

```bash
node scripts/midtrans-sandbox-test.mjs \
  --notify https://dirory.com/api/payments/midtrans/webhook \
  --order DRY-xxxxxxxxxxxx-1700000000 \
  --amount 5000000
```

It signs the payload exactly as Midtrans does, so it exercises the real signature
check and the settle path. **Run it twice**: the second run must change nothing,
which is the idempotency guarantee.

**What to check after any of these:**

- the invoice shows **paid** in the vendor portal and in **Admin → Payments**;
- `payment_events` has a row for the notification;
- the subscription's `current_period_end` moved forward one period.


## Choosing the payment methods

### Restrict Snap to BSI Virtual Account

Set one variable on the server:

```bash
MIDTRANS_ENABLED_PAYMENTS=bsi_va
```

`bsi_va` is Midtrans' code for **BSI Virtual Account** (confirmed in their docs).
When only one method is listed, Snap skips its method list and goes straight to
that flow. Leave the variable empty to offer everything the merchant account has
enabled (QRIS, cards, GoPay, OVO, DANA, ShopeePay, other banks' VA).

**Important:** BSI VA can only be paid through the **BYOND by BSI** app. That is
Midtrans' rule, not a Dirory limitation. Because that excludes most payers, keep
the manual transfer option switched on alongside it rather than making BSI the
only way to pay.

### Where the money actually goes

This distinction matters for reconciliation:

| Method | Payer pays into | Reaches your BSI account |
|---|---|---|
| BSI VA via Midtrans | Midtrans' BSI collection account | **After** Midtrans settles, to the bank account registered in your Midtrans profile |
| Snap QRIS / card / e-wallet | Midtrans' merchant account | Same — on settlement |
| Manual transfer | **Your account directly** | Immediately |

So `MIDTRANS_ENABLED_PAYMENTS=bsi_va` gives the payer a BSI virtual account, but
it is **not** your account number, and the money does not land in it instantly.
Register your BSI account as the settlement destination in the Midtrans
dashboard, or use the manual transfer path below.

### Use your own BSI account directly (no gateway, no fee)

This is the manual bank transfer already on every unpaid invoice. Set three
server variables — they are read at runtime, so only a restart is needed:

```bash
BILLING_BANK_NAME="Bank Syariah Indonesia (BSI)"
BILLING_BANK_ACCOUNT=2511199205
BILLING_BANK_HOLDER="Rendy Noor Chandra"
```

The invoice page then shows those details and the vendor uploads proof, which an
admin confirms in **Admin → Payments**. No transaction fee, money arrives
directly, and it works today.

Note that these values are **shown to every vendor** — that is what a payment
destination is for. Do not put anything secret in them. Because this is a
personal account, check the tax and bookkeeping treatment with your accountant
before invoicing businesses at scale.

### Dynamic QRIS, unique per payment

Every invoice gets **its own QR**, with the amount fixed and an expiry — a
"dynamic" QRIS in Bank Indonesia's terms, not a static code. It is created with
Midtrans Core API (`payment_type: "qris"`), which returns a hosted PNG in
`actions[]` plus the `qr_string` payload.

- The QR is stored on the invoice (`qr_string`, `qr_url`, `qr_expires_at`).
- A still-valid QR is **reused** when the page reloads, rather than minting a new
  Midtrans transaction each time.
- It settles through the same webhook as Snap, because both set `gateway_ref` to
  the same order id.
- The QR is unique to one invoice, so a leaked screenshot can only ever pay that
  invoice, never a different one.

Set `MIDTRANS_SERVER_KEY` and the QRIS card appears on unpaid invoices
automatically. Snap also offers QRIS, so if you only want one route to payment,
you can leave the dedicated QR off — but it is the only way to show a scannable
code without redirecting the payer.

## Kuitansi (receipt) after payment

Once an invoice is **paid**, the vendor can open a Kuitansi in Bahasa Indonesia:

- From the paid banner on the invoice: **Kuitansi (PDF)**
- From the invoice list: the **Kuitansi** link on any paid row
- Direct: `/receipt/<invoice-id>`

**PDF is the browser's print dialog** (Print → *Save as PDF*). That keeps the
receipt a plain HTML document — no PDF library, no headless browser, nothing
extra in the image — and it prints exactly what is on screen. The page carries
`@page { size: A4; margin: 18mm }` and hides its own toolbar when printing.

What it contains: receipt number (`KWT/DIR/<year>/<invoice prefix>`), the vendor
and brand, the **amount in words** as well as figures (`terbilang`, the Indonesian
convention), what the payment was for, the period covered, the method and the
gateway reference, and the signature block.

**The signature** is a file: `apps/web/public/signature.jpg`. Replace it to change
the signature; no code change is needed. If the file is missing the receipt still
reads correctly, just without the image.

**Authorisation:** the receipt lives at `/receipt/[id]`, deliberately *outside*
the vendor layout so it prints without a sidebar. It therefore repeats the check
itself — the signed-in user must be a member of the invoice's vendor — and RLS
limits the query to the vendor's own invoices regardless.

## Safety properties

- **Signature.** Every notification is verified with SHA-512 over
  `order_id + status_code + gross_amount + server_key`, compared in constant time.
  An unsigned or tampered call is rejected with 401.
- **Idempotency.** `payment_events` has a unique key on
  `(gateway, order_id, transaction_status)`. A retry inserts nothing and is
  acknowledged, so a subscription is never extended twice.
- **Amount check.** The notification's `gross_amount` must equal the invoice
  amount before settling, so a small payment cannot clear a large invoice.
- **Service role.** The webhook uses the service-role key, which bypasses RLS. It
  is confined to `webhook/route.ts`; the browser never receives it.
- **One settlement path.** The admin "Mark paid" button and the webhook both call
  `mark_invoice_paid()`, so manual and automatic confirmation cannot diverge.
- **Any order settles its invoice.** The order id embeds the **full** invoice id
  (`DRY-<32 hex>-<epoch>`, 47 chars), and the webhook falls back to parsing it when
  `invoices.gateway_ref` points at a newer order. A vendor who mints a second
  payment — or a QRIS charge after a Snap attempt — and then pays the first is
  still credited, instead of the payment landing as `unmatched`.

## Not implemented (deliberately)

- **Automatic recurring charge.** Midtrans can store a card for recurring billing,
  but that needs a saved-token flow and a customer-consent step. Today a vendor
  renews by paying the next invoice.
- **Refunds.** A `refund`/`partial_refund` notification is logged and ignored; it
  does not reverse a subscription. Handle these manually until needed.
- **Direct dynamic QRIS via Xendit.** `lib/payments.ts` still throws; Snap already
  covers QRIS, so this is only needed if you move off Midtrans.
