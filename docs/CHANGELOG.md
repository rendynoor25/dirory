# Changelog

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
