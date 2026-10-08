-- Dirory - analytics for the admin dashboard and the vendor benchmark
-- 0017_analytics.sql
--
-- The metrics from the founder's document that could be computed but were not
-- built yet. Two audiences, two rules:
--
--   * `admin_*` functions are admin-only and may count anything: installs,
--     engagement, coverage, demand.
--   * `vendor_category_share` is vendor-facing, so it returns the vendor's own
--     numbers plus a CATEGORY TOTAL and nothing else. Never another vendor's
--     figures, never a project or a person. A vendor is a member of the vendor
--     it asks about, or an admin.
--
-- All are SECURITY DEFINER because they read tables the caller cannot (installs,
-- usage snapshots). Each one authorises itself.

-- ---------------------------------------------------------------------------
-- 1. Growth and engagement (document §1: Growth, Users)
--
-- "Active" means the install sent a usage snapshot in the window. Snapshots are
-- upserted per (install, model), so taken_at is the last time that file was
-- reported - a reasonable activity signal, and the only one we have.
-- ---------------------------------------------------------------------------
create or replace function public.admin_growth_summary()
returns table (
  installs_total        bigint,
  installs_new_7d       bigint,
  installs_new_30d      bigint,
  active_dau            bigint,
  active_wau            bigint,
  active_mau            bigint,
  installs_used         bigint,
  first_use_pct         numeric,
  retained_30d          bigint,
  retention_pct         numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  return query
  with base as (
    select i.id,
           i.first_seen,
           max(s.taken_at) as last_at
      from public.installs i
      left join public.usage_snapshots s on s.install_id = i.id
     group by i.id, i.first_seen
  )
  select
    count(*)::bigint,
    count(*) filter (where first_seen > now() - interval '7 days')::bigint,
    count(*) filter (where first_seen > now() - interval '30 days')::bigint,
    (select count(distinct install_id) from public.usage_snapshots
      where taken_at > now() - interval '1 day')::bigint,
    (select count(distinct install_id) from public.usage_snapshots
      where taken_at > now() - interval '7 days')::bigint,
    (select count(distinct install_id) from public.usage_snapshots
      where taken_at > now() - interval '30 days')::bigint,
    count(*) filter (where last_at is not null)::bigint,
    case when count(*) > 0
         then round(100.0 * count(*) filter (where last_at is not null) / count(*), 1)
         else 0 end,
    count(*) filter (where first_seen < now() - interval '30 days'
                       and last_at > now() - interval '30 days')::bigint,
    case when count(*) filter (where first_seen < now() - interval '30 days') > 0
         then round(100.0
              * count(*) filter (where first_seen < now() - interval '30 days'
                                   and last_at > now() - interval '30 days')
              / count(*) filter (where first_seen < now() - interval '30 days'), 1)
         else 0 end
  from base;
end $$;

comment on function public.admin_growth_summary() is
  'Admin-only: installs, new installs, DAU/WAU/MAU, first-use and 30-day retention.';

-- Weekly new installs, for the trend line.
create or replace function public.admin_installs_weekly(p_weeks int default 12)
returns table (week_start date, installs bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select date_trunc('week', i.first_seen)::date as week_start,
         count(*)::bigint
    from public.installs i
   where i.first_seen > now() - make_interval(weeks => greatest(p_weeks, 1))
   group by 1
   order by 1;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Content coverage (document §1: Content, Production)
-- ---------------------------------------------------------------------------
create or replace function public.admin_content_coverage(p_target int default 250)
returns table (
  published        bigint,
  samples          bigint,
  pending_review   bigint,
  draft            bigint,
  rejected         bigint,
  archived         bigint,
  with_thumbnail   bigint,
  without_thumbnail bigint,
  idle_30d         bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_platform uuid := '00000000-0000-0000-0000-0000000000d1';
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select
    count(*) filter (where a.status = 'approved' and a.vendor_id <> v_platform)::bigint,
    count(*) filter (where a.status = 'approved' and a.vendor_id = v_platform)::bigint,
    count(*) filter (where a.status = 'pending_review')::bigint,
    count(*) filter (where a.status = 'draft')::bigint,
    count(*) filter (where a.status = 'rejected')::bigint,
    count(*) filter (where a.status = 'archived')::bigint,
    -- Thumbnail coverage among published assets.
    count(*) filter (where a.status = 'approved'
                       and exists (select 1 from public.asset_versions v
                                    where v.asset_id = a.id and v.thumbnail_path is not null))::bigint,
    count(*) filter (where a.status = 'approved'
                       and not exists (select 1 from public.asset_versions v
                                        where v.asset_id = a.id and v.thumbnail_path is not null))::bigint,
    -- Published but not used in any snapshot in 30 days: candidates worth
    -- promoting, or products nobody wants.
    count(*) filter (where a.status = 'approved'
                       and not exists (
                         select 1 from public.usage_snapshot_items i
                           join public.usage_snapshots s on s.id = i.snapshot_id
                          where i.asset_id = a.id
                            and s.taken_at > now() - interval '30 days'))::bigint
  from public.assets a;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Library usage (document §1: Library usage)
-- ---------------------------------------------------------------------------
create or replace function public.admin_top_categories(p_days int default 30)
returns table (
  category    text,
  type        asset_type,
  inserts     bigint,
  area_m2     numeric,
  assets_used bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select coalesce(c.name, 'Uncategorised'),
         a.type,
         coalesce(sum(i.qty), 0)::bigint,
         coalesce(sum(i.area_m2), 0)::numeric,
         count(distinct i.asset_id)::bigint
    from public.usage_snapshot_items i
    join public.usage_snapshots s on s.id = i.snapshot_id
    join public.assets a on a.id = i.asset_id
    left join public.categories c on c.id = a.category_id
   where i.asset_id is not null
     and s.taken_at > now() - make_interval(days => greatest(p_days, 1))
   group by 1, 2
   order by 3 desc, 4 desc
   limit 20;
end $$;

-- Searches that found nothing, per day: the demand signal over time.
create or replace function public.admin_searches_daily(p_days int default 30)
returns table (day date, misses bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select m.created_at::date, count(*)::bigint
    from public.search_misses m
   where m.created_at > now() - make_interval(days => greatest(p_days, 1))
   group by 1
   order by 1;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Vendor category share (document §2: competitive benchmark)
--
-- Returns the vendor's own figures and the CATEGORY TOTAL only. The category
-- total is an aggregate across every vendor, so it can be shown as a percentage
-- without exposing a competitor's numbers, and it names no one.
--
-- Models and materials are kept apart: summing a count of models with square
-- metres of paint would produce a meaningless number.
-- ---------------------------------------------------------------------------
create or replace function public.vendor_category_share(
  p_vendor uuid, p_from date, p_to date)
returns table (
  category       text,
  type           asset_type,
  vendor_units   numeric,
  category_units numeric,
  share_pct      numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_vendor_member(p_vendor) or public.is_admin()) then
    raise exception 'not allowed';
  end if;

  return query
  with used as (
    select a.category_id,
           a.type,
           a.vendor_id,
           -- models: how many placed; materials: how much area painted.
           sum(case when a.type = 'model' then i.qty else i.area_m2 end) as units
      from public.usage_snapshot_items i
      join public.usage_snapshots s on s.id = i.snapshot_id
      join public.assets a on a.id = i.asset_id
     where i.asset_id is not null
       and s.taken_at::date between p_from and p_to
     group by 1, 2, 3
  )
  select coalesce(c.name, 'Uncategorised'),
         u.type,
         coalesce(sum(u.units) filter (where u.vendor_id = p_vendor), 0),
         coalesce(sum(u.units), 0),
         case when coalesce(sum(u.units), 0) > 0
              then round(100.0 * coalesce(sum(u.units) filter (where u.vendor_id = p_vendor), 0)
                         / sum(u.units), 1)
              else 0 end
    from used u
    left join public.categories c on c.id = u.category_id
   group by 1, 2
   having coalesce(sum(u.units) filter (where u.vendor_id = p_vendor), 0) > 0
   order by 3 desc;
end $$;

comment on function public.vendor_category_share(uuid, date, date) is
  'Vendor benchmark: the vendor''s own units, the category total and its share. Aggregate only - never a competitor''s figures, a project or a person.';
