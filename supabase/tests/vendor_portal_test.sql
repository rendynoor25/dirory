-- Dirory — vendor portal acceptance tests (FR-V4/V5/V6, M7/M8)
-- 0012_vendor_portal.sql
--
-- Run against a local stack:  supabase test db
-- Or on a linked project:     npx supabase db query --linked --file supabase/tests/vendor_portal_test.sql
--
-- Everything runs inside one transaction and is rolled back, so it is safe to
-- run against production. Each block raises on failure; a clean run means every
-- assertion passed.

begin;

do $$
declare
  v          uuid := '00000000-0000-0000-0000-0000000001a1';
  v_other    uuid := '00000000-0000-0000-0000-0000000001a2';
  u_member   uuid := '00000000-0000-0000-0000-0000000001c1';
  u_outsider uuid := '00000000-0000-0000-0000-0000000001c2';
  a_chair    uuid := '00000000-0000-0000-0000-0000000001e1';
  plan_choice uuid := '00000000-0000-0000-0000-0000000001b1';
  snap_id    uuid := '00000000-0000-0000-0000-0000000001f1';
  inv_id     uuid;
  r          record;
  denied     boolean;
  cnt        int;
begin
  -- -------------------------------------------------------------- fixtures
  insert into auth.users (id, email) values
    (u_member, 'vmember@example.com'),
    (u_outsider, 'outsider@example.com')
  on conflict (id) do nothing;

  insert into public.profiles (id, role, full_name) values
    (u_member, 'vendor_owner', 'Vendor member'),
    (u_outsider, 'architect', 'Outsider')
  on conflict (id) do update set role = excluded.role;

  insert into public.vendors (id, name, brand_name, status, approved_at) values
    (v, 'Test Vendor', 'BrandX', 'approved', now()),
    (v_other, 'Other Vendor', 'BrandY', 'approved', now())
  on conflict (id) do nothing;

  insert into public.vendor_members (vendor_id, profile_id, role) values
    (v, u_member, 'owner')
  on conflict do nothing;

  insert into public.assets (id, vendor_id, type, name, status) values
    (a_chair, v, 'model', 'Chair A', 'approved')
  on conflict (id) do nothing;

  insert into public.plans (id, name, price_idr, period, max_assets, active) values
    (plan_choice, 'Test Plan', 1000000, 'monthly', 50, true)
  on conflict (id) do nothing;

  -- A usage snapshot: 3 chairs in one project, one signed-in architect.
  insert into public.usage_snapshots (id, install_id, profile_id, model_id, taken_at)
  values (snap_id, gen_random_uuid(), u_member, 'model-1', now())
  on conflict (id) do nothing;

  insert into public.usage_snapshot_items
    (snapshot_id, asset_key, asset_id, type, name, brand, qty, faces, area_m2)
  values
    (snap_id, 'Model/Chair/Chair A.skp', a_chair, 'model', 'Chair A', 'BrandX', 3, 0, 0);

  -- Append-only history drives the trend line.
  insert into public.usage_history (install_id, model_id, taken_at, items)
  values (gen_random_uuid(), 'model-1', now(),
          '[{"asset":"Model/Chair/Chair A.skp","type":"model","name":"Chair A","brand":"BrandX","qty":3,"area_m2":0}]'::jsonb);

  -- A consented quote request for this vendor, containing the chair.
  insert into public.quote_requests (vendor_id, items, created_at)
  values (v, jsonb_build_array(jsonb_build_object('asset_id', a_chair::text, 'name', 'Chair A', 'qty', 3)), now());

  -- ------------------------------------------------- as the vendor member
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_member)::text, true);

  -- Check 1: totals aggregate correctly.
  select * into r from public.vendor_usage_totals(v, current_date, current_date);
  if r.projects <> 1 or r.units <> 3 or r.architects <> 1 or r.quotes <> 1 then
    raise exception 'TOTALS FAIL: projects=% units=% architects=% quotes=%',
      r.projects, r.units, r.architects, r.quotes;
  end if;

  -- Check 2: per-product row carries units and the matched quote count.
  select * into r from public.vendor_usage_by_asset(v, current_date, current_date)
   where asset_id = a_chair;
  if r is null or r.units <> 3 or r.quotes <> 1 then
    raise exception 'BY ASSET FAIL: %', r;
  end if;

  -- Check 3: the daily series attributes history to the product.
  select * into r from public.vendor_usage_daily(v, current_date, current_date)
   where asset_id = a_chair;
  if r is null or r.units <> 3 then
    raise exception 'DAILY FAIL: %', r;
  end if;

  -- Check 4: a non-member cannot read the same numbers.
  perform set_config('request.jwt.claims', json_build_object('sub', u_outsider)::text, true);
  denied := false;
  begin
    perform count(*) from public.vendor_usage_totals(v, current_date, current_date);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'SEC FAIL: a non-member could read a vendor''s usage';
  end if;

  -- Check 5: another vendor's data is invisible (different vendor id → denied).
  perform set_config('request.jwt.claims', json_build_object('sub', u_member)::text, true);
  denied := false;
  begin
    perform count(*) from public.vendor_usage_totals(v_other, current_date, current_date);
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'SEC FAIL: a vendor could read another vendor''s usage';
  end if;

  -- Check 6: choosing a plan creates a subscription + an unpaid invoice.
  inv_id := public.vendor_request_subscription(plan_choice);
  if inv_id is null then raise exception 'SUBSCRIBE FAIL: no invoice returned'; end if;

  select count(*) into cnt from public.invoices where id = inv_id and status = 'unpaid'
    and amount_idr = 1000000;
  if cnt <> 1 then raise exception 'SUBSCRIBE FAIL: invoice not created correctly'; end if;

  select count(*) into cnt from public.subscriptions where vendor_id = v and plan_id = plan_choice;
  if cnt <> 1 then raise exception 'SUBSCRIBE FAIL: subscription not created'; end if;

  -- Check 7: calling it again reuses the invoice instead of stacking a new one.
  if public.vendor_request_subscription(plan_choice) <> inv_id then
    raise exception 'SUBSCRIBE FAIL: a second call created a duplicate invoice';
  end if;
  select count(*) into cnt from public.invoices where vendor_id = v and status = 'unpaid';
  if cnt <> 1 then raise exception 'SUBSCRIBE FAIL: % unpaid invoices, expected 1', cnt; end if;

  -- Check 8: submitting proof attaches it without marking the invoice paid.
  perform public.vendor_submit_payment(inv_id, 'v/proofs/x/receipt.png', 'TRF-1', 'transfer');
  select count(*) into cnt from public.invoices
   where id = inv_id and status = 'unpaid'
     and proof_path = 'v/proofs/x/receipt.png' and proof_reference = 'TRF-1';
  if cnt <> 1 then raise exception 'PROOF FAIL: proof not attached'; end if;

  -- Check 9: an outsider cannot attach proof to someone else's invoice.
  perform set_config('request.jwt.claims', json_build_object('sub', u_outsider)::text, true);
  denied := false;
  begin
    perform public.vendor_submit_payment(inv_id, 'x', 'y', 'transfer');
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'SEC FAIL: an outsider could alter an invoice';
  end if;

  -- Check 10: a vendor cannot read search misses (still admin-only).
  perform set_config('role', 'postgres', true);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_member)::text, true);
  select count(*) into cnt from public.search_misses;
  if cnt <> 0 then raise exception 'SEC FAIL: a vendor read search misses'; end if;

  -- ------------------------------------------------------------- cleanup
  perform set_config('role', 'postgres', true);
  delete from public.quote_requests where vendor_id = v;
  delete from public.usage_snapshot_items where snapshot_id = snap_id;
  delete from public.usage_snapshots where id = snap_id;
  delete from public.usage_history where model_id = 'model-1';
  delete from public.invoices where vendor_id = v;
  delete from public.subscriptions where vendor_id = v;
  delete from public.assets where id = a_chair;
  delete from public.vendor_members where vendor_id = v;
  delete from public.vendors where id in (v, v_other);
  delete from public.plans where id = plan_choice;
  delete from public.profiles where id in (u_member, u_outsider);

  raise notice 'Dirory vendor portal suite: ALL CHECKS PASSED';
end $$;

rollback;
