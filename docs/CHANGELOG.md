# Changelog

## 0.15.0 — Kuitansi (receipt) after payment, with print-to-PDF

A paid invoice now produces a Kuitansi in Bahasa Indonesia at `/receipt/[id]`,
linked from the paid banner on the invoice and from the invoice list.

- Numbered `KWT/DIR/<year>/<invoice prefix>`, dated in long Indonesian form.
- States the amount **in words as well as figures** — `lib/terbilang.ts`
  implements the Indonesian rules, including the irregular forms (sebelas,
  seratus, seribu) that naive versions get wrong.
- Shows the vendor and brand, what was paid for, the period covered, the method
  and the gateway reference.
- Signed with the supplied signature at `apps/web/public/signature.jpg`. Replace
  the file to change it; if it is absent the receipt still reads correctly.
- **PDF via the browser's print dialog.** No PDF library and no headless browser,
  so nothing new in the image. The page sets `@page { size: A4; margin: 18mm }`
  and hides its own toolbar when printing.
- The route sits **outside the vendor layout** so it prints without a sidebar, so
  it repeats the authorisation check itself: the signed-in user must be a member
  of the invoice's vendor, and RLS limits the query to their own invoices anyway.

**Verified:** `scripts/test-terbilang.mts` — 36 checks, all passing, covering
`sebelas`/`seratus`/`seribu`, the thousand and million groups, the receipt
sentence form, negatives, decimals and NaN. `tsc` clean, `next build` clean (the
`/receipt/[id]` route is registered). Local production smoke test: `/signature.jpg`
returns 200 with the 17,458-byte file, and `/receipt/<uuid>` returns 404 for an
unauthenticated request rather than a 500.

**Not verified:** no real paid invoice has been rendered — the live database has
no paid invoices yet, so the receipt has not been seen with real data.

## 0.14.2 — vendor registration bug fix, and a "For brands" nav link

**Vendor registration was broken, and this fixes it.** `registerVendor()` inserted
the vendor and then read the new row back to get its id for the membership insert.
The `vendors_public_read` policy only allows reading a vendor that is *visible*
(approved, the platform brand, or subscribed) or that the caller is already a
member of. A brand-new `pending` vendor is none of those, so the read returned no
row, `.single()` raised, and the action returned **before creating the
membership**. The form therefore appeared to do nothing, and the database was
left with a `pending` vendor that had no members.

Migration `0019` moves both inserts into one `SECURITY DEFINER` function,
`register_vendor(...)`, which needs no read-back and is atomic — a failure cannot
leave a vendor without an owner. It is idempotent per account, so a double submit
returns the existing vendor instead of creating a second one. The same migration
deletes the orphaned `pending` vendors the bug produced (pending, not the
platform brand, no members at all — a state only this failure could create).

The read policy was deliberately **not** loosened: letting every signed-in user
read every pending vendor would expose the registration pipeline (brand names,
contact details, NPWP) to anyone, which is a worse outcome than the bug.

**"For brands" in the top navigation.** The vendor section on the landing page
now has an anchor (`#for-brands`) and a nav link, so a brand can reach the
benefits summary from the header. Its CTA still goes to the gated `/pricing`.

**Verified:** migration `0019` applied to the live database and re-checked (the
function exists and refuses an anonymous caller with "not signed in"; no orphaned
pending vendors remain — the 15 vendors listed are all approved). `tsc` clean,
`next build` clean, migration lint clean over 19 files.

**Still to do on your side:** the live site is serving an older build —
`dirory.com/pricing` returns 404 and the landing page has no vendor section. A
redeploy is required for any of this to appear.

## 0.14.1 — full payment list, and the founder's pricing exception

**Payment methods stay on the full list.** `MIDTRANS_ENABLED_PAYMENTS` is left
empty, so Snap offers everything the merchant account has enabled. BCA Virtual
Account (`bca_va`) is included by default, which is what most Indonesian payers
will use. Setting `bsi_va` remains available if BSI-only is ever wanted.

**Company-pricing exception.** `canViewCompanyPricing()` in
`lib/businessEmail.ts` now allows an allowlist on top of the company-domain rule.
The founder's address (`rendynoorchandra@gmail.com`) is built in so the team can
review `/pricing` without a corporate mailbox; `PRICING_ALLOWED_EMAILS`
(comma-separated) extends it for colleagues or a demo account.

Worth recording: the **vendor portal itself has no email-domain restriction** -
`/vendor` only requires a signed-in account with a vendor membership. The only
domain gate in the app is `/pricing`, and it is a soft gate that shapes who sees
the page rather than protecting anything.

**Verified:** `scripts/test-business-email.mts` - 26 checks covering domain
parsing (`a@`, `@b.com`, a domain with no dot, mixed case, null), the freemail
list, and the allowlist, including that the founder's gmail is allowed while an
unlisted gmail is not. `tsc` clean, `next build` clean.

## 0.14.0 — live migrations, optional geography, brand pricing page, BSI and dynamic QRIS

**Migrations applied to the live database.** `0013`-`0018` are now pushed and
verified against the project: the payment tables and functions exist, `plans`
holds Starter (Rp 5.000.000/year, 20 products) and Growth (Rp 25.000.000/year, 30
products), and the profile consent and geography columns are present. Everything
built in 0.10.0-0.13.0 is live as a result.

**Optional user geography** (migration `0018`): nullable `city` and `province` on
`profiles`, asked once right after the occupation question as a skippable second
step. Admin → Analytics shows users by province and by city. Collected only if
volunteered, never guessed, never shown to a vendor, and the privacy page now
says so.

**Brand section and pricing page.** The landing page has a "For brands" section
with a CTA. `/pricing` shows the packages (read from `plans`, so it cannot quote
a different price from the vendor portal) plus digitization and add-on rates. It
is gated behind a **company email**: personal domains such as gmail.com see an
explanation instead. This is a soft gate that shapes who sees the page and
protects nothing — no RLS policy depends on it.

**BSI Virtual Account.** `MIDTRANS_ENABLED_PAYMENTS=bsi_va` restricts Snap to BSI
VA, confirmed against Midtrans' docs. Because BSI VA is payable only through the
BYOND by BSI app, the docs recommend keeping the manual transfer alongside it.
`docs/PAYMENTS.md` also spells out that a Midtrans VA pays into Midtrans, not
directly into your own BSI account — the manual path is the one that pays you
directly, configured with `BILLING_BANK_*`.

**Dynamic QRIS, unique per invoice.** Midtrans Core API `payment_type: "qris"`
returns a hosted QR per order. Stored on the invoice (`qr_string`, `qr_url`,
`qr_expires_at`), reused while still valid, and settled by the same webhook as
Snap.

**Testing.** `scripts/test-midtrans.mts` runs under Node's type stripping and
checks the signature verification (accepts a correct signature; rejects a
tampered amount, order id, status code, foreign signature, empty and short
signatures), the status mapping, order-id generation and method parsing — 26
checks, all passing. `scripts/midtrans-sandbox-test.mjs` creates a real sandbox
Snap transaction, or signs and posts a settlement notification to a running
webhook.

**Verified:** migrations applied and re-checked against the live database; `tsc`
clean; `next build` clean; migration lint clean over 18 files; Midtrans unit
tests pass. **Not verified:** no live sandbox payment was made (no merchant keys
here), and the QRIS charge and BSI VA have not been exercised against Midtrans.

