-- Dirory - enforce FR-M6: a subscription gates visibility
-- 0022_vendor_visibility.sql
--
-- Until now `vendor_is_visible()` returned true for any vendor whose status was
-- 'approved', and the catalogue Edge Function did the same thing in TypeScript.
-- The subscription branch was dead code: every vendor in the database had NONE,
-- so nothing was ever gated. A brand that stopped paying kept its catalogue live
-- forever, which is the opposite of what FR-M6 promises.
--
-- FR-M6: on expiry, 7 days of grace, then the vendor's assets are hidden (not
-- deleted); they return on renewal. Samples are never affected.
--
-- There are two places that decide this, so both are changed together:
--   1. this function, used by the RLS policies, and
--   2. supabase/functions/catalog/index.ts, which reads with the service role
--      and therefore bypasses RLS entirely. A SQL-only fix would not reach the
--      plugin.
--
-- The rule, in both places:
--   visible = platform brand
--             OR (vendor approved
--                 AND a subscription in trial/active/grace
--                 AND (the period never ends, or ended <= 7 days ago))
--
-- Grandfathering: the launch brands (Propan, TACO, Nippon, ...) were onboarded
-- before billing existed and must not disappear. Each gets a non-expiring active
-- subscription (`current_period_end is null`). When one later buys a plan,
-- `vendor_request_subscription()` reuses that row and `mark_invoice_paid()` gives
-- it a real end date, so the comp converts cleanly instead of stacking a second
-- subscription.

-- ---------------------------------------------------------------------------
-- 1. Grandfather the launch catalogue
-- ---------------------------------------------------------------------------
insert into public.subscriptions
  (vendor_id, plan_id, status, current_period_start, current_period_end)
select v.id, null, 'active', now(), null
from public.vendors v
where v.status = 'approved'
  and not v.is_platform
  and not exists (
    select 1 from public.subscriptions s where s.vendor_id = v.id
  );

-- ---------------------------------------------------------------------------
-- 2. The visibility rule (RLS)
--
-- Volatility changes from `immutable` to `stable`: the old marker was a lie, the
-- body calls `now()`. A function that reads the clock cannot be immutable.
-- ---------------------------------------------------------------------------
create or replace function public.vendor_is_visible(v public.vendors)
returns boolean language sql stable as $$
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
  'FR-M6: the platform brand, or an approved vendor with a subscription in trial/active/grace. The period may have ended up to 7 days ago (grace). Hidden, not deleted, after that; returns on renewal.';

-- ---------------------------------------------------------------------------
-- 3. The expiry job
--
-- Visibility is already date-driven above, so a lapsed subscription hides itself
-- even if this never runs. The job exists to keep the status *label* honest for
-- the vendor portal ("grace", then "expired") and for admin reporting.
-- ---------------------------------------------------------------------------
create or replace function public.expire_subscriptions()
returns void language sql security definer set search_path = public as $$
  update public.subscriptions
     set status = 'grace'
   where status in ('trial','active')
     and current_period_end is not null
     and current_period_end <= now();

  update public.subscriptions
     set status = 'expired'
   where status = 'grace'
     and current_period_end is not null
     and current_period_end <= now() - interval '7 days';
$$;

comment on function public.expire_subscriptions() is
  'FR-M6: moves lapsed subscriptions to grace, then to expired. Visibility already depends on current_period_end, so this only keeps the status label honest.';

-- Best-effort schedule. pg_cron may not be enabled on this project; if it is not,
-- the function above is still correct and can be scheduled from the dashboard.
do $do$
begin
  begin
    perform cron.schedule(
      'dirory-expire-subs', '15 * * * *',
      $cron$select public.expire_subscriptions()$cron$
    );
  exception when others then
    raise notice 'pg_cron not available; schedule expire_subscriptions() manually';
  end;
end $do$;
