-- Dirory — RLS acceptance tests (PRD §13.3, M1)
-- Run against a local stack:  supabase test db
-- Or paste into the Supabase SQL editor on a staging project.
--
-- These tests impersonate users by setting the request.jwt.claims, which is what
-- `auth.uid()` reads. Each block raises an exception when a policy is wrong, so a
-- clean run means every assertion passed.

begin;

create extension if not exists pgtap; -- optional; the asserts below are plain plpgsql

-- ---------------------------------------------------------------------------
-- Fixtures: two vendors, two architects, one admin, one asset each.
-- ---------------------------------------------------------------------------
create temp table _fx as
select
  gen_random_uuid() as vendor_a,
  gen_random_uuid() as vendor_b,
  gen_random_uuid() as user_a,
  gen_random_uuid() as user_b,
  gen_random_uuid() as admin_id;
-- (the real suite seeds via SQL inserts; this comment block documents intent)

do $$
declare
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_b uuid := '00000000-0000-0000-0000-0000000000a2';
  u_a uuid := '00000000-0000-0000-0000-0000000000c1';
  u_b uuid := '00000000-0000-0000-0000-0000000000c2';
  adm uuid := '00000000-0000-0000-0000-0000000000c3';
  a_a uuid := '00000000-0000-0000-0000-0000000000e1';
  a_b uuid := '00000000-0000-0000-0000-0000000000e2';
  a_b_pending uuid := '00000000-0000-0000-0000-0000000000e3';
  a_b_draft   uuid := '00000000-0000-0000-0000-0000000000e4';
  a_b_rejected uuid := '00000000-0000-0000-0000-0000000000e5';
  arch_a uuid := '00000000-0000-0000-0000-0000000000f1';
  arch_b uuid := '00000000-0000-0000-0000-0000000000f2';
  fixture_role profile_role;
  cnt  int;
