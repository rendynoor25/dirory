-- Dirory - schema (PRD section 9)
-- 0001_schema.sql : extensions, enums, tables, indexes.
-- Run order: 0001 (schema) -> 0002 (RLS) -> 0003 (functions) -> 0004 (storage) -> 0005 (seed).

-- gen_random_uuid() is built into Postgres 13+ (Supabase runs 15), so it needs
-- no extension. This project ran `uuid-ossp` first and `uuid_generate_v4()`
-- failed with "function does not exist" because the extension created on the
-- line above is not visible to statements later in the same batch.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type profile_role       as enum ('architect','vendor_owner','vendor_staff','admin');
create type vendor_status      as enum ('pending','approved','suspended');
create type vendor_member_role as enum ('owner','editor');
create type category_type      as enum ('model','material');
create type asset_type         as enum ('model','material');
create type asset_status       as enum ('draft','pending_review','approved','rejected','archived');
create type review_status      as enum ('pending','approved','rejected');
create type plan_period        as enum ('monthly','yearly');
create type subscription_status as enum ('trial','active','grace','expired','cancelled');
create type invoice_status     as enum ('unpaid','paid','void');
create type invoice_gateway    as enum ('midtrans','xendit','manual');
create type request_status     as enum ('new','planned','added','ignored');
create type quote_status       as enum ('new','contacted','won','lost');
create type miss_tab           as enum ('all','model','material','favourite');

-- FR-A24: where a brand logo came from. "library" = the plugin's local
-- <library>/Brands/<Brand>.png, "upload" = the vendor's registration upload.
create type logo_source        as enum ('library','upload');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       profile_role not null default 'architect',
  full_name  text,
  phone      text,
  firm       text,
  verified   boolean not null default false,
  created_at timestamptz not null default now()
);

-- One row per plugin install. install_id is the plugin's random UUID (FR-A5).
create table public.installs (
  id             uuid primary key,
  profile_id     uuid references public.profiles(id) on delete set null,
  plugin_version text,
  su_version     text,
  platform       text,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
create table public.vendors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  brand_name  text not null,
  logo_url    text,
  -- FR-A24 / FR-M13: brand logo, shown on cards, the brand banner and the
  -- Usage tab. Square, transparent PNG or SVG, >= 256x256, < 200 KB.
  logo_path   text,                              -- storage key in bucket "brands"
  logo_source logo_source,                       -- null until a logo exists
  whatsapp    text,
  email       text,
  website     text,
  npwp        text,
  is_platform boolean not null default false,  -- true only for the "Dirory" sample brand
  status      vendor_status not null default 'pending',
  approved_at timestamptz,
  created_at  timestamptz not null default now()
);
-- Only one platform ("Dirory") vendor.
create unique index vendors_one_platform on public.vendors (is_platform) where is_platform;

