# Dirory — Product Requirements Document

**Version:** 1.2 (draft) **Date:** 29 Sep 2026
**Working name:** Dirory (keep the product name in one config constant so it can be renamed later)

**What changed in 1.2** (plugin v0.5.1)
- New **Favourite** tab: star a product, and products inserted or painted before are listed automatically ("Used before"), so users do not repeat searches.
- **Search bar, tabs (All / Models / Materials / Favourite / Usage) and category/brand filters are pinned** at the top while the list scrolls; a new search or filter jumps back to the top of the results.
- **Brand logo space** in three places (§6.2a).
- Open questions Q14 (a "Request a product" button in addition to zero-result searches) and Q15 (syncing favourites).

**What changed in 1.1**
- Decided **Q1**: browsing and search are anonymous; **signing in is required to insert, paint, download or ask for a quote**.
- Decided **Q9**: free **sample assets owned by Dirory** exist, under a "Dirory" brand with no vendor.
- New: **search misses** — a search with 0 results across the whole library is sent to admin as a "missing request".
- New: **usage snapshot** — a simple table of the Dirory items used in the architect's SketchUp file, sent every few minutes. Vendor statistics are now derived from snapshots instead of per-click insert/paint events.
- Plugin **v0.5.1** already implements the plugin side of the above (see §2). Milestones (§13) are re-ordered to match.

---

## 1. Summary

Dirory is a multi-vendor 3D product library for Indonesian construction products, delivered inside SketchUp. Architects browse and insert branded models and materials for free. Vendors (brands) publish their products, see how architects use them, and receive quote requests. The platform owner (admin) curates content, sees what architects are looking for but cannot find, and collects subscription fees from vendors.

It is a **three-sided platform**:

| Side | Who | Surface | Pays? |
|---|---|---|---|
| **Architect** | Designers using SketchUp | SketchUp plugin (RBZ) | Free |
| **Vendor** | Brands / suppliers | Web portal | Monthly/annual subscription |
| **Admin** | Dirory team | Web back-office | Receives payment |

**Core value loop:** Vendors upload products → admin approves → architects insert them into real projects → usage and quote requests flow back to vendors → vendors see value and keep subscribing. **Second loop:** architects search for something that is missing → admin sees the demand → admin recruits a vendor or adds a sample → the catalogue grows.

## 2. Current state (DiroryLibrary.rbz v0.5.1)

The plugin still reads a **local library folder**, but now has the client side of the cloud features:

- HtmlDialog panel with tabs: All / Models / Materials / **★ Favourite** / Usage; category and brand filters; search with autocomplete. The search bar, tabs and filters stay pinned at the top while scrolling.
- Folder convention: `<root>/Model/<Category>/<Brand>/<file>.skp` and `<root>/Materials/<Category>/<Brand>/<image>.jpg`. **An item with no brand folder is a free Dirory sample** (brand "Dirory", "Free sample" badge, cannot be quoted).
- Insert model, apply material (Paint Bucket), tile size from filename plus 3 mm grout, `Dirory` attribute tag on everything inserted, Usage tab computed from the model itself, Ask for a Quote via WhatsApp, CSV export.
- **Soft sign-in (new):** name + email (phone, firm optional), stored locally, **not verified**. Insert, paint and quote are blocked until signed in; the click is replayed after signing in. Browsing and search stay anonymous.
- **Search misses (new):** search terms with 0 results in the *whole* library (ignoring tab/category/brand filters), at least 3 characters, after a 1.2 s typing pause, are queued. Refinements of the previous miss within 60 s replace it; duplicates are dropped.
- **Usage snapshot (new):** every 5 minutes (configurable) the plugin reads the active model and queues a table of used Dirory items — only if the model changed (SketchUp transaction observer) and the table differs from the last one. Latest snapshot per model wins.
- **Outbox (new):** everything is queued in `~/.dirory/outbox.json` and sent in batches to `POST <API URL>/events` with `Sketchup::Http::Request`. Nothing is lost while offline or before the server URL is set (Extensions ▸ Dirory ▸ Connection Settings). Extensions ▸ Dirory ▸ Cloud Status / Send Usage Now help testing.
- **"Help brands and Dirory see demand" switch (new)** in the account dialog turns snapshots and search reports off.

