-- Dirory - add missing consent_version column and fix share_search_miss comment
-- 0032_consent_version_and_share_search_miss.sql
--
-- This migration adds the missing consent_version column that was intended
-- in 0031 but was omitted due to a copy-paste error.

-- ---------------------------------------------------------------------------
-- Add consent_version column to profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists consent_version text;

comment on column public.profiles.consent_version is
  'The policy version the user last consented to. Null = never consented. Bump to force re-consent.';

-- ---------------------------------------------------------------------------
-- Fix share_search_miss comment (it was duplicated in 0031)
-- ---------------------------------------------------------------------------

comment on column public.profiles.share_search_miss is
  'Whether the architect has opted in to anonymous search-miss reporting. Default true (anonymous, opt-out).';