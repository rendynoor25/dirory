-- Dirory - vendor_is_visible must be SECURITY DEFINER
-- 0024_vendor_visible_security_definer.sql
--
-- 0022 made visibility depend on a subscription, but left the function as the
-- ordinary (invoker) kind. Its internal `select ... from subscriptions` was
-- therefore itself subject to RLS, and an anonymous visitor has no policy on
-- `subscriptions` — so the subquery found nothing, the function returned false,
-- and the public catalogue collapsed for anyone without a session:
--
--     anonymous: 2 of 1,355 products, and zero brands
--
-- The plugin never noticed, because it reads through the catalogue Edge Function
-- with the service role; a service-role read bypasses RLS entirely. That is
-- exactly why the break was invisible in the path that mattered most.
--
-- Every other predicate in 0002 (`is_admin`, `is_vendor_member`,
-- `is_vendor_editor`) is SECURITY DEFINER for this same reason: a function used
-- inside a policy must be able to read the table it guards, or it dead-ends on
-- RLS. This brings `vendor_is_visible` in line.
--
-- Behaviour is otherwise unchanged: the 7-day grace window and the grandfather
-- subscription rule are exactly as 0022 wrote them.

create or replace function public.vendor_is_visible(v public.vendors)
returns boolean language sql stable security definer set search_path = public as $$
  select v.is_platform
      or (
           v.status = 'approved'
           and exists (
                select 1 from public.subscriptions s
                where s.vendor_id = v.id
                  and s.status in ('trial','active','grace')
                  and (
                    s.current_period_end is null
                    or s.current_period_end > now() - interval '7 days'
                  )
              )
         );
$$;

comment on function public.vendor_is_visible(public.vendors) is
  'FR-M6: the platform brand, or an approved vendor with a subscription in trial/active/grace whose period ended no more than 7 days ago. SECURITY DEFINER so the subscriptions lookup is not itself filtered by RLS — without it, anonymous readers see nothing.';