**Still missing:** cloud catalogue and downloads, verified login, server, vendor portal, admin back-office, billing.

## 3. Goals and non-goals

### Goals
1. Architects find and use any approved model/material in two clicks, at no cost.
2. Vendors self-serve: upload, track approval, see per-product usage and quote requests, receive leads.
3. Admin approves/rejects content and vendors, sees **what architects search for but cannot find**, and confirms subscription payments.
4. Only vendors with an active subscription have products visible to architects; **Dirory's own free samples are always visible**.
5. Usage data reaches the server with a small, predictable footprint (a table every few minutes, never files or geometry).
6. All three sides are buildable by an AI coding agent in small, testable milestones.

### Non-goals (v1)
- Revit / ArchiCAD / other plugins (design the API so they can be added later).
- In-app checkout or e-commerce.
- Automated 3D quality validation (manual admin review in v1).
- Per-click tracking of every insert/paint action (see §6.5).
- Multi-language UI (English + Bahasa Indonesia can come in v1.1).

## 4. Users and personas

- **Architect / designer** — uses SketchUp daily, wants correct dimensions and real brand products fast. Cares about privacy and not being spammed.
- **Vendor marketing/sales person** — wants leads and proof of exposure. Not technical; uploads from a browser.
- **Admin** — 1–3 internal staff; reviews content, watches demand, follows up payments.

## 5. Recommended architecture

Chosen to minimise moving parts for an AI-agent build. (Assumption — confirm before starting; see §14.)

| Layer | Choice | Why |
|---|---|---|
| Database + Auth + File storage | **Supabase** (Postgres, Auth, Storage, Row Level Security) | One service covers DB, login, files, signed URLs. |
| Web apps (vendor + admin) | **Next.js (TypeScript) + Tailwind + shadcn/ui**, one repo, routes `/vendor/*` and `/admin/*` | One codebase, role-gated. |
| Plugin API | Supabase REST + **Edge Functions** (`/events` ingest, quote submit, payment webhook) | Thin server. |
| Payments | **Midtrans or Xendit** invoices (VA, QRIS, cards) + **manual bank-transfer confirmation** | Local payment methods. |
| Plugin | Existing Ruby + HtmlDialog. HTTP via `Sketchup::Http::Request` (SketchUp 2021+). | No external gems. |
| Email | Resend or Supabase SMTP | Approval / lead / invoice notifications. |

**Monorepo layout**
```
dirory/
  AGENTS.md              # rules for the coding agent (see §13)
  apps/web/              # Next.js: vendor + admin portals
  supabase/migrations/   # SQL schema + RLS policies
  supabase/functions/    # edge functions (events ingest, quotes, payment webhook)
  plugin/                # Ruby extension (start from RBZ v0.5.1: main.rb, cloud.rb, ui/)
  docs/PRD.md
```

## 6. Side 1 — Architect (SketchUp plugin)

### 6.1 Account (Q1 decided)
- **FR-A1** **Anonymous:** open the panel, browse, filter, search, view the Usage tab.
- **FR-A2** **Requires sign-in:** insert a model, apply a material, download an asset, Ask for a Quote. This includes Dirory's free samples. If the user clicks while signed out, a sign-in form appears and the click continues after signing in. The rule is enforced in the Ruby code, not only in the panel.
- **FR-A3** Profile: name and email required; phone and firm optional.
- **FR-A4** **v0.5 (built): soft sign-in** — unverified details stored in SketchUp settings and sent as an `account` event. **M6 replaces it with a verified login** (device-code flow: the plugin opens the browser to `/auth/device`, the user signs in with email magic link or Google, the plugin polls and stores a token). The single gate `Cloud.signed_in?` is the only code that changes.
- **FR-A5** Every install has a random `install_id` (UUID) so anonymous search misses can be counted per install without knowing who it is.
- **FR-A6** Account dialog: shows who is signed in, Sign out, and the **"Help brands and Dirory see demand"** switch (default on; explains exactly what is sent). Off = no snapshots, no search reports.

