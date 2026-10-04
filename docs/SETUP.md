# Dirory — setup guide

Step-by-step: Supabase, hosting, your Domainesia domain, paying for software
subscriptions from a Jago Syariah account, and pushing your local library up to
Supabase.

Everything can start on free tiers. Three facts shape the plan:

1. **Vercel's free Hobby tier forbids commercial use.** Its fair-use policy covers
   "any Deployment that is used for the purpose of financial gain of anyone involved",
   including a paid contractor who wrote the code, and "any method of requesting or
   processing payment from visitors". Dirory charges vendors, so you are over that
   line: **Vercel Pro is $20/month.** If you want to stay free, **Cloudflare Pages**
   allows commercial use on its free tier. Both options are below.
2. **Supabase Free caps uploads at 50 MB and storage at 1 GB** (and pauses a project
   after 7 days of inactivity). Fine for the database, auth and the portals; tight
   for `.skp` files. Start free, upgrade when storage nears 1 GB.
3. **A Jago Syariah Visa debit card can pay international subscriptions.** Enable
   international/online transactions in the Jago app, then use the digital card for
   Vercel, Supabase and Cloudflare. Jago also supports scheduled payments if you
   prefer not to leave a card on file.

---

## 1. Supabase (database, auth, file storage)

### 1.1 Create the project

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. **New project**: name `dirory`, region **Singapore** (closest to Indonesia),
   set a database password and save it somewhere safe.
3. Wait ~2 minutes for provisioning.

### 1.2 Grab your keys

**Supabase now issues two key formats. Use the new ones.**

Project → **API Keys** (or **Project Settings → API**):

| Supabase shows | Use it as | Safe in the browser? |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | ✅ yes |
| **Publishable key** `sb_publishable_…` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ yes, by design |
| **Secret key** `sb_secret_…` | `SUPABASE_SERVICE_ROLE_KEY` | ❌ **server-only** |

The publishable key replaces the legacy `anon` key; the secret key replaces
`service_role`. Legacy keys look like `eyJ…` (a JWT) and are deprecated at the
end of 2026. The variable *names* in this project still say `ANON` and
`SERVICE_ROLE` for compatibility, but either value works.

**Treat the secret key like a database root password.** It bypasses Row Level
Security entirely. If it ever reaches a browser, a public repo or a chat, revoke
it immediately in API Keys and issue a new one.

> **Migration note (handled in code).** New keys are plain strings, not JWTs, so
> they must be sent on the `apikey` header **only**. Adding
> `Authorization: Bearer` makes Supabase try to parse them as a JWT and fail with
> `Invalid JWT`. The plugin and the Edge Functions detect the prefix and send the
> Bearer header only for legacy `eyJ` keys.


### 1.3 Push the schema

Install the CLI (no admin rights needed):

```bash
npm i -g supabase
```

From the repo root:

```bash
cd supabase
supabase login                                   # opens the browser
supabase link --project-ref <your-project-ref>   # ref is in the dashboard URL
supabase db push                                 # runs migrations 0001 → 0005
```

This creates every table, all RLS policies, the RPCs, the two **private** storage
buckets (`models`, `materials`) and the seed data, including the platform brand
**Dirory** and four plans.

### 1.4 Deploy the plugin ingest function

```bash
cd supabase
supabase functions deploy events --no-verify-jwt
```

`--no-verify-jwt` is required: the SketchUp plugin sends an anon key, not a user
JWT. Security comes from input validation plus the service role inside the function.

Your endpoint is then:

```
https://<your-project-ref>.supabase.co/functions/v1/events
```

### 1.5 Make yourself admin

Push migration `0006_admin_bootstrap.sql`, then sign in once at `/login` with
your Gmail/email. This is a passwordless email link sent to Gmail, not Google
OAuth. A new address creates an architect profile; it does not automatically
become an admin. In **SQL Editor**:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

Use the exact email you signed in with. Signed-in non-admin users cannot promote
themselves; the trusted SQL Editor is the bootstrap path. Then sign out and back
in, and visit `/admin`.

