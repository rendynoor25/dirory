-- Dirory - RAB price book (Dirory Pro: Bill of Quantities, step 2)
-- 0038_rab_price_book.sql
--
-- A price book per region: the work items an RAB is built from (AHSP), each
-- with its coefficients and that region's basic prices (HSD), and the unit
-- price that results. The first region is DKI Jakarta, built from Jakarta's
-- own published analyses by scripts/build-rab-jakarta.py and loaded by
-- scripts/seed-rab.mjs.
--
-- The data is public in origin, but turning it into a priced RAB is the paid
-- feature, so clients do not read these tables: the `rab` Edge Function serves
-- them (service role) and decides who may have them. Only admins read and
-- write directly.

create table public.rab_regions (
  id            text primary key,              -- 'jakarta'
  name          text not null,
  currency      text not null default 'IDR',
  overhead_pct  numeric not null default 15,   -- biaya umum dan keuntungan
  source        text not null,
  fetched       date,
  updated_at    timestamptz not null default now()
);

create table public.rab_items (
  region_id       text not null references public.rab_regions(id) on delete cascade,
  key             text not null,              -- 'floor_tile'
  name            text not null,
  element         text not null check (element in ('wall','floor','ceiling','roof','opening')),
  quantity_basis  text not null,              -- how the takeoff gives its volume
  unit            text not null,
  title           text,                       -- the source's own item title
  reference       text,                       -- the AHSP circular it follows
  source_ref      text,                       -- e.g. Jakarta HSP id
  unit_price      numeric not null,
  sort            int not null default 0,
  primary key (region_id, key)
);

create table public.rab_components (
  id            bigserial primary key,
  region_id     text not null,
  item_key      text not null,
  kind          text not null check (kind in ('labour','material','equipment')),
  code          text,
  name          text not null,
  unit          text,
  coef          numeric not null,
  price         numeric not null,
  price_source  text,
  foreign key (region_id, item_key) references public.rab_items(region_id, key) on delete cascade
);

create index rab_components_item_idx on public.rab_components (region_id, item_key);

alter table public.rab_regions    enable row level security;
alter table public.rab_items      enable row level security;
alter table public.rab_components enable row level security;

create policy rab_regions_admin on public.rab_regions
  for all using (public.is_admin()) with check (public.is_admin());
create policy rab_items_admin on public.rab_items
  for all using (public.is_admin()) with check (public.is_admin());
create policy rab_components_admin on public.rab_components
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.rab_items is
  'RAB work items per region with their unit price (AHSP coefficients x regional HSD + overhead). Served by the rab Edge Function.';
