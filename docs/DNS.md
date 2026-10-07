# Dirory — DNS and hosting

Your domain is **`dirory.com`**, registered at Domainesia. This document covers
where the site lives and which DNS records point at it.

Read `DEPLOY.md` for the Sumopod VPS steps. This file is about names and records.

---

## 1. The plan: one domain, one server

Everything is served from **`dirory.com`**, on the Sumopod VPS:

| Path | What it is |
|---|---|
| `/` | public landing page |
| `/library`, `/product/<id>` | public product catalogue (browse without an account) |
| `/login`, `/download` | architect sign-in and plugin download |
| `/auth/device` | the plugin's browser sign-in approval page |
| `/admin` | the back-office (role-gated) |

There is **no `admin.` subdomain**. One domain means one TLS certificate, one
cookie scope, and sign-in that works everywhere. (An earlier plan used
`admin.dirory.com`; it was dropped because cookies do not cross hostnames, so a
sign-in on one host did not carry to the other.)

```
dirory.com  ──A──▶  129.226.208.234  (Sumopod VPS)
www         ──CNAME──▶  dirory.com
```

---

## 2. Do not change the nameservers

Nameservers stay at Domainesia: `ns1.domainesia.net`, `ns2.domainesia.net`.

Your domain has **live email** on it (Mailspace):

```
MX   @      mx4.mailspace.id
A    mail   36.50.77.49
TXT  @      v=spf1 a mx include:relay.mailchannels.net ~all
TXT  _dmarc v=DMARC1; p=reject; rua=mailto:dmarc@dirory.com
```

Switching nameservers to a host (Netlify, Cloudflare, the VPS) moves **all** DNS
control and will **break this email**. Add individual records instead. That is
why this document never asks you to change nameservers.

---

## 3. Point `dirory.com` at the VPS

### 3.1 At Domainesia

Domainesia → **Domains** → `dirory.com` → **DNS Management**.

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `@` | `129.226.208.234` | 300 while setting up, then 3600 |
| `CNAME` | `www` | `dirory.com` | 3600 |

Notes:

- **Name** is only the label: `@` is the bare domain; `www` is the label, not
  `www.dirory.com`.
- If an old `A` record for `@` exists (it pointed at `172.104.187.4`, an
  unrelated server), replace it.
- Only one record may exist per name. Delete a conflicting `A`/`CNAME` first.
- Leave every email record untouched.

### 3.2 Wait, then check

Propagation is usually 15–30 minutes. From your own machine:

```bash
nslookup dirory.com          # must return 129.226.208.234
```

Do not continue until it does — Caddy cannot obtain a certificate before then.
A 300 s TTL keeps this quick to correct.

---

## 4. Supabase auth URLs

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://dirory.com`
- **Redirect URLs**:
  - `https://dirory.com/auth/callback`
  - `http://localhost:3000/auth/callback` (local development)

Without the matching redirect entry, magic-link and Google sign-in fail silently —
the mail sends and the link lands back on `/login`.

If `admin.dirory.com/auth/callback` is still listed from the earlier plan, it is
now unused and can be removed.

---

## 5. Environment variables

Set these in `.env` on the server (see `DEPLOY.md` §6). `NEXT_PUBLIC_*` values are
compiled into the bundle at **build** time, so changing one needs a rebuild, not
a restart. `SUPABASE_SERVICE_ROLE_KEY` is read at runtime and is server-only.

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ajlmncbzufagplbaaukv.supabase.co` | no trailing slash |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key (`sb_publishable_…`) | safe in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key (`sb_secret_…`) | **server-only, never public** |
| `NEXT_PUBLIC_SITE_URL` | `https://dirory.com` | auth redirects and absolute links |
| `DOMAIN` | `dirory.com` | what Caddy gets a certificate for |
| `BILLING_BANK_NAME` | e.g. `Bank Central Asia (BCA)` | server-only, shown on an invoice |
| `BILLING_BANK_ACCOUNT` | account number | server-only |
| `BILLING_BANK_HOLDER` | account holder name | server-only |
| `XENDIT_SECRET_KEY` *or* `MIDTRANS_SERVER_KEY` | gateway key | optional; switches on dynamic QRIS |

The `BILLING_*` and gateway keys are **not** `NEXT_PUBLIC_*`, so they are read at
runtime and never reach the browser bundle. Changing them needs a restart, not a
rebuild.

The variable names keep the legacy wording (`ANON`, `SERVICE_ROLE`) so both older
and newer Supabase projects work; the **values** are the new `sb_publishable_…`
and `sb_secret_…` strings.

---

## 6. Netlify (optional, no longer production)

The Netlify site (`cheerful-arithmetic-490036.netlify.app`) was the staging host.
Once `dirory.com` points at the VPS, nothing depends on Netlify.

Options:

1. **Leave it.** It keeps working at its `.netlify.app` address as a preview.
   Harmless.
2. **Remove the `dirory.com` alias in Netlify** if it was added there, so there is
   no confusion about which host is live.
3. **Delete the site** when you no longer need a preview.

If you keep it, note that its `NEXT_PUBLIC_SITE_URL` should stay
`https://dirory.com` so any links it renders point at production.

---

## 7. Checklist

- [ ] Domainesia: `A @ → 129.226.208.234`; `CNAME www → dirory.com`
- [ ] Email records (`MX @`, `A mail`, SPF, DMARC, DKIM) untouched
- [ ] `nslookup dirory.com` returns `129.226.208.234`
- [ ] `DEPLOY.md` steps 2–10 completed on the server
- [ ] Supabase Site URL `https://dirory.com` + `/auth/callback` redirect
- [ ] `https://dirory.com` loads the landing page
- [ ] `https://dirory.com/library` loads the catalogue
- [ ] `https://dirory.com/admin` loads the dashboard (after you are an admin)
- [ ] Sign in, then grant yourself `admin` in the SQL editor
- [ ] Confirm Mailspace email still works (you never changed nameservers)
