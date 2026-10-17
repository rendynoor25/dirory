-- Dirory - security hardening (OWASP Top 10 review, 17 Oct 2026)
-- 0045_security_hardening.sql
--
-- A01 Broken Access Control. RLS let a vendor editor UPDATE its whole row in
-- vendors, assets, asset_versions and invoices, so straight through the API a
-- vendor could approve itself (vendors.status, is_platform), approve its own
-- products (assets.status, asset_versions.review_status) or mark its own
-- invoice paid (invoices.status, paid_at, amount_idr). Triggers now pin those
-- columns for a direct change by a signed-in user who is not an admin.
--
-- "Direct" means the statement runs as the `authenticated` or `anon` role,
-- i.e. PostgREST on a user's behalf. Dirory's own SECURITY DEFINER functions
-- (set_vendor_status, review_asset, submit_asset_version,
-- vendor_request_subscription, mark_invoice_paid, ...) run as their owner and
-- do their own checks, as do the service role, cron and migrations, so every
-- legitimate path is unchanged.
--
-- Also:
--   * plugin_device_codes: a signed-in user could read every pending sign-in
--     code; now only their own (approval still works: it matches by code).
--   * product links and vendor websites must be http(s) (A05): the plugin opens
--     them with the system shell, which would also run a program or a share.
--   * submit_asset_version: the file must be in the asset's vendor folder.
--   * functions only the server, cron or other functions should run are no
--     longer callable through the API (write_audit could forge audit entries).

-- ---------------------------------------------------------------------------
-- Who may change protected columns
-- ---------------------------------------------------------------------------
create or replace function public.can_change_protected()
returns boolean language sql stable set search_path = public as $$
  select current_user not in ('authenticated', 'anon') or public.is_admin();
$$;

-- vendors: approval and the platform flag are Dirory's decision.
create or replace function public.guard_vendor_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.can_change_protected() then
    new.status      := old.status;
    new.is_platform := old.is_platform;
    new.approved_at := old.approved_at;
  end if;
  return new;
end $$;

drop trigger if exists vendors_guard on public.vendors;
create trigger vendors_guard before update on public.vendors
  for each row execute function public.guard_vendor_update();

-- assets: a vendor may draft, submit and archive, never approve or reject,
-- and may not point the live version at an unreviewed one.
create or replace function public.guard_asset_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.can_change_protected() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status in ('approved', 'rejected') then new.status := 'draft'; end if;
    new.current_version_id := null;
  else
    if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
      new.status := old.status;
    end if;
    new.current_version_id := old.current_version_id;
    new.vendor_id := old.vendor_id;
  end if;
  return new;
end $$;

drop trigger if exists assets_guard on public.assets;
create trigger assets_guard before insert or update on public.assets
  for each row execute function public.guard_asset_write();

-- asset_versions: the review outcome is the reviewer's.
create or replace function public.guard_asset_version_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.can_change_protected() then return new; end if;
  if tg_op = 'INSERT' then
    new.review_status := 'pending';
    new.reviewed_by   := null;
    new.reviewed_at   := null;
    new.review_note   := null;
  else
    new.review_status := old.review_status;
    new.reviewed_by   := old.reviewed_by;
    new.reviewed_at   := old.reviewed_at;
    new.review_note   := old.review_note;
    new.asset_id      := old.asset_id;
    new.file_path     := old.file_path;
    new.revit_file_path := old.revit_file_path;
  end if;
  return new;
end $$;

drop trigger if exists asset_versions_guard on public.asset_versions;
create trigger asset_versions_guard before insert or update on public.asset_versions
  for each row execute function public.guard_asset_version_write();

-- invoices: a vendor may attach the QR it requested and its payment proof;
-- what is owed and whether it is paid are settled by the gateway or an admin.
create or replace function public.guard_invoice_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.can_change_protected() then
    new.status          := old.status;
    new.paid_at         := old.paid_at;
    new.amount_idr      := old.amount_idr;
    new.vendor_id       := old.vendor_id;
    new.subscription_id := old.subscription_id;
    new.due_at          := old.due_at;
  end if;
  return new;
end $$;

drop trigger if exists invoices_guard on public.invoices;
create trigger invoices_guard before update on public.invoices
  for each row execute function public.guard_invoice_update();

