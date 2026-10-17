-- Migration 0045: a vendor owner who is not an admin tries, straight through
-- the API role, what the guards must stop. Run inside a transaction that is
-- rolled back (scripts/test-security.mjs does: BEGIN; <0045 if not applied>;
-- this file; ROLLBACK). It creates its own test vendor membership, product
-- and invoice and leaves nothing behind.
--
-- The last statement returns one row per check: { check, ok }.

create temp table _sec_results (check_name text, ok boolean) on commit drop;
grant all on _sec_results to authenticated;

create temp table _sec_ctx on commit drop as
select
  (select id from public.profiles where role <> 'admin' order by created_at limit 1) as uid,
  (select id from public.vendors where not is_platform and status = 'approved' order by created_at limit 1) as vid;
grant select on _sec_ctx to authenticated;

insert into public.vendor_members (vendor_id, profile_id, role)
select vid, uid, 'owner' from _sec_ctx
on conflict do nothing;

insert into public.assets (id, vendor_id, type, name, status)
select '00000000-0000-4000-8000-00000000a501', vid, 'material', 'security test', 'draft' from _sec_ctx;
insert into public.asset_versions (id, asset_id, version, file_path, review_status)
select '00000000-0000-4000-8000-00000000a502', '00000000-0000-4000-8000-00000000a501', 1,
       vid::text || '/test/file.png', 'pending' from _sec_ctx;
insert into public.invoices (id, vendor_id, amount_idr, status, due_at)
select '00000000-0000-4000-8000-00000000a503', vid, 500000, 'unpaid', now() + interval '7 days' from _sec_ctx;
insert into public.plugin_device_codes (device_code_hash, user_code, status, expires_at)
values (repeat('a', 64), 'TEST-0045', 'pending', now() + interval '10 minutes');

-- Act as that vendor owner, through the API role.
select set_config('request.jwt.claims',
  json_build_object('sub', (select uid from _sec_ctx), 'role', 'authenticated')::text, true);
set local role authenticated;

update public.vendors set status = 'approved', is_platform = true, approved_at = now()
 where id = (select vid from _sec_ctx);
update public.assets set status = 'approved' where id = '00000000-0000-4000-8000-00000000a501';
update public.asset_versions set review_status = 'approved' where id = '00000000-0000-4000-8000-00000000a502';
update public.invoices set status = 'paid', paid_at = now(), amount_idr = 1
 where id = '00000000-0000-4000-8000-00000000a503';
update public.invoices set qr_string = 'qr-ok' where id = '00000000-0000-4000-8000-00000000a503';

insert into _sec_results
select 'cannot read other people''s pending sign-in codes',
       not exists (select 1 from public.plugin_device_codes where user_code = 'TEST-0045');

do $$
begin
  begin
    perform public.write_audit('forged', 'test', 'x', '{}'::jsonb);
    insert into _sec_results values ('cannot write audit entries', false);
  exception when others then
    insert into _sec_results values ('cannot write audit entries', true);
  end;
  begin
    perform public.expire_subscriptions();
    insert into _sec_results values ('cannot run cron jobs', false);
  exception when insufficient_privilege then
    insert into _sec_results values ('cannot run cron jobs', true);
  end;
  begin
    update public.assets set product_url = 'C:\Windows\System32\calc.exe'
     where id = '00000000-0000-4000-8000-00000000a501';
    insert into _sec_results values ('product link must be http(s)', false);
  exception when check_violation then
    insert into _sec_results values ('product link must be http(s)', true);
  end;
end $$;

insert into _sec_results
select 'approve_device_code approves for the caller', public.approve_device_code('test-0045');

reset role;

insert into _sec_results
select 'vendor cannot approve itself or become platform',
       v.is_platform = false from public.vendors v where v.id = (select vid from _sec_ctx);
insert into _sec_results
select 'vendor cannot approve its own product', status <> 'approved'
  from public.assets where id = '00000000-0000-4000-8000-00000000a501';
insert into _sec_results
select 'vendor cannot approve its own version', review_status = 'pending'
  from public.asset_versions where id = '00000000-0000-4000-8000-00000000a502';
insert into _sec_results
select 'vendor cannot mark its invoice paid or change the amount', status = 'unpaid' and amount_idr = 500000
  from public.invoices where id = '00000000-0000-4000-8000-00000000a503';
insert into _sec_results
select 'vendor can still attach its QR', qr_string = 'qr-ok'
  from public.invoices where id = '00000000-0000-4000-8000-00000000a503';
insert into _sec_results
select 'approved code belongs to the caller', profile_id = (select uid from _sec_ctx) and status = 'approved'
  from public.plugin_device_codes where user_code = 'TEST-0045';

select check_name, ok from _sec_results;
