-- Dirory - RAB price book: demolition (pembongkaran) work items
-- 0042_rab_demolition.sql
--
-- Revit phasing tells the add-in which elements a phase demolishes (and the
-- SketchUp plugin reads a "demolish" / "bongkar" tag), so the price book gains
-- demolition items under a new element, 'demolition'. Loaded by
-- scripts/seed-rab.mjs.

alter table public.rab_items drop constraint rab_items_element_check;
alter table public.rab_items add constraint rab_items_element_check
  check (element in ('wall','floor','ceiling','roof','opening','structure','mep','demolition'));