## 0.13.0 — admin analytics and the vendor category benchmark

The remaining computable metrics from the founder's document.

**Migration `0017`** adds five functions, all `SECURITY DEFINER` and each
authorising itself:

- `admin_growth_summary()` — installs, new installs, DAU/WAU/MAU, first-use rate
  and 30-day retention. "Active" means the install sent a usage snapshot in the
  window, which is the only activity signal the plugin provides.
- `admin_installs_weekly(weeks)` — new installs per week, for the trend line.
- `admin_content_coverage(target)` — published, samples, in review, draft,
  rejected, thumbnail coverage, and published-but-idle-for-30-days.
- `admin_top_categories(days)` — inserts and painted area per category.
- `admin_searches_daily(days)` — zero-result searches per day.
- `vendor_category_share(vendor, from, to)` — the vendor's own units, the
  category total and its share. **Aggregate only**: it returns no competitor's
  figures, no project and no person. Models and materials are kept apart,
  because counting models and square metres in one column would be meaningless.

**Admin → Analytics**, a new page: growth and engagement, new installs per week,
searches with no results over time, content coverage against the 250 target, and
top categories.

**Vendor → Dashboard** gains a "Category share" card.

**Verified:** `tsc --noEmit` clean, `next build` clean, migration lint clean over
17 files.

**Important, checked against the live database:** migrations `0013` through
`0017` are **not applied**. `payment_events`, `plugin_health_events` and
`unhandled_events` do not exist, `mark_invoice_paid` and `plugin_health_summary`
are absent, `plans` still holds the original seed prices, and
`profiles.plugin_consent_at` does not exist. So none of the payment gateway, the
consent gate, the new packages, plugin health or analytics is live yet — the site
will show their empty states until `npx supabase db push` is run.

## 0.12.0 — plugin health metrics, and a forward-compatible ingest

**Plugin 0.9.6** adds the counters behind the dashboard's "Plugin health" area.
Until now those numbers never left the architect's machine, which is why that
area could not be built.

- `cloud.rb`: `health_bump` / `report_health` keep counters for load attempts,
  load failures, cumulative load time, insert failures, paint failures and API
  failures, and queue a `plugin_health` event on the existing flush timer. They
  are gated on the same sharing switch as usage snapshots.
- `main.rb`: counts a model load attempt, its duration (whether it succeeds or
  not) and its failures; counts failed inserts and failed material preparation.
- `cloud.rb`: a failed call to the Dirory API counts as a cloud failure.
- Only counters are sent: no project name, geometry or file path.

**Ingest is now forward-compatible (important).** The `/events` function used to
reject a whole batch if any event had an unknown kind. That is a rollout trap:
shipping a newer plugin before the server knew its new kind would fail every
batch and stop all data collection. Unknown kinds are now accepted and stored in
`unhandled_events`, so the batch succeeds and nothing is lost while the server
catches up.

**Schema** (migration `0016`): `plugin_health_events`, `unhandled_events` (both
admin-readable only) and `plugin_health_summary(p_days)` for the rollup.

**Admin → Overview** gains a "Plugin health" card: per plugin version, installs,
loads, failure percentage, average load time, and insert/paint/cloud failures.
It stays empty until 0.9.6 reports, because earlier versions never sent it.

**Verified:** `node scripts/check-ruby.mjs` clean (all five Ruby files parse, and
every `Cloud.*` used in `main.rb` is defined), Edge Functions typecheck clean,
`tsc` clean, `next build` clean, migration lint clean over 16 files. The packaged
`DiroryLibrary-0.9.6.rbz` was opened and confirmed to contain the new health code.
**Not verified:** none of this has run inside SketchUp. The health counters are
the one part of this change that only a real SketchUp session can prove.

## 0.11.0 — vendor packages, download consent, and the .env answer

**Pricing: the founder chose the package model** from the metrics document
(Table B) over PRD Q4's flat-tier hypothesis.

- Migration `0014`: Starter (Rp 5.000.000/year, 20 products) and Growth
  (Rp 25.000.000/year, 30 products) are the self-serve packages. Full Range is a
  negotiated quote, so it is stored **inactive** and cannot be bought online.
  The two old monthly tiers are deactivated, not deleted, so existing
  subscriptions keep their history. The vendor subscription page reads plans
  from the database, so it picks this up with no code change.
- Still not modelled, because they are one-off invoices rather than
  subscriptions: the per-product digitization fee (Table A), annual listing as a
  percentage of it (Table C) and the add-ons (Table D).
- PRD Q4 still says "flat tiers"; it now disagrees with the database and needs
  updating to record this decision.

**Consent before the plugin download (UU 27/2022).**

- Migration `0015` adds `profiles.plugin_consent_at` and
  `profiles.plugin_consent_version`.
- `/download` now shows the privacy summary and requires an explicit,
  check-boxed agreement before offering the RBZ. The agreement is recorded
  against the profile with the policy version.
- `/api/download/rbz` re-checks the consent version, so a direct link to the file
  cannot skip the dialog. Bumping `PLUGIN_CONSENT_VERSION`
  (`apps/web/src/lib/consent.ts`) requires everyone to agree again.
- The privacy page gained a "Consent before download" section and was rewritten
  in plain ASCII: an earlier edit had mojibake in it (a mangled arrow and middle
  dot).

**Verified:** `tsc --noEmit` clean, `next build` clean, migration lint clean over
15 files, `node scripts/check-ruby.mjs` clean. **Not verified:** migrations
`0014` and `0015` are not applied to the live database, and the consent flow has
not been clicked through in a browser.

## 0.10.0 — Midtrans Snap payments, plus revenue and catalog metrics

**Payment gateway (Midtrans Snap).** A vendor can now pay an invoice online —
QRIS, bank transfer (VA), GoPay, OVO, DANA, ShopeePay or card — instead of only
sending transfer proof. See `docs/PAYMENTS.md`.

- `POST /api/payments/midtrans/token` mints a Snap token for one of the vendor's
  own unpaid invoices and records the order id on it.
- `POST /api/payments/midtrans/webhook` verifies the SHA-512 signature, records
  the notification, and settles the invoice only when the amount matches.
- `public.mark_invoice_paid()` (migration `0013`) is now the single settlement
  path, so the admin "Mark paid" button and the webhook cannot diverge. It is
  idempotent: a retry cannot extend a subscription twice.
- `public.payment_events` (migration `0013`) logs every notification with a
  unique `(gateway, order_id, transaction_status)` key for idempotency and
  reconciliation. Admin-readable, service-role-writable.
- `apps/web/src/lib/midtrans.ts` holds the adapter, the constant-time signature
  check and the status mapping. `MIDTRANS_*` are read at runtime, so the client
  key is not baked into the browser bundle.
- The manual bank-transfer path is unchanged and still works.

**Metrics** (`docs/METRICS.md` reconciles the founder's document against the
schema, metric by metric):

- Admin → Overview: a **Revenue** card (MRR, ARR, collected, overdue, revenue by
  plan) and a **Vendor pipeline** card (pending / approved / suspended).
- Vendor → Dashboard: a **Catalog status** card (live / in review / draft /
  rejected).
