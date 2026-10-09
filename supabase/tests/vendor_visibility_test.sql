-- Dirory — FR-M6 vendor visibility tests (migration 0022)
-- Run against a local stack:  supabase test db
-- Or paste into the Supabase SQL editor on a staging project.
--
-- `vendor_is_visible()` decides whether a brand's catalogue reaches architects.
-- Migration 0022 changed it, and the catalogue Edge Function mirrors it, so this
-- pins the rule down:
--
--   visible = platform brand
--             OR (vendor approved
--                 AND a subscription in trial/active/grace
--                 AND (the period never ends, or ended <= 7 days ago))
--
-- The important case is #2: before 0022 an approved vendor with no subscription
-- was visible, so nothing was ever gated. Every assert raises on failure, so a
-- clean run means the rule holds. Everything is rolled back at the end.

begin;

do $$
declare
  v_platform  uuid := '00000000-0000-0000-0000-0000000000a1';
  v_nosub     uuid := '00000000-0000-0000-0000-0000000000a2';
  v_forever   uuid := '00000000-0000-0000-0000-0000000000a3';
  v_future    uuid := '00000000-0000-0000-0000-0000000000a4';
  v_grace     uuid := '00000000-0000-0000-0000-0000000000a5';
  v_lapsed    uuid := '00000000-0000-0000-0000-0000000000a6';
  v_pending   uuid := '00000000-0000-0000-0000-0000000000a7';
  v_suspended uuid := '00000000-0000-0000-0000-0000000000a8';
  got boolean;
begin
  -- The platform brand may already exist (it is unique); reuse it if so.
  select id into v_platform from public.vendors where is_platform limit 1;
  if v_platform is null then
    v_platform := '00000000-0000-0000-0000-0000000000a1';
    insert into public.vendors (id, name, brand_name, status, is_platform)
    values (v_platform, 'Dirory', 'Dirory', 'approved', true);
  end if;

  insert into public.vendors (id, name, brand_name, status, is_platform) values
    (v_nosub,     'NoSub',    'NoSub',    'approved',  false),
    (v_forever,   'Forever',  'Forever',  'approved',  false),
    (v_future,    'Future',   'Future',   'approved',  false),
    (v_grace,     'Grace',    'Grace',    'approved',  false),
    (v_lapsed,    'Lapsed',   'Lapsed',   'approved',  false),
    (v_pending,   'Pending',  'Pending',  'pending',   false),
    (v_suspended, 'Susp',     'Susp',     'suspended', false)
  on conflict (id) do nothing;

  insert into public.subscriptions
    (vendor_id, status, current_period_start, current_period_end) values
    -- Non-expiring: how the launch brands were grandfathered in 0022.
    (v_forever,   'active',  now(),                    null),
    (v_future,    'active',  now(),                    now() + interval '30 days'),
    -- Period ended 2 days ago. Status is still 'active' on purpose: visibility
    -- must be date-driven and must not depend on expire_subscriptions() running.
    (v_grace,     'active',  now() - interval '32 days', now() - interval '2 days'),
    -- Period ended 8 days ago: one day past grace.
    (v_lapsed,    'active',  now() - interval '38 days', now() - interval '8 days'),
    (v_pending,   'active',  now(),                    null),
    (v_suspended, 'active',  now(),                    null);

  -- 1. Platform brand: always visible.
  select public.vendor_is_visible(v) into got from public.vendors v where v.id = v_platform;
  if not got then raise exception 'FR-M6 FAIL: platform brand is hidden'; end if;

  -- 2. Approved, never subscribed: hidden. The regression 0022 fixed.
  select public.vendor_is_visible(v) into got from public.vendors v where v.id = v_nosub;
  if got then raise exception 'FR-M6 FAIL: approved vendor with no subscription is visible'; end if;

  -- 3. Non-expiring subscription: visible.
  select public.vendor_is_visible(v) into got from public.vendors v where v.id = v_forever;
  if not got then raise exception 'FR-M6 FAIL: non-expiring subscription is hidden'; end if;

  -- 4. Active, period in the future: visible.
  select public.vendor_is_visible(v) into got from public.vendors v where v.id = v_future;
  if not got then raise exception 'FR-M6 FAIL: active subscription is hidden'; end if;

  -- 5. Period ended 2 days ago (inside the 7-day grace): still visible.
  select public.vendor_is_visible(v) into got from public.vendors v where v.id = v_grace;
  if not got then raise exception 'FR-M6 FAIL: subscription inside grace is hidden'; end if;

  -- 6. Period ended 8 days ago (past grace): hidden. The boundary.
  select public.vendor_is_visible(v) into got from public.vendors v where v.id = v_lapsed;
  if got then raise exception 'FR-M6 FAIL: subscription past grace is still visible'; end if;

  -- 7. Paying does not substitute for approval.
  select public.vendor_is_visible(v) into got from public.vendors v where v.id = v_pending;
  if got then raise exception 'FR-M6 FAIL: pending vendor is visible'; end if;

  -- 8. A suspended vendor is hidden even while subscribed.
  select public.vendor_is_visible(v) into got from public.vendors v where v.id = v_suspended;
  if got then raise exception 'FR-M6 FAIL: suspended vendor is visible'; end if;

  raise notice 'FR-M6 vendor visibility: all assertions passed';
end $$;

rollback;
