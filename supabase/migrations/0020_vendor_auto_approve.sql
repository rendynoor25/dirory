-- Dirory - auto-approve a vendor that signs up with a company email
-- 0020_vendor_auto_approve.sql
--
-- Founder decision (9 Oct 2026): a brand that registers with its **company
-- email** should not have to wait for a manual approval before its account is
-- usable. The admin still sees the vendor and can suspend it at any time.
--
-- What this does and does not change:
--
--   * It approves the VENDOR ACCOUNT, so the vendor portal is fully usable and
--     no "pending" banner is shown.
--   * It does NOT approve products. Uploaded assets still go to the admin review
--     queue (FR-M2), so nothing reaches architects unreviewed. That review is the
--     part that actually protects catalogue quality.
--
-- The caller decides, by passing p_auto_approve. The freemail list lives in one
-- place - `apps/web/src/lib/businessEmail.ts` - and the server action passes the
-- answer, so the rule cannot drift between SQL and TypeScript.
--
-- Trade-off, stated plainly: any address on a company domain is auto-approved.
-- Someone can register a domain and get in. The admin can suspend them, and
-- their products still need review, but the manual gate on the account itself is
-- gone. Set p_auto_approve = false to go back to approving every vendor by hand.

-- The parameter list changes, so replace rather than overload.
drop function if exists public.register_vendor(text, text, text, text, text, text);

create or replace function public.register_vendor(
  p_name         text,
  p_brand_name   text,
  p_email        text,
  p_whatsapp     text,
  p_website      text default null,
  p_npwp         text default null,
  p_auto_approve boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := auth.uid();
  v_vendor  uuid;
  v_status  vendor_status := case when p_auto_approve then 'approved' else 'pending' end;
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

  insert into public.vendors (
    name, brand_name, email, whatsapp, website, npwp, status, is_platform, approved_at
  )
  values (
    btrim(p_name),
    btrim(p_brand_name),
    nullif(btrim(p_email), ''),
    nullif(btrim(p_whatsapp), ''),
    nullif(btrim(p_website), ''),
    nullif(btrim(p_npwp), ''),
    v_status,
    false,
    case when p_auto_approve then now() else null end
  )
  returning id into v_vendor;

  insert into public.vendor_members (vendor_id, profile_id, role)
  values (v_vendor, v_profile, 'owner');

  perform public.write_audit(
    case when p_auto_approve then 'vendor.auto_approved' else 'vendor.registered' end,
    'vendors', v_vendor::text,
    jsonb_build_object('brand_name', btrim(p_brand_name), 'auto', p_auto_approve)
  );

  return v_vendor;
end $$;

comment on function public.register_vendor(text, text, text, text, text, text, boolean) is
  'Creates a vendor plus the caller''s owner membership in one transaction. p_auto_approve = true approves the vendor account immediately (company email); products still go through the admin review queue.';
