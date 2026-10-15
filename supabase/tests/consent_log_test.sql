-- Dirory — consent_log RLS tests (migrations 0031, 0033; UU PDP A4)
-- Run against a local stack:  supabase test db
-- Or paste into the Supabase SQL editor on a staging project.
--
-- consent_log is evidence of what each architect agreed to, so:
--   1. an architect reads their own rows and nobody else's;
--   2. a vendor and an anonymous caller read nothing;
--   3. no client can insert, change or delete a row — only the /events Edge
--      Function writes it, with the service role.
-- Every assert raises on failure; everything is rolled back at the end.

begin;

do $$
declare
  arch_a uuid := '00000000-0000-0000-0000-0000000000d1';
  arch_b uuid := '00000000-0000-0000-0000-0000000000d2';
  vend   uuid := '00000000-0000-0000-0000-0000000000d3';
  cnt    int;
  blocked boolean;
begin
  insert into auth.users (id, email) values
    (arch_a, 'arch-a@example.com'), (arch_b, 'arch-b@example.com'),
    (vend, 'vendor@example.com')
  on conflict (id) do nothing;

  insert into public.profiles (id, role, full_name) values
    (arch_a, 'architect', 'Architect A'),
    (arch_b, 'architect', 'Architect B'),
    (vend, 'vendor_owner', 'Vendor owner')
  on conflict (id) do update set role = excluded.role;

  insert into public.consent_log (profile_id, purpose, granted, policy_version) values
    (arch_a, 'usage', true, '2026-10'),
    (arch_a, 'project_name', false, '2026-10'),
    (arch_b, 'usage', false, '2026-10');

  -- 1. Architect A sees exactly their two rows.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', arch_a)::text, true);
  select count(*) into cnt from public.consent_log;
  if cnt <> 2 then
    raise exception 'RLS FAIL: architect A sees % consent rows, expected 2', cnt;
  end if;
  select count(*) into cnt from public.consent_log where profile_id = arch_b;
  if cnt <> 0 then
    raise exception 'RLS FAIL: architect A can read architect B''s consent';
  end if;

  -- 3. ...and cannot write, change or remove any of them.
  blocked := false;
  begin
    insert into public.consent_log (profile_id, purpose, granted, policy_version)
    values (arch_a, 'usage', false, '2026-10');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then
    raise exception 'RLS FAIL: an architect can insert into consent_log';
  end if;

  -- Refused outright (0033 revokes the privilege) or matching no row: either
  -- way nothing may change.
  cnt := 0;
  begin
    update public.consent_log set granted = false where profile_id = arch_a;
    get diagnostics cnt = row_count;
  exception when insufficient_privilege then cnt := 0;
  end;
  if cnt <> 0 then
    raise exception 'RLS FAIL: an architect changed % consent row(s)', cnt;
  end if;

  cnt := 0;
  begin
    delete from public.consent_log where profile_id = arch_a;
    get diagnostics cnt = row_count;
  exception when insufficient_privilege then cnt := 0;
  end;
  if cnt <> 0 then
    raise exception 'RLS FAIL: an architect deleted % consent row(s)', cnt;
  end if;

  -- 2. A vendor reads nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', vend)::text, true);
  select count(*) into cnt from public.consent_log;
  if cnt <> 0 then
    raise exception 'RLS FAIL: vendor can read % consent row(s)', cnt;
  end if;

  -- 2. An anonymous caller reads nothing.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into cnt from public.consent_log;
  if cnt <> 0 then
    raise exception 'RLS FAIL: anon can read % consent row(s)', cnt;
  end if;

  raise notice 'consent_log RLS: all checks passed';
end $$;

rollback;
