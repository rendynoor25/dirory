-- Dirory - vendors see a usage figure only when it covers >= 5 architects
-- 0035_vendor_min_architects.sql
--
-- UU PDP action item A6. A vendor's per-product numbers are aggregates, but an
-- aggregate of one is a person: "1 project, 3 units, last Tuesday" together
-- with a quote request is enough to know which architect it was. Every
-- vendor-facing usage function therefore withholds a figure that covers fewer
-- than `min_reporting_installs()` distinct installations.
--
-- Counted by install, not by signed-in profile: anonymous usage has no profile,
-- and a profile-only count would let one signed-out architect through.
--
-- Quote counts are not withheld: a quote request is the architect contacting
-- the vendor on purpose, with consent, and the vendor already holds the lead.

create or replace function public.min_reporting_installs()
returns int language sql immutable as $$ select 5 $$;

comment on function public.min_reporting_installs() is
  'Smallest number of distinct installs a vendor-facing usage figure may describe (UU PDP A6).';

-- ---------------------------------------------------------------------------
-- Totals: all or nothing. Below the threshold the vendor sees zeros and
-- `suppressed = true`, which the dashboard explains.
-- ---------------------------------------------------------------------------
drop function if exists public.vendor_usage_totals(uuid, date, date);
create function public.vendor_usage_totals(
  p_vendor uuid, p_from date, p_to date)
returns table(projects int, units int, area_m2 numeric, architects int, quotes int, suppressed boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_installs int;
begin
  if not (public.is_vendor_member(p_vendor) or public.is_admin()) then
    raise exception 'not allowed';
  end if;

  select count(distinct s.install_id) into v_installs
    from public.usage_snapshot_items i
    join public.usage_snapshots s on s.id = i.snapshot_id
    join public.assets a on a.id = i.asset_id
   where a.vendor_id = p_vendor
     and s.taken_at::date between p_from and p_to;

  if v_installs < public.min_reporting_installs() and not public.is_admin() then
    return query
      select 0, 0, 0::numeric, 0,
             (select count(*)::int from public.quote_requests q
               where q.vendor_id = p_vendor
                 and q.created_at::date between p_from and p_to),
             v_installs > 0;
    return;
  end if;

  return query
    select
      count(distinct s.install_id::text || ':' || s.model_id)::int,
      coalesce(sum(i.qty), 0)::int,
      coalesce(sum(i.area_m2), 0)::numeric,
      count(distinct s.install_id)::int,
      (select count(*)::int from public.quote_requests q
        where q.vendor_id = p_vendor
          and q.created_at::date between p_from and p_to),
      false
    from public.usage_snapshot_items i
    join public.usage_snapshots s on s.id = i.snapshot_id
    join public.assets a on a.id = i.asset_id
   where a.vendor_id = p_vendor
     and i.asset_id is not null
     and s.taken_at::date between p_from and p_to;
end $$;

-- ---------------------------------------------------------------------------
-- Per product: a product used by fewer than 5 installs keeps its row (it is
-- the vendor's own catalogue) but its usage figures are null and
-- `suppressed = true`.
-- ---------------------------------------------------------------------------
drop function if exists public.vendor_usage_by_asset(uuid, date, date);
create function public.vendor_usage_by_asset(
  p_vendor uuid, p_from date, p_to date)
returns table(
  asset_id uuid, name text, type asset_type,
  projects int, units int, area_m2 numeric, quotes int, suppressed boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_min int := case when public.is_admin() then 1 else public.min_reporting_installs() end;
begin
  if not (public.is_vendor_member(p_vendor) or public.is_admin()) then
    raise exception 'not allowed';
  end if;

  return query
    select
      a.id,
      a.name,
      a.type,
      case when coalesce(u.installs, 0) >= v_min then u.projects::int end,
      case when coalesce(u.installs, 0) >= v_min then u.units::int end,
      case when coalesce(u.installs, 0) >= v_min then u.area_m2::numeric end,
      coalesce(q.quotes, 0)::int,
      coalesce(u.installs, 0) between 1 and v_min - 1
    from public.assets a
    left join (
      select i.asset_id,
             count(distinct s.install_id) as installs,
             count(distinct s.install_id::text || ':' || s.model_id) as projects,
             sum(i.qty) as units,
             sum(i.area_m2) as area_m2
        from public.usage_snapshot_items i
        join public.usage_snapshots s on s.id = i.snapshot_id
       where s.taken_at::date between p_from and p_to
       group by i.asset_id
    ) u on u.asset_id = a.id
    left join (
      select e->>'asset_id' as asset_id, count(*) as quotes
        from public.quote_requests q,
             jsonb_array_elements(q.items) e
       where q.vendor_id = p_vendor
         and q.created_at::date between p_from and p_to
       group by 1
    ) q on q.asset_id = a.id::text
   where a.vendor_id = p_vendor
     and a.status <> 'archived'
   order by (case when coalesce(u.installs, 0) >= v_min
                  then coalesce(u.units, 0) + coalesce(u.area_m2, 0) else 0 end) desc,
            a.name;
end $$;

-- ---------------------------------------------------------------------------
-- Daily trend: a single day is the easiest place to spot one person, so the
-- threshold applies to every (product, day) point.
-- ---------------------------------------------------------------------------
create or replace function public.vendor_usage_daily(
  p_vendor uuid, p_from date, p_to date)
returns table(asset_id uuid, day date, units int, area_m2 numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_brand text;
  v_min int := case when public.is_admin() then 1 else public.min_reporting_installs() end;
begin
  if not (public.is_vendor_member(p_vendor) or public.is_admin()) then
    raise exception 'not allowed';
  end if;

  select brand_name into v_brand from public.vendors where id = p_vendor;

  return query
    select a.id,
           h.taken_at::date,
           coalesce(sum((e->>'qty')::numeric), 0)::int,
           coalesce(sum((e->>'area_m2')::numeric), 0)::numeric
      from public.usage_history h,
           jsonb_array_elements(h.items) e
      join public.assets a
        on a.vendor_id = p_vendor
       and a.name = (e->>'name')
     where (e->>'brand') = v_brand
       and h.taken_at::date between p_from and p_to
     group by a.id, h.taken_at::date
    having count(distinct h.install_id) >= v_min
     order by h.taken_at::date;
end $$;

-- ---------------------------------------------------------------------------
-- Category share: the vendor's own figure in a category is shown only when it
-- comes from at least 5 installs. The category total already spans brands.
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
declare
  v_min int := case when public.is_admin() then 1 else public.min_reporting_installs() end;
begin
  if not (public.is_vendor_member(p_vendor) or public.is_admin()) then
    raise exception 'not allowed';
  end if;

  return query
  with used as (
    select a.category_id,
           a.type,
           a.vendor_id,
           sum(case when a.type = 'model' then i.qty else i.area_m2 end) as units,
           count(distinct s.install_id) as installs
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
      and coalesce(sum(u.installs) filter (where u.vendor_id = p_vendor), 0) >= v_min
   order by 3 desc;
end $$;
