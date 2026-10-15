-- Dirory - schedule the housekeeping jobs
-- 0037_schedule_jobs.sql
--
-- 0022 and 0036 scheduled their jobs "best effort", and pg_cron was not
-- installed, so neither ever ran. This enables pg_cron and schedules both:
--
--   dirory-expire-subs  hourly at :15   public.expire_subscriptions()  (FR-M6)
--   dirory-retention    daily at 02:30  public.run_retention()         (UU PDP A9)
--
-- Times are UTC (pg_cron's clock): 02:30 UTC is 09:30 WIB.
-- cron.schedule() replaces a job of the same name, so re-running is safe.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;

select cron.schedule(
  'dirory-expire-subs', '15 * * * *',
  $cron$select public.expire_subscriptions()$cron$
);

select cron.schedule(
  'dirory-retention', '30 2 * * *',
  $cron$select public.run_retention()$cron$
);
