-- Dirory — storage bucket for plugin release archives (plugin self-update)
-- 0009_plugin_bucket.sql
--
-- The SketchUp plugin can now update itself: it checks the published version,
-- downloads the new .rbz, and swaps its own files on the next restart.
--
-- The archive cannot live in `brands` (200 KB cap, image MIME allow-list) or in
-- `models`/`materials` (those are private per-vendor asset buckets). So it gets
-- its own bucket.
--
-- `plugin-release` is PRIVATE: the RBZ is only handed out to a signed-in plugin
-- via the `plugin-release` Edge Function, which checks the plugin token. The
-- function uses the service role, so no client-facing policy is needed here.
--
-- Run order: 0001 -> ... -> 0009.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'plugin-release',
  'plugin-release',
  false,
  52428800,                       -- 50 MB headroom; the archive is ~170 KB today
  array['application/octet-stream', 'application/zip', 'application/x-zip-compressed']
)
on conflict (id) do nothing;

-- No policies on purpose: only the service role (the Edge Function) reads or
-- writes this bucket. Adding none means anon/authenticated clients see nothing,
-- which is what we want for a gated deliverable.
