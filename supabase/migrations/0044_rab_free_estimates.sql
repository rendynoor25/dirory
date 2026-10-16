-- Dirory - two free RAB estimates before Dirory Pro
-- 0044_rab_free_estimates.sql
--
-- A signed-in architect without Pro may generate the itemised RAB (and export
-- it) for two projects. A project is the same sha256 model hash the project
-- pass already uses (migration 0039): never the model's id, title or path.
-- Opening the same project again does not use another estimate. The `rab`
-- Edge Function writes and reads this table with the service role.

create table public.rab_free_estimates (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  model_hash  text not null check (model_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  primary key (profile_id, model_hash)
);

alter table public.rab_free_estimates enable row level security;

create policy rab_free_estimates_admin on public.rab_free_estimates
  for select using (public.is_admin());
create policy rab_free_estimates_own on public.rab_free_estimates
  for select using (profile_id = auth.uid());

comment on table public.rab_free_estimates is
  'Projects (model hashes) a free account has generated a RAB for; the first two are free.';