---

## 2. Hosting the web app

Both options build the same repo. Cloudflare is free for commercial use; Vercel is
simpler but wants $20/month once you charge anyone.

### 2.1 Option A — Cloudflare Pages (free, commercial use allowed)

1. Push the repo to GitHub.
2. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick the repo.
3. Build settings:
   - **Root directory**: `dirory/apps/web`
   - **Framework preset**: Next.js
   - **Build command**: `npm run build`
   - **Build output directory**: `.next`
4. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables (Production **and**
   Preview), plus `SUPABASE_SERVICE_ROLE_KEY` as a secret.
5. Deploy. You get `<project>.pages.dev`.

> Next.js on Cloudflare runs through the Workers runtime. If a feature misbehaves,
> check the Cloudflare Next.js compatibility notes — the app here uses only
> standard App Router features (server components, server actions, middleware),
> which are supported.

### 2.2 Option B — Vercel (simplest; Pro $20/mo for commercial use)

1. <https://vercel.com> → **Add New** → **Project** → import the repo.
2. **Root Directory**: `apps/web`. Framework auto-detects Next.js.
3. Environment variables: same four as above.
4. Deploy → `<project>.vercel.app`.

**When to upgrade:** before you take your first vendor payment. Hobby accounts get
paused for commercial use; Pro removes the restriction and adds 250 GB egress and
7-day backups.

---

## 3. Pointing your Domainesia domain at the app

Use DNS records, **not** nameserver changes — that keeps your Domainesia email and
other records intact. This works identically for Vercel and Cloudflare Pages; only
the target values differ.

### 3.1 Get the required values

- **Vercel**: Project → **Settings → Domains → Add** → type `dirory.id`. Vercel
  shows an **A record** for the apex (`76.76.21.21`) and a **CNAME** for `www`
  (`cname.vercel-dns.com`). Use the values *your* dashboard shows.
- **Cloudflare Pages**: Project → **Custom domains → Set up a domain**. For an apex
  you may be asked to move the domain into Cloudflare; for `www` it gives you a
  CNAME to `<project>.pages.dev`.

### 3.2 Add the records at Domainesia

1. Log in at <https://www.domainesia.com> → **Domain** → **Kelola DNS** /
   **DNS Management**.
