-- Dirory - security events, so that A09 (logging and monitoring) is not a gap
-- 0030_security_events.sql
--
-- The app already logged to stdout and audited business actions, but nothing
-- *recorded security-relevant failures in a way anyone could look at*, and
-- nothing told the founder. A signature-failure storm would fill a container log
-- that nobody reads.
--
-- This table is deliberately dull: append-only, one row per event, written with
-- the service role from the routes that see hostile input. The admin UI reads it;
-- the alert sender reads it too, and uses `notified_at` to avoid mailing the same
-- kind of event repeatedly when a scanner is hammering an endpoint.

create table public.security_events (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,          -- e.g. 'webhook.bad_signature'
  severity     text not null default 'warning',
  detail       jsonb,
  ip           text,
  notified_at  timestamptz,            -- set when an alert was sent for this row
  created_at   timestamptz not null default now()
);

create index security_events_created_idx on public.security_events (created_at desc);
create index security_events_kind_idx    on public.security_events (kind, created_at desc);

alter table public.security_events enable row level security;

-- Admins read. Nobody writes through the API: rows are inserted with the service
-- role from a route handler, so a vendor or an anonymous caller cannot forge one.
create policy security_events_admin_read on public.security_events
  for select using (public.is_admin());

create policy security_events_admin_write on public.security_events
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.security_events is
  'Append-only security log (0030). Written by route handlers with the service role; read by /admin/security and by the alert sender.';
