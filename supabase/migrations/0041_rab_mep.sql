-- Dirory - RAB price book: MEP work items
-- 0041_rab_mep.sql
--
-- The Revit add-in measures pipes, ducts, fixtures and devices, so the price
-- book gains plumbing, electrical, air and fire items under a new element,
-- 'mep'. Most are AHSP analyses; split AC units, which have none, are market
-- estimates and say so in `reference`. The items are data, loaded by
-- scripts/seed-rab.mjs.

alter table public.rab_items drop constraint rab_items_element_check;
alter table public.rab_items add constraint rab_items_element_check
  check (element in ('wall','floor','ceiling','roof','opening','structure','mep'));
