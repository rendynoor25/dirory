# Dirory — agent rules

- Source of truth: `docs/PRD.md`. If something is ambiguous, ask; do not invent scope.
- Stack: Next.js (TypeScript, App Router), Tailwind, Supabase (Postgres, Auth, Storage, Edge
  Functions), Ruby for the SketchUp plugin.
- Every table has RLS. Never use the service-role key in client code.
- Schema changes only via files in `supabase/migrations`. Never edit the DB by hand.
- Validate all inputs with Zod. Server-side checks for every role.
- Plugin: no external gems; HTTP via `Sketchup::Http::Request`; never block the UI thread; keep the
  catalogue hash shape identical to the current `scan_library` output; keep the sign-in gate in
  `Cloud.signed_in?`.
- `POST /events` must stay compatible with plugin v0.5.x (PRD §10) and be idempotent by event id.
  v0.5.0 and v0.5.1 send identical payloads — do not "modernise" the envelope.
- Vendors must never read project names, architect identities, or search misses except through
  consented quote requests.
- Write tests: RLS policy tests (SQL), unit tests for server actions and the ingest function, Ruby
  tests for pure functions.
- Small commits, one milestone at a time. Update `docs/CHANGELOG.md`.
