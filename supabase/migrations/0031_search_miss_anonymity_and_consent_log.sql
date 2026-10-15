-- Dirory - search_miss anonymity (A1) & consent_log (A4)
-- 0031_search_miss_anonymity_and_consent_log.sql
--
-- A1: search_miss events must be truly anonymous - no install_id, no user.
--     The events function will accept a separate envelope type for search_miss.
-- A4: consent_log table for per-switch consent changes.

-- ---------------------------------------------------------------------------
-- 1. Make search_misses truly anonymous (A1)
-- ---------------------------------------------------------------------------

-- Remove install_id and profile_id from search_misses. They must never be stored.
alter table public.search_misses
  drop column if exists install_id,
  drop column if exists profile_id;

-- Add an index on created_at for retention jobs
create index if not exists search_misses_created_at_idx on public.search_misses (created_at);

-- ---------------------------------------------------------------------------
-- 2. consent_log table (A4)
-- ---------------------------------------------------------------------------
-- Append-only log of every consent change. RLS ensures users only see their own.

create table public.consent_log (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  install_id    uuid,  -- nullable: search_miss consent doesn't have an install
  purpose       text not null check (purpose in (
    'usage', 'project_name', 'search_miss', 'quote_phone_firm', 'plugin_download'
  )),
  granted       boolean not null,
  policy_version text not null,
  plugin_version text,
  created_at    timestamptz not null default now()
);

create index consent_log_profile_idx on public.consent_log (profile_id, created_at);
create index consent_log_install_idx on public.consent_log (install_id);

-- RLS: users only see their own consent log
alter table public.consent_log enable row level security;

create policy "Users can read their own consent log"
  on public.consent_log for select
  using (auth.uid() = profile_id);

-- No insert/update/delete policies needed - only service role (events function) writes

comment on table public.consent_log is
  'Append-only log of every consent change. purpose: usage, project_name, search_miss, quote_phone_firm, plugin_download.';

-- ---------------------------------------------------------------------------
-- 3. Add share_usage and share_project columns to profiles for server-side checks
-- ---------------------------------------------------------------------------
-- The plugin stores these locally, but server needs to know for enforcement.

alter table public.profiles
  add column if not exists share_usage boolean not null default false,
  add column if not exists share_project boolean not null default false,
  add column if not exists share_search_miss boolean not null default true; -- anonymous, default on

-- ---------------------------------------------------------------------------
-- 4. Add search_miss consent column to profiles (for the separate switch)
-- ---------------------------------------------------------------------------
-- This is the "Report missing searches" switch (A3.3)

alter table public.profiles
  add column if not exists share_search_miss boolean not null default true;

comment on column public.profiles.share_usage is
  'Whether the architect has opted in to sharing usage snapshots (Share usage). Default false (opt-in).';
comment on column public.profiles.share_project is
  'Whether the architect has opted in to sharing project titles in usage snapshots. Default false.';
comment on column public.profiles.share_search_miss is
  'Whether the architect has opted in to anonymous search-miss reporting. Default true (anonymous, opt-out).';