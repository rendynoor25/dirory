-- Dirory - how a material should look beyond its image
-- 0046_asset_appearance.sql
--
-- A texture alone cannot say "this is glass". `appearance` carries the
-- rendering properties the SketchUp plugin and the Revit add-in need for
-- transparent and reflective materials. Null means an ordinary image material,
-- which is every material before this migration.
--
-- Shape (all fields optional except kind):
--   { "kind": "glass",
--     "color": [r, g, b],     -- tint, 0-255
--     "opacity": 0.25,        -- 0 = invisible, 1 = opaque
--     "reflectivity": 0.1,    -- 0-1, head-on reflection
--     "roughness": 0.0,       -- 0 = polished, 1 = fully frosted
--     "metallic": false }     -- mirror-like coating
--
-- The catalog Edge Function returns it as `appearance`; plugins that predate
-- it ignore the field and use the image as before.

alter table public.assets
  add column appearance jsonb
    check (appearance is null or (jsonb_typeof(appearance) = 'object' and appearance ? 'kind'));
