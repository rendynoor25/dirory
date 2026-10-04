-- Dirory — server-side operations and audit (PRD §8, FR-M1/M2/M6/M8)
-- 0003_functions.sql. Depends on 0001 + 0002.

-- ---------------------------------------------------------------------------
-- Generic audit helper
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(
  p_action text, p_entity text, p_entity_id text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Admin: approve / reject / suspend a vendor (FR-M1)
-- ---------------------------------------------------------------------------
create or replace function public.set_vendor_status(p_vendor uuid, p_status vendor_status)
returns public.vendors language plpgsql security definer set search_path = public as $$
declare v public.vendors;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_status = 'approved' then
    update public.vendors set status = p_status, approved_at = now() where id = p_vendor returning * into v;
  else
    update public.vendors set status = p_status where id = p_vendor returning * into v;
  end if;
  if v is null then raise exception 'vendor not found'; end if;
  perform public.write_audit('vendor.' || p_status::text, 'vendors', p_vendor::text);
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Admin: review an asset version (FR-M2). Approving the version promotes the
-- asset and makes it the live version; rejecting records a mandatory reason.
-- ---------------------------------------------------------------------------
create or replace function public.review_asset(
  p_version uuid, p_decision review_status, p_note text default null)
returns public.asset_versions language plpgsql security definer set search_path = public as $$
declare av public.asset_versions; a public.assets;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_decision = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'rejection reason is required';
  end if;

  update public.asset_versions
     set review_status = p_decision,
         review_note   = p_note,
         reviewed_by   = auth.uid(),
         reviewed_at   = now()
   where id = p_version
   returning * into av;
  if av is null then raise exception 'version not found'; end if;

  select * into a from public.assets where id = av.asset_id;

  if p_decision = 'approved' then
    update public.assets
       set status = 'approved', current_version_id = av.id
     where id = av.asset_id
     returning * into a;
  elsif p_decision = 'rejected' then
    -- Only move the asset out of review; do not hide a previously live version.
    update public.assets set status = 'rejected'
     where id = av.asset_id and status = 'pending_review';
  end if;

  perform public.write_audit('asset.' || p_decision::text, 'assets', av.asset_id::text,
                             jsonb_build_object('version', av.version, 'note', p_note));
  return av;
end $$;

-- ---------------------------------------------------------------------------
-- Vendor: submit an asset version for review (FR-V3). Increments the version.
-- ---------------------------------------------------------------------------
create or replace function public.submit_asset_version(
  p_asset uuid, p_file_path text, p_thumbnail_path text default null, p_file_size bigint default null)
returns public.asset_versions language plpgsql security definer set search_path = public as $$
declare a public.assets; next_v int; av public.asset_versions;
begin
  select * into a from public.assets where id = p_asset;
  if a is null then raise exception 'asset not found'; end if;
  if not public.is_vendor_editor(a.vendor_id) then raise exception 'not allowed'; end if;

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
-- Nightly rollup: rebuild daily_asset_usage from the latest snapshots.
-- Schedule with pg_cron (Supabase: Database → Extensions → pg_cron):
--   select cron.schedule('dirory-rollup', '0 18 * * *', $$select public.rollup_daily_usage()$$);
-- ---------------------------------------------------------------------------
create or replace function public.rollup_daily_usage(p_day date default (now() at time zone 'utc')::date)
returns int language plpgsql security definer set search_path = public as $$
declare inserted int;
begin
  delete from public.daily_asset_usage where day = p_day;

  insert into public.daily_asset_usage (day, asset_id, vendor_id, projects, units, area_m2)
  select p_day,
         i.asset_id,
         a.vendor_id,
         count(distinct s.install_id || ':' || s.model_id),
         sum(i.qty),
         sum(i.area_m2)
    from public.usage_snapshots s
    join public.usage_snapshot_items i on i.snapshot_id = s.id
    join public.assets a on a.id = i.asset_id
   where s.taken_at::date = p_day
     and i.asset_id is not null
   group by i.asset_id, a.vendor_id;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- ---------------------------------------------------------------------------
-- Trigger: audit vendor status changes made outside the RPC (defence in depth).
-- ---------------------------------------------------------------------------
create or replace function public.audit_vendor_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.write_audit('vendor.status_changed', 'vendors', new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;

create trigger vendors_audit
  after update on public.vendors
  for each row execute function public.audit_vendor_change();
