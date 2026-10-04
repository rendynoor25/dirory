-- Dirory — seed data (PRD §9, milestones M1/M2)
-- 0005_seed.sql. Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Platform brand "Dirory" (Q9 / FR-A8 / FR-M12). Owns the free samples.
-- FR-A24: Dirory's own brand uses the Dirory logo shipped with the plugin
-- (ui/logo_small.png). In the cloud, set logo_path/logo_url to the uploaded
-- brand asset; the plugin falls back to a round initial when neither exists.
-- ---------------------------------------------------------------------------
insert into public.vendors (id, name, brand_name, is_platform, status, approved_at, email, logo_url)
values ('00000000-0000-0000-0000-0000000000d1',
        'Dirory', 'Dirory', true, 'approved', now(), 'hello@dirory.id', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Taxonomy (FR-M3). Two trees: models and materials.
-- ---------------------------------------------------------------------------
insert into public.categories (type, name, sort) values
  ('model','Furniture',10),
  ('model','Doors & Windows',20),
  ('model','Sanitary',30),
  ('model','Lighting',40),
  ('model','Kitchen',50),
  ('material','Tiles',10),
  ('material','Paint',20),
  ('material','Stone',30),
  ('material','Wood',40),
  ('material','Wallpaper',50)
on conflict (type, parent_id, name) do nothing;

-- A couple of sub-categories to show the tree works.
insert into public.categories (type, name, parent_id, sort)
select 'model', 'Closet', c.id, 10 from public.categories c
where c.type = 'model' and c.name = 'Sanitary'
on conflict (type, parent_id, name) do nothing;

insert into public.categories (type, name, parent_id, sort)
select 'material', 'Floor Tile', c.id, 10 from public.categories c
where c.type = 'material' and c.name = 'Tiles'
on conflict (type, parent_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Plans (FR-M4). Flat tiers with an asset limit (Q4 / Q5).
-- ---------------------------------------------------------------------------
insert into public.plans (id, name, price_idr, period, max_assets, active) values
  ('00000000-0000-0000-0000-0000000000b1','Starter', 500000,  'monthly', 50,  true),
  ('00000000-0000-0000-0000-0000000000b2','Growth',  1500000, 'monthly', 200, true),
  ('00000000-0000-0000-0000-0000000000b3','Starter', 5000000, 'yearly',  50,  true),
  ('00000000-0000-0000-0000-0000000000b4','Growth',  15000000,'yearly',  200, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Promote an existing signed-up user to admin. Run this AFTER your first
-- magic-link sign-in (Supabase SQL editor):
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
--
-- (The profiles_force_role trigger only resets the role when the actor is not
-- already an admin, and SQL-editor statements run as the postgres role, so this
-- works.)
-- ---------------------------------------------------------------------------
