-- Dirory - Revit families on catalogue products
-- 0043_revit_families.sql
--
-- A product version can now carry a Revit family (.rfa) next to its SketchUp
-- model, in the same `models` bucket. The SketchUp plugin keeps using
-- file_path; the Revit add-in downloads revit_file_path (download?format=rfa).
-- A Revit-only product has file_path null and only revit_file_path.

alter table public.asset_versions
  add column revit_file_path text,
  add column revit_file_size bigint;

comment on column public.asset_versions.revit_file_path is
  'Storage key of the Revit family (.rfa) in bucket "models", when the product has one.';