2. Make sure nameservers are on **Use default nameservers** (Domainesia's own) —
   you only change nameservers if you decide to let Vercel or Cloudflare manage DNS.
3. Delete any existing **A** or **CNAME** records for host `@` and `www` that point
   at an old host. Conflicting records split your traffic.
4. Add:

   | Type | Host / Name | Value / Target | TTL |
   |---|---|---|---|
   | A | `@` | `76.76.21.21` (Vercel) or the value shown | 3600 |
   | CNAME | `www` | `cname.vercel-dns.com` (Vercel) or `<project>.pages.dev` | 3600 |

   The `@` host is the bare domain `dirory.id`. Use only `www` (not
   `www.dirory.id`) as the host name.

5. Save, then go back to Vercel/Cloudflare and click **Refresh**. Propagation is
   usually 15–30 minutes. Vercel/Cloudflare then issue the TLS certificate
   automatically.

### 3.3 Apex vs www

Pick one canonical host and redirect the other (Vercel: Domains → *Redirect to*;
Cloudflare: a Redirect Rule). Keeping both live without a redirect splits SEO and
breaks cookies.

### 3.4 Supabase, once the domain is live

**Authentication → URL Configuration**:

- **Site URL**: `https://dirory.com`
- **Redirect URLs**: add `https://dirory.com/auth/callback`,
  `https://admin.dirory.com/auth/callback`, and the Netlify deploy URL's
  `/auth/callback` while testing.

Also set `NEXT_PUBLIC_SITE_URL=https://dirory.com` in the hosting environment
variables. Without the redirect entry, magic-link sign-in silently fails.

Supabase currently reports email auth enabled and Google OAuth disabled. This
app signs in by emailing a one-time link to a Gmail address; it does not use a
Google OAuth button. Before allowing public signups, configure custom SMTP under
Authentication → SMTP Settings; Supabase's built-in mail service is restricted
and intended for testing, not reliable public delivery.

---

## 4. Paying these subscriptions from Jago Syariah

All three vendors bill in USD by card. What works:

**Jago Syariah Visa debit card.** The Visa debit card (physical or the free
**digital** card) is accepted for online transactions and international services
— Bank Jago's own documentation lists Netflix, Spotify and PayPal. Two prerequisites:

1. In the Jago app, open the debit card's settings and **enable international /
   online transactions**. This is off by default and is the usual reason a payment
   is declined.
2. Link the card to a **Kantong Bayar** with enough balance. The card spends from
   the linked pocket only.

**One card per pocket.** A Jago card links to exactly one pocket at a time. A good
pattern: create a pocket named *Software Subscriptions*, link the digital card to
it, and keep a small balance there. Damage from a leaked number is then capped.

**Recurring charges.** Cloudflare, Supabase and Vercel all store the card and
charge monthly. Foreign-currency debits post at the prevailing rate; keep a buffer
above the nominal amount.

**If a card is declined**, in order of likelihood: international transactions still
off; insufficient pocket balance; the merchant blocks prepaid/debit foreign cards.
Fallbacks that people use in Indonesia:

- **PayPal**, if a provider accepts it — Jago documents PayPal support.
- **A virtual-card / billing-agent service** that pays the subscription on your
  behalf and bills you in IDR via QRIS. Convenient, but you are trusting a third
  party with your account, and the markup is real.
- **Ask for annual invoicing** — some providers will invoice a company by bank
  transfer. Not available for Supabase's self-serve tiers.

**Recommended order of spending:**

1. Free tier everywhere while you build (Supabase Free + Cloudflare Pages Free).
2. Supabase **Pro $25/mo** when you outgrow 1 GB storage or 50 MB uploads — this is
   the first one you will actually need once real `.skp` files arrive.
3. Vercel **Pro $20/mo** only if you choose Vercel and are taking money; otherwise
   stay on Cloudflare Pages free.
4. Payment gateway (Midtrans/Xendit) monthly fees: none. They charge per successful
   transaction only, settled to your bank.

### 4.1 A note on the payment gateway

Per PRD §5 the vendor-facing subscriptions should be collected with **Midtrans or
Xendit** (VA, QRIS, cards) plus manual bank transfer — not with your personal card.
Those are business accounts: registering needs a KTP, and NPWP for methods beyond
GoPay/QRIS/VA. The gateway settles to a business bank account, which can be your
Jago Syariah account if it is a business account. Your Jago card is for paying
*Dirory's own* tools, which is what this section covers.

---

## 5. Pushing your local library to Supabase

Your RBZ reads a local folder with this convention:

```
<root>/Model/<Category>/<Brand>/<file>.skp
<root>/Materials/<Category>/<Brand>/<image>.jpg
```

An item with **no brand folder** becomes a Dirory free sample.

### 5.1 Preview what will be uploaded

```bash
node scripts/upload-library.mjs --root "D:/Dirory/sample_library" --dry-run
```

Dry-run prints every file it found, which vendor and category it inferred, and
writes nothing. Run this first — it catches a wrong root or a stray prefix.

### 5.2 Set the credentials

Create `.env.local` in the repo root (git-ignored):

```bash
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<the service role key>
```

The script uses the **service role** because it writes catalogue rows directly.
Never put this key in the web app's browser environment.

### 5.3 Upload

**Dirory free samples** (the default — no `--vendor` needed):

```bash
node scripts/upload-library.mjs --root "D:/Dirory/sample_library"
```

These land under the platform vendor, are created as `approved` immediately, and
are visible to architects with no subscription.

**A real vendor's products:**

```bash
node scripts/upload-library.mjs --root "D:/Dirory/TOTO" --vendor <vendor-uuid>
```

Find the vendor id in the admin **Vendors** page URL, or:

```sql
select id, brand_name from public.vendors;
```

Vendor uploads are created as `pending_review` and appear in the admin review
queue, exactly as if the vendor had uploaded them.

### 5.4 What the script does per file

1. Uploads to the private bucket (`models` or `materials`) under
   `<vendor_id>/<asset_id>/<filename>` — the path convention the storage policies
   check.
2. Finds or creates the category row.
3. Inserts the asset and an approved (samples) or pending (vendors) `asset_versions` row.
4. Sets `assets.current_version_id`.

### 5.5 Bulk-uploading a large library

The script is sequential and fine for hundreds of items. For thousands, split by
folder and run in sequence rather than in parallel — Supabase Free throttles, and a
parallel run is the quickest way to blow through the storage quota.

### 5.6 Checking it worked

- **Admin → Dirory samples**: your samples, visible without a subscription.
- **Admin → Review queue**: vendor items awaiting approval.
- Storage → `models` / `materials`: the uploaded files.

Then point the plugin at Supabase: in SketchUp, **Extensions → Dirory → Connection
Settings**, set the API base URL to
`https://<your-project-ref>.supabase.co/functions/v1`. Watch **Cloud Status** to
confirm the outbox drains.

---

## 6. Verify the install end to end

```bash
# 1. RLS: a vendor must not read another vendor's data, search misses, snapshots
#    or favourites; brand logos are public to read, private to write.
supabase test db supabase/tests/rls_test.sql    # or paste into the SQL editor
# Expect: NOTICE "Dirory RLS suite: ALL CHECKS PASSED"

# 2. Ingest is idempotent — run twice, second call stores 0
curl -X POST "https://<ref>.supabase.co/functions/v1/events" \
  -H "Content-Type: application/json" \
  -d '{"install_id":"11111111-1111-1111-1111-111111111111","events":[{"id":"22222222-2222-2222-2222-222222222222","kind":"search_miss","data":{"query":"bathtub gold","tab":"all"}}]}'

# 3. The app builds
cd apps/web && npm run build
```

Acceptance checks from PRD §13.3 that this repo satisfies:

- **M0** — a vendor cannot open `/admin`; an admin can.
- **M1** — vendor A cannot read vendor B's assets, leads, stats, search misses or
  snapshot project names; favourites are private to the architect
  (`rls_test.sql` checks 1–8).
- **M2** — approving a vendor writes an audit row; a sample is visible with no
  subscription.
- **M5** — a 0-result search appears in **Admin → Missing requests** with the right
  count; replaying the same batch changes nothing.
- **M7** — vendor dashboard numbers come from the snapshot rollup; no project names.

### 6.1 The test suite was not executed in this environment

`rls_test.sql` was validated structurally only — Docker, WSL and `psql` are not
available on the machine where this scaffold was written, so the suite **has not
been run**. Run it against your Supabase project before trusting it. The suite
runs inside a transaction that ends in `rollback`, so it leaves no data behind and
is safe to paste into the SQL editor.

It needs a `pgcrypto`/`uuid-ossp` extension and write access to `auth.users`,
`public.*` and `storage.objects`, which the SQL editor's `postgres` role has.


---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `db push` fails on a policy | Migrations run out of order | Push all five together; they are numbered |
| Magic link opens but lands on `/login` | Callback URL not allowlisted | Add `https://your-domain/auth/callback` in Supabase Auth → URL Configuration |
| `/admin` redirects to `/vendor` | Profile role is still `architect` | Run the `update profiles set role='admin'` statement |
| Plugin `HTTP 401` | `apikey` header missing | Set the anon key in Connection Settings |
| Plugin `HTTP 404` | Base URL wrong | It must end at `/functions/v1`, not `/events` |
| Upload fails "payload too large" | Over the 50 MB free-tier limit | Upgrade Supabase, or split the model |
| Storage policy denies the upload | Path not prefixed with the vendor id | The script does this; check manually-uploaded files |
| Quota warning after a week idle | Free projects pause | Open the project once a week, or upgrade to Pro |
