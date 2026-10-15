-- Dirory — Dirory Pro tests (migration 0039)
-- Run against a local stack:  supabase test db
-- Or paste into the Supabase SQL editor on a staging project.
--
--   1. pro_create_order prices the order from pro_plans and reuses an open one.
--   2. mark_pro_order_paid grants once, however often the webhook retries.
--   3. A second monthly order extends from the end of the first.
--   4. An architect sees only their own orders and cannot write any.
-- Every assert raises on failure; everything is rolled back at the end.

begin;

do $$
declare
  arch_a uuid := '00000000-0000-0000-0000-0000000000e7';
  arch_b uuid := '00000000-0000-0000-0000-0000000000e8';
  o1 public.pro_orders;
  o1b public.pro_orders;
  o2 public.pro_orders;
  e1 public.pro_entitlements;
  e2 public.pro_entitlements;
  cnt int;
  blocked boolean;
begin
  insert into auth.users (id, email) values
    (arch_a, 'pro-a@example.com'), (arch_b, 'pro-b@example.com')
  on conflict (id) do nothing;
  insert into public.profiles (id, role, full_name) values
    (arch_a, 'architect', 'Pro A'), (arch_b, 'architect', 'Pro B')
  on conflict (id) do update set role = excluded.role;

  -- 1. Orders are priced by the table, and an open order is reused.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', arch_a)::text, true);
  o1 := public.pro_create_order('pro_monthly');
  if o1.amount_idr <> (select price_idr from public.pro_plans where id = 'pro_monthly') then
    raise exception 'PRO FAIL: order amount % is not the plan price', o1.amount_idr;
  end if;
  o1b := public.pro_create_order('pro_monthly');
  if o1b.id <> o1.id then
    raise exception 'PRO FAIL: an open order was not reused';
  end if;

  -- 4. Clients cannot write orders or grant themselves Pro.
  blocked := false;
  begin
    insert into public.pro_orders (profile_id, plan_id, amount_idr) values (arch_a, 'pro_monthly', 1);
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then
    select count(*) into cnt from public.pro_orders where amount_idr = 1;
    if cnt > 0 then raise exception 'PRO FAIL: an architect inserted an order at Rp 1'; end if;
  end if;
  blocked := false;
  begin
    perform public.mark_pro_order_paid(o1.id);
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then
    raise exception 'PRO FAIL: an architect could mark their own order paid';
  end if;

  -- 2. Settling (as the webhook does) grants exactly once.
  perform set_config('role', 'postgres', true);
  e1 := public.mark_pro_order_paid(o1.id, 'midtrans', 'DRP-test-1');
  perform public.mark_pro_order_paid(o1.id, 'midtrans', 'DRP-test-1');
  select count(*) into cnt from public.pro_entitlements where order_id = o1.id;
  if cnt <> 1 then
    raise exception 'PRO FAIL: % entitlements for one order', cnt;
  end if;
  if (select status from public.pro_orders where id = o1.id) <> 'paid' then
    raise exception 'PRO FAIL: order not marked paid';
  end if;

  -- 3. A second month starts where the first ends.
  insert into public.pro_orders (profile_id, plan_id, amount_idr)
  values (arch_a, 'pro_monthly', 99000) returning * into o2;
  e2 := public.mark_pro_order_paid(o2.id);
  if abs(extract(epoch from (e2.starts_at - e1.ends_at))) > 1 then
    raise exception 'PRO FAIL: second month starts % instead of %', e2.starts_at, e1.ends_at;
  end if;

  -- 4. Architect B sees none of A's orders or entitlements.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', arch_b)::text, true);
  select count(*) into cnt from public.pro_orders;
  if cnt <> 0 then raise exception 'PRO FAIL: architect B sees % orders', cnt; end if;
  select count(*) into cnt from public.pro_entitlements;
  if cnt <> 0 then raise exception 'PRO FAIL: architect B sees % entitlements', cnt; end if;

  raise notice 'dirory pro: all checks passed';
end $$;

rollback;
