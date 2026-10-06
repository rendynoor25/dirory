-- Dirory — user occupation + admin-facing email (admin "Users" screen, FR-M9)
-- 0010_profiles_occupation.sql
--
-- Two additions to `profiles`, both driven by the admin dashboard:
--
--   1. `occupation` — asked once, right after a user first signs in, so the
--      founder can see how many architects / designers / students / others use
--      Dirory. NULL means "not answered yet"; it is never guessed.
--
--   2. `email` — `auth.users` is not reachable through PostgREST with the anon
--      key, so the admin dashboard cannot read emails from there. Copying the
--      address onto the profile lets the Users screen identify an account. It is
--      populated by the sign-up trigger and backfilled here for existing rows.
--
-- RLS is unchanged: the existing policy already lets a user update their own
-- profile (so they can set their occupation) and lets an admin read all rows.
-- The `force_profile_role` trigger only rewrites `role`, so it does not interfere.
--
-- Run order: 0001 -> ... -> 0010.

-- ---------------------------------------------------------------------------
-- Occupation
-- ---------------------------------------------------------------------------
do $$ begin
  create type occupation_kind as enum ('architect', 'designer', 'student', 'other');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists occupation occupation_kind;

comment on column public.profiles.occupation is
  'Self-reported: architect | designer | student | other. NULL = not answered.';

-- ---------------------------------------------------------------------------
-- Email copy (so the admin dashboard can list accounts)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email text;

comment on column public.profiles.email is
  'Mirror of auth.users.email for admin listings; auth.users is not readable via PostgREST.';

-- Backfill existing profiles.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and (p.email is null or p.email <> u.email);

-- Keep it filled for new sign-ups.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Admin helper: counts per occupation, for the dashboard overview.
-- ---------------------------------------------------------------------------
create or replace function public.user_occupation_counts()
returns table (occupation text, total bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(p.occupation::text, 'unknown') as occupation, count(*)::bigint as total
    from public.profiles p
   where public.is_admin()
   group by 1
   order by 2 desc;
$$;
