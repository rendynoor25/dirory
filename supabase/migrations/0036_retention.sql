-- Dirory - retention: delete what the privacy policy says we no longer keep
-- 0036_retention.sql
--
-- UU PDP action item A9. Personal data is kept only as long as the policy says,
-- then deleted by a daily job:
--
--   usage_history, usage_snapshots      12 months  (the snapshot is the latest
--                                                   state of one SketchUp file;
--                                                   untouched for a year, it goes)
--   ingest_log, plugin_health_events,
--   unhandled_events                    12 months
--   search_misses                       24 months  (their counts live on in
--                                                   missing_requests)
--   audit_log, security_events          24 months
--
-- Never touched: invoices and subscriptions (tax and accounting records),
-- consent_log (evidence of what each architect agreed to; erased with the
-- account), quote_requests (a vendor's lead, held under the vendor terms).

create or replace function public.run_retention()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb := '{}'::jsonb;
  n int;
begin
  delete from public.usage_history where taken_at < now() - interval '12 months';
  get diagnostics n = row_count; result := result || jsonb_build_object('usage_history', n);

  delete from public.usage_snapshots where taken_at < now() - interval '12 months';
  get diagnostics n = row_count; result := result || jsonb_build_object('usage_snapshots', n);

  delete from public.ingest_log where received_at < now() - interval '12 months';
  get diagnostics n = row_count; result := result || jsonb_build_object('ingest_log', n);

  delete from public.plugin_health_events where received_at < now() - interval '12 months';
  get diagnostics n = row_count; result := result || jsonb_build_object('plugin_health_events', n);

  delete from public.unhandled_events where received_at < now() - interval '12 months';
  get diagnostics n = row_count; result := result || jsonb_build_object('unhandled_events', n);

  delete from public.search_misses where created_at < now() - interval '24 months';
  get diagnostics n = row_count; result := result || jsonb_build_object('search_misses', n);

  delete from public.audit_log where created_at < now() - interval '24 months';
  get diagnostics n = row_count; result := result || jsonb_build_object('audit_log', n);

  delete from public.security_events where created_at < now() - interval '24 months';
  get diagnostics n = row_count; result := result || jsonb_build_object('security_events', n);

  return result;
end $$;

revoke all on function public.run_retention() from public, anon, authenticated;

comment on function public.run_retention() is
  'UU PDP A9: deletes usage and logs past their retention period. Never touches invoices, subscriptions, consent_log or quote_requests. Returns rows deleted per table.';

-- Best-effort daily schedule, as for expire_subscriptions() (0022). If pg_cron
-- is not enabled, schedule `select public.run_retention()` from the dashboard.
do $do$
begin
  begin
    perform cron.schedule(
      'dirory-retention', '30 2 * * *',
      $cron$select public.run_retention()$cron$
    );
  exception when others then
    raise notice 'pg_cron not available; schedule run_retention() manually';
  end;
end $do$;
