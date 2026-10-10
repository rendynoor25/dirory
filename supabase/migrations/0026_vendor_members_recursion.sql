-- Dirory - fix: the vendor_members policy recursed infinitely
-- 0026_vendor_members_recursion.sql
--
-- `vendor_members_owner` (FOR ALL) tested ownership with a subquery on the very
-- table it guards:
--
--   using (is_vendor_member(vendor_id) and exists (
--            select 1 from public.vendor_members m
--             where m.vendor_id = vendor_members.vendor_id ...))
--
-- Evaluating the policy on `vendor_members` re-evaluates the policy on
-- `vendor_members`. PostgreSQL detects that and aborts the statement:
--
--   ERROR: infinite recursion detected in policy for relation "vendor_members"
--
-- Every other predicate in 0002 is SECURITY DEFINER precisely to avoid this; this
-- one policy escaped the rule. It went unnoticed because no vendor account
-- existed until now.
--
-- The damage: `getSession()` reads `vendor_members` to find the signed-in user's
-- vendor. That query failed for every real vendor, so the portal treated a
-- registered vendor as a stranger. The visible symptom was a registration form
-- that "did nothing": the vendor WAS created (register_vendor commits before the
-- read), but the page could not read it back, so it rendered the empty form
-- again -- with no error, because the failure happened in a policy, not in code.
--
-- The fix is the same pattern as the rest of 0002: a SECURITY DEFINER helper.

create or replace function public.is_vendor_owner(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vendor_members
    where vendor_id = target
      and profile_id = auth.uid()
      and role = 'owner'
  );
$$;

comment on function public.is_vendor_owner(uuid) is
  'True when the signed-in user is an owner of the given vendor. SECURITY DEFINER so the lookup does not re-enter the vendor_members policy (0026).';

drop policy if exists vendor_members_owner on public.vendor_members;
create policy vendor_members_owner on public.vendor_members
  for all using (public.is_vendor_owner(vendor_id))
  with check (public.is_vendor_owner(vendor_id));