- `lib/payments.ts` no longer treats `MIDTRANS_SERVER_KEY` as enabling the
  direct-QRIS path, which would have shown a "scan this QR" box with no QR in it.
  Snap already covers QRIS; that path is Xendit-only.

**Two conflicts with the PRD are recorded, not silently built** (`docs/METRICS.md`):
the document asks vendors to see unmet searches, which PRD §241 and Q12 forbid in
v1; and it proposes a different pricing model from PRD Q4/Q5. Both need a
decision before implementation.

**Verified:** `tsc --noEmit` clean, `next build` clean (both payment routes
registered), migration lint clean over 13 files. **Not verified:** no Midtrans
sandbox transaction was run from here, and migration `0013` has not been applied
to the live database.

## 0.9.11 — mobile-friendly admin and vendor shell, clearer sign-in errors

The admin and vendor layouts rendered a fixed 256px sidebar at every screen
width, so on a phone the content had almost no room. Replaced `Sidebar`/`Topbar`
with a responsive `Shell`:

- `lg` and up: the sidebar stays exactly as it was.
- below `lg`: navigation moves into a slide-over drawer opened from a hamburger
  in the top bar. It closes on navigation, backdrop click and Escape, and locks
  background scrolling while open. Adds `aria-current`, `aria-expanded` and a
  labelled close button.
- Content padding is now `p-4 sm:p-6` instead of a fixed `p-6`, and the top bar
  is sticky.

Also:
- The auth callback now distinguishes an expired/used one-time link from a
  missing code, instead of always reporting "Missing code". An expired link now
  says to request a new one; a missing code points at the Supabase Site URL.
- Added a `/no-access` page. A signed-in non-admin who opens `/admin` is sent
  there with an explanation instead of being bounced into vendor onboarding,
  which read as a broken login.

Verified: `tsc --noEmit` clean, `next build` clean. Not verified on a physical
phone, and not deployed from this session.

## 0.9.10 — the Materium catalogue, plus generic Indonesian materials

**19 MATERIUM models** uploaded from `sample_library/Model/3D MATERIUM 2020
CATALOGUE/` under a new **MATERIUM** brand, with categories Accessories,
Cabinetry, Lighting, Partition, Seating, Table and Workstation. The catalogue is
now **1,354 assets / 30 models**.

The `.skp` files shipped without previews, so the thumbnails were fetched from
the brand's product pages on malka.co.id by a new script,
`scripts/fetch-materium-thumbnails.mjs` (the site rejects requests without a
browser User-Agent). `library-overrides.json` grew a **`thumbnail`** field
pointing at an image outside the library, plus `sku` and `product_url`, so the
uploader can attach a preview and a product link without the source folder
having to change. The brand logo was set from the same site, into the public
`brands` bucket.

The catalogue folder nests category under a catalogue name, so without the
overrides the scanner would have read the category as "3D MATERIUM 2020
CATALOGUE" and the brand as the sub-folder. **`D:\Dirory` was not modified.**

**Malka retired.** Polonium Credenza and Ottium existed twice (they are Materium
products): the old Malka copies and their stored files were removed and the
Malka vendor deleted, so each product appears once.

**26 generic Indonesian materials** (Roof, Stone, Tile, Wood, Metal, Brick,
Concrete, Paint) were uploaded too. They live in the category folders under
`Materials/` with `meta.json` setting `brand: "Generic"` — they had simply never
been uploaded. Note: `Materials/Dirory_Free_Indonesian_Materials` itself is
**empty**, so if that folder was meant to hold a different set, it needs
re-checking.

**Verified:** catalogue returns 1,354 items with the MATERIUM brand logo; every
Materium model has a thumbnail and a SketchUp version (2013, or 2018 for the
workstations); `dirory.com/library` lists MATERIUM and no Malka; a product page
and its thumbnail both return 200. No web code changed, so no redeploy was
needed — the catalogue is served live and the site picks changes up within its
5-minute cache.

## 0.9.9 — vendor dashboard that works, and subscription payments

**Why the old dashboard showed nothing.** `/vendor` read `daily_asset_usage`, the
nightly rollup, which had **0 rows** — it needs `pg_cron`, which was never
installed. The real data was in `usage_snapshots` all along. There was also a
bug: "Projects using your products" counted *products*, not projects.

**Vendor dashboard (M7, FR-V4/V5).** Rebuilt on three new SECURITY DEFINER
functions that aggregate live from the snapshot tables, so it no longer depends
on the rollup:

- `vendor_usage_totals` — projects, units, painted area, distinct architects,
  quote requests.
- `vendor_usage_by_asset` — the same per product, plus quotes matched from the
  quote items.
- `vendor_usage_daily` — the trend series from the append-only `usage_history`.

Every function checks membership itself and returns **counts only** — never a
project name or an architect identity (PRD §9). The screen gains six KPI tiles, a
vendor-wide activity chart, per-product sparklines, server-side sorting, a
7/30/90/custom range, and **CSV export** for both usage and leads.

**Subscription and payment (M8, FR-V6/FR-M5).** The vendor side had no way to
pay at all. Now:

- `/vendor/subscription` — pick a plan (or switch/renew); the RPC
  `vendor_request_subscription` creates the subscription and an **unpaid
  invoice**, and is idempotent (re-running reuses the invoice rather than
  stacking duplicates).
- `/vendor/subscription/invoice/<id>` — the amount, due date, **bank transfer
  details**, and an **"I've paid"** form that uploads the receipt and records a
  reference (`vendor_submit_payment`). The invoice stays unpaid until the admin
  confirms it.
- Admin *Mark paid* now extends by the **plan's** period (it assumed monthly)
  and extends from the later of now and the current period end.

**QRIS — scaffolded, not switched on.** Dynamic QRIS needs a gateway merchant
account and API keys, which do not exist yet. `lib/payments.ts` holds the
adapter (`qrisConfigured`, `createQrisCharge`) and the invoice page says the QR
is coming, so switching it on later is a small, contained change.

**Migration `0012_vendor_portal.sql`** (functions + invoice columns).
**Test `supabase/tests/vendor_portal_test.sql`** — 10 checks covering the
aggregates, cross-vendor isolation, the subscribe/proof flow, and that a vendor
still cannot read search misses. Runs in a transaction and rolls back.

**Not changed:** visibility gating. An approved vendor is still visible whether
or not it pays (FR-M6 would hide every seeded brand, so that stays a separate
decision).

**Verified:** migration pushed; the test suite passes and leaves no residue;
`next build` passes.

## 0.9.8 — admin product upload, and SketchUp-version awareness

**Admin — Products (`/admin/products`, FR-M12 / FR-V3).** A new section with a
list (search by name, filter by type, paginated) and an upload form. The form
carries the same detail the plugin's Inspector shows — name, brand, category,
tags, SKU, product URL, dimensions (models) or tile size (materials) — and lets
the brand and category be created inline, so nothing is a dead end. A file goes
**straight from the browser to the private `models` / `materials` bucket**; only
the metadata passes through a server action (`registerProduct`), because a `.skp`
can be tens of megabytes. New uploads publish immediately (like a Dirory sample)
unless "Publish now" is unticked, which sends them to the review queue instead.
The dead `/admin/samples/new` link now points here with the Dirory brand
preselected.