### 6.2 Catalogue and Dirory samples (Q9 decided)
- **FR-A7** Replace `scan_library` with `fetch_catalog`, returning the **same hash shape** (`id, name, type, category, brand, sample, tags, thumbnail, model_path, material_path`) plus `asset_id`, `version`, `tile_size_cm`. Panel and insert/apply code stay unchanged.
- **FR-A8** **Dirory samples:** assets owned by the platform, shown under the brand **"Dirory"** with a "Free sample" badge. They are visible whether or not any vendor subscribes, need no vendor, and **cannot be quoted** (their Usage-tab checkbox is disabled). They still count in usage statistics for admin.
- **FR-A9** Panel views: Categories (models and materials separately) and Brands (choose a brand → its catalogue by category); "Dirory" appears as a brand like any other. Only approved assets of vendors with an active subscription appear, plus samples.
- **FR-A10** Catalogue is cached locally with `updated_since` sync; downloaded items work offline.

### 6.2a Favourites, pinned controls and brand logos (new)
- **FR-A22 Favourite tab:** every card has a ☆ button (it does not insert or paint). The tab lists **★ Starred** items first, then **Used before** (the last 60 inserted or painted items, most recent first, added automatically). Search and the category/brand filters work inside the tab. Stored per computer, by the item's path inside the library, so moving the library folder keeps them. **From M6:** stored on the server per account so they follow the user across computers, keyed by `asset_id`.
- **FR-A23 Pinned controls:** search bar, tabs and filters remain visible while scrolling; the Usage toolbar sits directly below them. Changing the search, tab or filter scrolls the list back to the top.
- **FR-A24 Brand logo, three places:**
  1. **Brand banner** above the list when a brand is chosen in the filter: large logo (44 px), brand name, number of models/materials, "Show all brands" button. This is the main brand space.
  2. **Logo chip** on the bottom-left corner of each product thumbnail (small; drawn only when a logo exists).
  3. **Usage tab:** logo before each brand name (and later in the quote dialog).
  - Fallback when there is no logo: a round letter with the brand's first character. Dirory's own brand uses the Dirory logo.
  - **Local library (v0.5.1):** `<library>/Brands/<Brand name>.png` (also jpg, jpeg, webp, svg); the file name must match the brand folder name, not case-sensitive.
  - **Cloud (M3+):** the vendor uploads it at registration (`vendors.logo_url`); recommended square, transparent PNG or SVG, at least 256 × 256 px, under 200 KB; admin checks it during vendor approval.
  - Later, with many brands, add a scrolling **brand strip** of logo tiles above the list; not needed for v1.

### 6.3 Download, insert, paint
- **FR-A11** On click (signed in), the plugin downloads through a **short-lived signed URL** to `<user cache>/Dirory/<asset_id>/<version>/`, then runs the existing insert/paint logic.
- **FR-A12** Entities are tagged in the `Dirory` attribute dictionary with `asset_id` (UUID) in addition to existing fields; legacy path-based ids stay readable. A missing/empty brand is read as "Dirory".
- **FR-A13** Material tile size comes from the server field `tile_size_cm` (fallback: filename parse). Keep the 3 mm grout constant.

### 6.4 Search misses (new)
- **FR-A14** When a search returns **0 results across the whole library** (not merely inside the current tab, category or brand filter), the plugin reports it. Rules (built in v0.5): normalised text (lower-case, single spaces), 3–120 characters, sent after a 1.2 s typing pause, at most once per query per session, a refinement of the previous miss within 60 s replaces it.
- **FR-A15** The architect sees a message: *"No results for “…”. It isn't in the library yet — we've noted your search so the Dirory team can add it."* (or just "No results" when sharing is off).
- **FR-A16** Payload: `query`, `tab` (`all`/`model`/`material`) plus the envelope (install id, user if signed in, plugin/SketchUp version, platform). Works for anonymous users.

