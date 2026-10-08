# Dashboard metrics — what the document asks for, and what we can actually show

Reconciliation of `Dirory Dashboard Metrics and Vendor Pricing.docx` against the
current database. Written so the founder can see, per metric, whether it is
**live**, **possible but not built**, **blocked on data we do not collect**, or
**in conflict with the PRD**.

## Two conflicts that need a decision

### C1. Vendor-visible search demand — the PRD forbids this in v1

The document asks vendors to see:

> "Searches in their category with no matching product — tells them what to digitize next."

The PRD says the opposite, twice:

- §241: a vendor must **never** read `search_misses`.
- Q12: *"Should vendors see demand insights (missing searches in their categories)?
  **Not in v1**; optional FR-V8 in v1.1."*

The brief (§148) says: *if the PRD and this brief disagree, stop and ask.* So this
is not built. Options:

1. Keep it admin-only (current behaviour, PRD-compliant).
2. Build it as an **aggregate count** for the vendor's own categories only —
   e.g. "12 searches in Sanitary had no match" — with no query text and no
   competitor data. This needs a PRD change to FR-V8 and a new RLS-safe function.
3. Do nothing until v1.1.

### C2. Pricing model — the document proposes a different one from the PRD

The document proposes **one-time digitization fees** (Table A), **packages**
(Table B), **annual listing as a % of the digitization fee** (Table C), **add-ons**
(Table D) and a **pilot offer** (Table E).

The PRD models something else:

- Q4: *"Flat tiers with an asset limit."*
- Q5: *"subscription only in v1."*
- The `plans` table is `(name, price_idr, period, max_assets)`.

These are compatible only if the packages map onto plans. Today the seeded plans
are Starter/Growth, monthly and yearly, priced in IDR with a product limit. The
document's numbers (Rp 5.000.000 Starter, Rp 25.000.000 Growth, plus per-product
digitization) do not match. **No pricing was changed.** Confirm which model wins,
then the `plans` rows and the public pricing page follow from that.

## Admin dashboard (document §1)

| Area | Metric | Status |
|---|---|---|
| Growth | Total downloads, new installs per day/week | **Possible** — `installs.first_seen` |
| Growth | DAU / WAU / MAU | **Possible** — `usage_snapshots.taken_at` per install |
| Growth | Install-to-first-use rate | **Possible** — installs with ≥1 snapshot |
| Growth | 30-day retention | **Possible** — installs active in two windows |
| Plugin health | SketchUp / plugin version distribution | **Live** — `installs` + `plugin_health_events` |
| Plugin health | Failed model loads, insert/paint failures, average load time | **Live since plugin 0.9.6** — `plugin_health_summary()` on Admin → Overview. Empty until 0.9.6 reports; earlier versions never sent it |
| Plugin health | Crash rate | **Partial** — failures are counted, but a hard SketchUp crash cannot report itself. A session that never sends its next beacon is the only signal |
| Library usage | Inserts per model, searches/day, top terms, top categories | **Possible** — `usage_snapshot_items`, `search_misses` |
| Library usage | Zero-result searches | **Live** — Admin → Missing requests |
| Content | Models published vs the 250 target | **Possible** |
| Content | Models by tier A/B/C | **Blocked** — no tier field |
| Content | Thumbnail coverage | **Possible** — `asset_versions.thumbnail_path` |
| Content | Models with zero inserts in 30 days | **Possible** |
| Production | Models per status | **Partial** — `assets.status` exists; the PRD's statuses differ from the document's "not started / in progress / review / published" |
| Production | Avg days per model, rejection/rework rate | **Possible** — `asset_versions.reviewed_at - created_at` |
| Production | Output per student | **Blocked** — no student or contributor field |
| Vendors | Pipeline stage, contract value, renewal, outstanding invoices | **Partial** — status + subscriptions + invoices exist; "contract value" is not a field |
| Revenue | MRR / ARR, revenue per vendor, revenue by tier | **Possible** — `invoices` + `subscriptions` + `plans` |
| Revenue | Digitization cost vs revenue (margin) | **Blocked** — no cost field |
| Users | Total, by occupation | **Live** — `profiles.occupation`, `user_occupation_counts()` |
| Users | By city / province | **Live, optional** — migration `0018` adds nullable `city`/`province`, asked once after the occupation question. Only answered accounts are counted; the rest show as "unknown" |
| Users | Repeat-use rate | **Possible** — installs with >1 snapshot day |
| Derived | Insert-to-save rate | **Blocked** — snapshots show current state, not saves |

## Vendor dashboard (document §2)

| Metric | Status |
|---|---|
| Total inserts (30 / 90 / all time) | **Live** — range picker on `/vendor` |
| Inserts per product, ranked | **Live** |
| Unique users who used their products | **Live** (`architects`) |
| Trend over time | **Live** (sparkline) |
| Searches that surfaced their products | **Blocked** — a search that *succeeds* is never reported; only misses are |
| Searches in their category with no match | **Conflict C1** |
| Share within their category | **Possible** — needs a new aggregate function |
| Geography (city / province) | **Blocked** — not collected |
| Catalog status (live / in review / outdated) | **Possible** — `assets.status` + versions |
| Monthly PDF / CSV report | **Partial** — CSV export exists; no scheduled PDF |

## Privacy rules that constrain all of the above

The document says: *"Do not show vendors individual user identities or emails…
make sure benchmarks never reveal a competitor's exact numbers."* That matches the
PRD, and it means:

- every vendor metric is an **aggregate** and is served by a `SECURITY DEFINER`
  function that checks membership itself (the pattern in migration `0012`);
- a category-share metric may return the vendor's own numbers and the category
  total, never another vendor's figures;
- `usage_snapshots.project` and `profile_id` stay admin-only.

## Status

Built:

1. Admin revenue + vendor pipeline (0.10.0).
2. Vendor catalog status (0.10.0).
3. Plugin health, end to end: migration `0016`, ingest support, plugin 0.9.6
   counters, and the Admin → Overview card (0.12.0).
4. Admin growth and engagement, content coverage and library usage — a new
   **Admin → Analytics** page backed by migration `0017` (0.13.0).
5. Vendor category share, on the vendor dashboard (0.13.0).

Decided: C2 pricing = the document's packages; C1 vendor-visible unmet searches
= admin-only for now.

Still **Blocked**, needing new collection rather than new queries: model tiers
A/B/C, digitization cost vs revenue, output per student, user geography,
insert-to-save rate, and search-success counts. This document does not invent
numbers for them.

A hard SketchUp crash cannot report itself; the nearest signal is a session that
stops sending its next health beacon.