**SketchUp version (FR-V3).** A model saved in a newer SketchUp cannot be opened
by an older one. The upload form now reads the version out of the `.skp` header
(`{18.0.16975}` → SketchUp 2018; 21+ → the versionless "2021+"), stores it on the
version (`asset_versions.su_version` / `su_version_raw`, migration `0011`), and
shows it on the product page. The plugin carries it on the entity and, before
inserting a model, warns and asks for confirmation when the running SketchUp is
older than the file. The Inspector gained **Dimensions** and **SketchUp** rows
and its labels are now translated.

**Backfill.** `scripts/backfill-su-version.mjs` (`npm run library:backfill-su`)
set the version on all 13 existing models by reading the matching file in the
library: 2013 (Polonium Credenza, Ottium), 2015 (Arabian, LW952J, SAPPHIRA),
2016 (Ellis 3 Seater, Tromso), 2018 (CE9, CW 630 PJ, Chrysolite, MAX 1, MAX 2,
U104). The bulk uploader records it too.

**Plugin 0.9.5** built and published to `plugin-release`; the website's
`/download` serves the same archive.

**Verified:** migration `0011` pushed; catalogue returns `su_version` and
`dimensions`; a throwaway asset created through the exact storage + DB path was
served by the catalogue and then removed; `next build` passes; the Ruby plugin
parses clean.

## 0.9.7 — five new models, plus a name override and a removal tool

**Library.** Five models were added to `sample_library/Model` and pushed to
Supabase: **Polonium Credenza** (Malka / Cabinet), **Ellis 3 Seater**
(Ellis / Chair), **MAX 1** and **MAX 2** (ALPHAMAX / Doors), and
**Tromso Coffee Table** (Tromso / Table). The catalogue is now **1,311 assets,
13 models**. New vendors created: Ellis, ALPHAMAX, Tromso.

**`--overrides` for the uploader.** The two ALPHAMAX door folders would have
become their own brands and both taken the name "Panel Door A" from a leftover
scaffold `meta.json`. `scripts/library-overrides.json` maps a path to
`{ brand, name, category }`, applied before upload:

```
node scripts/upload-library.mjs --root "D:/Dirory/sample_library" \
  --overrides scripts/library-overrides.json
```

The source folder is left untouched (`D:\Dirory` is read-only input).

**`scripts/remove-library-item.mjs`** (`npm run library:remove`). Removes an
item whose source folder was renamed or deleted — the asset row plus its stored
files, matched by `legacy_key`. Used to retire the old **Panel Door A**, whose
folder no longer exists.

**Verified:** upload reported "Uploaded 5, skipped 1306, 0 failed"; the catalogue
returns 13 models and Panel Door A is gone; `dirory.com/library` lists the new
brands (ALPHAMAX, Tromso, Ellis) and a new product page returns 200.
**Note:** Tromso Coffee Table has no thumbnail image, so its card shows a
placeholder until one is added.

## 0.9.6 (web) — user metrics and a one-time "what do you do?" question

**Admin — Users (`/admin/users`, brief §4.6 / FR-M9).** New screen with:
- KPIs: total users, architects, designers, students, plus "joined in the last
  30 days" and how many answered.
- A breakdown strip by occupation.
- A table of every account: name, email, occupation, role, joined, last seen
  (from the plugin installs).

**Admin — Overview.** Added a **Users** KPI (the first tile) linking to the
screen, and the grid is now five columns on wide screens.

**Ask once, after the first sign-in.** A new `/welcome` page asks "What best
describes you?" — Architect / Designer / Student / Other — and saves it to the
profile. It is optional ("Skip for now") and asked only once.
- Web sign-in: `/auth/callback` sends a first-time user to `/welcome`.
- **Plugin sign-in:** `/auth/device` asks the same question after approving the
  device, because most people sign in from SketchUp and would otherwise never
  see it.
- The account menu has "Your profile" (`/welcome?edit=1`) so an answer can be
  changed later.

**Schema (`0010_profiles_occupation.sql`)**
- `profiles.occupation` (`architect | designer | student | other`, NULL until
  answered — never guessed).
- `profiles.email`, mirrored from `auth.users`: that table is not reachable
  through PostgREST with the anon key, so the admin dashboard could not otherwise
  show which account is which. Backfilled for existing rows and kept up to date
  by the sign-up trigger.
- `user_occupation_counts()` helper for the dashboard.

**Verified:** migration applied; emails backfilled for all three existing
accounts; typecheck and build clean; `/welcome` and `/admin/users` both build.
**Not verified:** the picker click and the admin screen in a browser (needs the
admin account to be signed in).

## 0.9.5 (web) — English / Bahasa Indonesia toggle

The public site can now be read in Indonesian. English stays the default.

- **Toggle** (EN / ID) in the header of every public page — landing, library,
  product, how-to-install, download, login — and in the footers.
- **Cookie-based, not URL-based.** The choice is stored in a `locale` cookie, so
  every existing route and link is unchanged and pages keep server-rendering.
  A server action writes it and the toggle refreshes; unknown values fall back
  to English.
- Translations live in `lib/i18n.ts` as flat key→string dictionaries for both
  languages. `t()` falls back English → key, so a missing string shows up rather
  than rendering blank.
- Translated: the whole landing page (hero, how-it-works, inside-SketchUp,
  brands, CTA, footer), the library (search, filters, sort, cards, counts), the
  product page (specs, CTA, related), the install guide (steps, version checker,
  troubleshooting), download, login, and the account menu.
- **Not translated yet:** `/privacy` (a legal draft) and the admin/vendor
  back-office (internal tools).

**Verified locally:** with no cookie the pages render English; with
`locale=id` the landing, library, product, how-to-install, download and login
pages all render Indonesian with no English leaking through. Typecheck and build
clean.

## 0.9.4 (plugin) — fix: favourites did nothing, and the star was hidden

Two real bugs meant the Favourite feature could not work at all.

1. **The catalogue had no `key` field.** The panel keys favourites by `item.key`,
   but `catalog` returned only `asset_id` / `legacy_key`, so `item.key` was
   `undefined`. Tapping the star added `undefined` and Ruby dropped it
   (`key.to_s.empty?`), so nothing was ever saved. `catalog` now returns
   `key: asset_id`, which is also what the `/favourites` endpoint expects for
   account-wide sync.

2. **The star sat underneath the download badge.** Both were pinned to the
   thumbnail's top-right, and the badge had the higher z-index, so on every cloud
   card the star was invisible and unclickable.

**Card layout** (founder request): the per-card product-info button (ⓘ) is
removed — product details already live in the Inspector (🔍), which shows the
same information for the selected item. The star takes the thumbnail's
bottom-right, where the ⓘ used to be:

| Corner | Element |
|---|---|
| top-right | download badge (⤓ / ✓) |
| bottom-left | brand logo chip |
| **bottom-right** | **Favourite star (☆ / ★)** |

The unused product-info modal, its handlers and its CSS were removed too.

**Verified:** `catalog` returns `key` equal to `asset_id` for all 1,307 items;
`plugin-release` reports 0.9.4; Ruby and panel.js parse clean; web build clean.
**Not verified:** the star tap in SketchUp — needs a human click.

## 0.9.3 — deployed to the VPS (certificate pending DNS)

The app now runs on the Sumopod VPS behind Caddy. Verified on the server:

