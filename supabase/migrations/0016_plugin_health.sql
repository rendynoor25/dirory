-- Dirory - plugin health reports + forward-compatible ingest
-- 0016_plugin_health.sql
--
-- Why two tables:
--
--   1. `plugin_health_events` backs the "Plugin health" area of the dashboard
--      (failed model loads, failed inserts, failed paints, and how long models
--      take to open). The plugin already knows these numbers; until now they
--      never left the machine, which is why that dashboard area was empty.
--
--   2. `unhandled_events` makes the ingest forward-compatible. The /events
--      function used to REJECT a whole batch if any event had an unknown kind.
--      That is a rollout trap: ship a newer plugin before the server knows its
--      new kind and every batch fails, so all data collection stops. Unknown
--      kinds are now stored here instead, so the batch succeeds and nothing is
--      lost while the server catches up.
--
-- Both are admin-readable only. They describe the plugin's own operation, not
-- the architect's projects, so they carry no project names or geometry.

-- ---------------------------------------------------------------------------
-- Plugin health
-- ---------------------------------------------------------------------------
create table if not exists public.plugin_health_events (
  id             uuid primary key,          -- client event id (idempotency)
  install_id     uuid,
  profile_id     uuid references public.profiles(id) on delete set null,
  plugin_version text,
  su_version     text,
  platform       text,
  -- Counters since the previous report. Cumulative errors, never per-project.
  load_attempts  int     not null default 0,
  load_failures  int     not null default 0,
  load_ms_total  bigint  not null default 0,
  insert_failures int    not null default 0,
  paint_failures  int    not null default 0,
  cloud_failures  int    not null default 0,
  received_at    timestamptz not null default now()
);

create index if not exists plugin_health_received_idx
  on public.plugin_health_events (received_at desc);
create index if not exists plugin_health_version_idx
  on public.plugin_health_events (plugin_version);

alter table public.plugin_health_events enable row level security;

drop policy if exists plugin_health_admin_read on public.plugin_health_events;
create policy plugin_health_admin_read on public.plugin_health_events
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Forward compatibility: events the server does not understand yet
-- ---------------------------------------------------------------------------
create table if not exists public.unhandled_events (
  id          uuid primary key,
  install_id  uuid,
  kind        text,
  payload     jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists unhandled_events_kind_idx
  on public.unhandled_events (kind, received_at desc);

alter table public.unhandled_events enable row level security;

drop policy if exists unhandled_events_admin_read on public.unhandled_events;
create policy unhandled_events_admin_read on public.unhandled_events
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Admin rollup: health per plugin version, for the dashboard card.
-- A SECURITY DEFINER function so the page needs one call and no joins.
-- ---------------------------------------------------------------------------
create or replace function public.plugin_health_summary(p_days int default 7)
returns table (
  plugin_version   text,
  installs         bigint,
  load_attempts    bigint,
  load_failures    bigint,
  load_failure_pct numeric,
  avg_load_ms      numeric,
  insert_failures  bigint,
  paint_failures   bigint,
  cloud_failures   bigint
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(h.plugin_version, 'unknown')                       as plugin_version,
    count(distinct h.install_id)::bigint                        as installs,
    coalesce(sum(h.load_attempts), 0)::bigint                   as load_attempts,
    coalesce(sum(h.load_failures), 0)::bigint                   as load_failures,
    case when coalesce(sum(h.load_attempts), 0) > 0
         then round(100.0 * sum(h.load_failures) / sum(h.load_attempts), 1)
         else 0 end                                             as load_failure_pct,
    case when coalesce(sum(h.load_attempts), 0) > 0
         then round(1.0 * sum(h.load_ms_total) / sum(h.load_attempts), 0)
         else 0 end                                             as avg_load_ms,
    coalesce(sum(h.insert_failures), 0)::bigint                 as insert_failures,
    coalesce(sum(h.paint_failures), 0)::bigint                  as paint_failures,
    coalesce(sum(h.cloud_failures), 0)::bigint                  as cloud_failures
  from public.plugin_health_events h
  where public.is_admin()
    and h.received_at > now() - make_interval(days => greatest(p_days, 1))
  group by 1
  order by 3 desc;
$$;

comment on function public.plugin_health_summary(int) is
  'Admin-only rollup of plugin health per plugin version over the last N days.';
