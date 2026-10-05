# Changelog

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
