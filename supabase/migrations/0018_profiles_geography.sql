-- Dirory - optional user geography (founder decision, 9 Oct 2026)
-- 0018_profiles_geography.sql
--
-- The dashboard's "users by city / province" metric had no data to read: a
-- profile had no location at all. This adds two nullable columns, filled only if
-- the user chooses to answer, in the same optional step as their occupation.
--
-- Both are optional and never guessed. NULL means "not answered", and the admin
-- rollup reports that honestly as "unknown" rather than inventing a place.
--
-- Privacy: a city is personal data, so it is collected on the same basis as the
-- occupation - volunteered by the user, used only for aggregate admin reporting,
-- and never shown to a vendor. `admin_users_by_geography()` is admin-only, and
-- the vendor benchmark functions in 0017 never touch it.
--
-- RLS needs no change: the existing policy already lets a user update their own
-- profile row and lets an admin read all rows.

alter table public.profiles
  add column if not exists city     text,
  add column if not exists province text;

comment on column public.profiles.city is
  'Self-reported city. NULL = not answered. Admin aggregate reporting only; never shown to a vendor.';
comment on column public.profiles.province is
  'Self-reported province. NULL = not answered. Admin aggregate reporting only; never shown to a vendor.';

-- ---------------------------------------------------------------------------
-- Admin rollup: users per province and city.
-- ---------------------------------------------------------------------------
create or replace function public.admin_users_by_geography()
returns table (province text, users bigint, answered bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select coalesce(nullif(btrim(p.province), ''), 'unknown'),
         count(*)::bigint,
         count(*) filter (where nullif(btrim(p.province), '') is not null)::bigint
    from public.profiles p
   group by 1
   order by 2 desc;
end $$;

comment on function public.admin_users_by_geography() is
  'Admin-only: users per province, with how many actually answered.';

-- The city-level view, for a second table on the analytics page.
create or replace function public.admin_users_by_city(p_limit int default 20)
returns table (city text, province text, users bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select nullif(btrim(p.city), ''),
         nullif(btrim(p.province), ''),
         count(*)::bigint
    from public.profiles p
   where nullif(btrim(p.city), '') is not null
   group by 1, 2
   order by 3 desc
   limit greatest(p_limit, 1);
end $$;
