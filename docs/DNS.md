# Dirory — DNS and hosting

Your domain is **`dirory.com`**, registered at Domainesia. This document covers
where the site lives and which DNS records point at it.

Read `DEPLOY.md` for the Sumopod VPS steps. This file is about names and records.

---

## 1. Facts about the current setup (verified 4 Oct 2026)

| Thing | Value |
|---|---|
| Registrar / DNS host | Domainesia, nameservers `ns1.domainesia.net`, `ns2.domainesia.net` |
| Root `dirory.com` | `A` → `172.104.187.4` — **not your Sumopod**; it answers 404 |
| Your Sumopod VPS | `129.226.208.234` (private `10.3.8.254`) |
| Netlify site | `cheerful-arithmetic-490036.netlify.app` |
| `admin.dirory.com` | does not exist yet |

### Do not change the nameservers

`ns1.domainesia.net` / `ns2.domainesia.net` are correct. Keep them.

Your domain has **live email** on it (Mailspace):

```
MX   @      mx4.mailspace.id
A    mail   36.50.77.49
TXT  @      v=spf1 a mx include:relay.mailchannels.net ~all
TXT  _dmarc v=DMARC1; p=reject; rua=mailto:dmarc@dirory.com
```

Switching nameservers to a host (Netlify, Vercel, your VPS) moves **all** DNS
control and will **break this email**. Add individual records instead. That is
also why this runbook never asks you to change nameservers.

---

## 2. Two hosting paths

You have both. They are not exclusive, and DNS decides which is live.

| | Netlify | Sumopod VPS |
|---|---|---|
| Status | Built, public, no GitHub link | Empty Ubuntu, paid |
| Best for | Staging, previews, demo | Production |
| Cost | Free tier restricts commercial use | Already paid |
| HTTPS | Automatic | Automatic via Caddy |
| Secrets | Service-role key lives with Netlify | Lives only on your server |

**Recommendation:** point `admin.dirory.com` at **Netlify now** to unblock
testing, then repoint the same record to the VPS when the admin dashboard is
ready. Changing one record is the whole migration.

Production should be the VPS: the `service_role` key bypasses all Row Level
Security, and on your own server you control where it is stored.

---

## 3. Point `admin.dirory.com` at Netlify

### 3.1 Add the domain in Netlify first

Netlify → your site → **Domain management** → **Add a domain** → `admin.dirory.com`.

Netlify then displays the record it wants. **Use the value it shows** — the
hostname differs per site, and a guessed value will not validate.

### 3.2 Add the record at Domainesia

Domainesia → **Domains** → `dirory.com` → **DNS Management** → **Add Record**:

| Type | Name | Value | TTL |
|---|---|---|---|
| `CNAME` | `admin` | *(the target Netlify displays)* | 3600 |

Notes:

- **Name** is only the label: `admin`, not `admin.dirory.com`.
- Only one record may exist for a given name. If an `A` or `CNAME` for `admin`
  already exists, delete it first.
- Do not add an `A` record for `admin` at the same time; that takes precedence
  and masks the CNAME.

### 3.3 Wait, then check

Propagation is usually 15–30 minutes. Check from your machine:

```bash
nslookup admin.dirory.com
```

Then Netlify → Domain management → **Verify DNS configuration**. Once it shows
green, Netlify issues the TLS certificate automatically.

### 3.4 Make the public landing page available at `dirory.com`

The landing page is the app's `/` route. First add **`dirory.com`** as a domain
alias in Netlify → Domain management. Netlify will display the exact apex
records it requires. Then at Domainesia replace only the existing `A` record for
host `@` (currently the old `172.104.187.4`) with the apex value Netlify shows.
Netlify's common apex value is `75.2.60.5`, but follow your site's Domain
management instructions if they show a different value.

Keep these records untouched: `MX @`, `A mail`, SPF, DMARC and DKIM. They provide
your Mailspace email. The existing `www CNAME -> dirory.com` can stay; after the
apex points at Netlify, `www.dirory.com` follows it.

Do not change nameservers. This changes only the website destination and
preserves email.

---

## 4. Point `admin.dirory.com` at the Sumopod VPS instead

When you are ready for production, replace the CNAME with an `A` record:

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `admin` | `129.226.208.234` | 300 |

Delete the CNAME first — an `A` and a `CNAME` cannot both exist for one name.

Then follow `DEPLOY.md` from step 2. Caddy obtains the certificate as soon as
this record resolves.

---

## 5. What about `dirory.com` itself?

It currently points at `172.104.187.4`, which returns 404.

**Find out what that server is before overwriting it.** It may be an old
experiment of yours or a hosting account you are still paying for. To check:

```bash
nslookup dirory.com
```

Options once you know:

