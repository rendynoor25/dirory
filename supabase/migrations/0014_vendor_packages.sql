-- Dirory - vendor packages (founder decision, 8 Oct 2026)
-- 0014_vendor_packages.sql
--
-- The founder chose the package model from
-- `Dirory Dashboard Metrics and Vendor Pricing.docx` (Table B) over the earlier
-- flat-tier hypothesis in PRD Q4. This migration moves the seeded plans onto it.
--
-- Packages (Table B):
--   Starter    Rp  5.000.000 / year  up to 20 products, 1 year listing
--   Growth     Rp 25.000.000 / year  up to 30 products, 1 year listing, monthly report
--   Full Range custom quote          50+ products, priority placement, quarterly review
--
-- Full Range is a negotiated quote, so it is stored **inactive**: it must not
-- appear as a self-serve button, because no price can be charged for it yet.
--
-- NOTE: PRD Q4 still reads "flat tiers with an asset limit". It now needs
-- updating to match this decision; until it is, the PRD and the database
-- disagree. This comment is the record of that.
--
-- Three one-time products from the document are NOT plans and are not modelled
-- here: the per-product digitization fee (Table A), annual listing as a % of it
-- (Table C) and the add-ons (Table D). Those are one-off invoices, not
-- subscriptions, and would need their own table.

-- ---------------------------------------------------------------------------
-- The two self-serve packages. Reuse the existing yearly rows so any
-- subscription already pointing at them keeps working.
-- ---------------------------------------------------------------------------
update public.plans
   set name = 'Starter', price_idr = 5000000, period = 'yearly',
       max_assets = 20, active = true
 where id = '00000000-0000-0000-0000-0000000000b3';

update public.plans
   set name = 'Growth', price_idr = 25000000, period = 'yearly',
       max_assets = 30, active = true
 where id = '00000000-0000-0000-0000-0000000000b4';

-- The old monthly tiers are retired. Deactivated rather than deleted: a
-- subscription may reference them, and deleting would break that history.
update public.plans
   set active = false
 where id in (
   '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000b2'
 );

-- ---------------------------------------------------------------------------
-- Full Range: negotiated, therefore not purchasable online.
-- ---------------------------------------------------------------------------
insert into public.plans (id, name, price_idr, period, max_assets, active)
values ('00000000-0000-0000-0000-0000000000b5', 'Full Range', 0, 'yearly', 1000, false)
on conflict (id) do update
  set name = excluded.name,
      period = excluded.period,
      max_assets = excluded.max_assets,
      active = excluded.active;

comment on table public.plans is
  'Vendor packages. Starter and Growth are self-serve (active). Full Range is a negotiated quote and stays inactive so it cannot be bought online.';
