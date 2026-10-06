-- Dirory — admin product upload (FR-M12, FR-V3)
-- 0011_product_upload.sql
--
-- The admin back-office gains a "Products" section where a file is uploaded and
-- the same product detail the plugin's Inspector shows is filled in. Two
-- additions support that:
--
--   assets.dimensions           free text, e.g. "120 × 60 × 75 cm" (FR-V3).
--   asset_versions.su_version   the SketchUp release the file was saved in,
--   asset_versions.su_version_raw   read from the .skp header at upload time.
--
-- Why the SketchUp version is stored: a model saved in a newer SketchUp cannot
-- be opened (or imported) by an older one, so the website and the plugin show
-- it, and the plugin warns before inserting a file the running SketchUp is too
-- old to read. It lives on the version, not the asset, because a re-upload can
-- change it.

alter table public.assets
  add column if not exists dimensions text;

alter table public.asset_versions
  add column if not exists su_version text,
  add column if not exists su_version_raw text;

comment on column public.assets.dimensions is
  'Free-text physical size, e.g. "120 × 60 × 75 cm" (FR-V3).';
comment on column public.asset_versions.su_version is
  'Minimum SketchUp release the file needs: a 4-digit year ("2018") or "2021+" for the versionless 2021-and-later format.';
comment on column public.asset_versions.su_version_raw is
  'Raw .skp header version marker, e.g. "{18.0.16975}". Kept for debugging.';
