-- Dirory — Storage buckets and policies (PRD §9, §11, §6.2a)
-- 0004_storage.sql
--
-- `models` and `materials` are PRIVATE. Architects never read those files
-- directly: the plugin gets a short-lived signed URL from the Edge Function
-- (GET /assets/:id/download).
--
-- `brands` (FR-A24 / FR-M13) is PUBLIC. A brand logo is not sensitive, and the
-- plugin draws it on every card, the brand banner and the Usage tab, so it must
-- be cacheable without a signed URL. Recommended: square, transparent PNG or
-- SVG, >= 256x256 px, < 200 KB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('models',    'models',    false, 52428800, null),          -- 50 MB, PRD default
  ('materials', 'materials', false, 10485760, null),          -- 10 MB tile images
  ('brands',    'brands',    true,    204800,                 -- 200 KB, FR-A24
   array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

-- Helper: the vendor id that owns a storage object, from its path
-- convention "<vendor_id>/<asset_id>/<file>" (brands: "<vendor_id>/logo.png").
create or replace function public.storage_vendor_id(object_name text)
returns uuid language sql immutable as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Private buckets: models, materials
-- ---------------------------------------------------------------------------
create policy storage_admin_all on storage.objects
  for all to authenticated
  using (bucket_id in ('models','materials') and public.is_admin())
  with check (bucket_id in ('models','materials') and public.is_admin());

-- Vendors: read/write only under their own vendor prefix.
create policy storage_vendor_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('models','materials')
    and public.is_vendor_member(public.storage_vendor_id(name))
  );

create policy storage_vendor_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('models','materials')
    and public.is_vendor_editor(public.storage_vendor_id(name))
  );

create policy storage_vendor_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('models','materials')
    and public.is_vendor_editor(public.storage_vendor_id(name))
  )
  with check (
    bucket_id in ('models','materials')
    and public.is_vendor_editor(public.storage_vendor_id(name))
  );

create policy storage_vendor_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('models','materials')
    and public.is_vendor_editor(public.storage_vendor_id(name))
  );

-- ---------------------------------------------------------------------------
-- Public bucket: brands
-- Anyone may read a logo (architect, anonymous plugin, cached CDN).
-- Only the owning vendor, or an admin, may write one.
-- ---------------------------------------------------------------------------
create policy storage_brands_public_read on storage.objects
  for select
  using (bucket_id = 'brands');

create policy storage_brands_vendor_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brands'
    and public.is_vendor_editor(public.storage_vendor_id(name))
  );

create policy storage_brands_vendor_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'brands'
    and public.is_vendor_editor(public.storage_vendor_id(name))
  )
  with check (
    bucket_id = 'brands'
    and public.is_vendor_editor(public.storage_vendor_id(name))
  );

create policy storage_brands_vendor_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'brands'
    and public.is_vendor_editor(public.storage_vendor_id(name))
  );

-- Admins may replace a vendor's logo on its behalf (FR-M13).
create policy storage_brands_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'brands' and public.is_admin())
  with check (bucket_id = 'brands' and public.is_admin());
