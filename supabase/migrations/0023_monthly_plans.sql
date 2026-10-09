-- Dirory - monthly plans, priced so the yearly plan is the obvious deal
-- 0023_monthly_plans.sql
--
-- 0014 retired the old monthly rows (b1, b2) because the package model was
-- yearly-only. A year is a hard commitment for a brand trying Dirory for the
-- first time, so monthly is back. The two rows are reused rather than inserted,
-- so any subscription that ever pointed at them keeps working.
--
-- The numbers are rational: twelve months at the monthly rate is 1.2x the yearly
-- price, i.e. the yearly plan is "pay 10 months, get 12". No rounding tricks.
--
--   Starter   Rp   500.000 / month   or   Rp  5.000.000 / year   (2 bulan gratis)
--   Growth    Rp 2.500.000 / month   or   Rp 25.000.000 / year   (2 bulan gratis)
--
-- Capacity is identical to the yearly row of the same name, so the only thing the
-- vendor chooses is the commitment - not a different product.
--
-- Full Range stays a negotiated quote and stays inactive (0014).

update public.plans
   set name = 'Starter', price_idr = 500000, period = 'monthly',
       max_assets = 100, active = true
 where id = '00000000-0000-0000-0000-0000000000b1';

update public.plans
   set name = 'Growth', price_idr = 2500000, period = 'monthly',
       max_assets = 500, active = true
 where id = '00000000-0000-0000-0000-0000000000b2';

comment on table public.plans is
  'Vendor packages. Starter and Growth are self-serve, monthly or yearly (yearly = 10 months, i.e. 2 months free). Full Range is a negotiated quote and stays inactive so it cannot be bought online.';
