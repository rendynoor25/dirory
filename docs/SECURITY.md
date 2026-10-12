# Security — OWASP Top 10 (2021)

How Dirory stands against the OWASP Top 10, what changed in 0.17.18, and what is
deliberately left open. Written to be honest rather than reassuring: a category
marked **gap** is a real absence, not a formality.

## Summary

| # | Category | State |
|---|---|---|
| A01 | Broken access control | **In place.** RLS on every table; the one row-level bug found (a recursive policy) was fixed in 0026 |
| A02 | Cryptographic failures | **In place.** HSTS, constant-time signature compare, secrets server-only. One known trade-off (below) |
| A03 | Injection | **In place.** Zod on every server action, parameterised queries only, no raw SQL, no `dangerouslySetInnerHTML` |
| A04 | Insecure design | **Improved.** Signed webhook, idempotent settlement, payloads bounded |
| A05 | Security misconfiguration | **Improved.** Headers added, bucket types restricted, version fingerprints removed |
| A06 | Vulnerable components | **Improved.** Next upgraded; one build-time advisory remains |
| A07 | Authentication failures | **Fixed.** The sign-in callback redirected to the container address |
| A08 | Integrity failures | **Improved.** Amount checked before settling; upload types restricted |
| A09 | Logging & monitoring | **Addressed (0030).** Events recorded and emailed; needs a mail key to deliver |
| A10 | SSRF | **In place.** No user-controlled outbound request exists |

---

## A01 — Broken access control

Authorization lives in the database, not in the page. Every table has RLS enabled,
and the predicates are `SECURITY DEFINER` helpers (`is_admin`, `is_vendor_member`,
`is_vendor_editor`, `is_vendor_owner`) so a policy can read the table it guards.

Two real bugs were found and fixed in this area:

- **`vendor_is_visible` was not `SECURITY DEFINER`** (0024). Its `subscriptions`
  lookup was therefore filtered by RLS, so an anonymous visitor could see 2 of
  1,355 products. The plugin never noticed because it reads through the Edge
  Function with the service role.
- **`vendor_members_owner` queried its own table inside its policy** (0026). Every
  read of `vendor_members` aborted with *infinite recursion*, which made the whole
  vendor portal unreachable.

Server-side checks are repeated in the app even where RLS already covers it — the
Midtrans token route re-verifies that the invoice belongs to the signed-in vendor
rather than trusting the policy alone.

## A02 — Cryptographic failures

- The webhook signature is compared with `timingSafeEqual` over SHA-512, with a
  length check first (the function throws on a length mismatch).
- The service-role key is read only in `createSupabaseServiceClient()`, which is
  imported by the webhook route alone and never by a page or client component.
- HSTS is set by Caddy; `upgrade-insecure-requests` is now in the CSP.

**Known trade-off:** `@supabase/ssr` stores the session in a cookie that the
browser client must read, so it is not `HttpOnly`. This is inherent to the library,
not a Dirory choice. The identity provider is the only party that can mint one, and
the cookie is scoped to the site.

## A03 — Injection

- Every server action validates with Zod before touching the database.
- All database access goes through supabase-js, which parameterises. There is no
  string-built SQL anywhere in `apps/web`.
- No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no `new Function` —
  verified by search across `apps/web/src`.
- The CSV export quotes cells (`csvCell`) and is served with
  `Content-Type: text/csv`, not HTML.

## A04 — Insecure design

- The browser callback **cannot** mark an invoice paid; only the webhook can, and
  only after the signature and the amount are checked.
- Settlement is idempotent: `payment_events` has a unique key on
  `(gateway, order_id, transaction_status)`, so a retry is a no-op and a
  subscription cannot be extended twice.
- Any order for an invoice settles it (the order id embeds the invoice id), so a
  vendor who mints a second payment and then pays the first is still credited.
- **New:** the webhook body is bounded at 64 KB, enforced on the bytes that
  arrived rather than on `Content-Length`.

## A05 — Security misconfiguration

**New in 0.17.18:**

- `poweredByHeader: false` — responses no longer advertise Next.js.
- `X-Permitted-Cross-Domain-Policies: none`, `Cross-Origin-Opener-Policy:
  same-origin-allow-popups` (allow-popups, not `same-origin`, so Google sign-in
  keeps working).
- `Content-Security-Policy` with `object-src 'none'`, `base-uri 'self'`,
  `frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests`.

  These directives cannot break rendering, which is why they are the ones shipped.
  A `script-src`/`style-src` policy is the next step and **must be tested against
  the Midtrans Snap page first** — a missing source there silently breaks paying,
  and a broken payment path is worse than a looser CSP.