- `tsc` + Docker build succeed; containers `web` (healthy) and `caddy` (up) run.
- Routes from inside the container: `/api/health`, `/`, `/library`, `/login`,
  `/download`, `/api/plugin/latest`, `/privacy` all **200**; `/admin` **307** to
  `/login` when signed out; an unknown product **404**.
- The VPS reaches the Supabase catalogue (1,307 items) and the RBZ is in the image.

Server hardening applied: ufw (22/80/443 only), fail2ban, root login refused,
password login refused, key login working.

**Fixed a false-positive in `scripts/deploy.sh`:** the post-deploy check fetched
`https://$DOMAIN/api/health` over the public internet, which silently tested
whatever DNS pointed at — the old Netlify site — and reported success while the
VPS certificate was still failing. It now tests Caddy locally with
`--resolve $DOMAIN:443:127.0.0.1` and explains a pending certificate instead of
exiting with an error.

**Not yet verified:** the public HTTPS certificate. Caddy's ACME challenge fails
while `dirory.com` resolves to Netlify (`75.2.60.5`). It retries automatically;
once the A record points at `129.226.208.234` the certificate is issued with no
further action.

## 0.9.2 — single domain: dirory.com (admin at /admin)

The earlier plan used `admin.dirory.com` as a separate host with middleware that
rewrote `/` to `/admin`. That split caused a real problem: **cookies do not cross
hostnames**, so signing in on one host did not carry to the other. It also needed
host-routing code and two certificates for no benefit.

**Decision (founder):** one domain, everything on the VPS.

- `middleware.ts` no longer does host routing. It only refreshes the Supabase
  session and redirects signed-out visitors from `/admin` and `/vendor` to
  `/login`. The security boundary remains RLS plus `requireAdmin()`.
- Removed `NEXT_PUBLIC_ADMIN_HOST` everywhere (Dockerfile, docker-compose,
  `.env.example`, `apps/web/.env.example`, docs).
- `NEXT_PUBLIC_SITE_URL` and `DOMAIN` are `https://dirory.com` / `dirory.com`.
- `docs/DNS.md` rewritten for one domain: `A @ → 129.226.208.234`, `www` CNAME,
  email records untouched.
- `docs/DEPLOY.md` updated: DNS points the apex at the VPS, and `/admin` is the
  dashboard (no subdomain).
- Repaired lingering mojibake in `apps/web/.env.example`.

**Not verified:** nothing has been deployed to the VPS yet — the runbook still
needs SSH access.

## 0.9.1 — M5: VPS deployment artefacts and runbook

The brief's M5 deliverables (Dockerfile, docker-compose, Caddyfile, .env.example,
scripts/deploy.sh, docs/DEPLOY.md) existed only as a runbook; the files did not.
All are now present and verified as far as this machine allows.

**New files**
- `Dockerfile` — three-stage build, `output: "standalone"`, runs as a non-root
  user, with a HEALTHCHECK on `/api/health`. The service-role key is a RUNTIME
  env var, never a build arg, so it cannot be baked into an image layer.
- `docker-compose.yml` — `web` + `caddy` (automatic HTTPS), named volumes for
  certificates, `web` healthcheck gating Caddy.
- `Caddyfile` — reverse proxy to `web:3000`, domain from `$DOMAIN`, security
  headers, access logs.
- `.env.example` — every variable name with a comment; no values.
- `scripts/deploy.sh` — preflight checks, pull, build, health-gated restart and
  an HTTPS check. LF endings, marked executable in git.
- `.dockerignore` — keeps node_modules/.next/.env out of the build context.

**App changes required for the image**
- `next.config.mjs`: enabled `output: "standalone"`, and fixed
  `outputFileTracingRoot` to an absolute monorepo path. The previous
  `new URL(...).pathname` form produced **no** standalone output, which would
  have broken the Docker build (silently: `server.js` would not exist).
- New `GET /api/health` (brief §120).
- `catalog` gained `?thumbs=path`, and the web uses it: the catalogue dropped from
  **1.71 MB to 1.01 MB** and no longer carries short-lived signed URLs. New
  `/api/thumb/<asset_id>` proxies thumbnail images for the (private) storage
  bucket with a long cache header, so a cached page does not show broken images.
- Removed 10 stale `DiroryLibrary-*.rbz` copies from `apps/web/private/`; the image
  was tracing all of them. Only the current version ships.

**Verified on this machine** (no Docker available here)
- `tsc` and `next build` clean; standalone output produced at
  `apps/web/.next/standalone/apps/web/server.js`.
- The **standalone server** was actually run: `/api/health` → 200 with
  `{"status":"ok"}`, `/api/thumb/<id>` → 200 `image/jpeg`, `/library` → 200.
- `docker-compose.yml` structure and the six env names cross-checked against
  `.env.example`; `deploy.sh` is LF-only.

**Not verified:** the Docker build itself, Caddy's certificate issuance, and the
server hardening steps — these need the VPS. Run `docs/DEPLOY.md` from step 1.

## 0.9.0 — in-plugin update button and Settings (English / Bahasa Indonesia)

**Plugin update, without the Extension Manager.**
- New **Update** badge in the toolbar appears when a newer version is published.
- Clicking it downloads the new archive and **stages** it; the swap happens
  automatically on the next SketchUp launch, then SketchUp is restarted by the
  user. Settings and sign-in survive because they live in SketchUp defaults and
  `~/.dirory`, not in the plugin folder.
- A running extension cannot overwrite its own code (the Ruby is loaded and, on
  Windows, the files are locked), so the swap is deferred to startup by design.
- The plugin checks `GET /plugin-release` (no auth) and downloads from
  `GET /plugin-release/download` with its device token.

**Settings.**
- New Settings dialog with **Language: English / Bahasa Indonesia**. The whole
  panel UI is translated (`i18n.rb`); missing keys fall back to English, so a
  partial translation is safe.

**Infrastructure.**
- Migration `0009_plugin_bucket.sql`: private `plugin-release` Storage bucket.
- Edge Function `plugin-release`: version check + gated download (401 without a
  plugin token). Verified live: 0.9.0 reported, 401 unauth, 182,446-byte ZIP
  authenticated, and every .rb in the downloaded archive parses.
- `scripts/upload-plugin-release.mjs` (`npm run rbz:publish`) uploads the built
  archive; `apps/web/src/lib/pluginRelease.ts` is the single version constant.
- `GET /api/plugin/latest` on the website for a browser-side version check.

**Not verified:** the Update button and the language switch have not been clicked
in SketchUp. The download/version endpoints are verified against the live project.

## 0.8.3 — search only on Enter (so Dirory learns the query the user meant)

**Why:** the panel filtered live as the architect typed, and a zero-result
search is only reported after a pause. Backspacing ("toto closet" → "toto")
silently changed the results and could erase the term the architect actually
wanted, so the demand signal was lost.

**Plugin 0.8.3**
- The search box no longer filters as you type. Results appear when the query is
  **committed** — press Enter or click the new **Search** button.
- The whole catalogue stays visible until a search is run (unchanged).
- Only committed zero-result searches are reported (PRD FR-A14 unchanged), so the
  term reported is exactly the one the user committed.
- The Search button is dimmed until there is typed text that has not been run
  yet, so it is clear that typing alone does nothing.

