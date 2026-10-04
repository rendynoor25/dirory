# Dirory

Multi-vendor 3D product library for Indonesian construction products, delivered inside SketchUp.

- **Architect** — SketchUp plugin (RBZ). Free. Browse/search anonymously; sign in to insert, paint, download, quote.
- **Vendor** — web portal. Publishes products, sees aggregate usage and leads, pays a subscription.
- **Admin** — back-office. Approves vendors/assets, manages taxonomy/plans/samples, watches demand, confirms payments.

Source of truth: `docs/PRD.md` (PRD v1.1). Read it before changing scope.

## Layout

```
dirory/
  apps/web/              Next.js (App Router) vendor + admin portals
  supabase/migrations/   SQL schema, RLS policies, seed and storage buckets
  supabase/functions/    Edge Functions (events ingest, payment webhook)
  scripts/               Local helpers (library upload, seeding)
  docs/PRD.md            Product requirements
  AGENTS.md              Rules for the coding agent
```

## Stack

| Layer | Choice |
|---|---|
| DB / Auth / Storage | Supabase (Postgres, Auth, Storage, RLS) |
| Web apps | Next.js + TypeScript + Tailwind |
| Plugin API | Supabase REST + Edge Functions |
| Payments | Midtrans / Xendit + manual bank transfer |
| Plugin | Ruby + HtmlDialog (SketchUp 2021+) |

## Quick start

```bash
# 1. Install the Supabase CLI (one-off, no admin needed)
npm i -g supabase

# 2. Link this folder to your cloud project (ref from the Supabase dashboard URL)
cd supabase
supabase login
supabase link --project-ref <your-project-ref>

# 3. Push the schema + seed
supabase db push

# 4. Deploy the plugin ingest function
supabase functions deploy events --no-verify-jwt

# 5. Run the web app
cd ../apps/web
cp .env.example .env.local     # fill in the two NEXT_PUBLIC_* values
npm install
npm run dev                    # http://localhost:3000
```

First admin: sign in once with your email, then in the Supabase SQL editor run

```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
```

See `docs/SETUP.md` for the full Supabase + Vercel + Domainesia + payment walkthrough.
