-- Dirory — plugin device-code auth (PRD §6.1 FR-A4, §10, milestone M6)
-- 0007_plugin_auth.sql
--
-- The SketchUp plugin cannot run an OAuth redirect flow, so M6 uses a
-- device-code flow (RFC 8628 style):
--
--   1. The plugin calls POST /auth-device/start and gets a short `user_code`
--      plus a secret `device_code`. It opens the browser at
--      <site>/auth/device?code=<user_code>.
--   2. The architect signs in on the web (existing magic link) and approves the
--      code. Their profile_id is bound to the pending row.
--   3. The plugin polls POST /auth-device/poll with its `device_code`; once the
--      row is approved it receives an opaque plugin token.
--   4. Every later plugin request (catalog download, quotes, favourites) sends
--      that token as `Authorization: Bearer <token>`. Edge Functions hash it and
--      look it up here; nothing trusts the token's contents.
--
-- Only SHA-256 hashes are stored at rest, so a database leak does not hand out
-- working credentials. Neither table is ever readable or writable by the anon
-- key; the device-approval policy is the single narrow exception, and it can
-- only bind a *pending, unexpired* code to the signed-in user's own profile.
--
-- Run order: 0001 -> ... -> 0006 -> 0007.

-- ---------------------------------------------------------------------------
-- Pending device authorisations
-- ---------------------------------------------------------------------------
create table public.plugin_device_codes (
  device_code_hash text primary key,          -- sha256 hex of the secret code
  user_code        text not null unique,      -- short code shown in the browser
  profile_id       uuid references public.profiles(id) on delete cascade,
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'denied')),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  approved_at      timestamptz
);
create index plugin_device_codes_user_code_idx on public.plugin_device_codes (user_code);
create index plugin_device_codes_expiry_idx     on public.plugin_device_codes (expires_at);

-- ---------------------------------------------------------------------------
-- Issued plugin tokens (opaque; only the hash is stored)
-- ---------------------------------------------------------------------------
create table public.plugin_tokens (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  install_id   uuid,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index plugin_tokens_profile_idx on public.plugin_tokens (profile_id);

-- ---------------------------------------------------------------------------
-- RLS: locked down by default. No policy => no anon/authenticated access.
-- ---------------------------------------------------------------------------
alter table public.plugin_device_codes enable row level security;
alter table public.plugin_tokens       enable row level security;

-- The only client-reachable operation: a signed-in architect approves a code
-- shown in their browser. The USING clause restricts this to a live pending
-- code; the WITH CHECK clause forces the result to be that same user's approval.
-- Reading codes back (`.select()`) is allowed under the same row, which lets the
-- approve screen confirm success without exposing anyone else's codes.
--
-- NOTE: the SELECT policy below was too narrow (profile_id = auth.uid()) and is
-- corrected in migration 0008_device_code_read_fix.sql. It is left as first
-- written so the applied history stays honest; 0008 supersedes it.
create policy plugin_device_codes_approve on public.plugin_device_codes
  for update to authenticated
  using (status = 'pending' and expires_at > now())
  with check (status = 'approved' and profile_id = auth.uid());

create policy plugin_device_codes_owner_read on public.plugin_device_codes
  for select to authenticated
  using (profile_id = auth.uid());

-- Housekeeping helper for the start endpoint: drop rows that can no longer be
-- approved. Security definer so the service role path stays simple.
create or replace function public.purge_expired_device_codes()
returns void language sql security definer set search_path = public as $$
  delete from public.plugin_device_codes
   where expires_at < now() - interval '1 hour'
      or (status <> 'pending' and approved_at < now() - interval '1 day');
$$;

comment on table public.plugin_device_codes is
  'M6 device-code logins. Hashes only; service-role access except the approval policy.';
comment on table public.plugin_tokens is
  'M6 opaque plugin tokens. Hashes only; validated by Edge Functions with the service role.';