### 6.5 Usage snapshot and Get Quote
- **FR-A17** **Usage snapshot** = one simple table per SketchUp file. Columns per row: `type, asset, name, category, brand, qty, faces, area_m2` (`qty` for models, `faces` and `area_m2` for materials; only used items). Header fields: `model_id` (the SketchUp model GUID), `project` (file title), totals.
- **FR-A18** **Cadence:** every 5 minutes by default (configurable), for the active model. It is skipped when the model has not changed since the last check (transaction observer marks it dirty) and when the table is identical to the last one sent (SHA-1). If the user removes everything, one empty snapshot is sent so the server clears the project. The server keeps the **latest snapshot per (install, model)** and a history for trends.
- **FR-A19** The plugin never sends geometry, files, file paths or thumbnails.
- **FR-A20** **Get Quote** is available for vendor brands only (not "Dirory"). v0.5 keeps the WhatsApp hand-off and additionally queues a `quote_request` event (brands + the items and quantities of those brands). From M6 the quote is created server-side with a consent form (project name, city, timeline, phone, note; a switch for sharing optional details) and creates one `quote_request` per vendor containing only that vendor's items; the WhatsApp link stays as an optional extra.
- **FR-A21** CSV export stays.

### 6.6 Delivery to the server (outbox)
- All messages are written to a local queue first and sent in batches of up to 50 to `POST /events` (see §10), every 60 seconds and after a quote. A message leaves the queue only after a 2xx answer. The queue holds at most 1,000 entries (oldest dropped). Sending is asynchronous and never blocks SketchUp.
- Message kinds: `account`, `search_miss`, `usage_snapshot`, `quote_request`. Every message has a UUID so the server can ignore duplicates.

## 7. Side 2 — Vendor (web portal)

- **FR-V1 Registration:** company name, brand name(s), logo, contact person, phone/WhatsApp, email, website, NPWP (optional). Status `pending` until admin approves.
- **FR-V2 Team:** one owner + optional staff logins (owner / editor).
- **FR-V3 Asset upload:**
  - Model: `.skp` (max size configurable, default 50 MB), thumbnail, name, category, tags, optional dimensions/SKU/product URL.
  - Material: image (jpg/png), tile size (W×H cm), category, name.
  - Bulk upload with the filename as the default name.
  - Status: `draft → pending_review → approved | rejected (with reason) → archived`.
  - Editing an approved asset creates a **new version** that goes through review; the old version stays live until approved.
- **FR-V4 Dashboard** (range: 7 / 30 / 90 days / custom) — metrics come from usage snapshots and quotes:
  - **Projects using** the product (distinct SketchUp projects whose latest snapshot includes it).
  - **Units placed** (models) and **painted area m²** (materials) in those projects.
  - **Architects** (distinct, signed-in only) and **Quote requests**.
  - Per-product table with trend sparkline, sortable, CSV export.
  - The vendor never sees project names or architect identities from snapshots; those appear only on a quote request the architect chose to send.
- **FR-V5 Leads inbox:** quote requests (date, architect, project, city, items, quantities/areas, note). Status `new → contacted → won / lost`. Email on new lead. Vendor sees only what the architect consented to share. CSV export.
- **FR-V6 Subscription:** current plan, renewal date, invoices, pay/renew, plan limits.
- **FR-V7 Notifications:** approval/rejection, lead received, invoice due, subscription expiring.
- **FR-V8 (optional, v1.1) Demand insights:** top missing-request searches that match the vendor's categories — a reason to upgrade or add products.

## 8. Side 3 — Admin (web back-office)

- **FR-M1 Vendor approval:** approve / reject / suspend vendors.
- **FR-M2 Asset review queue:** preview thumbnail, download the file, see metadata, approve or reject with a mandatory reason; bulk approve; checklist (file opens, correct scale, sensible name/category, no unrelated branding, size within limit).
- **FR-M3 Taxonomy:** categories (model and material trees), brands, tags.
- **FR-M4 Plans and pricing:** name, price, period, limits (e.g. max published assets, lead export).
- **FR-M5 Payments:** invoices; online payments via gateway webhook; **mark manual bank transfers as paid** with proof upload; receipts; MRR and overdue vendors.
- **FR-M6 Subscription rules:** on activation the vendor's approved assets become visible. On expiry: 7-day grace, then hidden (not deleted); they return on renewal. Dirory samples are never affected.
- **FR-M7 Platform analytics:** architects (total, active in 30 days), snapshots received, projects using Dirory, top products, quote requests — per vendor and per category.
- **FR-M8 Moderation:** take down any asset immediately; audit log of all admin actions.
- **FR-M9 Users:** search architects, disable accounts, export (subject to privacy policy).
- **FR-M10 Missing requests (new):** every search miss, grouped by normalised query.
  - Columns: query, times searched, distinct installs, signed-in vs anonymous share, tab (model/material/both), first seen, last seen.
  - Sort by count or recency; filter by status and date.
  - Status: `new → planned → added` or `ignored`; optional category, note, and a link to the asset that resolved it.
  - Merge similar queries ("toto closet", "closet toto") into one request; export CSV.
  - Purpose: decide which sample to create or which brand to recruit.