- The `materials` bucket accepted **any** MIME type (0029). It is where payment
  proofs land, and an admin opens them from Admin → Payments. Now images and PDF
  only, with SVG excluded — it is the one image format that executes.

**Left open deliberately:** the `brands` bucket is public and accepts SVG, so a
hostile SVG logo could run script *on the storage origin*. It cannot reach a
Dirory session (different origin), logos are admin-reviewed, and the product
specifies SVG as an allowed logo format.

## A06 — Vulnerable components

`npm audit` found 3 production vulnerabilities. Two are fixed:

- `next` 15.5.26 → **15.5.27**, which clears the **cache-poisoning advisories for
  SSG/ISR in self-hosted deployments** — directly applicable, since Dirory is
  self-hosted on the VPS.
- `source-map-js` DoS — resolved by `npm audit fix`.

**Remaining, accepted:** Next 15.5.27 still bundles a `postcss` with a
`sourceMappingURL` path-traversal advisory. Fixing it requires **Next 16**, a
breaking major, and the vulnerability is a *build-time* one: it needs
attacker-controlled CSS, and Dirory does not compile untrusted CSS. Revisit when
Next 16 is worth a planned upgrade.

`braces`/`tailwindcss` appear in the full audit but are dev-only (not in
`npm audit --omit=dev`).

## A07 — Authentication failures

Sign-in is passwordless: Google OAuth or an email magic link, both via Supabase
Auth with PKCE. No passwords are stored, so there is nothing to brute-force or
reuse.

The live bug fixed here: the auth callback built its redirects from
`request.url`'s origin, which behind Caddy is the container bind address
(`https://0.0.0.0:3000`). Every user who clicked an email link landed on an
unreachable host. It now uses `publicOrigin()`, as the rest of the app already did.

## A08 — Software and data integrity

- A payment settles only when `gross_amount` equals the invoice amount, so a small
  payment cannot clear a large one.
- Uploads are type-restricted (0029) and size-limited by the bucket
  (10 MB materials, 50 MB models, 200 KB logos).
- The plugin release is served from a private bucket with the version derived from
  the bucket itself, so a stale token cannot fetch a mismatched build.

## A09 — Logging & monitoring

`write_audit()` records business actions (vendor approval, invoice payment, service
request acceptance). Migration **0030** adds the security half.

`security_events` is an append-only table written with the service role by the
routes that see hostile input. The webhook records four things:

| Event | Why it matters |
|---|---|
| `webhook.bad_signature` | Either someone is probing, or the gateway key was rotated and real notifications are now being discarded |
| `webhook.oversized_body` | Not a genuine Midtrans notification |
| `webhook.amount_mismatch` | A small payment trying to clear a larger invoice |
| `webhook.unmatched_invoice` | A **signed** notification nobody can apply — a payment taken with nothing credited |

They appear at **/admin/security**, which also states plainly whether email
delivery is configured.

**Alerts email to `SECURITY_ALERT_TO`** (default `rendynoorchandra@gmail.com`) via
Resend, throttled to **one per kind per 15 minutes** so a flood becomes one mail
rather than thousands — a mailbox that noisy gets filtered, which is the same as
having none.

Two deliberate properties: recording **never throws** (monitoring must not break
what it monitors), and if `RESEND_API_KEY` is unset the event is still stored and
the reason is logged, so nothing is silently lost.

**Why not send from the VPS itself:** dirory.com publishes DMARC `p=reject`. Mail
claiming to be from it, sent by a host with no matching DKIM, is rejected by Gmail
outright. Delivery needs a real sender.

## A10 — Server-side request forgery

Dirory makes no outbound request to a URL a user supplies. The server-side fetches
are to fixed hosts only: the Supabase project, the Midtrans API and simulator, and
storage signed URLs. The catalog Edge Function queries Supabase and nothing else.
There is no "fetch this image from that URL" feature, which is the usual SSRF
entry point.

---

## Rules that keep this true

1. **Never the service-role key in client code.** It belongs to
   `createSupabaseServiceClient()` and the payment webhook.
2. **Validate with Zod at the boundary**, even when RLS already protects the table.
3. **Authorization in the database.** A page hiding a button is not access control.
4. **A policy must not query its own table.** Use a `SECURITY DEFINER` helper, or
   you get infinite recursion — see 0026.
5. **Never print a secret.** Not to a log, not to a user, not into a redirect.
6. **A file bind-mount pins the inode.** Editing a mounted config is fine; *replacing*
   it — which `git pull` does — leaves the container reading the old file. See the
   Caddyfile check in `scripts/deploy.sh`.