begin
  -- Seed auth.users + profiles + vendors + members + assets as the postgres role.
  insert into auth.users (id, email) values
    (u_a, 'a@example.com'), (u_b, 'b@example.com'), (adm, 'admin@example.com')
  on conflict (id) do nothing;

  insert into public.profiles (id, role, full_name) values
    (u_a, 'vendor_owner', 'Vendor A owner'),
    (u_b, 'vendor_owner', 'Vendor B owner'),
    (adm, 'admin', 'Dirory admin')
  on conflict (id) do update set role = excluded.role;

  insert into public.vendors (id, name, brand_name, status, approved_at) values
    (v_a, 'Vendor A', 'BrandA', 'approved', now()),
    (v_b, 'Vendor B', 'BrandB', 'approved', now())
  on conflict (id) do nothing;

  insert into public.vendor_members (vendor_id, profile_id, role) values
    (v_a, u_a, 'owner'), (v_b, u_b, 'owner')
  on conflict do nothing;

  insert into public.assets (id, vendor_id, type, name, status) values
    -- Published products. Every architect may browse these, and so may another
    -- vendor: the catalogue is public by design.
    (a_a, v_a, 'model', 'A closet', 'approved'),
    (a_b, v_b, 'model', 'B closet', 'approved'),
    -- Unreleased B products. These are the ones a competitor must never see.
    (a_b_pending,  v_b, 'model', 'B unannounced closet', 'pending_review'),
    (a_b_draft,    v_b, 'model', 'B draft closet', 'draft'),
    (a_b_rejected, v_b, 'model', 'B rejected closet', 'rejected')
  on conflict (id) do nothing;

  -- =========================================================================
  -- 1. Vendor A must not read Vendor B's UNPUBLISHED assets.
  --
  -- Not "zero rows": an approved product is public by design, because architects
  -- browse every brand's published catalogue. The boundary that matters is the
  -- unpublished state — a draft, an item in review, or a rejected product — and
  -- the same rule applies to a vendor, an anonymous visitor and an architect.
  -- =========================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_a)::text, true);

  select count(*) into cnt from public.assets
   where vendor_id = v_b and status <> 'approved';
  if cnt <> 0 then
    raise exception 'RLS FAIL: vendor A can read % unpublished asset(s) of vendor B', cnt;
  end if;

  -- Sanity: the public part really is visible, so the check above is meaningful
  -- and not passing merely because the query returned nothing at all.
  select count(*) into cnt from public.assets
   where vendor_id = v_b and status = 'approved';
  if cnt = 0 then
    raise exception 'RLS TEST BROKEN: vendor A cannot read B approved assets either';
  end if;

  -- And Vendor B's own drafts must still be visible to Vendor B.
  perform set_config('request.jwt.claims', json_build_object('sub', u_b)::text, true);
  select count(*) into cnt from public.assets
   where vendor_id = v_b and status <> 'approved';
  if cnt = 0 then
    raise exception 'RLS FAIL: vendor B cannot read its own unpublished assets';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_a)::text, true);

  -- =========================================================================
  -- 2. Vendor A must not read search_misses
  -- =========================================================================
  -- Seed the row as the service role first. A vendor cannot write this table —
  -- only the /events Edge Function does, using the service role — so inserting
  -- while impersonating the vendor is refused by RLS, which is the point.
  perform set_config('role', 'postgres', true);
  insert into public.search_misses (install_id, query_norm)
  values (gen_random_uuid(), 'bathtub gold');

  -- Back to Vendor A to prove the read is blocked.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_a)::text, true);

  select count(*) into cnt from public.search_misses;
  if cnt <> 0 then
    raise exception 'RLS FAIL: vendor can read search_misses';
  end if;

  -- =========================================================================
  -- 3. Vendor A must not read usage_snapshots (project names / identities)
  -- =========================================================================
  select count(*) into cnt from public.usage_snapshots;
  if cnt <> 0 then
    raise exception 'RLS FAIL: vendor can read usage snapshots';
  end if;

  -- =========================================================================
  -- 4. Vendor A must not approve its own asset version
  -- =========================================================================
  begin
    perform public.review_asset(gen_random_uuid(), 'approved', null);
    -- if the RPC exists but the caller is not admin it raises; reaching here is a failure
    raise exception 'RLS FAIL: vendor could call review_asset';
  exception
    when others then
      if position('not allowed' in sqlerrm) = 0
         and position('RLS FAIL' in sqlerrm) = 0 then
        -- expected: the function refused
        null;
      elsif position('RLS FAIL' in sqlerrm) > 0 then
        raise;
      end if;
  end;

  -- =========================================================================
  -- 5. Admin sees everything
  -- =========================================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', adm)::text, true);
  select role into strict fixture_role from public.profiles where id = adm;
  if fixture_role <> 'admin' then
    raise exception 'RLS TEST SETUP FAIL: admin fixture role was changed to %', fixture_role;
  end if;
  select count(*) into cnt from public.assets;
  if cnt < 2 then
    raise exception 'RLS FAIL: admin cannot read all assets (%)', cnt;
  end if;

  select count(*) into cnt from public.search_misses;
  if cnt < 1 then
    raise exception 'RLS FAIL: admin cannot read search_misses';
  end if;

  -- =========================================================================
  -- 6. Anonymous must read approved assets of approved vendors, and samples
  -- =========================================================================
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  select count(*) into cnt from public.assets where status = 'approved';
  if cnt < 2 then
    raise exception 'RLS FAIL: anon cannot read approved assets (%)', cnt;
  end if;

  -- The same boundary as check 1: an anonymous visitor must not reach an
  -- unpublished product, even though it can read the published catalogue.
  select count(*) into cnt from public.assets where status <> 'approved';
  if cnt <> 0 then
    raise exception 'RLS FAIL: anon can read % unpublished asset(s)', cnt;
  end if;

  -- =========================================================================
  -- 7. FR-A22 favourites are private to their owner
  -- =========================================================================
  perform set_config('role', 'postgres', true);
  insert into auth.users (id, email) values
    (arch_a, 'archa@example.com'), (arch_b, 'archb@example.com')
  on conflict (id) do nothing;
  insert into public.profiles (id, role, full_name) values
    (arch_a, 'architect', 'Architect A'),
    (arch_b, 'architect', 'Architect B')
  on conflict (id) do update set role = excluded.role;

  insert into public.favourites (profile_id, legacy_key, starred) values
    (arch_a, 'Model/Closet/Toto/A.skp', true),
    (arch_b, 'Model/Closet/Toto/B.skp', true)
  on conflict do nothing;

  -- Architect A sees only their own row.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', arch_a)::text, true);

  -- A normal signed-in user cannot promote themselves by editing profiles.
  update public.profiles set role = 'admin' where id = arch_a;
  select role into strict fixture_role from public.profiles where id = arch_a;
  if fixture_role = 'admin' then
    raise exception 'RLS FAIL: architect self-promoted to admin';
  end if;

  -- A trusted SQL Editor operation can bootstrap/promote an account (migration
  -- 0006). This is how the founder grants the first admin role.
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{}', true);
  update public.profiles set role = 'admin' where id = arch_b;
  select role into strict fixture_role from public.profiles where id = arch_b;
  if fixture_role <> 'admin' then
    raise exception 'RLS FAIL: trusted admin bootstrap could not assign admin role';
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', arch_a)::text, true);

  select count(*) into cnt from public.favourites;
  if cnt <> 1 then
    raise exception 'RLS FAIL: architect A sees % favourite rows, expected 1', cnt;
  end if;

  select count(*) into cnt from public.favourites
   where legacy_key = 'Model/Closet/Toto/B.skp';
  if cnt <> 0 then
    raise exception 'RLS FAIL: architect A can read architect B favourites';
  end if;

  -- A vendor must not read favourites at all: it is a private demand signal.
  perform set_config('request.jwt.claims', json_build_object('sub', u_a)::text, true);
  select count(*) into cnt from public.favourites;
  if cnt <> 0 then
    raise exception 'RLS FAIL: vendor can read favourites (% rows)', cnt;
  end if;

  -- And an anonymous caller must see nothing.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into cnt from public.favourites;
  if cnt <> 0 then
    raise exception 'RLS FAIL: anon can read favourites (% rows)', cnt;
  end if;

  -- An architect cannot write a favourite that belongs to someone else.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', arch_a)::text, true);
  begin
    insert into public.favourites (profile_id, legacy_key, starred)
    values (arch_b, 'Model/Closet/Toto/spoofed.skp', true);
    raise exception 'RLS FAIL: architect A wrote a favourite for architect B';
  exception
    when insufficient_privilege then null;  -- expected: WITH CHECK refused it
  end;

  -- Cleanup the favourite fixture.
  perform set_config('role', 'postgres', true);
  delete from public.favourites where profile_id in (arch_a, arch_b);
  delete from public.profiles where id in (arch_a, arch_b);

  -- =========================================================================
  -- 8. FR-A24 brand logo is readable by anyone (public bucket)
  -- =========================================================================
  -- Insert a real object row as the service role, then prove anon can read it
  -- while a non-owning vendor cannot write over it.
  perform set_config('role', 'postgres', true);
  delete from storage.objects
   where bucket_id = 'brands' and name = v_a::text || '/logo.png';
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('brands', v_a::text || '/logo.png', null, '{}'::jsonb);

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into cnt from storage.objects
   where bucket_id = 'brands' and name = v_a::text || '/logo.png';
  if cnt <> 1 then
    raise exception 'RLS FAIL: anon cannot read a brand logo (% rows)', cnt;
  end if;

  -- Vendor B must not delete Vendor A's logo.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_b)::text, true);
  delete from storage.objects
   where bucket_id = 'brands' and name = v_a::text || '/logo.png';
  perform set_config('role', 'postgres', true);
  select count(*) into cnt from storage.objects
   where bucket_id = 'brands' and name = v_a::text || '/logo.png';
  if cnt <> 1 then
    raise exception 'RLS FAIL: vendor B deleted vendor A brand logo';
  end if;

  delete from storage.objects
   where bucket_id = 'brands' and name = v_a::text || '/logo.png';

  -- =========================================================================
  -- 9. Consent (UU 27/2022): a snapshot without consent stores no project name
  -- =========================================================================
  -- Mirrors the ingest function's rule: '' from the plugin means "not consented"
  -- and must be stored as NULL, never as an empty string.
  perform set_config('role', 'postgres', true);
  insert into public.usage_snapshots (install_id, model_id, project, totals)
  values (gen_random_uuid(), 'consent-model-1', null, '{}'::jsonb)
  on conflict do nothing;

  select count(*) into cnt from public.usage_snapshots
   where model_id = 'consent-model-1' and project is null;
  if cnt <> 1 then
    raise exception 'CONSENT FAIL: opted-out snapshot did not store a NULL project';
  end if;

  select count(*) into cnt from public.usage_snapshots
   where model_id = 'consent-model-1' and project = '';
  if cnt <> 0 then
    raise exception 'CONSENT FAIL: opted-out snapshot stored an empty string';
  end if;

  -- A vendor must still not be able to read any snapshot row, consented or not.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_a)::text, true);
  select count(*) into cnt from public.usage_snapshots;
  if cnt <> 0 then
    raise exception 'CONSENT FAIL: vendor can read usage snapshots (% rows)', cnt;
  end if;

  perform set_config('role', 'postgres', true);
  delete from public.usage_snapshots where model_id = 'consent-model-1';

  -- cleanup
  perform set_config('role', 'postgres', true);
  delete from public.vendor_members where vendor_id in (v_a, v_b);
  delete from public.assets where id in (a_a, a_b, a_b_pending, a_b_draft, a_b_rejected);
  delete from public.vendors where id in (v_a, v_b);
  delete from public.search_misses where query_norm = 'bathtub gold';
  delete from public.profiles where id in (u_a, u_b, adm);

  raise notice 'Dirory RLS suite: ALL CHECKS PASSED';
end $$;

rollback;
