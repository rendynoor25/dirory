-- Dirory - pricing adjusted for material-heavy brands
-- 0021_pricing_materials.sql
--
-- Why: the first package sizes were set as if every brand had a handful of
-- products. Real catalogues do not look like that. Propan alone has 160 approved
-- materials in Dirory; TACO has 634. A package capped at 20 or 30 products cannot
-- hold a paint or laminate range, and pricing every colour at Rp 50.000-150.000
-- puts 160 colours at Rp 8-24 million before listing.
--
-- A material is a texture image: small, quick to prepare, and brands have
-- hundreds. A model is real 3D work: heavier, slower, and brands have dozens.
-- The pricing now reflects that difference.
--
-- Two separate things, deliberately not bundled:
--
--   1. LISTING (subscription) - what this migration changes. Sized by how many
--      products a brand keeps live, so a material range fits.
--   2. DIGITIZATION (one-time) - published rates, not stored here. Materials are
--      cheap with volume tiers; models stay at the standard/advanced rates.
--
-- Prices below are proposals for the founder to confirm, not validated numbers.

-- Starter: fits a small brand, and a modest material range.
update public.plans
   set name = 'Starter', price_idr = 5000000, period = 'yearly',
       max_assets = 100, active = true
 where id = '00000000-0000-0000-0000-0000000000b3';

-- Growth: the tier a material-heavy brand needs - hundreds of colours fit.
update public.plans
   set name = 'Growth', price_idr = 25000000, period = 'yearly',
       max_assets = 500, active = true
 where id = '00000000-0000-0000-0000-0000000000b4';

-- Full Range stays a negotiated quote and stays inactive.
update public.plans
   set max_assets = 100000
 where id = '00000000-0000-0000-0000-0000000000b5';

comment on column public.plans.max_assets is
  'How many products may be live at once. Sized so a material range (hundreds of colours) fits: Starter 100, Growth 500.';