- **FR-M11 Usage explorer (new):** per architect and project, the latest snapshot table (what they use), last update time, item count; filter by brand/product; export CSV. Internal only.
- **FR-M13 Vendor logos:** check the uploaded logo (square, readable on white) when approving a vendor; replace it on the vendor's behalf if needed.
- **FR-M12 Dirory samples (new):** upload and manage assets under the platform brand "Dirory". Admin-created samples skip the review queue; they are visible without a subscription and excluded from quotes and from vendor dashboards.

## 9. Data model (Postgres)

```
profiles(id uuid pk → auth.users, role enum['architect','vendor_owner','vendor_staff','admin'],
         full_name, phone, firm, verified bool, created_at)
installs(id uuid pk /* plugin install_id */, profile_id null, plugin_version, su_version, platform,
         first_seen, last_seen)

vendors(id, name, brand_name, logo_url, whatsapp, email, website, npwp,
        is_platform bool default false,   -- true only for the "Dirory" sample brand
        status enum['pending','approved','suspended'], approved_at, created_at)
vendor_members(vendor_id, profile_id, role enum['owner','editor'])

categories(id, type enum['model','material'], name, parent_id, sort)
assets(id, vendor_id, type enum['model','material'], category_id, name, tags text[],
       sku, product_url, tile_w_cm, tile_h_cm,
       status enum['draft','pending_review','approved','rejected','archived'],
       current_version_id, created_at)      -- assets of the is_platform vendor = free samples
asset_versions(id, asset_id, version int, file_path, thumbnail_path, file_size,
               review_status enum['pending','approved','rejected'], review_note,
               reviewed_by, reviewed_at)

plans(id, name, price_idr, period enum['monthly','yearly'], max_assets, active)
subscriptions(id, vendor_id, plan_id, status enum['trial','active','grace','expired','cancelled'],
              current_period_start, current_period_end)
invoices(id, vendor_id, subscription_id, amount_idr, status enum['unpaid','paid','void'],
         gateway enum['midtrans','xendit','manual'], gateway_ref, proof_path, paid_at, due_at)

ingest_log(id uuid pk /* client event id: idempotency */, install_id, kind, received_at)

search_misses(id uuid /* event id */, install_id, profile_id null, query_norm, tab, created_at)
missing_requests(id, query_norm unique, miss_count, distinct_installs, first_seen, last_seen,
                 status enum['new','planned','added','ignored'], category_id null, note,
                 merged_into null → missing_requests, resolved_asset_id null → assets)

usage_snapshots(id, install_id, profile_id null, model_id text, project text, totals jsonb,
                taken_at, unique(install_id, model_id))         -- latest state (upserted)
usage_snapshot_items(snapshot_id, asset_key text, asset_id null → assets, type, name, category,
                     brand, qty int, faces int, area_m2 numeric)
usage_history(id, install_id, model_id, taken_at, items jsonb)  -- append-only, 12-month retention
daily_asset_usage(day, asset_id, vendor_id, projects int, units int, area_m2, quotes int) -- nightly rollup

quote_requests(id, architect_id, vendor_id, project_name, city, timeline, note,
               phone_shared bool, items jsonb,  -- [{asset_id, name, qty, area_m2}]
               status enum['new','contacted','won','lost'], created_at)

audit_log(id, actor_id, action, entity, entity_id, meta jsonb, created_at)
```

**Mapping note:** until the cloud catalogue exists (M6), the plugin's `asset` value is the *relative path* in the local library (e.g. `Model/Closet/Toto/CW 630 PJ.skp`). The ingest function stores it as `asset_key` and links `asset_id` by matching brand + category + name when possible. From M6 the plugin sends the `asset_id` UUID.

