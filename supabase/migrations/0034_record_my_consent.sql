-- Dirory - consent is asked on the download page, not inside SketchUp
-- 0034_record_my_consent.sql
--
-- The architect now makes the three sharing choices (usage, project name,
-- search misses) on /download, signed in, before the plugin is downloaded. The
-- plugin picks the choices up when it signs in (auth-device poll).
--
-- consent_log is closed to clients (0033), so the website records a choice
-- through this function. It only ever writes rows for auth.uid(), so a caller
-- cannot record consent for anybody else, and it needs no service key.

alter table public.consent_log
  add column if not exists source text not null default 'plugin'
    check (source in ('plugin', 'website'));

comment on column public.consent_log.source is
  'Where the choice was made: the SketchUp plugin or the website download page.';

create or replace function public.record_my_consent(
  p_usage       boolean,
  p_project     boolean,
  p_search_miss boolean,
  p_version     text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_project boolean := coalesce(p_usage, false) and coalesce(p_project, false);
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if p_version is null or length(p_version) = 0 or length(p_version) > 32 then
    raise exception 'invalid policy version';
  end if;

  -- The project title only travels inside a usage snapshot (A2).
  insert into public.consent_log (profile_id, purpose, granted, policy_version, source) values
    (me, 'plugin_download', true,                            p_version, 'website'),
    (me, 'usage',           coalesce(p_usage, false),        p_version, 'website'),
    (me, 'project_name',    v_project,                       p_version, 'website'),
    (me, 'search_miss',     coalesce(p_search_miss, false),  p_version, 'website');

  update public.profiles
     set share_usage       = coalesce(p_usage, false),
         share_project     = v_project,
         share_search_miss = coalesce(p_search_miss, false),
         consent_version   = p_version
   where id = me;
end $$;

revoke all on function public.record_my_consent(boolean, boolean, boolean, text) from public, anon;
grant execute on function public.record_my_consent(boolean, boolean, boolean, text) to authenticated;