1. **Leave it.** Harmless, and `admin.dirory.com` is independent.
2. **Point it at the marketing site** (a future Next.js app) with `A @ →
   <that host>` or a CNAME to Netlify/Vercel.
3. **Redirect it to `admin`** via a Domainesia redirect, if you want one URL.

Do not point the apex at the VPS unless the app there also serves the root
domain; Caddy is configured for one hostname.

---

## 6. Connect the Netlify site to GitHub

Right now Netlify says *"Last deployed from Netlify Drop"* — a manual upload.
That means pushes to GitHub do **not** update the site.

To make it automatic:

1. Netlify → **Project configuration** → **Build & deploy** → **Link repository**.
2. Choose `rendynoor25/dirory`.
3. Set:
   - **Base directory**: `apps/web`
   - **Build command**: `npm run build`
   - **Publish directory**: `apps/web/.next`
4. Add the environment variables (§7). `NEXT_PUBLIC_*` values are baked in at
   **build** time, so they must exist before the build runs.
5. **Deploys → Trigger deploy → Clear cache and deploy site.**

### GitHub Actions

`.github/workflows/deploy-web.yml` runs typecheck and build only. Netlify's own
Git integration handles production deployment. It is currently blocked by
Netlify's private-repository "Unrecognized Git contributor" restriction.
Resolve it from the failed deploy's **Manage Git contributors** link by linking
the GitHub account, or choose a paid plan. Keep this repository private: it
contains the gated RBZ artifact.

---

## 7. Environment variables

Set these on whichever host serves the app.

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ajlmncbzufagplbaaukv.supabase.co` | no trailing slash |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *publishable key* (`sb_publishable_…`) | safe in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | *secret key* (`sb_secret_…`) | **server-only, never public** |
| `NEXT_PUBLIC_SITE_URL` | e.g. `https://admin.dirory.com` | used for auth redirects |

The variable names keep the legacy wording (`ANON`, `SERVICE_ROLE`) so both older
and newer projects work; the **values** are the new `sb_publishable_…` and
`sb_secret_…` strings.

### The public site: `dirory.com`

The architect-facing pages (landing, sign-in, `/auth/device`, `/download`) are
served at **`dirory.com`**. The plugin opens
`https://dirory.com/auth/device?code=…` for sign-in.

1. Netlify → your site → **Domain management → Add a domain** → `dirory.com`
   (and `www.dirory.com` if you want it). Netlify shows the apex records to use.
2. Domainesia → **DNS Management** → set the `@` **A** record to the value Netlify
   shows (commonly `75.2.60.5`). Leave the `www` CNAME, and leave every email
   record (`MX @`, `A mail`, SPF, DMARC, DKIM) untouched.
3. Wait for the certificate, then confirm `https://dirory.com` loads the landing
   page.

### After the domains resolve

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://dirory.com`
- **Redirect URLs**: add **all** of:
  - `https://dirory.com/auth/callback`
  - `https://admin.dirory.com/auth/callback`
  - `http://localhost:3000/auth/callback` (local development)

Magic-link and Google sign-in fail silently without the matching redirect entry —
the mail sends and the link lands back on `/login`.

### How the two hosts behave (one app)

| Host | What it serves |
|---|---|
| `dirory.com` | Public/architect: `/`, `/login`, `/auth/device`, `/download`, `/privacy` |
| `admin.dirory.com` | The dashboard: `/` is rewritten to `/admin`; `/vendor/*` still reachable |
| `*.netlify.app`, `localhost` | No rewriting — normal paths, so previews and local dev are unaffected |

Set `NEXT_PUBLIC_ADMIN_HOST` if the admin hostname ever differs from
`admin.dirory.com`. Both hosts require the Supabase **role** to grant access:
an admin sees `/admin`, everyone else is redirected.


### Operational note

`NEXT_PUBLIC_*` variables are compiled into the bundle. Changing one requires a
**new build**, not a restart. `SUPABASE_SERVICE_ROLE_KEY` is read at runtime.

---

## 8. Checklist

- [ ] Netlify: add `dirory.com` (public) and `admin.dirory.com` (dashboard)
- [ ] Domainesia: point the `@` A record at Netlify; keep the `admin` CNAME
- [ ] `nslookup dirory.com` and `nslookup admin.dirory.com` both resolve
- [ ] Netlify shows a valid configuration and issues certificates for both
- [ ] Set the environment variables (including `NEXT_PUBLIC_ADMIN_HOST`), then
      clear-cache and redeploy
- [ ] Supabase Site URL `https://dirory.com` + both `/auth/callback` redirect URLs
- [ ] `https://dirory.com` loads the landing page
- [ ] `https://admin.dirory.com` loads the dashboard (after you are an admin)
- [ ] Sign in, then grant yourself `admin` in the SQL editor
- [ ] Confirm Mailspace email still works (you never changed nameservers)
