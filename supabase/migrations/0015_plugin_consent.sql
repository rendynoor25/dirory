-- Dirory - plugin download consent (UU 27/2022, PRD §292)
-- 0015_plugin_consent.sql
--
-- The plugin collects data about the architect's SketchUp files. Before that can
-- happen lawfully, the download page must present the policy and the architect
-- must actively agree. This records that agreement, so there is evidence of it.
--
-- Two columns, both nullable:
--   plugin_consent_at      - when the current agreement was given
--   plugin_consent_version - which policy text they agreed to
--
-- Null means "not agreed": /api/download/rbz refuses to serve the RBZ until this
-- is set, so a direct link cannot bypass the dialog. Re-accepting with a new
-- version overwrites the timestamp, which is what a policy revision requires.
--
-- RLS needs no change: the existing policy already lets a user update their own
-- profile row, and the download flow writes only the caller's own row.

alter table public.profiles
  add column if not exists plugin_consent_at timestamptz,
  add column if not exists plugin_consent_version text;

comment on column public.profiles.plugin_consent_at is
  'When the architect last accepted the plugin privacy notice before downloading. NULL = never accepted.';
comment on column public.profiles.plugin_consent_version is
  'Identifier of the policy text accepted, e.g. "2026-10". Bump to require re-acceptance.';