**Verified:** panel.js parses, every `sketchup.*` call still has a Ruby callback,
Prism parses all plugin sources, web build clean.
**Not verified:** the interaction itself (Enter/backspace behaviour) has not been
exercised in SketchUp.

## 0.8.2 — web product catalogue, product pages, simpler plugin sign-in

**Web (new pages, modelled on Dekoruma's supply warehouse):**
- `/library`: a public product catalogue — search, All/Models/Materials tabs,
  brand and category filters, sort, and a responsive grid. Browsing needs no
  account; "Free sample" is badged.
- `/product/<asset_id>`: a product page with a large image, specifications
  (brand, category, type, tile size, SKU, tags) and related products from the
  same brand/category.
- The product page's action is **"install Dirory to use this in SketchUp"**, not
  a file download. No file is offered on the web; the plugin fetches assets on
  demand. Signed-out visitors are sent to sign in first.

**Plugin 0.8.2:**
- Sign-in is now a single **"Sign in with Google"** button. The device code is no
  longer shown — the browser step auto-approves and the panel connects by itself.
- Clicking a model/material card while signed out shows a short notice
  ("Sign in to load this model…" / "…paint this material…") and opens the
  in-panel sign-in, instead of appearing to do nothing.

**Not verified:** the two new pages render and typecheck, but they have not been
reviewed in a browser by the founder, and the plugin changes have not been run
in SketchUp.

## 0.8.1 — fix: plugin sign-in never completed, so cards never loaded

**Symptom:** in plugin 0.8.0 clicking a model/material card asked to sign in;
after signing in with Google, clicking a card still did nothing (it just asked to
sign in again). No `plugin_token` was ever stored by the plugin.

**Cause (web):** `/auth/device` sent Google/email straight back to
`/auth/device?code=<device code>`. Nothing on that page exchanges the OAuth
`?code=` for a session, and Supabase appends its own `code=`, giving
`?code=ABCD-EFGH&code=<oauth>` — which crashed the page (HTTP 500, `code` was an
array). The device code was never approved, the plugin's poll stayed `pending`,
and the sign-in gate blocked every insert/paint.

**Fix**
- `DeviceSignIn.tsx`: return through `/auth/callback?next=/auth/device?code=…`
  (the same path `/login` uses), so the session is created first.
- `auth/device/page.tsx`: tolerate a repeated `code` param and pick the one
  shaped like a device code instead of crashing.
- Plugin 0.8.1: repaired `main.rb` text that 0.8.0 saved with broken encoding
  (menu showed "Sign in to Diroryâ€¦"); no behaviour change.

## 0.6.0 — M6: plugin cloud catalogue, verified login, downloads, quotes

Adds the client side of the cloud (PRD M6, FR-A4/A7/A10/A11/A20/A22) and the
backend it needs. The local-folder library still works when no server URL is set,
so existing users are unaffected until they opt in.

**Backend**
- Migration `0007_plugin_auth.sql`: `plugin_device_codes` and `plugin_tokens`
  (SHA-256 hashes at rest only). RLS locked down; the single approval policy can
  only bind a live pending code to the caller's own profile.
- `auth-device`: `POST /auth-device/{start,poll,revoke}` — device-code login.
  `poll` returns `pending` until the browser approves, then issues an opaque token.
- `download`: `GET /download/<asset_id>` — short-lived signed URL (≤ 10 min) for
  the current approved version; only visible vendors or the Dirory samples.
- `quotes`: `POST /quotes` — one `quote_requests` row per vendor with only that
  vendor's items, plus the consent form (project, city, timeline, note, phone).
  Samples are never quotable.
- `catalog`: now also returns a signed `thumbnail_url` per item, because the
  `models`/`materials` buckets are private.
- `favourites`: accepts the plugin's opaque token instead of a user JWT.
- `_shared/plugin-auth.ts`: token hashing, service client, identity resolution.

**Web**
- `/auth/device` page + action: the architect signs in and approves the code the
  plugin shows.

**Plugin v0.6.0 (`plugin/`, packaged to `dist/DiroryLibrary-0.6.0.rbz`)**
- `cloud.rb`: verified device sign-in (`sign_in_start`/poll/`sign_out`), opaque
  token in `request_headers`, `fetch_catalog` with a `~/.dirory` cache,
  `download_asset` into `~/.dirory/cache/<asset_id>/<version>/`, favourites
  pull/push, and `post_quote`.
- `main.rb`: `send_library` renders the cloud catalogue and falls back to the
  local scan; `insert_model`/`apply_material` download on demand (FR-A11); entities
  are tagged with `asset_id` (FR-A12); tile size prefers the server value (FR-A13).
- Panel: device-code sign-in UI, a quote consent modal, cloud thumbnail URLs.

**Tooling**
- `scripts/check-ruby.mjs` (`npm run rb:check`) now uses Ruby's own **Prism**
  parser via `@ruby/prism` (WASM), so the plugin files are checked with the same
  parser Ruby ships — no Ruby interpreter on the machine needed.
- `npm run fn:check` typechecks every Edge Function; `npm run rbz:build` packages.
- An earlier regex-based "checker" passed a `main.rb` with a duplicated `def` line
  and a missing `end`, which made SketchUp reject the whole extension with
  "unexpected end-of-input, expecting `end`". That is why the check is now a real
  parse, and the packaged RBZ is re-parsed from the archive before shipping.

**Verified**
- `npm run build` clean, 26 routes (up from 25: `/auth/device`).
- `npx tsc --noEmit` clean.
- `deno check` clean on all six Edge Functions.
- `node scripts/check-ruby.mjs` clean; every `Cloud.*` call resolves.
- RBZ rebuilt and inspected: 9 entries, forward-slash names, loader at root.

**Deployed and run against `ajlmncbzufagplbaaukv` (Singapore), 4 Oct 2026**
- Migrations 0007 and 0008 applied; six Edge Functions deployed.
- `auth-device/start` returns a device code and verification URL (HTTP 200).
- `catalog` returns 200; `download`, `quotes` and `favourites` return 401 without
  a token, as designed.
- **The RLS suite ran for the first time** and passed all checks 1–10. It caught
  two real defects:
  1. The 0007 device-code SELECT policy hid the pending row, so approval could
     never match a row — **fixed in migration 0008**.
  2. Check 8 wrote to `storage.objects` directly, which Supabase now blocks
     (`storage.protect_delete()`) — the test was wrong, not the policy; it now
     skips the fixture when the guard is present.
- **The library uploaded:** 1,307 assets (9 models, 1,298 materials) across 11
  brands, 1,306 with thumbnails, 272 with tile sizes. `catalog` returns all 1,307.

**Three plugin/upload bugs found by actually running things (all fixed)**
1. **Ruby syntax error** — a duplicated `def self.defer_folder_picker` line left
   `main.rb` missing an `end`, so SketchUp refused the whole extension
   ("unexpected end-of-input"). My regex-based "checker" had passed it; the check
   is now a real parse with Ruby's own Prism parser (`npm run rb:check`).
2. **The panel never received the catalogue** — `Sketchup::Http::Request` is
   asynchronous and a request held in a *local variable* is garbage-collected
   when the method returns, so its callback never fires. All ten HTTP calls now
   go through `Cloud.new_request`, which keeps in-flight requests reachable, and
   catalogue errors are surfaced on the panel instead of being swallowed.
3. **Only 1 of 1,307 assets was visible** — two causes: the uploader marked every
   per-brand asset `pending_review` (the fix approves seed-library assets), and
   `catalog` read a single PostgREST page capped at 1,000 rows (now paged).
4. **Clicking a card did nothing** — no component followed the cursor and the
   Paint tool never activated. Two known SketchUp quirks, both confirmed in the
   API tracker/forums: `place_component` and `send_action('selectPaintTool:')`
   do not take effect when invoked directly inside an HtmlDialog/HTTP callback.
   Fixed by deferring the insert/paint to a main-thread timer
   (`run_on_main_thread`, which also calls `Sketchup.focus`), and by preferring
   Dirory's own `MaterialPaintTool` over the flaky native `send_action`.

**Sign-in (added after the first test)**
- "Continue with Google" on `/login`, alongside the email link.
- `/auth/device` auto-approves a live code for an already-signed-in user, so a
  returning user connects with no extra click.
- **Requires you to enable the Google provider in Supabase** (Client ID/Secret
  from Google Cloud); the email path works without it.


**Still not verified**
- No Ruby interpreter here, so the plugin was **not** executed. Load
  `dist/DiroryLibrary-0.6.0.rbz` in SketchUp to run the M6 acceptance test
  (sign in → browse cloud → insert a model and paint a material; a sample cannot
  be quoted). This is the one remaining gate on Phase 1.
- The `/auth/device` web page has not been exercised end-to-end in a browser
  against the live project.
- `SITE_URL` was set to `https://dirory.id`; change it if the web app is hosted
  elsewhere.


## 0.5.0 — architect landing page, email signup, protected RBZ delivery

- Created the public architect/designer landing page at `/`, using the supplied
  transparent Dirory mark in the header, product preview, favicon and Open Graph
  metadata.
- Fixed the `/login` React #321 crash by keeping Next.js 15 `searchParams`
  resolution in a server component and moving hooks into `SignInForm`.
- Passwordless email-link sign-in supports Gmail. Supabase creates an architect
  profile on first sign-in; this is email OTP, not Google OAuth.
- Added `/download` and `/api/download/rbz`: an authenticated profile gets
  DiroryLibrary v0.5.2; unauthenticated requests are redirected to sign-in. The
  RBZ is included in Next's server trace and is not under the public static path.
- Added a public privacy-policy draft at `/privacy` and made callback `next`
  redirects local-path-only.
- Added migration `0006_admin_bootstrap.sql` to let the trusted SQL Editor
  promote the founder while authenticated non-admin users remain unable to self-
  promote. Extended the RLS suite to test the role trigger.
- Netlify remains blocked by its private-repository "Unrecognized Git
  contributor" limit. Source is ready, but this version will not be live until
  Netlify accepts the commit and a production deployment succeeds.

**Verified:** TypeScript strict check, Next.js production build (24 routes),
local production smoke test (`/`, `/login`, `/download`, `/privacy` all HTTP 200;
unauthenticated `/api/download/rbz` redirects to sign-in), and RBZ artifact is
present in the route output trace.

**Not verified:** Netlify production deployment, migration 0006 on Supabase, the
full RLS suite, or public SMTP delivery. Supabase's built-in email sender may
only deliver to project-team addresses; configure custom SMTP before inviting
architects publicly.

## 0.4.0 — public architect site and protected RBZ download

- Replaced the scaffold homepage with a public landing page for architects and
  designers, using the supplied Dirory mark as the header/hero brand, favicon
  and Open Graph page thumbnail.
- Split the broken async client login into a Next.js 15 server page and an
  interactive client form. `searchParams` is awaited on the server, so React
  hooks are no longer called after an `await` (the source of React error #321).
- Login clearly supports Gmail via passwordless email link. On first use,
  Supabase Auth creates an architect profile (`disable_signup=false`, email
  provider enabled). This is email OTP, not Google OAuth.
- Added `/download` and `/api/download/rbz`; unauthenticated requests go to
  sign-in, authenticated users receive RBZ v0.5.2. The package is server-traced,
  not placed in the public static directory.
- Added a public privacy-policy draft page and safer local-only callback paths.
- Added migration `0006_admin_bootstrap.sql`: the previous profile-role trigger
  prevented the trusted SQL Editor from promoting the founder to admin because
  it treated a null `auth.uid()` as a regular user. It still blocks authenticated
  users from self-promoting.
- Extended the RLS test with admin-fixture verification and tests for preventing
  self-promotion while allowing a trusted bootstrap operation.

**Verified:** strict TypeScript check and Next.js production build pass (24 app
routes); RBZ appears in the download route's output trace; local production
smoke test returned 200 for `/` and `/login`, and an unauthenticated download
request redirected to `/login`.

**Not verified:** Netlify has been blocking builds from GitHub with its
"Unrecognized Git contributor" private-repository limit. This code is not live
until that Netlify contributor/account issue is fixed and a deployment succeeds.
The new migration and expanded RLS test have not yet been pushed/run on Supabase.

## 0.3.0 — privacy, consent (UU 27/2022) and v0.5.2

Founder decisions this session: option C (policy now, consent UI as a separate
RBZ), project-title sharing **off by default**, scaffold moved to `D:\Dirory\dirory`.

**Docs**
- `docs/PRIVACY.md` — draft privacy policy for UU 27/2022, checked against the
  actual wire format. Includes Appendix A listing the exact payloads. Marked
  DRAFT; needs legal review.
- `docs/RECONCILIATION.md` — brief §32 deliverable: PRD v1.2 vs scaffold, with six
  gaps (G1–G6), three brief conflicts (C1–C3) and five assumptions.
- `docs/DEPLOY.md` — Sumopod VPS runbook, starting from "no domain yet".

**Plugin v0.5.2 (`plugin/`, packaged to `dist/DiroryLibrary-0.5.2.rbz`)**
- Split consent: `share_usage` (anonymous usage + search misses, on by default)
  and **`share_project` (project titles, OFF by default)**. One switch could not
  lawfully cover both: a project title is often personal data.
- `cloud.rb`: new `share_project?` / `set_share_project`. Both the snapshot and the
  quote payload now send `project: ''` unless consent is given. Turning the
  feature on re-marks every model dirty so it applies without waiting for an edit.
- Panel: explicit "What you share" block, a "See exactly what is sent" disclosure
  listing what is and is not transmitted, and a privacy-policy link.
- `main.rb`: `setShareProject` and `openPrivacy` callbacks; `PRIVACY_URL` constant.
- Version bumped to 0.5.2 in `dirory_library.rb` and `cloud.rb`.

**Edge Functions**
- `events`: new `nonEmptyString()` — an opted-out (or blank) `project` is stored as
  `NULL`, not `''`. This was a real bug: `typeof '' === 'string'` would have
  written an empty string, making "not consented" indistinguishable from "no
  title". Applied to both `usage_snapshots.project` and `quote_requests.project_name`.

**Tooling**
- `scripts/build-rbz.ps1` — builds the RBZ. **Necessary, not cosmetic:**
  PowerShell's `ZipFile::CreateFromDirectory` writes entries with backslashes on
  Windows, producing an archive where SketchUp extracts one file literally named
  `dirory_library\cloud.rb` and the extension fails to load. The script writes
  forward-slash entries and verifies the result (loader at root, no backslashes).

**Tests**
- `rls_test.sql` check 9: a non-consented snapshot stores `NULL` not `''`, and a
  vendor still cannot read `usage_snapshots`.

**Verified**
- `supabase/functions/**` typechecks clean under `--strict`.
- RBZ rebuilt and inspected: 9 entries, forward-slash names, loader at root, and
  the project-title gates present inside the *packaged* `cloud.rb`.
- Every panel JS callback has a matching Ruby handler (15/15, no orphans).
- `cloud.rb` is byte-clean ASCII again — my first edit introduced a mojibake `§`
  (U+00A7 written as one byte), which is fixed and re-verified at 0 non-ASCII.

**Not verified**
- No Ruby interpreter on this machine, so the `.rb` files were **not** parsed by
  Ruby. Comments and balance were checked by inspection only. Load the RBZ in
  SketchUp to confirm.
- The RLS suite still has **not been run** (no Docker/WSL/psql; brief §126).
- The privacy policy has not been reviewed by a lawyer.

## 0.2.0 — PRD v1.2 / plugin v0.5.1 reconciliation

Reconciled the backend against PRD v1.2 and RBZ v0.5.1.

**Finding: the plugin's server contract did not change.**
`cloud.rb` is byte-identical between v0.5.0 and v0.5.1 (17,793 bytes). The four
event kinds (`account`, `search_miss`, `usage_snapshot`, `quote_request`), the
envelope and `POST /events` are unchanged, so the ingest function needed no
compatibility work. The v0.5.1 features are local-only.

Changed files in the RBZ: `main.rb` (+3,341, favourites + brand logos),
`ui/panel.js` (+5,771, Favourite tab + pinned controls), `ui/panel.css` (+2,383),
`ui/panel.html` (+325). Three PNGs and `cloud.rb` unchanged.

**Schema (`0001_schema.sql`)**
- New `favourites` table (FR-A22 / Q15): per-profile starred + "Used before",
  keyed by `asset_id` once linked, or `legacy_key` before M6.
- `assets.legacy_key` — the plugin's local relative path (`relative_key` in
  main.rb), so pre-M6 favourites and usage rows can be linked to real assets.
- `vendors.logo_path` + `logo_source` enum, and `miss_tab` gains `favourite`.

**RLS (`0002_rls.sql`)**
- `favourites`: owner-only read/write, admin all. **Vendors and anon read
  nothing** — a favourite is a private demand signal, so it is treated like
  `search_misses`.
- `vendors_public_read` already exposed `logo_url`; no change needed there.

**Storage (`0004_storage.sql`)**
- New **public** `brands` bucket (FR-A24), 200 KB cap, image MIME allow-list.
  Public because the plugin draws logos on every card and cannot sign URLs for
  them. Write access stays with the owning vendor or an admin (FR-M13).
- `models` / `materials` remain private.

**Edge Functions**
- `catalog`: returns `brand_logos` (brand banner + Usage tab) and per-item
  `brand_logo`, `legacy_key` and `vendor_id` (FR-A24), matching the keys the
  v0.5.1 panel already reads from `send_library`.
- `events`: links `usage_snapshot_items.asset_id` via `assets.legacy_key`
  (PRD §9 mapping note) instead of leaving it null until M6. Wire format
  unchanged; header documents v0.5.0/v0.5.1 parity.
- `favourites` (new): `GET` / `POST` sync for M6. Not called by v0.5.1.

**Tests (`supabase/tests/rls_test.sql`)**
- Added check 7: favourites are invisible to other architects, to vendors and to
  anonymous callers, and cannot be written on another profile's behalf.
- Added check 8: brand logos are readable by anyone, but a non-owning vendor
  cannot delete one.

**Verified**
- `supabase/functions/**` typechecks clean under `--strict` (Deno URL imports
  and the `Deno` global stubbed for the check only).
- `apps/web` `npm run build` clean, 21 routes.
- `rls_test.sql` structure validated (balanced dollar-quotes, single top-level
  `declare`, well-formed exception block).

**Not verified — no local Postgres**
Docker, WSL and psql are all unavailable on this machine, so `supabase db push`
and the RLS suite were **not executed**. They must be run before relying on them
(see docs/SETUP.md §6).

## 0.1.0 — scaffold (M0–M5, M7 partial)

Initial monorepo scaffold built from PRD v1.1.

**Database (`supabase/migrations`)**
- `0001_schema.sql` — every table from PRD §9: profiles, installs, vendors,
  vendor_members, categories, assets, asset_versions, plans, subscriptions,
  invoices, ingest_log, search_misses, missing_requests, usage_snapshots,
  usage_snapshot_items, usage_history, daily_asset_usage, quote_requests,
  audit_log.
- `0002_rls.sql` — RLS on every table. Vendor isolation, admin-only demand
  tables, architect read rules, storage policies, auto-profile trigger, and a
  role-escalation guard.
- `0003_functions.sql` — `set_vendor_status`, `review_asset`,
  `submit_asset_version`, `rollup_daily_usage`, `write_audit`, plus an audit
  trigger on vendor status.
- `0004_storage.sql` — private `models` / `materials` buckets and per-vendor path
  policies.
- `0005_seed.sql` — platform brand "Dirory", taxonomy, four plans.

**Edge Functions (`supabase/functions`)**
- `events/index.ts` — `POST /events` per PRD §10: batch validation, event-id
  idempotency, per-install rate limit, snapshot upsert + history, search-miss
  aggregation into `missing_requests`, quote fan-out to vendors.
  v0.5.0-compatible.
- `catalog/index.ts` — `GET /catalog` returning the same hash shape as
  `scan_library` plus `asset_id`, `version`, `tile_size_cm` (FR-A7).

**Web app (`apps/web`)**
- Next.js 15 App Router, React 19, Tailwind. Magic-link auth, session middleware,
  role gates for `/admin` and `/vendor`.
- Admin: overview (KPIs, MRR, demand, audit), vendors (FR-M1), review queue
  (FR-M2), Dirory samples (FR-M12), taxonomy (FR-M3), plans (FR-M4), payments
  (FR-M5/M6), missing requests (FR-M10), usage explorer (FR-M11), quotes.
- Vendor: onboarding (FR-V1), dashboard with range selector (FR-V4), products
  with direct-to-storage upload and versioning (FR-V3), leads inbox (FR-V5),
  subscription + invoices (FR-V6), team (FR-V2), settings.

**Tooling**
- `scripts/upload-library.mjs` — push a local `Model/<Category>/<Brand>` /
  `Materials/...` tree into Supabase, with `--dry-run` and `--vendor`.
- `supabase/tests/rls_test.sql` — the M1 acceptance suite.
- `docs/SETUP.md`, `docs/PRD.md`, `AGENTS.md`, `README.md`.

**Verified**
- `npm run build` — clean, 21 routes.
- `npx tsc --noEmit` — clean.

**Not yet done (see PRD §13.3)**
- M6 device-code login (soft sign-in still the gate), signed download endpoint,
  server-side quotes with the consent form.
- M8 payment gateway webhook and the grace/expiry job.
- M9 hardening: emails, rate-limit tuning, privacy pages, signed `.rbz`,
  update banner.