**Row Level Security (must be written and tested):**
- Architects: read approved assets of active vendors and all assets of the platform vendor; write only their own profile and quote requests.
- Vendors: read/write only rows with their `vendor_id`; **cannot read other vendors' stats or leads**; cannot approve their own assets; **never read `usage_snapshots.project`, `profile_id` or `search_misses`**.
- Admin: full access; all admin actions write `audit_log`.
- The `/events` function writes with the service role after validating input; clients never write these tables directly.
- Storage: buckets `models` and `materials` are private; downloads only via signed URLs for approved assets of active vendors, or platform samples.

## 10. API surface (plugin ↔ backend)

| Endpoint | Purpose |
|---|---|
| `POST /events` | Batch ingest from the plugin (see below) |
| `POST /auth/device/start`, `POST /auth/device/poll` | Device-code login (M6) |
| `GET /catalog?updated_since=` | Approved catalogue incl. Dirory samples (M6) |
| `GET /assets/:id/download` | Signed URL for the current approved version (M6) |
| `POST /quotes` | Server-side quote creation with consent (M6) |
| `POST /webhooks/payment` | Gateway callback → mark invoice paid, extend subscription |

**`POST /events`** (already used by plugin v0.5.x)
```json
{
  "install_id": "uuid",
  "user": { "name": "…", "email": "…", "phone": "", "firm": "" },     // null when signed out
  "plugin_version": "0.5.1", "su_version": "24.0.553", "platform": "win",
  "events": [
    { "id": "uuid", "kind": "search_miss",    "ts": "2026-09-29T03:10:00Z",
      "data": { "query": "bathtub gold", "tab": "all" } },
    { "id": "uuid", "kind": "usage_snapshot", "ts": "…",
      "data": { "model_id": "guid", "project": "House Rina",
                "items": [ { "type":"model","asset":"Model/Closet/Toto/CW 630 PJ.skp","name":"CW 630 PJ",
                             "category":"Closet","brand":"Toto","qty":2,"faces":0,"area_m2":0 },
                           { "type":"material","asset":"Materials/Tiles/ROMAN/Dark Grey01.jpeg","name":"Dark Grey01",
                             "category":"Tiles","brand":"ROMAN","qty":0,"faces":18,"area_m2":12.4 } ],
                "totals": { "models": 2, "area_m2": 12.4 } } },
    { "id": "uuid", "kind": "quote_request",  "ts": "…", "data": { "brands": ["Toto"], "items": [ … ] } },
    { "id": "uuid", "kind": "account",        "ts": "…", "data": { "action": "sign_in" } }
  ]
}
```
- Answer 2xx only when the whole batch is stored; the plugin then deletes it from its queue. Duplicates (same `id`) are accepted and ignored.
- `usage_snapshot` upserts on `(install_id, model_id)`, appends to `usage_history`, and an empty `items` list clears the project.
- `search_miss` increments the matching `missing_requests` row (create if new).
- Auth: `apikey` / `Authorization: Bearer <anon key>` headers, configured in the plugin's Connection Settings. Rate-limit per install; reject payloads over a size limit; validate every field with a schema.

## 11. Non-functional requirements

