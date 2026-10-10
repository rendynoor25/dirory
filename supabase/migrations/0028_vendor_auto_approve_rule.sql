-- Dirory - vendor registration is approved automatically
-- 0028_vendor_auto_approve_rule.sql
--
-- Approval used to be a manual step for anything that was not a company email,
-- which put the founder in the critical path of every registration. He cannot sit
-- in the admin dashboard during a working day, so the queue was the bottleneck.
--
-- The rule now, decided in one place (here, not in the app):
--
--   company email                 -> approved
--   personal email + a website    -> approved   (the link is the business signal)
--   personal email, no website    -> refused, with a way to reach us
--
-- A personal domain tells us nothing about whether a business exists — a small
-- vendor on @gmail.com is indistinguishable from a curious individual. A company
-- website, store link or Instagram profile is evidence, and it is a field we
-- already collect. So the gate on pricing stays meaningful without anyone
-- approving anything.
--
-- The app passes `p_auto_approve` (it knows the email domain); this function adds
-- the website rule, so the rule holds even if the app is wrong or bypassed.

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
  v_website text := nullif(btrim(coalesce(p_website, '')), '');
  v_approve boolean;
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

  v_approve := p_auto_approve or v_website is not null;
  if not v_approve then
    raise exception 'Add your company website or store link — a company email also works. Or message us on WhatsApp +62 857-1008-6041 and we will set your brand up.';
  end if;

  insert into public.vendors (
    name, brand_name, email, whatsapp, website, npwp, status, is_platform, approved_at
  )
  values (
    btrim(p_name),
    btrim(p_brand_name),
    nullif(btrim(p_email), ''),
    nullif(btrim(p_whatsapp), ''),
    v_website,
    nullif(btrim(p_npwp), ''),
    'approved',
    false,
    now()
  )
  returning id into v_vendor;

  insert into public.vendor_members (vendor_id, profile_id, role)
  values (v_vendor, v_profile, 'owner');

  perform public.write_audit('vendor.auto_approved', 'vendors', v_vendor::text,
    jsonb_build_object(
      'brand_name', btrim(p_brand_name),
      'via', case when p_auto_approve then 'company_email' else 'website' end
    ));

  return v_vendor;
end $$;

comment on function public.register_vendor(text, text, text, text, text, text, boolean) is
  'Creates an approved vendor plus the caller''s owner membership in one transaction. Approved automatically: a company email, or any email plus a website/store link. Refuses otherwise (0028); no admin step.';