create table public.vendor_members (
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       vendor_member_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (vendor_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Taxonomy + catalogue
-- ---------------------------------------------------------------------------
create table public.categories (
  id        uuid primary key default gen_random_uuid(),
  type      category_type not null,
  name      text not null,
  parent_id uuid references public.categories(id) on delete set null,
  sort      int not null default 0,
  unique (type, parent_id, name)
);

create table public.assets (
  id                 uuid primary key default gen_random_uuid(),
  vendor_id          uuid not null references public.vendors(id) on delete cascade,
  type               asset_type not null,
  category_id        uuid references public.categories(id) on delete set null,
  name               text not null,
  tags               text[] not null default '{}',
  sku                text,
  product_url        text,
  tile_w_cm          numeric,
  tile_h_cm          numeric,
  status             asset_status not null default 'draft',
  current_version_id uuid,
  -- FR-A22: until M6 the plugin identifies an item by its path inside the local
  -- library ("Model/Closet/Toto/CW 630 PJ.skp"), produced by relative_key in
  -- main.rb. Storing it here lets favourites recorded before the cloud catalogue
  -- existed be linked to the real asset later.
  legacy_key         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index assets_vendor_idx   on public.assets (vendor_id);
create index assets_status_idx   on public.assets (status);
create index assets_category_idx on public.assets (category_id);
-- Several assets may legitimately share a legacy path (e.g. re-uploads), so this
-- is a lookup index rather than a unique constraint.
create index assets_legacy_key_idx on public.assets (legacy_key);

-- ---------------------------------------------------------------------------
-- Favourites (FR-A22, Q15)
--
-- Declared AFTER `assets`: the foreign key below requires the referenced table
-- to exist first, and Postgres enforces that at CREATE TABLE time.
--
-- v0.5.1 keeps favourites in the SketchUp settings, per computer: a list of
-- keys plus an automatic "Used before" list of the last 60 inserted or painted
-- items. From M6 they sync per account so they follow the user. This table is
-- the server side of that sync.
--
-- `legacy_key` is the local-library relative path the plugin sends today.
-- `asset_id` is filled in by the nightly link job once the cloud catalogue
-- exists (M6), at which point the plugin starts sending asset_id directly.
-- ---------------------------------------------------------------------------
create table public.favourites (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  asset_id   uuid references public.assets(id) on delete cascade,
  legacy_key text,
  starred    boolean not null default true,  -- false = "Used before", true = starred.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per (user, asset) once linked, or per (user, legacy path) before that.
  unique (profile_id, asset_id),
  unique (profile_id, legacy_key)
);
create index favourites_profile_idx on public.favourites (profile_id, starred, updated_at desc);
create index favourites_asset_idx   on public.favourites (asset_id);

create table public.asset_versions (
  id             uuid primary key default gen_random_uuid(),
  asset_id       uuid not null references public.assets(id) on delete cascade,
  version        int not null,
  file_path      text,           -- storage key in bucket "models"
  thumbnail_path text,           -- storage key in bucket "materials" or thumbnail
  file_size      bigint,
  review_status  review_status not null default 'pending',
  review_note    text,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (asset_id, version)
);
alter table public.assets
  add constraint assets_current_version_fk
  foreign key (current_version_id) references public.asset_versions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------
create table public.plans (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price_idr  bigint not null default 0,
  period     plan_period not null default 'monthly',
  max_assets int not null default 50,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  vendor_id            uuid not null references public.vendors(id) on delete cascade,
  plan_id              uuid references public.plans(id) on delete set null,
  status               subscription_status not null default 'trial',
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  created_at           timestamptz not null default now()
);
create index subscriptions_vendor_idx on public.subscriptions (vendor_id);

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  amount_idr      bigint not null default 0,
  status          invoice_status not null default 'unpaid',
  gateway         invoice_gateway not null default 'manual',
  gateway_ref     text,
  proof_path      text,
  paid_at         timestamptz,
  due_at          timestamptz,
  created_at      timestamptz not null default now()
);
create index invoices_vendor_idx on public.invoices (vendor_id);
create index invoices_status_idx on public.invoices (status);

-- ---------------------------------------------------------------------------
-- Plugin ingest + demand
-- ---------------------------------------------------------------------------
-- Idempotency: primary key is the client event id.
create table public.ingest_log (
  id          uuid primary key,
  install_id  uuid,
  kind        text,
  received_at timestamptz not null default now()
);

create table public.search_misses (
  id         uuid primary key default gen_random_uuid(),
  install_id uuid,
  profile_id uuid references public.profiles(id) on delete set null,
  query_norm text not null,
  tab        miss_tab not null default 'all',
  created_at timestamptz not null default now()
);
create index search_misses_query_idx on public.search_misses (query_norm);

create table public.missing_requests (
  id                uuid primary key default gen_random_uuid(),
  query_norm        text not null unique,
  miss_count        int not null default 0,
  distinct_installs int not null default 0,
  first_seen        timestamptz not null default now(),
  last_seen         timestamptz not null default now(),
  status            request_status not null default 'new',
  category_id       uuid references public.categories(id) on delete set null,
  note              text,
  merged_into       uuid references public.missing_requests(id) on delete set null,
  resolved_asset_id uuid references public.assets(id) on delete set null
);

-- Latest state per (install, model) - upserted on every snapshot (FR-A18).
create table public.usage_snapshots (
  id         uuid primary key default gen_random_uuid(),
  install_id uuid not null,
  profile_id uuid references public.profiles(id) on delete set null,
  model_id   text not null,
  project    text,
  totals     jsonb not null default '{}'::jsonb,
  taken_at   timestamptz not null default now(),
  unique (install_id, model_id)
);

create table public.usage_snapshot_items (
  id          bigserial primary key,
  snapshot_id uuid not null references public.usage_snapshots(id) on delete cascade,
  asset_key   text,           -- plugin v0.5 sends the local relative path
  asset_id    uuid references public.assets(id) on delete set null,
  type        asset_type not null,
  name        text,
  category    text,
  brand       text,
  qty         int not null default 0,
  faces       int not null default 0,
  area_m2     numeric not null default 0
);
create index usage_items_snapshot_idx on public.usage_snapshot_items (snapshot_id);
create index usage_items_asset_idx    on public.usage_snapshot_items (asset_id);

-- Append-only history for trends, 12-month retention.
create table public.usage_history (
  id         bigserial primary key,
  install_id uuid not null,
  model_id   text not null,
  taken_at   timestamptz not null default now(),
  items      jsonb not null default '[]'::jsonb
);

-- Nightly rollup that the vendor dashboard reads (kept cheap and stable).
create table public.daily_asset_usage (
  day        date not null,
  asset_id   uuid not null references public.assets(id) on delete cascade,
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  projects   int not null default 0,
  units      int not null default 0,
  area_m2    numeric not null default 0,
  quotes     int not null default 0,
  primary key (day, asset_id)
);
create index daily_usage_vendor_idx on public.daily_asset_usage (vendor_id, day);

create table public.quote_requests (
  id           uuid primary key default gen_random_uuid(),
  architect_id uuid references public.profiles(id) on delete set null,
  install_id   uuid,
  vendor_id    uuid not null references public.vendors(id) on delete cascade,
  project_name text,
  city         text,
  timeline     text,
  note         text,
  phone_shared boolean not null default false,
  items        jsonb not null default '[]'::jsonb,
  status       quote_status not null default 'new',
  created_at   timestamptz not null default now()
);
create index quotes_vendor_idx on public.quote_requests (vendor_id, created_at desc);

create table public.audit_log (
  id         bigserial primary key,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Keep assets.updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger assets_touch
  before update on public.assets
  for each row execute function public.touch_updated_at();

-- A vendor's assets are visible to architects while the vendor is active,
-- during the 7-day grace period, or when it is the platform ("Dirory") brand.
create or replace function public.vendor_is_visible(v public.vendors)
returns boolean language sql immutable as $$
  select v.is_platform
      or v.status = 'approved'
      or exists (
           select 1 from public.subscriptions s
           where s.vendor_id = v.id
             and s.status in ('trial','active','grace')
             and (s.current_period_end is null or s.current_period_end > now())
         );
$$;
