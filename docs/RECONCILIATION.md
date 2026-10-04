# Reconciliation — PRD v1.2 & RBZ v0.5.1 vs the scaffold

First deliverable required by `Dirory_OpenCode_Brief.md` §32. Read before coding.
Written 4 Oct 2026.

## Files read (fresh, this session)

| File | Size | Version |
|---|---|---|
| `D:\Dirory\Dirory_PRD.md` | 35,496 bytes | **v1.2** |
| `D:\Dirory\DiroryLibrary.rbz` | 156,792 bytes | **v0.5.1** |
| `D:\Dirory\Dirory_OpenCode_Brief.md` | 10,552 bytes | 4 Oct 2026 |
| `D:\Dirory\sample_library\` | 2,360 files | — |

RBZ contents: `dirory_library.rb` (515 B), `dirory_library/main.rb` (38,524 B),
`dirory_library/cloud.rb` (17,793 B), `ui/panel.{html,css,js}`, 3 PNGs.

**`cloud.rb` is byte-identical to the v0.5.0 I read on 29 Sep** (17,793 B). The four
event kinds, the envelope and `DEFAULT_API_BASE_URL` are unchanged, so the
`POST /events` contract is stable across v0.5.0 → v0.5.1.

## Brief vs. reality — three conflicts

| # | Conflict | Resolution |
|---|---|---|
| C1 | §30 says code lives at `D:\Dirory`; §28 says `D:\Dirory` is read-only input. The scaffold was at `C:\...\Default Project\dirory`. | **Founder decided:** moved the scaffold to `D:\Dirory\dirory`. `D:\Dirory`'s own files were not modified. |
| C2 | §18 puts plugin changes out of Phase 1; §25 forbids changing `cloud.rb`. But the requested consent prompt and optional project sharing both require plugin changes. | **Founder decided:** option C — privacy policy now; consent UI shipped as a separate v0.5.2 RBZ; deployed v0.5.1 and M6 untouched. |
| C3 | §30 says "keep building there" on top of the existing scaffold, but §9 says build the admin dashboard first and defer vendors. The scaffold already contains vendor screens. | Vendor screens **stay** in the repo (they are harmless and Phase 2 needs them) but are **not** extended in Phase 1. |

## Backend gaps against the brief

### G1 — Admin dashboard is partial (largest gap)

Present: overview, vendors (FR-M1), review queue (FR-M2), samples, taxonomy, plans,
payments, missing requests, usage explorer, quotes.

Missing versus §4:

| Brief | Requirement | Status |
|---|---|---|
| §4.1 | "No access" page for non-admins | Partial — redirects to `/vendor`, no dedicated page |
| §4.1 | MFA for admins | **Missing** — Supabase supports TOTP; not wired |
| §4.1 | Audit log viewer | **Missing UI** — `audit_log` is written but not browsable |
| §4.2 | Bulk approve / bulk reject | **Missing** |
| §4.2 | "Request changes" action | **Missing** (PRD has draft→pending→approved/rejected→archived only) |
| §4.2 | Uploader + submitted date in queue | Partial — date shown, uploader implicit |
| §4.3 | Browse *every* asset with filters + pagination | Partial — no `/admin/catalog`, no pagination |
| §4.3 | Edit metadata, unpublish/republish | **Missing** |
| §4.3 | Brand CRUD + logo upload + `logo_source` display | **Missing UI** (column + bucket exist) |
| §4.3 | Import status (counts per brand/category) | **Missing** |
| §4.4 | Search misses: date-range filter, CSV export | Partial — status filter present, date/CSV missing |
| §4.4a | Quote status `closed` | **Schema mismatch** — PRD enum is `new/contacted/won/lost`; brief says `new/contacted/closed` |
| §4.5 | Trends by day/week/month; top/bottom assets | **Missing** |
| §4.5 | Snapshots per project, anonymised unless consent | Partial — admin sees identity; needs consent gating |
| §4.6 | Users list, disable account | **Missing UI** (`installs`/`profiles` exist) |
| §4.6 | Admin accounts + role management | **Missing** |
| §4.7 | Favourites as aggregate counts only | **Not implemented** — no favourites view exists yet, so nothing leaks, but it must be built this way |

### G2 — Pagination, search and sorting are absent everywhere

§43 requires "search, filters, sorting and pagination" on every list. The current
screens load up to 50–200 rows with no paging. This is a cross-cutting gap, not a
per-screen one.

### G3 — Consent is not modelled separately from data collection

The plugin has **one** switch (`share_usage`) that gates both anonymous search
misses and the **project title** inside `usage_snapshot` (`cloud.rb` lines 330,
347). Under UU 27/2022 a project title is frequently personal data (client name,
site address) while a search term like "bathtub gold" is not. One switch cannot
lawfully cover both. See `docs/PRIVACY.md` §5.

### G4 — No privacy policy, no data-subject rights path

PRD §292 requires "a privacy policy and data-deletion path". Neither exists.
UU 27/2022 additionally requires a lawful basis, purpose limitation, retention
limits, and a way to exercise access/correction/deletion/objection.

### G5 — Deployment artefacts do not exist

§105–112 requires `Dockerfile`, `docker-compose.yml`, `Caddyfile`,
`.env.example`, `scripts/deploy.sh`, `docs/DEPLOY.md`, and a hardening runbook.
None exist. **Blocked on a domain** — Caddy cannot obtain a certificate for
`admin.<domain>.com` until DNS resolves, and no domain is registered yet.

### G6 — RLS suite has never been executed

It was still never run (no Docker/WSL/psql on the dev machine). §126 makes running
it on a real Supabase project the Phase 1 acceptance test.

## Assumptions I am making (confirm or correct)

1. **Quote status enum.** PRD says `won/lost`; brief §4.4a says `closed`. I follow
   the **PRD** (AGENTS.md: PRD is source of truth) and will note the discrepancy
   rather than change the schema.
2. **`admin.<domain>.com`.** The brief says `.com`, but the buyer earlier used an
   `.id` domain at Domainesia. Which TLD the `A` record points at is the founder's
   call; the Caddyfile will take the domain as a variable.
3. **Vendor screens remain in the repo** but are out of scope for Phase 1 work.
4. **The privacy policy is a draft.** It reflects what the code actually transmits,
   but I am not a lawyer and it needs professional review before launch.
5. **Consent for project titles defaults to off** (founder's decision), which
   differs from PRD Q10's current "on by default". The PRD should be updated.

## Suggested PRD corrections (founder to approve)

- §17: the line "Plugin v0.5.1 already implements the plugin side of the above
  (see §2)" sits under "What changed in 1.1" but belongs under 1.2. (Brief §149.)
- Q10: change the default for project titles to opt-in, separating it from
  anonymous usage counts.
- §9: add `favourites.consent`-style fields if per-purpose consent is to be stored
  server-side rather than only on the client.

## Not verified

- The RLS suite has still not been executed (no local Postgres; see G6).
- Nothing in this document was tested against a live Supabase project.
