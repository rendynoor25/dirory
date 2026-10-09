-- Dirory — mark_invoice_paid regression test (migration 0025)
-- Run against a local stack:  supabase test db
-- Or paste into the Supabase SQL editor on a staging project.
--
-- Guards the bug fixed in 0025: for a composite-typed PL/pgSQL variable, `IS NOT
-- NULL` is not the complement of `IS NULL` (against the live database both
-- returned false for a fully-populated row). The extension block was therefore
-- never entered, so confirming a payment marked the invoice paid but left the
-- subscription `trial` with a NULL current_period_end.
--
-- Everything is rolled back at the end.

begin;

do $$
declare
  v_vendor uuid := '00000000-0000-0000-0000-0000000e0001';
  v_sub    uuid := '00000000-0000-0000-0000-0000000e0002';
  v_inv    uuid := '00000000-0000-0000-0000-0000000e0003';
  v_status text;
  v_end    timestamptz;
  v_after  timestamptz;
begin
  insert into public.vendors (id, name, brand_name, status)
    values (v_vendor, 'PAYTEST', 'PAYTEST', 'approved');
  insert into public.subscriptions (id, vendor_id, plan_id, status)
    values (v_sub, v_vendor, '00000000-0000-0000-0000-0000000000b3', 'trial');
  insert into public.invoices (id, vendor_id, subscription_id, amount_idr, status, gateway)
    values (v_inv, v_vendor, v_sub, 5000000, 'unpaid', 'midtrans');

  -- mark_invoice_paid authorises on auth.role() = 'service_role'.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  perform public.mark_invoice_paid(v_inv, 'midtrans', 'TEST-ORDER-1');

  select status::text into v_status from public.invoices where id = v_inv;
  if v_status <> 'paid' then
    raise exception 'MARK FAIL: invoice is %, expected paid', v_status;
  end if;

  select status::text, current_period_end into v_status, v_end
    from public.subscriptions where id = v_sub;
  if v_status <> 'active' then
    raise exception 'MARK FAIL: subscription is %, not active — the 0025 bug', v_status;
  end if;
  if v_end is null then
    raise exception 'MARK FAIL: current_period_end was not set — the 0025 bug';
  end if;
  if v_end <= now() then
    raise exception 'MARK FAIL: current_period_end % is not in the future', v_end;
  end if;

  -- Idempotent: a second confirmation must not move the period again.
  v_after := v_end;
  perform public.mark_invoice_paid(v_inv, 'midtrans', 'TEST-ORDER-1');
  select current_period_end into v_end from public.subscriptions where id = v_sub;
  if v_end <> v_after then
    raise exception 'MARK FAIL: a second call moved the period from % to %', v_after, v_end;
  end if;

  raise notice 'mark_invoice_paid: all assertions passed';
end $$;

rollback;
