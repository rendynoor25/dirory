-- Dirory — vendor minimum-architects tests (migration 0035, UU PDP A6)
-- Run against a local stack:  supabase test db
-- Or paste into the Supabase SQL editor on a staging project.
--
-- A product used by 4 installs must be withheld from its vendor; at 5 it is
-- shown. Every assert raises on failure; everything is rolled back at the end.

begin;

do $$
declare
  v_id   uuid := '00000000-0000-0000-0000-0000000000b1';
  owner  uuid := '00000000-0000-0000-0000-0000000000b2';
  a_few  uuid := '00000000-0000-0000-0000-0000000000b3';
  a_many uuid := '00000000-0000-0000-0000-0000000000b4';
  snap   uuid;
  i      int;
  r      record;
begin
  insert into auth.users (id, email) values (owner, 'threshold-owner@example.com')
  on conflict (id) do nothing;
  insert into public.profiles (id, role, full_name) values (owner, 'vendor_owner', 'Owner')
  on conflict (id) do update set role = excluded.role;
  insert into public.vendors (id, name, brand_name, status, approved_at)
  values (v_id, 'Threshold Co', 'ThresholdBrand', 'approved', now())
  on conflict (id) do nothing;
  insert into public.vendor_members (vendor_id, profile_id, role) values (v_id, owner, 'owner')
  on conflict do nothing;
  insert into public.assets (id, vendor_id, type, name, status) values
    (a_few,  v_id, 'model', 'Few closet',  'approved'),
    (a_many, v_id, 'model', 'Many closet', 'approved')
  on conflict (id) do nothing;

  -- 4 installs use "Few", 5 use "Many".
  for i in 1..5 loop
    insert into public.usage_snapshots (install_id, model_id, totals, taken_at)
    values (gen_random_uuid(), 'm' || i, '{}'::jsonb, now())
    returning id into snap;
    insert into public.usage_snapshot_items (snapshot_id, asset_id, type, name, qty)
    values (snap, a_many, 'model', 'Many closet', 1);
    if i <= 4 then
      insert into public.usage_snapshot_items (snapshot_id, asset_id, type, name, qty)
      values (snap, a_few, 'model', 'Few closet', 1);
    end if;
  end loop;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner)::text, true);

  for r in select * from public.vendor_usage_by_asset(v_id, current_date - 1, current_date + 1) loop
    if r.name = 'Few closet' and (not r.suppressed or r.units is not null) then
      raise exception 'A6 FAIL: a product used by 4 installs was shown (units %)', r.units;
    end if;
    if r.name = 'Many closet' and (r.suppressed or r.units <> 5) then
      raise exception 'A6 FAIL: a product used by 5 installs was withheld (units %)', r.units;
    end if;
  end loop;

  select * into r from public.vendor_usage_totals(v_id, current_date - 1, current_date + 1);
  if r.suppressed or r.architects <> 5 then
    raise exception 'A6 FAIL: totals over 5 installs were withheld';
  end if;

  raise notice 'vendor threshold: all checks passed';
end $$;

rollback;
