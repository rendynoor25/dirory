-- Dirory - RAB price book: structural work items
-- 0040_rab_structure.sql
--
-- The Revit add-in measures structural elements (concrete volume, formwork
-- area and rebar weight per member, steel weight), so the price book gains
-- concrete, rebar, formwork and structural steel items under a new element,
-- 'structure'. The items themselves are data, loaded by scripts/seed-rab.mjs.

alter table public.rab_items drop constraint rab_items_element_check;
alter table public.rab_items add constraint rab_items_element_check
  check (element in ('wall','floor','ceiling','roof','opening','structure'));
