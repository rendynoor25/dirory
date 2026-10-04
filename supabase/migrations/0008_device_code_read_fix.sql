-- Dirory — fix the device-code SELECT policy (follow-up to 0007, M6)
-- 0008_device_code_read_fix.sql
--
-- 0007 created `plugin_device_codes_owner_read` with `using (profile_id = auth.uid())`.
-- That is wrong for the pending state: a freshly started code has `profile_id`
-- NULL until it is approved, so the signed-in architect could not SELECT the row,
-- and because an UPDATE's USING clause is evaluated against rows the caller may
-- read, the approval UPDATE silently matched zero rows. Sign-in could therefore
-- never complete.
--
-- Caught by `supabase/tests/rls_test.sql` check 10 (10b) on a real project.
-- The read policy must also permit a *live pending* code; the approve policy
-- (WITH CHECK, profile_id = auth.uid()) is unchanged and still binds the row to
-- the caller.
--
-- Idempotent: drop-and-create.

drop policy if exists plugin_device_codes_owner_read on public.plugin_device_codes;

create policy plugin_device_codes_owner_read on public.plugin_device_codes
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (status = 'pending' and expires_at > now())
  );
