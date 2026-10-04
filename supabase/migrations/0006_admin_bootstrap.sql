-- Allow a trusted SQL-editor/admin operation to promote the first admin while
-- keeping authenticated self-service users from assigning themselves a role.
--
-- The original trigger called `is_admin()` even for the SQL Editor's postgres
-- session. Since that session has no auth.uid(), it always reset the requested
-- role to `architect`, so the documented first-admin promotion could not work.
--
-- This trigger is SECURITY INVOKER intentionally. For normal authenticated
-- requests, auth.uid() is set and non-admin users are forced to architect.
-- Trusted SQL Editor/service operations have no end-user auth.uid() and may
-- assign roles. RLS still prevents a regular authenticated user from updating
-- another profile; this exception is for trusted server/database operators.
create or replace function public.force_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := 'architect';
  end if;
  return new;
end;
$$;

comment on function public.force_profile_role() is
  'Forces authenticated non-admin profile writes to architect. Trusted SQL Editor operations may bootstrap/promote admins.';