- **Performance:** catalogue sync < 3 s for 5,000 assets after first load; the snapshot walk runs only after a model change and is skipped otherwise; HTTP is async and never blocks the SketchUp UI.
- **Reliability:** local outbox survives offline use and restarts; idempotent ingest; latest-wins for snapshots.
- **Security:** RLS on every table; signed URLs ≤ 10 min; upload validation (extension, MIME, size); rate limits on `/events` and `/quotes`; secrets only in env vars. Soft sign-in is **unverified** — treat its emails as untrusted until M6.
- **Privacy:**
  - The plugin sends only the item table, the project title and the account fields; never geometry, files or paths.
  - **Vendors see aggregates only**; project names and architect identities reach a vendor only through a quote the architect chose to send.
  - Snapshots and search reports can be switched off by the architect; the switch and the data collected are explained in the sign-in dialog.
  - Provide a privacy policy and data-deletion path (Indonesia's Personal Data Protection Law, UU PDP). Retention: snapshot history 12 months; raw search misses 24 months.
- **Compatibility:** SketchUp 2021+ (`Sketchup::Http`), Windows first, macOS second.
- **Observability:** error logging in web and plugin (opt-in); "Cloud Status" menu in the plugin for support.
- **Distribution:** signed `.rbz`, in-panel "update available" banner; later Extension Warehouse.

## 12. Success metrics

| Metric | Target (first 6 months, placeholder) |
|---|---|
| Vendors onboarded (approved) | 10 |
| Paying vendors | 5 |
| Approved assets (excl. samples) | 500 |
| Monthly active architects (signed in) | 300 |
| Projects with at least one Dirory item / month | 200 |
| Quote requests / month | 100 |
| Vendor renewal rate | ≥ 70% |
| Missing requests turned into assets ("added") | ≥ 30% of the top 50 |

## 13. Build plan for OpenCode

### 13.1 How to run it
1. Create the repo and put this PRD at `docs/PRD.md`. Copy the current plugin source (unzipped RBZ v0.5.1) into `plugin/`.
2. Add `AGENTS.md` (OpenCode reads it automatically) with the rules below.
3. Work **one milestone per session**. Start in *plan* mode: ask the agent to restate the milestone and list the files it will touch; approve; then switch to *build* mode.
4. End every milestone with: tests pass → migration applied → commit. Do not start the next milestone in the same session.
5. Use a stronger reasoning model for M1 (schema + RLS), M5 (ingest) and M8 (payments); a cheaper, faster model is fine for UI-heavy milestones (M2, M3, M4, M7).

### 13.2 Suggested `AGENTS.md`
```
# Dirory — agent rules
- Source of truth: docs/PRD.md. If something is ambiguous, ask; do not invent scope.
- Stack: Next.js (TypeScript, App Router), Tailwind + shadcn/ui, Supabase (Postgres, Auth, Storage, Edge Functions), Ruby for the SketchUp plugin.
- Every table has RLS. Never use the service-role key in client code.
- Schema changes only via files in supabase/migrations. Never edit the DB by hand.
- Validate all inputs with Zod. Server-side checks for every role.
- Plugin: no external gems; HTTP via Sketchup::Http::Request; never block the UI thread; keep the catalogue hash shape identical to the current scan_library output; keep the sign-in gate in Cloud.signed_in?.
- POST /events must stay compatible with plugin v0.5.x (PRD §10) and be idempotent by event id.
- Vendors must never be able to read project names, architect identities, or search misses except through consented quote requests.
- Write tests: RLS policy tests (SQL), unit tests for server actions and the ingest function, Ruby tests for pure functions (parsing, quote message, query normalisation).
- Small commits, one milestone at a time. Update docs/CHANGELOG.md.
```

### 13.3 Milestones

| # | Milestone | Deliverable | Acceptance test |
|---|---|---|---|
| **M0** | Repo + Supabase project + auth | Monorepo scaffold, env setup, login page, role guards for `/vendor` and `/admin` | A vendor cannot open `/admin`; admin can |
| **M1** | Schema + RLS | All tables in §9 (incl. `installs`, `search_misses`, `missing_requests`, snapshots, platform vendor "Dirory"), seed data, RLS + SQL tests | Vendor A cannot read vendor B's assets/leads/stats; a vendor cannot read `search_misses` or snapshot project names |
| **M2** | Admin: vendors, taxonomy, plans, **Dirory samples** | Vendor approval, categories CRUD, plan CRUD, upload/manage samples under brand "Dirory" | Approving a vendor writes an audit row; a sample is visible with no subscription |
| **M3** | Vendor: registration + asset upload | Registration, team, single + bulk upload, statuses, versioning | Uploaded asset appears in the admin queue as `pending_review` |
| **M4** | Admin: review queue | Preview, download, approve/reject with reason, bulk approve, emails | Approved asset becomes `approved`; rejection reason shows to the vendor |
| **M5** | **`/events` ingest + admin demand screens** | Edge function per §10, idempotency, rate limit; admin **Missing requests** (FR-M10) and **Usage explorer** (FR-M11) | Point plugin v0.5.x at the function (Connection Settings): a 0-result search appears in Missing requests with the right count; editing a SketchUp file produces an updated snapshot within ~5 min; replaying the same batch changes nothing |
| **M6** | Plugin cloud catalogue + verified login | Device-code login replacing soft sign-in, `fetch_catalog`, signed download, cache, samples, server-side quotes with consent | Fresh SketchUp: sign in → browse → insert a model and paint a material from cloud assets; sample cannot be quoted |
| **M7** | Vendor dashboard + leads inbox | KPI cards, per-product table, charts from snapshots + rollup, lead status, CSV export | Dashboard numbers equal the snapshot tables for the range; vendor cannot see project names |
| **M8** | Subscription + payments | Invoices, gateway + webhook, manual transfer confirmation, grace/expiry job, visibility rule | Paying an invoice activates the vendor's assets; expiry hides them after grace; samples unaffected |
| **M9** | Hardening + release | Rate limits, error logging, privacy pages, signed `.rbz`, update banner, demo vendor | End-to-end demo passes for all three sides |

*Tip:* M5 only needs M0 and M1. If you want demand data (missing requests, usage) as early as possible, build M5 right after M1 and distribute plugin v0.5.x to a few architects.

### 13.4 Prompt template per milestone
> Read `docs/PRD.md` and `AGENTS.md`. We are doing **M{n}: {name}**. First, in plan mode, list the requirements from the PRD that apply (with FR ids), the files you will create or change, and any question you have. Wait for my approval. Then implement, run tests, and summarise what changed and what is left.

## 14. Open questions and assumptions

| # | Question | Status / default |
|---|---|---|
| Q1 | Must architects sign in just to browse? | **Decided:** browse and search anonymously; sign in to download, insert, paint or quote |
| Q2 | Stack: Supabase + Next.js OK? Any data-residency constraint? | Supabase + Next.js on Vercel |
| Q3 | What happens to a vendor's assets when its subscription lapses? | 7-day grace, then hidden (not deleted); Dirory samples unaffected |
| Q4 | Pricing model: flat tiers, or by number of assets / leads? | Flat tiers with an asset limit |
| Q5 | Will vendors pay per lead in future? | No, subscription only in v1 |
| Q6 | Payment gateway: Midtrans or Xendit? Is manual transfer enough for the first vendors? | Gateway + manual fallback |
| Q7 | Who owns the rights to uploaded models (licence for architects)? | Vendor grants a free-use licence; terms of service before launch |
| Q8 | Keep WhatsApp as a quote channel? | Yes, as an optional extra after the server-side quote |
| Q9 | Free samples without a vendor? | **Decided:** yes, brand "Dirory", always free and visible, not quotable |
| Q10 | Should sharing usage snapshots and search misses be **on by default** (current) or **opt-in**? | On by default with a clear notice and a switch; **needs a legal check under UU PDP before public launch** |
| Q11 | Do free samples also require sign-in? | Yes (same rule as everything else); revisit if it hurts first-time adoption |
| Q12 | Should vendors see demand insights (missing searches in their categories)? | Not in v1; optional FR-V8 in v1.1 |
| Q13 | Should architects be notified when something they searched for gets added? | Not in v1 (needs verified emails, so after M6) |
| Q14 | Add a "Request a product" button besides the automatic zero-result report? | Recommended: a small link inside the zero-result message that opens a short form (search text pre-filled, optional brand, size/link, note); no permanent big button. Not built yet |
| Q15 | Should Favourites sync across computers? | Local in v0.5.1; server-side per account from M6 |

## 15. Risks

- **Vendor demand** (the previous version was paused for lack of paying customers): offer a trial period, make the dashboard and leads the first thing a vendor sees, and validate willingness to pay with 3–5 vendors before M8. **Missing requests give you evidence to show vendors what architects ask for.**
- **Content cold start:** seed the catalogue with Dirory samples and a few well-known brands; use missing requests to choose what to add next.
- **Snapshot meaning:** snapshots show what is *currently in a file* (after undo/delete), not how many times someone clicked; that is the more honest number for vendors but lower than click counts. Only items inserted with Dirory (tagged) are counted; a user can copy them into another file or rename definitions.
- **Soft sign-in is unverified:** fake or mistyped emails are possible until M6. Do not use these emails for marketing or vendor leads before verification.
- **Privacy/consent:** default-on data sharing (Q10) and project titles in snapshots need legal review; keep titles admin-only.
- **Model file quality/size:** heavy `.skp` files slow SketchUp; enforce size limits and manual review.
- **Payment reconciliation:** manual transfers need a clear admin workflow and proof upload.
