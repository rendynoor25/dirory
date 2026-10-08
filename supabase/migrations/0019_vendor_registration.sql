-- Dirory - atomic vendor registration (bug fix)
-- 0019_vendor_registration.sql
--
-- The bug: `registerVendor()` inserted the vendor and then read the new row back
-- with `.select("id").single()` to get its id for the membership insert. But the
-- `vendors_public_read` policy only lets a caller read a vendor that is
-- *visible* (approved, or the platform brand, or subscribed) or that they are
-- already a member of. A brand-new `pending` vendor is none of those, and the
-- membership does not exist yet - so the read returned no row, `.single()`
-- raised, and the server action returned before creating the membership.
--
-- Net effect for the user: the form appeared to do nothing. The database was
-- left with a `pending` vendor that had no members, so the account still looked
-- unregistered.
--
-- The fix is to do both inserts in one SECURITY DEFINER function, which does not
-- need to read the row back at all, and which makes the two inserts atomic: a
-- failure cannot leave a vendor without an owner.
--
-- The read policy is deliberately NOT loosened. Letting every signed-in user read
-- every pending vendor would expose the registration pipeline (brand names,
-- contact details, NPWP) to anyone - the leak is worse than the bug.

-- ---------------------------------------------------------------------------
-- Clean up the orphaned rows the bug produced: pending, not the platform brand,
-- and with no members at all. Such a row can only come from this failure, so it
-- is safe to remove.
-- ---------------------------------------------------------------------------
delete from public.vendors v
 where v.status = 'pending'
   and not v.is_platform
   and not exists (select 1 from public.vendor_members m where m.vendor_id = v.id);

-- ---------------------------------------------------------------------------
-- Register the caller's brand: one vendor + one owner membership.
-- Idempotent: a second call returns the existing vendor instead of creating a
-- second one, so a double-submit is harmless.
-- ---------------------------------------------------------------------------
create or replace function public.register_vendor(
  p_name       text,
  p_brand_name text,
  p_email      text,
  p_whatsapp   text,
  p_website    text default null,
  p_npwp       text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := auth.uid();
  v_vendor  uuid;
begin
  if v_profile is null then
    raise exception 'not signed in';
  end if;

  -- Already registered? Return that vendor.
  select vm.vendor_id into v_vendor
    from public.vendor_members vm
   where vm.profile_id = v_profile
   order by (vm.role = 'owner') desc, vm.created_at
   limit 1;
  if v_vendor is not null then
    return v_vendor;
  end if;

  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_brand_name), '') = '' then
    raise exception 'name and brand name are required';
  end if;

  insert into public.vendors (name, brand_name, email, whatsapp, website, npwp, status, is_platform)
  values (
    btrim(p_name),
    btrim(p_brand_name),
    nullif(btrim(p_email), ''),
    nullif(btrim(p_whatsapp), ''),
    nullif(btrim(p_website), ''),
    nullif(btrim(p_npwp), ''),
    'pending',
    false
  )
  returning id into v_vendor;

  insert into public.vendor_members (vendor_id, profile_id, role)
  values (v_vendor, v_profile, 'owner');

  perform public.write_audit('vendor.registered', 'vendors', v_vendor::text,
    jsonb_build_object('brand_name', btrim(p_brand_name)));

  return v_vendor;
end $$;

comment on function public.register_vendor(text, text, text, text, text, text) is
  'Creates a pending vendor plus the caller''s owner membership in one transaction and returns the vendor id. Idempotent per account.';