-- ---------------------------------------------------------------------------
-- Device codes: read only your own; approve through one function
-- ---------------------------------------------------------------------------
-- Approving used to be a direct UPDATE, which needed every pending code to be
-- readable by every signed-in user. Now a function approves the one code the
-- architect typed (or followed), for themselves, and nothing else is readable.
create or replace function public.approve_device_code(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update public.plugin_device_codes
     set status = 'approved', profile_id = auth.uid(), approved_at = now()
   where user_code = upper(btrim(p_code))
     and status = 'pending'
     and expires_at > now();
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.approve_device_code(text) from public, anon;
grant execute on function public.approve_device_code(text) to authenticated;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'plugin_device_codes'
  loop
    execute format('drop policy %I on public.plugin_device_codes', p.policyname);
  end loop;
end $$;
create policy plugin_device_codes_own on public.plugin_device_codes
  for select to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Web links: http(s) only
-- ---------------------------------------------------------------------------
update public.vendors set website = 'https://' || website
 where website is not null and website <> '' and website !~* '^https?://' and website !~ '\s';
update public.vendors set website = null
 where website is not null and website <> '' and website !~* '^https?://';
update public.assets set product_url = null
 where product_url is not null and product_url !~* '^https?://';

alter table public.assets drop constraint if exists assets_product_url_web;
alter table public.assets add constraint assets_product_url_web
  check (product_url is null or product_url ~* '^https?://[^\s/\\]+');
alter table public.vendors drop constraint if exists vendors_website_web;
alter table public.vendors add constraint vendors_website_web
  check (website is null or website = '' or website ~* '^https?://[^\s/\\]+');
alter table public.vendors drop constraint if exists vendors_logo_url_web;
alter table public.vendors add constraint vendors_logo_url_web
  check (logo_url is null or logo_url ~* '^https://[^\s/\\]+');

-- ---------------------------------------------------------------------------
-- submit_asset_version: the file must be the vendor's own upload
-- ---------------------------------------------------------------------------
create or replace function public.submit_asset_version(
  p_asset uuid, p_file_path text, p_thumbnail_path text default null, p_file_size bigint default null)
returns public.asset_versions language plpgsql security definer set search_path = public as $$
declare a public.assets; next_v int; av public.asset_versions;
begin
  select * into a from public.assets where id = p_asset;
  if a is null then raise exception 'asset not found'; end if;
  if not public.is_vendor_editor(a.vendor_id) then raise exception 'not allowed'; end if;
  -- The storage key must sit in this vendor's own folder (no other brand's file).
  if p_file_path is null or p_file_path not like a.vendor_id::text || '/%'
     or p_file_path like '%..%' or position(E'\\' in p_file_path) > 0 then
    raise exception 'file is not in this vendor''s folder';
  end if;
  if p_thumbnail_path is not null and p_thumbnail_path not like a.vendor_id::text || '/%' then
    raise exception 'thumbnail is not in this vendor''s folder';
  end if;

  select coalesce(max(version), 0) + 1 into next_v
    from public.asset_versions where asset_id = p_asset;

  insert into public.asset_versions (asset_id, version, file_path, thumbnail_path, file_size, review_status)
  values (p_asset, next_v, p_file_path, p_thumbnail_path, p_file_size, 'pending')
  returning * into av;

  -- A new version always goes back through review, but the old one stays live
  -- until this one is approved (FR-V3).
  update public.assets set status = 'pending_review' where id = p_asset;

  perform public.write_audit('asset.submitted', 'assets', p_asset::text,
                             jsonb_build_object('version', next_v));
  return av;
end $$;

-- ---------------------------------------------------------------------------
-- Functions for the server, cron and other functions only
-- ---------------------------------------------------------------------------
-- Functions are executable by PUBLIC unless revoked. These are jobs for cron,
-- the service role, or other SECURITY DEFINER functions (which call them with
-- the owner's rights, so revoking does not affect them).
do $$
declare sig text;
begin
  foreach sig in array array['public.expire_subscriptions()', 'public.rollup_daily_usage(date)',
                             'public.purge_expired_device_codes()', 'public.run_retention()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', sig);
    execute format('grant execute on function %s to service_role', sig);
  end loop;
end $$;

-- write_audit was SECURITY DEFINER and callable by anyone, so any user could
-- write audit entries (OWASP A09: logs must be trustworthy). As an invoker
-- function it still works from Dirory's own SECURITY DEFINER functions (they
-- run as the owner) and for an admin; anyone else is refused by RLS.
create or replace function public.write_audit(p_action text, p_entity text, p_entity_id text, p_meta jsonb default '{}'::jsonb)
returns void language sql security invoker set search_path = public as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
$$;
drop policy if exists audit_log_admin_insert on public.audit_log;
create policy audit_log_admin_insert on public.audit_log
  for insert to authenticated with check (public.is_admin() and actor_id = auth.uid());
revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon;
grant execute on function public.write_audit(text, text, text, jsonb) to authenticated, service_role;

-- Everything else that needs a signed-in user: not for anon. (The is_* helpers
-- and vendor_is_visible stay, as RLS policies call them for every visitor.)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef
             and left(p.proname, 3) <> 'is_'
             and p.proname not in ('vendor_is_visible', 'handle_new_user', 'audit_vendor_change',
                                   'expire_subscriptions', 'rollup_daily_usage', 'purge_expired_device_codes',
                                   'run_retention', 'mark_pro_order_paid')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
