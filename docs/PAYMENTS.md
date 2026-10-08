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

With `MIDTRANS_IS_PRODUCTION=false` and sandbox keys, Midtrans provides test
payment instruments (for example a QRIS simulator and test VA numbers). Pay one
invoice, then confirm:

- the invoice shows **paid** in the vendor portal and in **Admin → Payments**;
- `payment_events` has a row for the notification;
- the subscription's `current_period_end` moved forward one period.

Replaying the same notification must change nothing — that is the idempotency
guarantee.

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

## Not implemented (deliberately)

- **Automatic recurring charge.** Midtrans can store a card for recurring billing,
  but that needs a saved-token flow and a customer-consent step. Today a vendor
  renews by paying the next invoice.
- **Refunds.** A `refund`/`partial_refund` notification is logged and ignored; it
  does not reverse a subscription. Handle these manually until needed.
- **The grace/expiry job.** PRD §174 (7-day grace, then hidden) still needs a
  scheduled job; paying an invoice activates the subscription, but nothing
  currently downgrades an expired one.
- **Direct dynamic QRIS via Xendit.** `lib/payments.ts` still throws; Snap already
  covers QRIS, so this is only needed if you move off Midtrans.
